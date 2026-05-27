import { describe, expect, test } from "vitest";
import { webcrypto } from "node:crypto";
import { bytesToBase64Url } from "../protocol/bytes";
import {
  exportRoomKeyBase64Url,
  generateRoomKeyBytes,
  importRoomKeyBase64Url,
  keyIdFromRoomKeyBytes,
  ROOM_KEY_BYTES,
} from "../protocol/room_key";

describe("room_key", () => {
  test("generates 32-byte room key", () => {
    const k = generateRoomKeyBytes();
    expect(k.byteLength).toBe(ROOM_KEY_BYTES);
  });

  test("exports and imports base64url room key", () => {
    const k = generateRoomKeyBytes();
    const b64 = exportRoomKeyBase64Url(k);
    const imp = importRoomKeyBase64Url(b64);
    expect(imp.ok).toBe(true);
    if (imp.ok) {
      expect(imp.roomKeyBytes.byteLength).toBe(32);
      expect(Array.from(imp.roomKeyBytes)).toEqual(Array.from(k));
    }
  });

  test("rejects invalid room key length", () => {
    const short = bytesToBase64Url(new Uint8Array(16));
    const imp = importRoomKeyBase64Url(short);
    expect(imp.ok).toBe(false);
  });

  test("rejects invalid base64url", () => {
    const imp = importRoomKeyBase64Url("not!!!valid");
    expect(imp.ok).toBe(false);
  });

  test("key_id is derived from room key without exposing full key", async () => {
    const k = generateRoomKeyBytes();
    const keyId = await keyIdFromRoomKeyBytes({ roomKeyBytes: k, subtle: webcrypto.subtle, chars: 16 });
    expect(keyId.length).toBe(16);
    expect(bytesToBase64Url(k)).not.toBe(keyId);
    expect(keyId).not.toContain(bytesToBase64Url(k).slice(0, 8));
  });
});
