# Ghost Bunker Reference Web Client (v0.2-reference)

This is the **first browser reference client** for the Ghost Bunker Protocol v0.1 server in this repository.

## Goals

- Reference-quality **browser** client for manual testing of:
  - v0.1 Protobuf wire format (`GhostEnvelope`) inside **binary WebSocket frames**
  - v0.1 state machine (HELLO → WELCOME → JOIN_ROOM → SEND_ENCRYPTED_MESSAGE)
  - client-side E2EE v0.1: **PBKDF2-HMAC-SHA256 + AES-256-GCM** (WebCrypto)
- Minimal UI (connect / join / encrypt+send / log)
- Client-side crypto unit tests

## Hard rules enforced

- No plaintext over WebSocket (binary frames only)
- No passphrase sent to server
- No derived key sent to server
- No telemetry
- No persistent identity
- `localStorage` is **optional** and **disabled by default**
- Emoji / non-ASCII blocked before encryption
- Message plaintext ≤ 4 KB (bytes) before encryption
- Ciphertext ≤ 16 KB

## Setup

From repo root:

```bash
cd ghost-bunker-protocol-client
npm install
npm run gen
```

## Run

1. Start the server:

```bash
mvn spring-boot:run
```

2. Start the web client:

```bash
cd ghost-bunker-protocol-client
npm run dev
```

Open the printed Vite URL and connect to `ws://localhost:8080/ghost-bunker`.

## Tests

```bash
cd ghost-bunker-protocol-client
npm test
```

