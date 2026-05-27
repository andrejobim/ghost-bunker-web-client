# Protocol notes (reference web client)

This folder contains the browser-side implementation of:

- v0.1 envelope encoding/decoding (generated Protobuf bindings under `src/gen/`)
- v0.1 WebSocket state machine (HELLO → WELCOME → JOIN_ROOM → SEND_ENCRYPTED_MESSAGE)
- client-side E2EE v0.1 (PBKDF2-HMAC-SHA256 + AES-256-GCM via WebCrypto)

Hard constraints enforced by this client:

- No plaintext over WebSocket (binary frames only; Protobuf `GhostEnvelope` only)
- No passphrase sent to server
- No derived key sent to server
- Message plaintext ≤ 4 KB (bytes) before encryption
- Ciphertext ≤ 16 KB
- Emoji / non-ASCII blocked before encryption
- `nickname` and `room_id` must be ASCII-visible (no whitespace)

