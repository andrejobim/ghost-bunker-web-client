import { describe, expect, test } from "vitest";
import { webcrypto } from "node:crypto";
import { RoomCryptoV01 } from "../protocol/crypto_v01";

describe("RoomCryptoV01", () => {
  test("roundtrips with same room key_id (salt)", async () => {
    const subtle = webcrypto.subtle;
    const roomId = "lobby";
    const passphrase = "correct horse battery staple";

    const room = await RoomCryptoV01.forRoom({ roomId, passphrase, subtle, roomSaltBytes: new Uint8Array(16).fill(7) });
    const enc = await room.encrypt("hello world\nline2");

    const dec = await RoomCryptoV01.decrypt({
      roomId,
      passphrase,
      keyId: enc.keyId,
      nonce: enc.nonce,
      ciphertext: enc.ciphertext,
      aadVersion: enc.aadVersion,
      subtle,
    });
    expect(dec).toBe("hello world\nline2");
  });

  test("fails decrypt with wrong room_id (AAD mismatch)", async () => {
    const subtle = webcrypto.subtle;
    const passphrase = "pw";
    const room = await RoomCryptoV01.forRoom({ roomId: "roomA", passphrase, subtle, roomSaltBytes: new Uint8Array(16).fill(1) });
    const enc = await room.encrypt("hi");

    await expect(
      RoomCryptoV01.decrypt({
        roomId: "roomB",
        passphrase,
        keyId: enc.keyId,
        nonce: enc.nonce,
        ciphertext: enc.ciphertext,
        aadVersion: enc.aadVersion,
        subtle,
      }),
    ).rejects.toBeTruthy();
  });

  test("enforces ciphertext <= 16KB", async () => {
    const subtle = webcrypto.subtle;
    const room = await RoomCryptoV01.forRoom({ roomId: "lobby", passphrase: "pw", subtle, roomSaltBytes: new Uint8Array(16).fill(2) });

    // Create a synthetic oversized ciphertext for decrypt-side check.
    const big = new Uint8Array(16_385);
    await expect(
      RoomCryptoV01.decrypt({
        roomId: "lobby",
        passphrase: "pw",
        keyId: room.getKeyId(),
        nonce: new Uint8Array(12).fill(3),
        ciphertext: big,
        aadVersion: 1,
        subtle,
      }),
    ).rejects.toThrow(/16 KB/);
  });
});

