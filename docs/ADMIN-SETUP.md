# Admin dashboard setup

The dashboard lives at **https://YOUR-SITE/admin** (if that shows a 404, try `/admin/`). Nothing links to it and search engines are told to skip it. Until the secret sign-in is revealed it looks like an ordinary 404 page.

**Revealing the sign-in:** click the big "404" **5 times**.

## One-time setup (about 10 minutes, all in the Firebase console)

1. **Publish the new rules.** Firestore Database → **Rules** → delete everything → paste the whole of `docs/firestore.rules.admin.txt` → **Publish**.
   (It contains all your existing rules plus the admin ones. Your repo's `firestore.rules` file does not need to change.)
2. **Create your admin login.** Authentication → Users → **Add user**. Use an email and a strong password that you use nowhere else (not a test shop or customer account). Copy the new user's **User UID**.
3. **Mark it as admin.** Firestore → **Start collection** → ID `admins` → Document ID = the UID you copied → add one field, `ok` (boolean) = `true` → Save. No app or browser can create this record; only you can, here.
4. **Create the site settings.** Firestore → **Start collection** → ID `config` → Document ID `site` → add one field, `testMode` (boolean) = `true` → Save.
5. Upload these files to GitHub (same folders as in the zip) and let Vercel redeploy. Open `/admin`, click "404" five times, sign in.

## What each tab does

- **Overview:** totals, signups (7 / 30 days), active users and ledgers (30 days), expense, payment, outstanding, and the two averages. Press **Refresh** to recalculate; it shows roughly how many document reads that used.
- **Shops:** mark a shop verified (a ✔ is added to its name in the customer directory), **Suspend** it (it disappears from the directory and code search, customers cannot link to it or add entries; history is kept) or restore it.
- **Flagged:** every entry shops have flagged, with shop, customer, amount and note.
- **Announcements:** a banner for all users (English + Bangla) and a full-screen maintenance message.
- **Danger zone:** delete test data (see below).

## Privacy by design
The admin can read profiles and the ledgers and entries of **registered shops**. Customers' **private ledgers are never readable** by the admin while test mode is off.

## Deleting test data before launch
1. Danger zone → tick the box → type `DELETE` → press the button. This removes all app data (users, shops, ledgers, entries, notes, shop codes). It does **not** remove logins or your admin settings.
2. Firebase → Authentication → Users → select the test accounts → **Delete accounts**. **Keep your admin login.**
3. Danger zone → **Turn off test mode permanently**. From then on the wipe cannot run from the app, and the admin can no longer read private ledgers. Turning it back on is only possible by hand in the Firebase console, so a stolen admin login cannot erase real records.

## Limits to know
- Maintenance mode hides the app on screen; it does not block the database.
- Logins (Authentication) can only be deleted or disabled in the Firebase console on the free plan.
- Each Overview refresh reads every ledger and entry of registered shops. That is fine for a pilot; check the read count it shows against your free daily quota as you grow.
- The dashboard was tested against a simulated Firestore, not a live project. Check each tab once after setup.
