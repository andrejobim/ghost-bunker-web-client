import { randomBytes } from "./bytes";
import { keyIdFromRoomKeyBytes, ROOM_KEY_BYTES } from "./room_key";

export type CipherSuiteName = "PBKDF2_HMAC_SHA256_AES_256_GCM";

type RoomCryptoV01Params = {
  roomId: string;
  roomKeyBytes: Uint8Array;
  subtle: SubtleCrypto;
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
  private readonly aesKey: CryptoKey;

  private constructor(args: {
    roomId: string;
    subtle: SubtleCrypto;
    keyId: string;
    aesKey: CryptoKey;
  }) {
    this.roomId = args.roomId;
    this.subtle = args.subtle;
    this.keyId = args.keyId;
    this.aesKey = args.aesKey;
  }

  static async forRoom(params: RoomCryptoV01Params): Promise<RoomCryptoV01> {
    if (params.roomKeyBytes.byteLength !== ROOM_KEY_BYTES) {
      throw new Error(`room_key must be exactly ${ROOM_KEY_BYTES} bytes.`);
    }

    const keyId = await keyIdFromRoomKeyBytes({
      roomKeyBytes: params.roomKeyBytes,
      subtle: params.subtle,
    });

    const aesKey = await params.subtle.importKey(
      "raw",
      params.roomKeyBytes,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );

    return new RoomCryptoV01({
      roomId: params.roomId,
      subtle: params.subtle,
      keyId,
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
  private aadV1(params: {
    protocol: string;
    version: string;
    roomId: string;
    keyId: string;
    cipherSuite: CipherSuiteName;
    aadVersion: number;
  }): Uint8Array {
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
    roomKeyBytes: Uint8Array;
    keyId: string;
    nonce: Uint8Array;
    ciphertext: Uint8Array;
    aadVersion: number;
    subtle: SubtleCrypto;
  }): Promise<string> {
    if (params.ciphertext.length > 16_384) {
      throw new Error("Ciphertext exceeds 16 KB.");
    }
    if (params.roomKeyBytes.byteLength !== ROOM_KEY_BYTES) {
      throw new Error(`room_key must be exactly ${ROOM_KEY_BYTES} bytes.`);
    }

    const expectedKeyId = await keyIdFromRoomKeyBytes({
      roomKeyBytes: params.roomKeyBytes,
      subtle: params.subtle,
    });
    if (params.keyId !== expectedKeyId) {
      throw new Error("key_id does not match loaded room key.");
    }

    const aesKey = await params.subtle.importKey(
      "raw",
      params.roomKeyBytes,
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
