# Admin 2-step login — setup guide

This site has a real backend (`/api/auth/*`, Vercel serverless functions)
that verifies your admin password **server-side**, then asks for a 6-digit
code from an authenticator app (Google Authenticator, Microsoft
Authenticator, Authy, 1Password, etc.) — both are required to log in.

No third-party accounts (Twilio, SendGrid, etc.) are needed for this —
authenticator codes are generated entirely on your phone, offline, from a
secret key shared only once during setup.

## 1. Add the environment variables in Vercel
Project → Settings → Environment Variables. Add each of these (Production **and** Preview):

| Name | Value |
|---|---|
| `ADMIN_USER_HASH` | `d68ddb5271e366573f2f24420ff3b98f273ab116ebc67fb9bacb0e0044af89b3` |
| `ADMIN_PASS_HASH` | `294d057cf02e4a7107d0e718ced2d474597c09c5f1ffce29198d0f07559bc6fd` |
| `OTP_SECRET` | `c994681ca1c098f124d54dea9d06860ad9e3ce6d0f3cbac6e66e5e16eb9213b2` |
| `SESSION_SECRET` | `c4cb32c23d0a3a8aa4a4795ce8b639191c3e61d9ee1e3abc36fa126163b1f470` |
| `ADMIN_TOTP_SECRET` | `NTM2JR7K6PPYPHRZ4CCUY24YFRP5YYQF` |
| `ALLOWED_ORIGIN` | `https://little-gopal-kipk.vercel.app` |

`ADMIN_USER_HASH` / `ADMIN_PASS_HASH` are SHA-256 hashes of the username/password
you chose earlier — the real values are never stored in this repo.

After adding these, go to **Deployments** and click **Redeploy** on the latest one.

## 2. Set up your authenticator app (one-time)
Install an authenticator app on your phone if you don't have one already —
**Google Authenticator** or **Microsoft Authenticator** are the easiest, free,
available on iOS and Android.

In the app, choose **"Enter a setup key"** / **"Enter code manually"**
(instead of scanning a QR code) and enter:

- **Account name:** `Little Gopal Admin`
- **Your key:** `NTM2JR7K6PPYPHRZ4CCUY24YFRP5YYQF`
- **Type:** Time based

Save it. The app will now show a fresh 6-digit code every 30 seconds — that's
what you'll type in at the second login step from now on.

**Keep that key safe** — anyone who has it can generate valid codes too. It's
only ever stored as the `ADMIN_TOTP_SECRET` environment variable in Vercel
(never in this repo's code) and on your phone.

## 3. Log in
1. Open `https://little-gopal-kipk.vercel.app/admin.html`
2. Enter your username + password → **Continue**
3. Open your authenticator app, find "Little Gopal Admin", and type in the
   current 6-digit code → **Verify and sign in**

If you ever lose your phone/authenticator app, tell me and I'll generate a
fresh `ADMIN_TOTP_SECRET` for you to set up again — there's no recovery
needed on my side since nothing is stored except that one environment
variable.
