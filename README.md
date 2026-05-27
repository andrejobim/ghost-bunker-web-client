# Ghost Bunker Reference Web Client (v0.2)

This is the **browser reference client** for the Ghost Bunker Protocol v0.1 server.

## Goals

- Reference-quality **browser** client for manual testing of:
  - v0.1 Protobuf wire format (`GhostEnvelope`) inside **binary WebSocket frames**
  - v0.1 state machine (HELLO → WELCOME → JOIN_ROOM → SEND_ENCRYPTED_MESSAGE)
  - client-side E2EE: **32-byte room key + AES-256-GCM** (WebCrypto); wire `cipher_suite` unchanged
- Room key + **invite link** (`#gbkey=`) instead of manual passphrase
- Minimal UI (connect / join / encrypt+send / log)
- Client-side crypto and invite-link unit tests

See [docs/e2ee-v0.2.md](docs/e2ee-v0.2.md) for room key and invite link details.

## Hard rules enforced

- No plaintext over WebSocket (binary frames only)
- No room key, gbkey, passphrase, or derived key sent to server
- No telemetry
- No persistent identity / login / accounts
- `localStorage` is **optional** and **disabled by default**; when enabled, stores only ws URL, nickname, room ID
- Emoji / non-ASCII blocked before encryption
- Message plaintext ≤ 4 KB (bytes) before encryption
- Ciphertext ≤ 16 KB

## Setup

```bash
npm install
npm run gen
```

## Run

1. Start the Ghost Bunker server (see server repo).

2. Start the web client:

```bash
npm run dev
```

Open the printed Vite URL (e.g. `http://localhost:5173`) and connect to `ws://localhost:8080/ghost-bunker`.

**Server v0.3** requires the WebSocket subprotocol `ghost-bunker.v0.1` during the upgrade handshake. This client negotiates it automatically. Without the subprotocol, the server may respond with HTTP 200 instead of upgrading the connection.

Manual WebSocket checks with [wscat](https://github.com/websockets/wscat):

```bash
wscat -c ws://localhost:8080/ghost-bunker -s ghost-bunker.v0.1
```

Use **Create secure room key** to generate a local 32-byte key and copy the invite link for other participants.

See [docs/manual-testing.md](docs/manual-testing.md) for more manual test notes.

## Tests

```bash
npm test
```

## Build

```bash
npm run build
```
