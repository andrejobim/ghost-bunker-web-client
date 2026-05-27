import { base64UrlToBytes, bytesToBase64Url } from "./bytes";

export const ROOM_KEY_BYTES = 32 as const;

export type RoomKeyImport =
  | { ok: true; roomKeyBytes: Uint8Array }
  | { ok: false; error: string };

export function generateRoomKeyBytes(): Uint8Array {
  // Must be generated locally; never send to server.
  const out = new Uint8Array(ROOM_KEY_BYTES);
  crypto.getRandomValues(out);
  return out;
}

export function exportRoomKeyBase64Url(roomKeyBytes: Uint8Array): string {
  if (roomKeyBytes.byteLength !== ROOM_KEY_BYTES) {
    throw new Error(`room_key must be exactly ${ROOM_KEY_BYTES} bytes.`);
  }
  return bytesToBase64Url(roomKeyBytes);
}

function looksLikeBase64Url(s: string): boolean {
  // Disallow empty; only url-safe chars.
  return /^[A-Za-z0-9_-]+$/.test(s);
}

export function importRoomKeyBase64Url(s: string): RoomKeyImport {
  const trimmed = s.trim();
  if (!trimmed) return { ok: false, error: "Room key is empty." };
  if (!looksLikeBase64Url(trimmed)) return { ok: false, error: "Room key must be base64url (A-Z a-z 0-9 - _)." };
  let bytes: Uint8Array;
  try {
    bytes = base64UrlToBytes(trimmed);
  } catch {
    return { ok: false, error: "Invalid base64url room key." };
  }
  if (bytes.byteLength !== ROOM_KEY_BYTES) {
    return { ok: false, error: `Room key must decode to exactly ${ROOM_KEY_BYTES} bytes.` };
  }
  return { ok: true, roomKeyBytes: bytes };
}

export async function keyIdFromRoomKeyBytes(params: {
  roomKeyBytes: Uint8Array;
  subtle: SubtleCrypto;
  chars?: 12 | 16;
}): Promise<string> {
  const chars = params.chars ?? 16;
  if (params.roomKeyBytes.byteLength !== ROOM_KEY_BYTES) {
    throw new Error(`room_key must be exactly ${ROOM_KEY_BYTES} bytes.`);
  }
  const digest = await params.subtle.digest("SHA-256", params.roomKeyBytes);
  const b64u = bytesToBase64Url(new Uint8Array(digest));
  return b64u.slice(0, chars);
}

