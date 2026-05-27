# Manual testing

## Prerequisites

- A running Ghost Bunker Protocol **v0.1** server (any compatible build; this web client is optional and not bundled with the server).
- This repository built and served locally (`npm run dev`).

## WebSocket endpoint and subprotocol

Ghost Bunker **server v0.3+** accepts WebSocket connections at a path such as:

```
ws://localhost:8080/ghost-bunker
```

(Use your deployment’s host, TLS, and path if different.)

The upgrade handshake **must** include the subprotocol:

```
ghost-bunker.v0.1
```

This reference web client passes that subprotocol when opening the socket. If you connect without it (e.g. raw `new WebSocket(url)`), the server may return HTTP 200 and the browser will not complete the expected WebSocket upgrade.

### wscat

```bash
wscat -c ws://localhost:8080/ghost-bunker -s ghost-bunker.v0.1
```

After the socket is open, frames are binary Protobuf `GhostEnvelope` messages (not plaintext chat).

## Browser client

```bash
npm run dev
```

Open the Vite URL, set the WebSocket URL to your server endpoint, and connect.

### Room key and invite link flow

1. **Create secure room key** — confirms a 32-byte key is generated in the browser (not fetched from the server).
2. Enter a **room ID** and join — the server sees only the room id and encrypted frames, not the key.
3. **Copy invite link** — link shape: `?room=<id>#gbkey=<base64url>`. Open the link in a second browser profile or machine on the **same client origin** to join the same room with the same key.
4. Send a message from each side — both should decrypt incoming traffic locally. The server relay must not require or accept the room key on the wire.
5. **Optional prefs** — enable “Remember local settings”, reload, and confirm WS URL / nickname / room id persist. Confirm the room key is **not** restored (generate or paste again, or reopen the invite link).
6. **Loss scenario** — clear the key in the UI (or use a fresh profile without the invite link) and verify you cannot decrypt new or historical ciphertext without re-importing `#gbkey=…`. The server cannot supply the key.

### Security checks (manual)

- DevTools → Network: WebSocket request URL must **not** include `gbkey` (fragment is omitted from requests).
- Do not put `gbkey` in the query string; the client ignores query `gbkey` by design.
- Treat invite links as secrets: anyone with the link can read the room.

This E2EE model is experimental and unaudited; use only for protocol and UX validation, not production assurance.
