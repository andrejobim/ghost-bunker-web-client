# Manual testing

## WebSocket endpoint and subprotocol

Ghost Bunker **server v0.3** accepts WebSocket connections at:

```
ws://localhost:8080/ghost-bunker
```

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

Open the Vite URL, set the WebSocket URL to `ws://localhost:8080/ghost-bunker`, connect, create or paste a room key, join a room, and send encrypted messages.
