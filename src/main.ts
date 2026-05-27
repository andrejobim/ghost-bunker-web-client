import { bytesToBase64Url, randomBytes } from "./protocol/bytes";
import { GhostBunkerClient } from "./protocol/client";
import { RoomCryptoV01 } from "./protocol/crypto_v01";
import {
  buildInviteLink,
  locationWithoutGbKeyFragment,
  parseInviteFromLocation,
  validateRoomId,
} from "./protocol/invite_link";
import {
  exportRoomKeyBase64Url,
  generateRoomKeyBytes,
  importRoomKeyBase64Url,
} from "./protocol/room_key";
import { asciiVisibleNoWhitespace, validateChatPlaintext } from "./protocol/validation";

const el = {
  wsUrl: document.getElementById("wsUrl") as HTMLInputElement,
  nickname: document.getElementById("nickname") as HTMLInputElement,
  roomId: document.getElementById("roomId") as HTMLInputElement,
  roomKeyState: document.getElementById("roomKeyState") as HTMLDivElement,
  createRoomKeyBtn: document.getElementById("createRoomKeyBtn") as HTMLButtonElement,
  importRoomKeyBtn: document.getElementById("importRoomKeyBtn") as HTMLButtonElement,
  copyInviteLinkBtn: document.getElementById("copyInviteLinkBtn") as HTMLButtonElement,
  importPanel: document.getElementById("importPanel") as HTMLDivElement,
  roomKeyImport: document.getElementById("roomKeyImport") as HTMLInputElement,
  confirmImportBtn: document.getElementById("confirmImportBtn") as HTMLButtonElement,
  cancelImportBtn: document.getElementById("cancelImportBtn") as HTMLButtonElement,
  inviteLinkPreview: document.getElementById("inviteLinkPreview") as HTMLDivElement,
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

type RoomKeyUiState =
  | "none"
  | "loaded"
  | "invite_ready"
  | "invite_copied";

let roomKeyBytes: Uint8Array | null = null;
let inviteLink: string | null = null;
let roomKeyUiState: RoomKeyUiState = "none";

let client: GhostBunkerClient | null = null;
let roomCrypto: RoomCryptoV01 | null = null;
let hasWelcome = false;
let hasRoomJoined = false;
let isConnecting = false;

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

function generateRoomId(): string {
  return bytesToBase64Url(randomBytes(9));
}

function hasRoomKeyLoaded(): boolean {
  return roomKeyBytes !== null && roomKeyBytes.byteLength === 32;
}

function setRoomKeyUiState(state: RoomKeyUiState) {
  roomKeyUiState = state;
  switch (state) {
    case "none":
      el.roomKeyState.textContent = "No room key loaded";
      break;
    case "loaded":
      el.roomKeyState.textContent = "Room key loaded locally";
      break;
    case "invite_ready":
      el.roomKeyState.textContent = "Invite link ready";
      break;
    case "invite_copied":
      el.roomKeyState.textContent = "Invite link copied";
      break;
  }
  updateButtons();
}

function clearRoomKey() {
  roomKeyBytes = null;
  inviteLink = null;
  roomCrypto = null;
  el.inviteLinkPreview.hidden = true;
  el.inviteLinkPreview.textContent = "";
  setRoomKeyUiState("none");
}

function loadRoomKey(bytes: Uint8Array) {
  roomKeyBytes = bytes;
  roomCrypto = null;
  setRoomKeyUiState("loaded");
  log("Room key loaded locally");
}

function refreshInviteLink() {
  if (!hasRoomKeyLoaded() || !roomKeyBytes) {
    inviteLink = null;
    el.copyInviteLinkBtn.disabled = true;
    el.inviteLinkPreview.hidden = true;
    return;
  }
  const roomCheck = validateRoomId(el.roomId.value);
  if (!roomCheck.ok) {
    inviteLink = null;
    el.copyInviteLinkBtn.disabled = true;
    return;
  }
  const roomId = el.roomId.value.trim();
  const b64 = exportRoomKeyBase64Url(roomKeyBytes);
  inviteLink = buildInviteLink({
    baseUrl: window.location.origin + window.location.pathname,
    roomId,
    roomKeyB64Url: b64,
  });
  el.copyInviteLinkBtn.disabled = false;
  el.inviteLinkPreview.hidden = true;
  if (roomKeyUiState === "loaded" || roomKeyUiState === "invite_ready" || roomKeyUiState === "invite_copied") {
    setRoomKeyUiState("invite_ready");
  }
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

function applyInviteFromUrl() {
  const parsed = parseInviteFromLocation(window.location);
  if (parsed.roomId) {
    el.roomId.value = parsed.roomId;
  }
  if (parsed.gbkey) {
    const imp = importRoomKeyBase64Url(parsed.gbkey);
    if (imp.ok) {
      loadRoomKey(imp.roomKeyBytes);
      refreshInviteLink();
      const clean = locationWithoutGbKeyFragment(window.location);
      history.replaceState(null, "", clean);
    } else {
      setStatus(imp.error);
    }
  }
}

loadPrefsIfEnabled();
applyInviteFromUrl();

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
  const roomIdCheck = validateRoomId(el.roomId.value);

  if (!validWsUrl(wsUrl)) return { ok: false, error: "WebSocket URL must be ws:// or wss://." };
  if (nickname.length > 0 && !asciiVisibleNoWhitespace(nickname)) {
    return { ok: false, error: "Nickname must be ASCII-visible (no whitespace, no emoji)." };
  }
  if (!roomIdCheck.ok) return { ok: false, error: roomIdCheck.error };
  if (!hasRoomKeyLoaded()) return { ok: false, error: "Room key required (load or create locally; never sent to server)." };
  return { ok: true };
}

function updateButtons() {
  const connected = client?.isOpen() ?? false;
  const connInputsOk = validateConnectionInputs().ok;
  const messageOk = validateChatPlaintext(el.message.value).ok;

  el.connectBtn.disabled = connected || isConnecting || !connInputsOk;
  el.disconnectBtn.disabled = !connected;
  el.joinBtn.disabled = !connected || !hasWelcome || hasRoomJoined;
  el.sendBtn.disabled = !connected || !hasRoomJoined || !messageOk;
  el.copyInviteLinkBtn.disabled = !inviteLink;
}

updateButtons();

for (const input of [el.wsUrl, el.nickname, el.roomId]) {
  input.addEventListener("input", () => {
    if (hasRoomKeyLoaded()) refreshInviteLink();
    updateButtons();
  });
}
el.message.addEventListener("input", () => updateButtons());

el.createRoomKeyBtn.addEventListener("click", () => {
  setStatus("");
  let roomId = el.roomId.value.trim();
  if (!roomId) {
    roomId = generateRoomId();
    el.roomId.value = roomId;
  }
  const roomCheck = validateRoomId(roomId);
  if (!roomCheck.ok) {
    setStatus(roomCheck.error);
    return;
  }
  const bytes = generateRoomKeyBytes();
  loadRoomKey(bytes);
  refreshInviteLink();
  log("Invite link ready");
});

el.importRoomKeyBtn.addEventListener("click", () => {
  el.importPanel.classList.add("open");
  el.roomKeyImport.value = "";
  el.roomKeyImport.focus();
});

el.cancelImportBtn.addEventListener("click", () => {
  el.importPanel.classList.remove("open");
  el.roomKeyImport.value = "";
});

el.confirmImportBtn.addEventListener("click", () => {
  setStatus("");
  const imp = importRoomKeyBase64Url(el.roomKeyImport.value);
  if (!imp.ok) {
    setStatus(imp.error);
    return;
  }
  loadRoomKey(imp.roomKeyBytes);
  el.importPanel.classList.remove("open");
  el.roomKeyImport.value = "";
  refreshInviteLink();
});

el.copyInviteLinkBtn.addEventListener("click", async () => {
  if (!inviteLink) return;
  try {
    await navigator.clipboard.writeText(inviteLink);
    setRoomKeyUiState("invite_copied");
    log("Invite link copied");
  } catch {
    setStatus("Could not copy invite link to clipboard.");
  }
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
        const roomId = el.roomId.value.trim();
        if (!hasRoomKeyLoaded() || !roomKeyBytes || roomId !== e.roomId) {
          log("DECRYPT_FAILED: unable to decrypt with current room key");
          return;
        }
        RoomCryptoV01.decrypt({
          roomId: e.roomId,
          roomKeyBytes,
          keyId: e.keyId,
          nonce: e.nonce,
          ciphertext: e.ciphertext,
          aadVersion: e.aadVersion,
          subtle: crypto.subtle,
        })
          .then((msg) => {
            appendChat(`DECRYPTED_MESSAGE: ${msg}`);
          })
          .catch(() => {
            log("DECRYPT_FAILED: unable to decrypt with current room key");
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
  const roomCheck = validateRoomId(roomId);
  if (!roomCheck.ok) {
    setStatus(roomCheck.error);
    return;
  }
  if (!hasRoomKeyLoaded() || !roomKeyBytes) {
    setStatus("Room key required (never sent to server).");
    return;
  }

  try {
    roomCrypto = await RoomCryptoV01.forRoom({
      roomId,
      roomKeyBytes,
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
