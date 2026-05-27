import { describe, expect, test } from "vitest";

/** Mirrors savePrefsIfEnabled() in main.ts — must never persist secrets. */
function buildPrefsPayload(wsUrl: string, nickname: string, roomId: string): string {
  return JSON.stringify({ wsUrl, nickname, roomId });
}

describe("localStorage prefs contract", () => {
  test("serializes only non-secret settings", () => {
    const raw = buildPrefsPayload("ws://localhost:8080/ghost-bunker", "anon", "lobby");
    const parsed = JSON.parse(raw) as Record<string, string>;
    expect(Object.keys(parsed).sort()).toEqual(["nickname", "roomId", "wsUrl"]);
    expect(parsed).not.toHaveProperty("room_key");
    expect(parsed).not.toHaveProperty("gbkey");
    expect(parsed).not.toHaveProperty("passphrase");
    expect(raw).not.toMatch(/gbkey/i);
  });
});
