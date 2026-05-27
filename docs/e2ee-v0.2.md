# Ghost Bunker E2EE — Reference Web Client v0.2

## Scope and disclaimer

This document describes how the **reference web client** handles room keys and invite links. It does **not** change the Ghost Bunker Protocol v0.1 wire format on the server.

- The web client is **optional** and maintained **separately** from the server.
- The server **does not depend** on this client; other clients may implement the same or different key distribution.
- This E2EE model is **experimental** and has **not been independently audited**. Do not rely on it for high-assurance threat models without your own review.

## Overview

Protocol wire format remains **v0.1** (Protobuf `GhostEnvelope`, binary WebSocket frames, `cipher_suite = PBKDF2_HMAC_SHA256_AES_256_GCM` on the wire).

**v0.2** changes how the browser obtains the symmetric key:

| v0.1 (removed) | v0.2 (current) |
|----------------|----------------|
| User-chosen room passphrase | 32-byte random `room_key` generated in the browser |
| `key_id` = base64url(room salt) | `key_id` = first 16 chars of base64url(SHA-256(room_key)) |
| PBKDF2 derives AES-256-GCM key | `room_key` imported directly as AES-256-GCM raw key |

The server never receives the room key, passphrase, derived key, gbkey, or message plaintext.

## Connecting to a server

The client targets **any compatible Ghost Bunker Protocol v0.1** WebSocket endpoint. Compatibility means:

- Binary WebSocket frames carrying Protobuf `GhostEnvelope`
- v0.1 message flow (HELLO → WELCOME → JOIN_ROOM → SEND_ENCRYPTED_MESSAGE)
- WebSocket subprotocol **`ghost-bunker.v0.1`** on the upgrade handshake (required by reference server v0.3+)

The reference client always passes `ghost-bunker.v0.1` when opening the socket. Server URL and path are user-configurable in the UI; they are not tied to a single deployment.

## Room key

- **Generated locally** in the browser: `crypto.getRandomValues(new Uint8Array(32))`.
- Encoded as **base64url** for sharing (import must decode to exactly 32 bytes).
- Held in **memory** for the session only.
- **Never sent to the server** — not in HELLO, JOIN_ROOM, ciphertext metadata, query strings, or logs.
- **Not saved to `localStorage` by default.** Optional “Remember local settings” persists only WebSocket URL, nickname, and `room_id`.

## Invite link

Participants share access by copying an invite link. Format:

```text
https://example.com/?room=<room_id>#gbkey=<base64url-room-key>
```

| Part | Location | Sent to server? |
|------|----------|-----------------|
| `room_id` | Query: `?room=` | Yes (JOIN_ROOM uses room id) |
| `room_key` | Fragment only: `#gbkey=` | **No** — fragments are not sent in HTTP/WebSocket requests |

Rules:

- Put `gbkey` **only** after `#`, never in the query string.
- Opening the link imports the key in the browser; the client may clear the fragment with `history.replaceState` to reduce on-screen exposure (query `room` is kept).

### Trust and recovery

- **Anyone with the full invite link** (including `#gbkey=…`) can decrypt messages for that room for as long as the same key is used.
- The link is effectively the **shared secret**. Treat it like a password: use HTTPS for the page origin, avoid posting links in public channels, and rotate by creating a new room key if leaked.
- If the **room key is lost** and no participant still has it, **the server cannot recover** messages or derive the key. Ciphertext on the wire remains opaque to the relay.

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
