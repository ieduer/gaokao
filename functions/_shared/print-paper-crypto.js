// Sealed print PDFs. The repository and the static site are public, so a paper is committed only as
// AES-256-GCM ciphertext; the key is a secret of the Pages project (and of the local build).
// File layout: "GKP1" | 12-byte nonce | ciphertext with the 16-byte tag. The year is authenticated with
// the data, so one year's file cannot be served as another's.

const MAGIC = Uint8Array.of(0x47, 0x4b, 0x50, 0x31);
const NONCE_BYTES = 12, TAG_BYTES = 16;
export const SEAL_OVERHEAD = MAGIC.length + NONCE_BYTES + TAG_BYTES;

const aad = year => new TextEncoder().encode(`gk-print-paper:${year}`);
const validYear = year => /^20\d{2}$/.test(String(year));

export async function importPaperKey(secret) {
  let raw;
  try { raw = Uint8Array.from(atob(String(secret || '').trim()), c => c.charCodeAt(0)); } catch { raw = new Uint8Array(); }
  if (raw.length !== 32) throw new Error('The print paper key must be 32 bytes, base64-encoded');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export const isSealedPaper = bytes => bytes instanceof Uint8Array && bytes.length > SEAL_OVERHEAD && MAGIC.every((value, index) => bytes[index] === value);

export async function sealPaper(key, year, plain, nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES))) {
  if (!validYear(year) || !(plain instanceof Uint8Array) || !plain.length || nonce.length !== NONCE_BYTES) throw new Error('Invalid paper to seal');
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: aad(year), tagLength: TAG_BYTES * 8 }, key, plain));
  const out = new Uint8Array(MAGIC.length + NONCE_BYTES + sealed.length);
  out.set(MAGIC, 0); out.set(nonce, MAGIC.length); out.set(sealed, MAGIC.length + NONCE_BYTES);
  return out;
}

// Throws when the key, the year or a single byte does not match.
export async function openPaper(key, year, sealed) {
  if (!validYear(year) || !isSealedPaper(sealed)) throw new Error('Not a sealed paper');
  const nonce = sealed.subarray(MAGIC.length, MAGIC.length + NONCE_BYTES);
  const body = sealed.subarray(MAGIC.length + NONCE_BYTES);
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce, additionalData: aad(year), tagLength: TAG_BYTES * 8 }, key, body));
}
