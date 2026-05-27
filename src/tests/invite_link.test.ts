import { describe, expect, test } from "vitest";
import { bytesToBase64Url } from "../protocol/bytes";
import { buildInviteLink, parseInviteFromLocation } from "../protocol/invite_link";

function mockLocation(href: string): Location {
  const u = new URL(href);
  return {
    href: u.href,
    origin: u.origin,
    protocol: u.protocol,
    host: u.host,
    hostname: u.hostname,
    port: u.port,
    pathname: u.pathname,
    search: u.search,
    hash: u.hash,
  } as Location;
}

describe("invite_link", () => {
  test("builds invite link with room in query and gbkey in fragment", () => {
    const roomKeyB64 = bytesToBase64Url(new Uint8Array(32).fill(9));
    const link = buildInviteLink({
      baseUrl: "http://localhost:5173/",
      roomId: "lobby",
      roomKeyB64Url: roomKeyB64,
    });
    const u = new URL(link);
    expect(u.searchParams.get("room")).toBe("lobby");
    expect(u.hash).toBe(`#gbkey=${roomKeyB64}`);
    expect(u.searchParams.has("gbkey")).toBe(false);
    expect(link.includes(`gbkey=${roomKeyB64}`)).toBe(true);
    expect(link.indexOf("#")).toBeLessThan(link.indexOf("gbkey="));
  });

  test("parses room_id from query and gbkey from fragment", () => {
    const gbkey = bytesToBase64Url(new Uint8Array(32).fill(1));
    const loc = mockLocation(`http://localhost:5173/?room=myroom#gbkey=${gbkey}`);
    const parsed = parseInviteFromLocation(loc);
    expect(parsed.roomId).toBe("myroom");
    expect(parsed.gbkey).toBe(gbkey);
  });

  test("does not read gbkey from query string", () => {
    const gbkey = bytesToBase64Url(new Uint8Array(32).fill(2));
    const loc = mockLocation(`http://localhost:5173/?room=myroom&gbkey=${gbkey}`);
    const parsed = parseInviteFromLocation(loc);
    expect(parsed.roomId).toBe("myroom");
    expect(parsed.gbkey).toBeUndefined();
  });
});
