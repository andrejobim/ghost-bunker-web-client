# Ghost Bunker E2EE — Reference Web Client v0.2

## Overview

Protocol wire format remains **v0.1** (Protobuf `GhostEnvelope`, binary WebSocket frames, `cipher_suite = PBKDF2_HMAC_SHA256_AES_256_GCM` on the wire).

**v0.2** changes how the browser obtains the symmetric key:

| v0.1 (removed) | v0.2 (current) |
|----------------|----------------|
| User-chosen room passphrase | 32-byte random `room_key` generated in the browser |
| `key_id` = base64url(room salt) | `key_id` = first 16 chars of base64url(SHA-256(room_key)) |
| PBKDF2 derives AES-256-GCM key | `room_key` imported directly as AES-256-GCM raw key |

The server never receives the room key, passphrase, derived key, or plaintext.

## Room key

- Generated with `crypto.getRandomValues(new Uint8Array(32))`.
- Encoded as **base64url** for sharing (import must decode to exactly 32 bytes).
- Stored only in memory for the session (not written to `localStorage` by default).

## Invite link

Format:

```text
https://example.com/?room=<room_id>#gbkey=<base64url-room-key>
```

- `room_id` is in the **query string** (`?room=`).
- `room_key` is only in the **URL fragment** (`#gbkey=`).
- Never put `gbkey` before `#` or in the query string.
- Opening the link imports the key locally; the client may clear the fragment with `history.replaceState` to reduce on-screen exposure (query `room` is kept).

Anyone with the invite link can decrypt room messages. If you lose the room key, the server cannot recover it.

## Encryption (unchanged on the wire)

- AES-256-GCM
- Random 12-byte nonce per message
- `ciphertext`, `key_id`, and `cipher_suite` required on `SendEncryptedMessage`
- AAD v1: `ghost-bunker|0.1|<room_id>|<key_id>|PBKDF2_HMAC_SHA256_AES_256_GCM|<aad_version>`

## Logging

The reference client does not log `room_key`, `gbkey`, derived keys, full plaintext/ciphertext/nonce, or full session/user IDs.

## Local storage

When “Remember local settings” is enabled, only **WebSocket URL**, **nickname**, and **room_id** are persisted.

Never stored: `room_key`, `gbkey`, derived key, plaintext, ciphertext, message history.
