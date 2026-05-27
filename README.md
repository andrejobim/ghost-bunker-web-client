# Ghost Bunker Reference Web Client (v0.2)

This is an **optional, separate** browser reference client for exercising Ghost Bunker Protocol **v0.1** servers. It lives in its own repository and is not required to run or deploy a server.

## Relationship to the server

| | Server | This web client |
|---|--------|-----------------|
| Required for the other? | No | No |
| Repository | `ghost-bunker-protocol-server` (or compatible fork) | `ghost-bunker-web-client` |
| Role | Authoritative relay for encrypted frames | Manual testing and demonstration UI |

- The **server does not depend on this client**. Any conforming v0.1 implementation can be used instead.
- This **client does not depend on a specific server build** beyond protocol compatibility. Point it at any Ghost Bunker Protocol **v0.1** WebSocket endpoint that accepts the subprotocol below.
- The client negotiates WebSocket subprotocol **`ghost-bunker.v0.1`** on connect (required by server v0.3+). Without it, the server may respond with HTTP 200 instead of upgrading the socket.

See [docs/e2ee-v0.2.md](docs/e2ee-v0.2.md) for the room key and invite link model, and [docs/manual-testing.md](docs/manual-testing.md) for hands-on checks.

Cryptographic review milestone (planning only, no v0.x advanced crypto):
[docs/v1.0-cryptographic-review.md](docs/v1.0-cryptographic-review.md).

## Room key and invite links (summary)

End-to-end encryption in this client is **experimental** and has **not been independently audited**. Treat it as a reference design, not a production security guarantee.

| Topic | Behavior |
|-------|----------|
| Key generation | The browser generates a **32-byte** `room_key` locally (`crypto.getRandomValues`). |
| Server visibility | The room key is **never** sent to the server (no field, header, or log path). |
| Sharing | Use an **invite link**: `room_id` in the query string, key only in the fragment `#gbkey=<base64url>`. |
| Persistence | The room key is **not** written to `localStorage` by default (optional prefs store only WS URL, nickname, room ID). |
| Access control | **Anyone with the invite link** can decrypt messages for that room. |
| Recovery | If the room key is **lost**, the server **cannot** recover plaintext or keys. |

Full detail: [docs/e2ee-v0.2.md](docs/e2ee-v0.2.md).

## Goals

- Reference-quality **browser** client for manual testing of:
  - v0.1 Protobuf wire format (`GhostEnvelope`) inside **binary WebSocket frames**
  - v0.1 state machine (HELLO → WELCOME → JOIN_ROOM → SEND_ENCRYPTED_MESSAGE)
  - client-side E2EE: **32-byte room key + AES-256-GCM** (WebCrypto); wire `cipher_suite` unchanged
- Room key + **invite link** (`#gbkey=`) instead of manual passphrase
- Minimal UI (connect / join / encrypt+send / log)
- Client-side crypto and invite-link unit tests

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

1. Start any compatible Ghost Bunker Protocol v0.1 server (see the server repository).

2. Start the web client:

```bash
npm run dev
```

Open the printed Vite URL (e.g. `http://localhost:5173`) and connect to `ws://localhost:8080/ghost-bunker` (or your server’s WebSocket path).

**Server v0.3+** requires subprotocol `ghost-bunker.v0.1` during the upgrade handshake. This client negotiates it automatically.

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
