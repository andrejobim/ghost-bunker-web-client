import { GhostBunkerClient } from "./protocol/client";
import { RoomCryptoV01 } from "./protocol/crypto_v01";
import { asciiVisibleNoWhitespace, validateChatPlaintext } from "./protocol/validation";

const el = {
  wsUrl: document.getElementById("wsUrl") as HTMLInputElement,
  nickname: document.getElementById("nickname") as HTMLInputElement,
  roomId: document.getElementById("roomId") as HTMLInputElement,
  passphrase: document.getElementById("passphrase") as HTMLInputElement,
  togglePassphraseBtn: document.getElementById("togglePassphraseBtn") as HTMLButtonElement,
  useLocalStorage: document.getElementById("useLocalStorage") as HTMLInputElement,
  connectBtn: document.getElementById("connectBtn") as HTMLButtonElement,
  disconnectBtn: document.getElementById("disconnectBtn") as HTMLButtonElement,
  joinBtn: document.getElementById("joinBtn") as HTMLButtonElement,
  sendBtn: document.getElementById("sendBtn") as HTMLButtonElement,
  clearLogBtn: document.getElementById("clearLogBtn") as HTMLButtonElement,
  message: document.getElementById("message") as HTMLTextAreaElement,
  chat: document.getElementById("chat") as HTMLDivElement,
  log: document.getElementById("log") as HTMLDivElement,
  status: document.getElementById("status") as HTMLDivElement,
};

function appendChat(line: string) {
  const ts = new Date().toISOString();
  el.chat.textContent = `${el.chat.textContent ?? ""}[${ts}] ${line}\n`;
  el.chat.scrollTop = el.chat.scrollHeight;
}

function log(line: string) {
  const ts = new Date().toISOString();
  el.log.textContent = `${el.log.textContent ?? ""}[${ts}] ${line}\n`;
  el.log.scrollTop = el.log.scrollHeight;
}

function setStatus(s: string) {
  el.status.textContent = s;
}

function loadPrefsIfEnabled() {
  if (!el.useLocalStorage.checked) return;
  try {
    const raw = localStorage.getItem("ghostbunker.refweb.prefs.v0.2");
    if (!raw) return;
    const v = JSON.parse(raw) as { wsUrl?: string; nickname?: string; roomId?: string };
    if (typeof v.wsUrl === "string") el.wsUrl.value = v.wsUrl;
    if (typeof v.nickname === "string") el.nickname.value = v.nickname;
    if (typeof v.roomId === "string") el.roomId.value = v.roomId;
  } catch {
    // ignore
  }
}

function savePrefsIfEnabled() {
  if (!el.useLocalStorage.checked) return;
  try {
    localStorage.setItem(
      "ghostbunker.refweb.prefs.v0.2",
      JSON.stringify({ wsUrl: el.wsUrl.value, nickname: el.nickname.value, roomId: el.roomId.value }),
    );
  } catch {
    // ignore
  }
}

loadPrefsIfEnabled();

let client: GhostBunkerClient | null = null;
let roomCrypto: RoomCryptoV01 | null = null;
let hasWelcome = false;
let hasRoomJoined = false;
let isConnecting = false;

function validWsUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "ws:" || u.protocol === "wss:";
  } catch {
    return false;
  }
}

function validateConnectionInputs(): { ok: true } | { ok: false; error: string } {
  const wsUrl = el.wsUrl.value.trim();
  const nickname = el.nickname.value.trim();
  const roomId = el.roomId.value.trim();
  const passphrase = el.passphrase.value;

  if (!validWsUrl(wsUrl)) return { ok: false, error: "WebSocket URL must be ws:// or wss://." };
  if (nickname.length > 0 && !asciiVisibleNoWhitespace(nickname)) {
    return { ok: false, error: "Nickname must be ASCII-visible (no whitespace, no emoji)." };
  }
  if (!asciiVisibleNoWhitespace(roomId)) {
    return { ok: false, error: "Room ID must be ASCII-visible (no whitespace, no emoji)." };
  }
  if (!passphrase || passphrase.length < 1) return { ok: false, error: "Passphrase required (never sent to server)." };
  return { ok: true };
}

function updateButtons() {
  const connected = client?.isOpen() ?? false;
  const connInputsOk = validateConnectionInputs().ok;
  const messageOk = validateChatPlaintext(el.message.value).ok;

  el.connectBtn.disabled = connected || isConnecting || !connInputsOk;
  el.disconnectBtn.disabled = !connected;

  // Join is only meaningful after WELCOME and before ROOM_JOINED.
  el.joinBtn.disabled = !connected || !hasWelcome || hasRoomJoined;

  // Send only after ROOM_JOINED and message is valid.
  el.sendBtn.disabled = !connected || !hasRoomJoined || !messageOk;
}

updateButtons();

for (const input of [el.wsUrl, el.nickname, el.roomId, el.passphrase]) {
  input.addEventListener("input", () => {
    updateButtons();
  });
}
el.message.addEventListener("input", () => updateButtons());

el.togglePassphraseBtn.addEventListener("click", () => {
  const isHidden = el.passphrase.type === "password";
  el.passphrase.type = isHidden ? "text" : "password";
  el.togglePassphraseBtn.textContent = isHidden ? "Hide" : "Show";
  el.togglePassphraseBtn.setAttribute("aria-label", isHidden ? "Hide passphrase" : "Show passphrase");
});

el.clearLogBtn.addEventListener("click", () => {
  el.log.textContent = "";
  el.chat.textContent = "";
});

el.useLocalStorage.addEventListener("change", () => {
  if (el.useLocalStorage.checked) loadPrefsIfEnabled();
});

el.connectBtn.addEventListener("click", async () => {
  setStatus("");
  const inputCheck = validateConnectionInputs();
  if (!inputCheck.ok) {
    setStatus(inputCheck.error);
    updateButtons();
    return;
  }

  const wsUrl = el.wsUrl.value.trim();
  const nickname = el.nickname.value.trim();
  hasWelcome = false;
  hasRoomJoined = false;
  roomCrypto = null;
  isConnecting = true;
  updateButtons();

  client = new GhostBunkerClient({
    url: wsUrl,
    onLog: log,
    onError: (e) => setStatus(String(e)),
    onEvent: (e) => {
      if (e.type === "welcome") {
        hasWelcome = true;
        updateButtons();
      }
      if (e.type === "room_joined") {
        hasRoomJoined = true;
        updateButtons();
      }
      if (e.type === "encrypted_message") {
        const passphrase = el.passphrase.value;
        const roomId = el.roomId.value.trim();
        if (!passphrase || !roomCrypto || roomId !== e.roomId) {
          log("DECRYPT_FAILED: unable to decrypt with current room passphrase");
          return;
        }
        RoomCryptoV01.decrypt({
          roomId: e.roomId,
          passphrase,
          keyId: e.keyId,
          nonce: e.nonce,
          ciphertext: e.ciphertext,
          aadVersion: e.aadVersion,
          subtle: crypto.subtle,
        })
          .then((msg) => {
            // Display decrypted plaintext only in chat area, not in technical log.
            appendChat(`DECRYPTED_MESSAGE: ${msg}`);
          })
          .catch(() => {
            log("DECRYPT_FAILED: unable to decrypt with current room passphrase");
          });
      }
      if (e.type === "closed") {
        hasWelcome = false;
        hasRoomJoined = false;
        roomCrypto = null;
        updateButtons();
      }
    },
  });

  try {
    await client.connectAndHello({
      clientName: "ghost-bunker-protocol-client",
      nickname: nickname.length > 0 ? nickname : undefined,
      capabilities: {
        e2eeSupported: true,
        maxCiphertextBytesSupported: 16_384,
      },
    });
    savePrefsIfEnabled();
    log("Connected + handshake OK.");
  } catch (e) {
    setStatus(String(e));
    client.close();
    client = null;
  } finally {
    isConnecting = false;
    updateButtons();
  }
});

el.disconnectBtn.addEventListener("click", () => {
  setStatus("");
  client?.close();
  client = null;
  roomCrypto = null;
  hasWelcome = false;
  hasRoomJoined = false;
  isConnecting = false;
  updateButtons();
  log("Disconnected.");
});

el.joinBtn.addEventListener("click", async () => {
  setStatus("");
  if (!client) return;
  const roomId = el.roomId.value.trim();
  if (!asciiVisibleNoWhitespace(roomId)) {
    setStatus("Room ID must be ASCII-visible (no whitespace, no emoji).");
    return;
  }
  const passphrase = el.passphrase.value;
  if (!passphrase || passphrase.length < 1) {
    setStatus("Passphrase required (never sent to server).");
    return;
  }

  try {
    roomCrypto = await RoomCryptoV01.forRoom({
      roomId,
      passphrase,
      subtle: crypto.subtle,
    });
    await client.joinRoom(roomId);
    log(`Join requested for room '${roomId}'.`);
  } catch (e) {
    setStatus(String(e));
  }
  updateButtons();
});

el.sendBtn.addEventListener("click", async () => {
  setStatus("");
  if (!client || !roomCrypto) {
    setStatus("Connect + join room first.");
    return;
  }
  const roomId = el.roomId.value.trim();
  const plaintext = el.message.value;
  const v = validateChatPlaintext(plaintext);
  if (!v.ok) {
    setStatus(v.error);
    return;
  }
  try {
    const enc = await roomCrypto.encrypt(plaintext);
    await client.sendEncryptedMessage({
      roomId,
      keyId: enc.keyId,
      cipherSuite: "PBKDF2_HMAC_SHA256_AES_256_GCM",
      nonce: enc.nonce,
      ciphertext: enc.ciphertext,
      aadVersion: enc.aadVersion,
    });
    el.message.value = "";
  } catch (e) {
    setStatus(String(e));
  }
  updateButtons();
});

