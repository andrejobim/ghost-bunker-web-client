import { RoomCryptoV01 } from "./crypto_v01";

/**
 * Minimal helper to demonstrate local decrypt, used by manual testing.
 * Not wired into the UI by default (to avoid accidental room key handling patterns).
 */
export async function tryDecryptIncoming(params: {
  roomId: string;
  roomKeyBytes: Uint8Array;
  keyId: string;
  nonce: Uint8Array;
  ciphertext: Uint8Array;
  aadVersion: number;
}): Promise<string> {
  return await RoomCryptoV01.decrypt({
    roomId: params.roomId,
    roomKeyBytes: params.roomKeyBytes,
    keyId: params.keyId,
    nonce: params.nonce,
    ciphertext: params.ciphertext,
    aadVersion: params.aadVersion,
    subtle: crypto.subtle,
  });
}
