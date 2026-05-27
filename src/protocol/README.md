# Protocol notes (reference web client)

This folder contains the browser-side implementation of:

- v0.1 envelope encoding/decoding (generated Protobuf bindings under `src/gen/`)
- v0.1 WebSocket state machine (HELLO → WELCOME → JOIN_ROOM → SEND_ENCRYPTED_MESSAGE)
- client-side E2EE v0.2: **32-byte room key** imported as AES-256-GCM (wire `cipher_suite` unchanged)

Hard constraints enforced by this client:

- No plaintext over WebSocket (binary frames only; Protobuf `GhostEnvelope` only)
- No room key, gbkey, passphrase, or derived key sent to server
- Message plaintext ≤ 4 KB (bytes) before encryption
- Ciphertext ≤ 16 KB
- Emoji / non-ASCII blocked before encryption
- `nickname` and `room_id` must be ASCII-visible (no whitespace)

Room key and invite links: [docs/e2ee-v0.2.md](../../docs/e2ee-v0.2.md)
