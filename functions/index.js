// OPTIONAL feature. Do not deploy unless you have enabled the Firebase Blaze plan.
// Lets a phone-only shop owner (no email, so no reset email) set a new password with the
// recovery code they saved at signup. Wrong guesses are counted and locked after 5 tries.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const crypto = require('crypto');

admin.initializeApp();
const PHONE_DOMAIN = 'phone.bakikhata.app';
const MAX_ATTEMPTS = 5;

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const same = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
function newCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  const c = [...bytes].map((b) => chars[b % chars.length]).join('');
  return c.slice(0, 4) + '-' + c.slice(4);
}

// The region here must match VITE_FUNCTIONS_REGION in the web app (default us-central1).
exports.resetWithRecoveryCode = onCall({ region: 'us-central1', cors: true }, async (req) => {
  const { phone, code, newPassword } = req.data || {};
  if (!/^01\d{9}$/.test(phone || '') || typeof code !== 'string' || typeof newPassword !== 'string')
    throw new HttpsError('invalid-argument', 'Invalid request.');
  if (newPassword.length < 6) throw new HttpsError('invalid-argument', 'Password too short.');

  let user;
  try { user = await admin.auth().getUserByEmail(`${phone}@${PHONE_DOMAIN}`); }
  catch { throw new HttpsError('permission-denied', 'Wrong details.'); } // same message as a wrong code

  const ref = admin.firestore().doc(`recovery/${user.uid}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('permission-denied', 'Wrong details.');
  const { hash, attempts = 0 } = snap.data();
  if (attempts >= MAX_ATTEMPTS) throw new HttpsError('resource-exhausted', 'Too many attempts.');

  const given = sha(`${user.uid}:${code.trim().toUpperCase()}`);
  if (!same(given, hash)) {
    await ref.update({ attempts: admin.firestore.FieldValue.increment(1) });
    throw new HttpsError('permission-denied', 'Wrong details.');
  }
  await admin.auth().updateUser(user.uid, { password: newPassword });
  const fresh = newCode(); // old code is now useless
  await ref.set({ hash: sha(`${user.uid}:${fresh}`), attempts: 0 });
  return { newCode: fresh };
});
