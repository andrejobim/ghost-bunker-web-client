import { toBinary, fromBinary, create } from "@bufbuild/protobuf";
function redactId(id: string | undefined | null): string {
  if (!id) return "?";
  const s = String(id);
  if (s.length <= 8) return `${s}...`;
  return `${s.slice(0, 8)}...`;
}
import {
  CipherSuite,
  ClientCapabilitiesSchema,
  GhostEnvelopeSchema,
  type GhostEnvelope,
  HelloSchema,
  JoinRoomSchema,
  MessageType,
  PongSchema,
  SendEncryptedMessageSchema,
} from "../gen/proto/ghost_bunker_v1_pb";

/** WebSocket subprotocol required by Ghost Bunker server v0.3+. */
export const GHOST_BUNKER_WS_SUBPROTOCOL = "ghost-bunker.v0.1";

const WS_CONNECT_FAILED_MSG =
  "WebSocket connection failed. Check URL, server status, allowed origin, and subprotocol.";

type ClientCapabilitiesInput = {
  e2eeSupported: boolean;
  maxCiphertextBytesSupported: number;
};

type ConnectHelloParams = {
  clientName?: string;
  nickname?: string;
  capabilities: ClientCapabilitiesInput;
};

type ClientParams = {
  url: string;
  onLog: (line: string) => void;
  onError: (err: unknown) => void;
  onEvent?: (e: GhostBunkerClientEvent) => void;
};

export type GhostBunkerClientEvent =
  | { type: "welcome"; sessionIdRedacted: string; userIdRedacted: string; displayName: string }
  | { type: "room_joined"; roomId: string }
  | {
      type: "encrypted_message";
      roomId: string;
      fromUserIdRedacted: string;
      serverMessageIdRedacted: string;
      ciphertextBytes: number;
      keyId: string;
      nonce: Uint8Array;
      ciphertext: Uint8Array;
      aadVersion: number;
    }
  | { type: "closed" };

type SendEncryptedParams = {
  roomId: string;
  keyId: string;
  cipherSuite: "PBKDF2_HMAC_SHA256_AES_256_GCM";
  nonce: Uint8Array;
  ciphertext: Uint8Array;
  aadVersion: number;
};

export class GhostBunkerClient {
  private readonly url: string;
  private readonly onLog: (line: string) => void;
  private readonly onError: (err: unknown) => void;
  private readonly onEvent?: (e: GhostBunkerClientEvent) => void;
  private ws: WebSocket | null = null;
  private established = false;

  constructor(params: ClientParams) {
    this.url = params.url;
    this.onLog = params.onLog;
    this.onError = params.onError;
    this.onEvent = params.onEvent;
  }

  isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  close(): void {
    try {
      this.ws?.close();
    } catch {
      // ignore
    } finally {
      this.ws = null;
      this.established = false;
    }
  }

  private sendEnvelope(env: GhostEnvelope): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error("WebSocket is not open.");
    const bytes = toBinary(GhostEnvelopeSchema, env);
    // Always binary frame (ArrayBuffer-backed).
    this.ws.send(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  }

  private newBaseEnvelope(type: MessageType, roomId?: string, requestId?: string): GhostEnvelope {
    const env = create(GhostEnvelopeSchema, {
      protocol: "ghost-bunker",
      version: "0.1",
      messageId: crypto.randomUUID(),
      timestampMs: BigInt(Date.now()),
      type,
      requestId: requestId ?? "",
      roomId: roomId ?? "",
    });
    return env;
  }

  async connectAndHello(params: ConnectHelloParams): Promise<void> {
    if (this.ws) throw new Error("Already connected.");

    const ws = new WebSocket(this.url, GHOST_BUNKER_WS_SUBPROTOCOL);
    ws.binaryType = "arraybuffer";
    this.ws = ws;

    const openPromise = new Promise<void>((resolve, reject) => {
      let opened = false;
      const fail = () => {
        if (!opened) reject(new Error(WS_CONNECT_FAILED_MSG));
      };
      ws.addEventListener(
        "open",
        () => {
          opened = true;
          resolve();
        },
        { once: true },
      );
      ws.addEventListener("error", fail, { once: true });
      ws.addEventListener("close", fail, { once: true });
    });
    await openPromise;

    ws.addEventListener("message", (ev) => void this.onMessage(ev));
    ws.addEventListener("close", () => {
      this.established = false;
      this.onLog("Socket closed.");
      this.onEvent?.({ type: "closed" });
    });
    ws.addEventListener("error", (e) => this.onError(e));

    const caps = create(ClientCapabilitiesSchema, {
      e2eeSupported: params.capabilities.e2eeSupported,
      supportedCipherSuites: [CipherSuite.PBKDF2_HMAC_SHA256_AES_256_GCM],
      maxCiphertextBytesSupported: params.capabilities.maxCiphertextBytesSupported,
    });

    const hello = create(HelloSchema, {
      clientName: params.clientName ?? "",
      nickname: params.nickname ?? "",
      capabilities: caps,
    });

    const env = this.newBaseEnvelope(MessageType.HELLO);
    env.payload = { case: "hello", value: hello };
    this.sendEnvelope(env);

    // Wait for WELCOME or ERROR/GOODBYE.
    await this.waitForEstablished(5_000);
  }

  private waitForEstablished(timeoutMs: number): Promise<void> {
    const started = Date.now();
    return new Promise((resolve, reject) => {
      const tick = () => {
        if (this.established) return resolve();
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return reject(new Error("Socket closed before WELCOME."));
        if (Date.now() - started > timeoutMs) return reject(new Error("Timed out waiting for WELCOME."));
        setTimeout(tick, 50);
      };
      tick();
    });
  }

  async joinRoom(roomId: string): Promise<void> {
    const env = this.newBaseEnvelope(MessageType.JOIN_ROOM, roomId, crypto.randomUUID());
    env.payload = { case: "joinRoom", value: create(JoinRoomSchema, { roomId }) };
    this.sendEnvelope(env);
  }

  async sendEncryptedMessage(params: SendEncryptedParams): Promise<void> {
    if (params.ciphertext.byteLength > 16_384) {
      throw new Error("Ciphertext exceeds 16 KB.");
    }

    const requestId = crypto.randomUUID();
    const env = this.newBaseEnvelope(MessageType.SEND_ENCRYPTED_MESSAGE, params.roomId, requestId);

    const msg = create(SendEncryptedMessageSchema, {
      clientMessageId: crypto.randomUUID(),
      keyId: params.keyId,
      cipherSuite: CipherSuite.PBKDF2_HMAC_SHA256_AES_256_GCM,
      nonce: params.nonce,
      ciphertext: params.ciphertext,
      aadVersion: params.aadVersion,
    });
    env.payload = { case: "sendEncryptedMessage", value: msg };
    this.sendEnvelope(env);
    this.onLog(`Sent encrypted message (key_id=${redactId(params.keyId)}, ct=${params.ciphertext.length}B).`);
  }

  private async onMessage(ev: MessageEvent): Promise<void> {
    try {
      const ab = ev.data instanceof ArrayBuffer ? ev.data : await (ev.data as Blob).arrayBuffer();
      const bytes = new Uint8Array(ab);
      const env = fromBinary(GhostEnvelopeSchema, bytes);
      this.handleEnvelope(env);
    } catch (e) {
      this.onError(e);
    }
  }

  private handleEnvelope(env: GhostEnvelope): void {
    switch (env.type) {
      case MessageType.WELCOME: {
        this.established = true;
        const welcome = env.payload.case === "welcome" ? env.payload.value : undefined;
        const sessionIdRedacted = redactId(welcome?.sessionId);
        const userIdRedacted = redactId(welcome?.userId);
        const displayName = welcome?.displayName ?? "?";
        this.onLog(`WELCOME: session_id=${sessionIdRedacted} user_id=${userIdRedacted} display_name=${displayName}`);
        this.onEvent?.({ type: "welcome", sessionIdRedacted, userIdRedacted, displayName });
        break;
      }
      case MessageType.ROOM_JOINED: {
        const rj = env.payload.case === "roomJoined" ? env.payload.value : undefined;
        const roomId = rj?.roomId ?? env.roomId;
        this.onLog(`ROOM_JOINED: room_id=${roomId} online=${rj?.onlineCount ?? 0}`);
        if (roomId) this.onEvent?.({ type: "room_joined", roomId });
        break;
      }
      case MessageType.PING: {
        const ping = env.payload.case === "ping" ? env.payload.value : undefined;
        const pingNonce = ping?.nonce ?? "";
        const pongEnv = this.newBaseEnvelope(MessageType.PONG, "", "");
        pongEnv.payload = { case: "pong", value: create(PongSchema, { nonce: pingNonce }) };
        this.sendEnvelope(pongEnv);
        this.onLog(`PING→PONG (nonce=${redactId(pingNonce)})`);
        break;
      }
      case MessageType.MESSAGE_ACCEPTED: {
        const ma = env.payload.case === "messageAccepted" ? env.payload.value : undefined;
        this.onLog(
          `MESSAGE_ACCEPTED: server_message_id=${redactId(ma?.serverMessageId)} room_id=${ma?.roomId ?? env.roomId}`,
        );
        break;
      }
      case MessageType.ENCRYPTED_MESSAGE: {
        const em = env.payload.case === "encryptedMessage" ? env.payload.value : undefined;
        const fromUserIdRedacted = redactId(em?.fromUserId);
        const serverMessageIdRedacted = redactId(em?.serverMessageId);
        const ciphertextBytes = em?.ciphertext?.length ?? 0;
        this.onLog(`ENCRYPTED_MESSAGE: from=${fromUserIdRedacted} server_message_id=${serverMessageIdRedacted} ct=${ciphertextBytes}B`);
        const roomId = env.roomId;
        if (roomId && em?.ciphertext && em?.nonce && em?.keyId) {
          this.onEvent?.({
            type: "encrypted_message",
            roomId,
            fromUserIdRedacted,
            serverMessageIdRedacted,
            ciphertextBytes,
            keyId: em.keyId,
            nonce: em.nonce,
            ciphertext: em.ciphertext,
            aadVersion: em.aadVersion,
          });
        }
        break;
      }
      case MessageType.ERROR: {
        const err = env.payload.case === "error" ? env.payload.value : undefined;
        this.onLog(`ERROR: code=${err?.code ?? 0} message=${err?.message ?? ""} request_id=${err?.requestId ?? ""}`);
        break;
      }
      case MessageType.GOODBYE: {
        const gb = env.payload.case === "goodbye" ? env.payload.value : undefined;
        this.onLog(`GOODBYE: reason=${gb?.reason ?? 0} message=${gb?.message ?? ""}`);
        break;
      }
      default: {
        this.onLog(`RECV: type=${env.type} (ignored)`);
      }
    }
  }
}

