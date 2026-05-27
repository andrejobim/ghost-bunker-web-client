import { asciiVisibleNoWhitespace } from "./validation";

export type ParsedInvite = {
  roomId?: string;
  gbkey?: string;
};

export function buildInviteLink(params: { baseUrl: string; roomId: string; roomKeyB64Url: string }): string {
  const base = new URL(params.baseUrl);
  // Force room_id in query string.
  base.searchParams.set("room", params.roomId);
  // Force gbkey only in fragment.
  base.hash = `gbkey=${params.roomKeyB64Url}`;
  return base.toString();
}

export function parseInviteFromLocation(loc: Location): ParsedInvite {
  const u = new URL(loc.href);
  const room = u.searchParams.get("room") ?? undefined;

  const hash = u.hash.startsWith("#") ? u.hash.slice(1) : u.hash;
  const hashParams = new URLSearchParams(hash);
  const gbkey = hashParams.get("gbkey") ?? undefined;

  // Ensure gbkey is not taken from query string by accident.
  return { roomId: room, gbkey };
}

export function validateRoomId(roomId: string): { ok: true } | { ok: false; error: string } {
  const s = roomId.trim();
  if (!s) return { ok: false, error: "Room ID is empty." };
  if (!asciiVisibleNoWhitespace(s)) {
    return { ok: false, error: "Room ID must be ASCII-visible (no whitespace, no emoji)." };
  }
  return { ok: true };
}

export function locationWithoutGbKeyFragment(loc: Location): string {
  const u = new URL(loc.href);
  // Preserve path + query, drop hash.
  u.hash = "";
  return u.toString();
}

