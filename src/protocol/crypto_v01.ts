import { base64UrlToBytes, bytesToBase64Url, randomBytes } from "./bytes";

export type CipherSuiteName = "PBKDF2_HMAC_SHA256_AES_256_GCM";

type RoomCryptoV01Params = {
  roomId: string;
  passphrase: string;
  subtle: SubtleCrypto;
  pbkdf2Iterations?: number;
  roomSaltBytes?: Uint8Array;
};

export type EncryptedPayload = {
  keyId: string;
  aadVersion: number;
  nonce: Uint8Array;
  ciphertext: Uint8Array;
};

export class RoomCryptoV01 {
  private readonly roomId: string;
  private readonly subtle: SubtleCrypto;
  private readonly keyId: string;
  private readonly pbkdf2Iterations: number;
  private readonly aesKey: CryptoKey;

  private constructor(args: {
    roomId: string;
    subtle: SubtleCrypto;
    keyId: string;
    pbkdf2Iterations: number;
    aesKey: CryptoKey;
  }) {
    this.roomId = args.roomId;
    this.subtle = args.subtle;
    this.keyId = args.keyId;
    this.pbkdf2Iterations = args.pbkdf2Iterations;
    this.aesKey = args.aesKey;
  }

  static async forRoom(params: RoomCryptoV01Params): Promise<RoomCryptoV01> {
    const pbkdf2Iterations = params.pbkdf2Iterations ?? 210_000;
    const roomSaltBytes = params.roomSaltBytes ?? randomBytes(16);
    const keyId = bytesToBase64Url(roomSaltBytes);

    const passphraseKey = await params.subtle.importKey(
      "raw",
      new TextEncoder().encode(params.passphrase),
      "PBKDF2",
      false,
      ["deriveKey"],
    );

    const aesKey = await params.subtle.deriveKey(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt: roomSaltBytes,
        iterations: pbkdf2Iterations,
      },
      passphraseKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );

    return new RoomCryptoV01({
      roomId: params.roomId,
      subtle: params.subtle,
      keyId,
      pbkdf2Iterations,
      aesKey,
    });
  }

  getKeyId(): string {
    return this.keyId;
  }

  /**
   * AAD v1 is reconstructed entirely from non-secret metadata so it never requires
   * server-side interpretation. Keep this stable across implementations.
   */
  private aadV1(params: { protocol: string; version: string; roomId: string; keyId: string; cipherSuite: CipherSuiteName; aadVersion: number }): Uint8Array {
    const s = `${params.protocol}|${params.version}|${params.roomId}|${params.keyId}|${params.cipherSuite}|${params.aadVersion}`;
    return new TextEncoder().encode(s);
  }

  async encrypt(plaintext: string): Promise<EncryptedPayload> {
    const aadVersion = 1;
    const nonce = randomBytes(12);
    const aad = this.aadV1({
      protocol: "ghost-bunker",
      version: "0.1",
      roomId: this.roomId,
      keyId: this.keyId,
      cipherSuite: "PBKDF2_HMAC_SHA256_AES_256_GCM",
      aadVersion,
    });
    const pt = new TextEncoder().encode(plaintext);

    const ct = await this.subtle.encrypt({ name: "AES-GCM", iv: nonce, additionalData: aad }, this.aesKey, pt);
    const ciphertext = new Uint8Array(ct);

    if (ciphertext.length > 16_384) {
      throw new Error("Ciphertext exceeds 16 KB.");
    }

    return { keyId: this.keyId, aadVersion, nonce, ciphertext };
  }

  static async decrypt(params: {
    roomId: string;
    passphrase: string;
    keyId: string;
    nonce: Uint8Array;
    ciphertext: Uint8Array;
    aadVersion: number;
    subtle: SubtleCrypto;
    pbkdf2Iterations?: number;
  }): Promise<string> {
    if (params.ciphertext.length > 16_384) {
      throw new Error("Ciphertext exceeds 16 KB.");
    }
    const pbkdf2Iterations = params.pbkdf2Iterations ?? 210_000;
    const roomSaltBytes = base64UrlToBytes(params.keyId);

    const passphraseKey = await params.subtle.importKey(
      "raw",
      new TextEncoder().encode(params.passphrase),
      "PBKDF2",
      false,
      ["deriveKey"],
    );
    const aesKey = await params.subtle.deriveKey(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt: roomSaltBytes,
        iterations: pbkdf2Iterations,
      },
      passphraseKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    );

    const aad = new TextEncoder().encode(
      `ghost-bunker|0.1|${params.roomId}|${params.keyId}|PBKDF2_HMAC_SHA256_AES_256_GCM|${params.aadVersion}`,
    );

    const ptBuf = await params.subtle.decrypt(
      { name: "AES-GCM", iv: params.nonce, additionalData: aad },
      aesKey,
      params.ciphertext,
    );
    return new TextDecoder().decode(ptBuf);
  }
}

