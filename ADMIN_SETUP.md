# Play On Studios Admin Setup

This repo now includes a private dashboard at `/admin` built for Firebase Auth + Firestore.

## What is already built

- `/admin/index.html`
  - private login screen
  - KPI cards
  - revenue, spend, downloads and platform charts
  - game management form
  - daily metric entry form
  - recent entry edit/delete actions
- `/admin/admin.js`
  - Firebase Auth login
  - Firestore reads/writes
  - dashboard aggregation logic
- `/admin/firebase-config.js`
  - fill this with your Firebase web config
- `/firebase/firestore.rules`
  - locks read/write access to one admin email
- `/firebase/firestore.indexes.json`
  - optional indexes for future filters

## Setup steps

1. Create or open your Firebase project.
2. In Firebase Authentication:
   - enable the `Email/Password` provider
   - add `playonstudios.co` to Authorized domains if it is not already there
   - create your admin user with the same email you will whitelist
3. In Firestore Database:
   - create the database
   - keep the default collections empty for now
4. Open `/admin/firebase-config.js` and replace:
   - `YOUR_ADMIN_EMAIL`
   - `YOUR_API_KEY`
   - `YOUR_PROJECT_ID`
   - `YOUR_MESSAGING_SENDER_ID`
   - `YOUR_APP_ID`
   - `YOUR_MEASUREMENT_ID`
5. Open `/firebase/firestore.rules` and replace `YOUR_ADMIN_EMAIL` with the same admin email.
6. If this Firebase project already has app data and rules, merge the two admin collection rules into your current rules instead of overwriting unrelated rule branches.
7. Deploy or paste the Firestore rules into Firebase.
8. Visit `https://playonstudios.co/admin/` and sign in.

## Firestore structure used by the dashboard

### `studioGames/{gameId}`

```json
{
  "name": "Zen Mahjong",
  "slug": "zen-mahjong",
  "status": "live",
  "platforms": ["ios", "android"],
  "iosUrl": "https://apps.apple.com/...",
  "androidUrl": "https://play.google.com/...",
  "notes": "Featured title",
  "createdAt": "serverTimestamp",
  "updatedAt": "serverTimestamp"
}
```

### `studioDailyMetrics/{gameId__platform__YYYY-MM-DD}`

```json
{
  "gameId": "game-document-id",
  "gameName": "Zen Mahjong",
  "gameSlug": "zen-mahjong",
  "platform": "ios",
  "date": "2026-04-18",
  "downloads": 123,
  "revenue": 456.78,
  "adRevenue": 120.5,
  "iapRevenue": 336.28,
  "adSpend": 90,
  "dau": 2800,
  "mau": 18000,
  "sessions": 5400,
  "rating": 4.8,
  "crashFreeUsers": 99.4,
  "notes": "Store feature day",
  "updatedAt": "serverTimestamp"
}
```

## Trusted install country (download country)

The dashboard's country split is only as good as the field you write. "Download country" is the country where the user installed the app, and it must never change after the first session — otherwise a VPN trip on day 30 silently rewrites history.

Schema (user doc):

```json
{
  "installCountry": "TR",      // ISO-2, write-once, preferred source
  "downloadCountry": "TR",      // accepted alias
  "storeCountry": "TR",         // accepted alias (matches Play/App Store locale)
  "country": "DE",              // optional, may drift with VPN/roaming → treated as "inferred"
  "countryCode": "DE"            // same as country, inferred
}
```

Schema (daily metric doc):

```json
{
  "downloadCountry": "TR",  // ISO-2 from Play Console / App Store Connect report → "verified"
  "country": "TR"            // fallback, inferred
}
```

Client rules for `installCountry` on the game side:

1. Resolve once on first launch before the user has changed anything:
   - iOS: `SKStorefront.countryCode` is the App Store country at install time (most authoritative). Fallback to `Locale.current.region?.identifier` (iOS 16+).
   - Android: `TelephonyManager.getSimCountryIso()` (SIM region) → fallback `Locale.getDefault().getCountry()`.
   - Unity: `Application.systemLanguage` + a server-side IP geolocation validation (MaxMind free tier / ipapi.co) to resolve ties.
2. Write it **exactly once**, on the first Firestore write for that user, e.g.:
   ```js
   await setDoc(userDoc, {
     installCountry: resolvedIsoCountry,
     createdAt: serverTimestamp(),
     // ...other init fields
   }, { merge: true });
   ```
3. **Never** include `installCountry` in subsequent update payloads. Removing it from the general update path is the cleanest guarantee.
4. Enforce immutability in Firestore rules (see `/firebase/firestore.rules` — `installCountry` is rejected on any update that tries to change a non-empty existing value).

For the `studioDailyMetrics` collection, `downloadCountry` should come from the store exports, not the client:

- **Google Play**: Reporting API → `Installs by country` dimension, written nightly as `{gameId}__{platform}__{date}__{country}` docs.
- **App Store Connect**: Sales & Trends API → `Country/Region` dimension from the `PROVIDER` reports.

These are the authoritative download-country numbers. Everything else (GA4 install country, Firebase `country` field, MMP-reported country) is a directional proxy — the dashboard labels anything not coming from these fields as "inferred" and shows a trust pill on the panel.

## Admin login hardening

The admin panel uses a Firebase Web SDK. Firebase Web API keys are not secrets — they only identify the project. Real protection comes from the seven layers below. Enable as many as possible.

### 1. Firestore security rules

`/firebase/firestore.rules` already enforces:

- `isAdmin()` requires a verified email (`email_verified == true`) and an exact lower-cased match against the admin address. Creating a Firebase account with any other email gets zero read access to admin collections.
- A default `match /{document=**}` deny rule so new collections aren't silently open.
- User docs accept only a whitelisted set of fields (reject arbitrary writes).
- `installCountry` is write-once — once set to a non-empty value, subsequent updates cannot change it.
- Payload shape validation on `studioGames` and `studioDailyMetrics`.

Deploy with:

```bash
firebase deploy --only firestore:rules
```

### 2. Email/password provider — disable self-signup

If anyone can create a Firebase account with any email (the default), they can still reach the login screen. They won't see any data (rules deny them), but they'll fill up the Auth user list and burn quota. Lock this down:

1. Firebase Console → Authentication → Sign-in method → Email/Password → open.
2. Toggle **"Email link (passwordless sign-in)"** off if you don't use it.
3. Under **"Advanced"** → **"User actions"** → turn **off** "Create (sign up)" if the console shows it. On projects where this toggle is absent, the equivalent is a Cloud Function `beforeCreate` blocking trigger that rejects any email except `endergametest@gmail.com`.
4. Delete any auth users that are not the admin account.

### 3. Email verification + 2FA

The dashboard now refuses to load if `user.emailVerified === false`. Make sure:

- You logged in at least once after clicking the verification link Firebase sent.
- The Google account that owns `endergametest@gmail.com` has 2FA enabled (Security → 2-Step Verification → Authenticator app, not SMS).

For stronger step-up, enable Firebase Auth **multi-factor authentication** (SMS or TOTP) for the admin account: Console → Authentication → Settings → Multi-factor authentication.

### 4. API key HTTP referrer restriction

This is what closes the GitHub "exposed API key" alert. The key stays public in the HTML, but it only works from your domain:

1. GCP Console → APIs & Services → **Credentials**.
2. Find the Web API key used by this project (matches `apiKey` in `firebase-config.js`).
3. Edit → **Application restrictions: HTTP referrers (web sites)**.
4. Add:
   - `https://playonstudios.co/*`
   - `https://playonstudios.co/admin/*`
   - `http://localhost:*/*` (only while developing; remove before ship).
5. **API restrictions** → **Restrict key** → allow only: Identity Toolkit API, Token Service API, Cloud Firestore API, Firebase Installations API, Firebase App Check API.
6. Save. Wait ~5 min for propagation, then test the dashboard.

Any site scraping your key and hitting Firebase from elsewhere now gets `403 referer blocked`.

### 5. Firebase App Check

App Check forces every request to carry a short-lived attestation token. For the web admin panel:

1. Firebase Console → App Check → Register the web app.
2. Provider: **reCAPTCHA v3** or **reCAPTCHA Enterprise**.
3. In `admin.js`, before `getFirestore()`:
   ```js
   import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-app-check.js";
   initializeAppCheck(app, {
     provider: new ReCaptchaV3Provider("YOUR_SITE_KEY"),
     isTokenAutoRefreshEnabled: true,
   });
   ```
4. In Firebase Console → App Check → Firestore → switch to **Enforced** after you've verified the token flows.

Once enforced, a request from any context that doesn't pass reCAPTCHA (including cURL, scripts, scrapers) gets blocked at the Firebase edge — before your rules even run.

### 6. CSP + supply-chain pinning

`admin/index.html` now carries a strict Content Security Policy and `referrer="no-referrer"`. The CDN-loaded Chart.js script is flagged for Subresource Integrity — you need to paste the real hash in. Run locally:

```bash
curl -sL https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js \
  | openssl dgst -sha384 -binary | openssl base64 -A
```

Then set `integrity="sha384-<hash>"` on the `<script>` tag in `admin/index.html`. If the CDN file ever changes, the browser will refuse to load it and Chart.js won't execute — which is the intended behavior.

For the strongest form of this defense, vendor Chart.js into `/admin/vendor/chart.umd.min.js` and remove the CDN reference + the `cdn.jsdelivr.net` entry from the CSP.

### 7. GitHub secret-scanning alert

The GitHub email about the exposed Firebase API key is not a vulnerability per the [official Firebase docs on API keys](https://firebase.google.com/docs/projects/api-keys#api-keys-for-firebase-are-different). Firebase Web API keys are allowed to be public; they identify the project and are not a secret. The real security boundary is the combination of Firestore rules + referrer restriction + App Check described above.

After applying the referrer restriction (step 4), dismiss the alert in GitHub:

1. Open the alert.
2. **Close as** → "Used in tests" is not right; pick "**Revoked**" if you rotate the key, or **"False positive"** with a comment like: *"Firebase Web API keys are public by design. Access restricted by Firestore rules, GCP HTTP referrer restriction and Firebase App Check."*

### Quick checklist

- [ ] Firestore rules deployed from this repo
- [ ] Email/password sign-up disabled (or blocked via beforeCreate trigger)
- [ ] Admin email verified; 2FA on the Google account
- [ ] Web API key restricted to `playonstudios.co` referrers + minimal API allowlist
- [ ] App Check enabled and enforced for Firestore
- [ ] SRI hash filled in on `admin/index.html` `<script>` for Chart.js
- [ ] GitHub secret-scanning alert closed with the correct reason

## If your games already write data into Firebase

The current panel assumes Firestore as the source of truth for the dashboard.

If your apps already send data somewhere in Firebase and you want me to wire live pull instead of manual entry, send these:

1. Is it `Firestore` or `Realtime Database`?
2. Exact collection names or database paths.
3. One example document per relevant dataset.
4. Which fields map to:
   - game name or game id
   - date
   - platform
   - downloads
   - revenue
   - ad revenue
   - ad spend
   - DAU / MAU / sessions

Once you send that schema, the admin can be adapted to read your existing Firebase data directly.
