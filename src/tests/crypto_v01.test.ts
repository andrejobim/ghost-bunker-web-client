import { describe, expect, test } from "vitest";
import { webcrypto } from "node:crypto";
import { RoomCryptoV01 } from "../protocol/crypto_v01";
import { generateRoomKeyBytes } from "../protocol/room_key";

describe("RoomCryptoV01", () => {
  test("roundtrips with same room key", async () => {
    const subtle = webcrypto.subtle;
    const roomId = "lobby";
    const roomKeyBytes = generateRoomKeyBytes();

    const room = await RoomCryptoV01.forRoom({ roomId, roomKeyBytes, subtle });
    const enc = await room.encrypt("hello world\nline2");

    const dec = await RoomCryptoV01.decrypt({
      roomId,
      roomKeyBytes,
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
    const roomKeyBytes = generateRoomKeyBytes();
    const room = await RoomCryptoV01.forRoom({ roomId: "roomA", roomKeyBytes, subtle });
    const enc = await room.encrypt("hi");

    await expect(
      RoomCryptoV01.decrypt({
        roomId: "roomB",
        roomKeyBytes,
        keyId: enc.keyId,
        nonce: enc.nonce,
        ciphertext: enc.ciphertext,
        aadVersion: enc.aadVersion,
        subtle,
      }),
    ).rejects.toBeTruthy();
  });

  test("fails decrypt when key_id does not match room key", async () => {
    const subtle = webcrypto.subtle;
    const roomKeyBytes = generateRoomKeyBytes();
    const otherKey = generateRoomKeyBytes();
    const room = await RoomCryptoV01.forRoom({ roomId: "lobby", roomKeyBytes, subtle });
    const enc = await room.encrypt("hi");

    await expect(
      RoomCryptoV01.decrypt({
        roomId: "lobby",
        roomKeyBytes: otherKey,
        keyId: enc.keyId,
        nonce: enc.nonce,
        ciphertext: enc.ciphertext,
        aadVersion: enc.aadVersion,
        subtle,
      }),
    ).rejects.toThrow(/key_id/);
  });

  test("enforces ciphertext <= 16KB", async () => {
    const subtle = webcrypto.subtle;
    const roomKeyBytes = generateRoomKeyBytes();
    const room = await RoomCryptoV01.forRoom({ roomId: "lobby", roomKeyBytes, subtle });

    const big = new Uint8Array(16_385);
    await expect(
      RoomCryptoV01.decrypt({
        roomId: "lobby",
        roomKeyBytes,
        keyId: room.getKeyId(),
        nonce: new Uint8Array(12).fill(3),
        ciphertext: big,
        aadVersion: 1,
        subtle,
      }),
    ).rejects.toThrow(/16 KB/);
  });
});
