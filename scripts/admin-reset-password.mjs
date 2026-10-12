// Manual password reset by the app admin (free, no Blaze plan needed).
// Use it when a phone-only shop owner is locked out and you have verified who they are.
//
//   1. Firebase console -> Project settings -> Service accounts -> "Generate new private key"
//      Save the file next to this script as serviceAccount.json (NEVER upload it to GitHub).
//   2. npm install firebase-admin --no-save
//   3. node scripts/admin-reset-password.mjs 01711000333 NewPassword123
//
// Phone-only accounts log in with a hidden address: <phone>@phone.bakikhata.app
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const admin = require('firebase-admin');

const [id, newPassword] = process.argv.slice(2);
if (!id || !newPassword || newPassword.length < 6) {
  console.error('Usage: node scripts/admin-reset-password.mjs <phone-or-email> <new password (6+ chars)>');
  process.exit(1);
}
const key = JSON.parse(readFileSync(new URL('../serviceAccount.json', import.meta.url), 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(key) });
const email = id.includes('@') ? id.toLowerCase() : `${id}@phone.bakikhata.app`;
const user = await admin.auth().getUserByEmail(email);
await admin.auth().updateUser(user.uid, { password: newPassword });
console.log(`Password updated for ${email}`);
process.exit(0);
