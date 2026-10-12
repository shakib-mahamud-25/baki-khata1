// The 6-digit PIN is a lock for THIS device only. It is never sent to Firebase.
// Real security = Firebase Auth (email/password) + firestore.rules.
const key = (uid) => 'bk_pin_' + uid;
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (s) => new Uint8Array(s.match(/../g).map((h) => parseInt(h, 16)));

async function derive(pin, salt) {
  const k = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' }, k, 256));
}

export const hasPin = (uid) => !!localStorage.getItem(key(uid));
export const clearPin = (uid) => localStorage.removeItem(key(uid));

export async function setPin(uid, pin) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  localStorage.setItem(key(uid), JSON.stringify({ s: hex(salt), h: await derive(pin, salt) }));
}

export async function checkPin(uid, pin) {
  const raw = localStorage.getItem(key(uid));
  if (!raw) return false;
  const { s, h } = JSON.parse(raw);
  return (await derive(pin, unhex(s))) === h;
}
