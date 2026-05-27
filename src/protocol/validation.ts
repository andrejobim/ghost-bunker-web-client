const ASCII_VISIBLE_NO_WHITESPACE = /^[\x21-\x7E]+$/;

export function asciiVisibleNoWhitespace(s: string): boolean {
  return ASCII_VISIBLE_NO_WHITESPACE.test(s);
}

export type ValidationResult = { ok: true } | { ok: false; error: string };

export function validateChatPlaintext(plaintext: string): ValidationResult {
  const bytes = new TextEncoder().encode(plaintext);
  if (bytes.length === 0) return { ok: false, error: "Message is empty." };
  if (bytes.length > 4096) return { ok: false, error: "Plaintext exceeds 4 KB before encryption." };

  // Block emoji / non-ASCII. Allow common whitespace in chat (space/newline/tab).
  for (const ch of plaintext) {
    const cp = ch.codePointAt(0)!;
    const isAllowedWhitespace = ch === " " || ch === "\n" || ch === "\r" || ch === "\t";
    const isPrintableAscii = cp >= 0x21 && cp <= 0x7e;
    if (!isAllowedWhitespace && !isPrintableAscii) {
      return { ok: false, error: "Message contains non-ASCII characters (emoji/invalid text blocked)." };
    }
  }
  return { ok: true };
}

