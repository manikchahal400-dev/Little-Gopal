# Admin 2-step login — setup guide

This site now has a real backend (`/api/auth/*`, Vercel serverless functions)
that verifies your admin password server-side, then sends **one OTP code to
WhatsApp** and **a second OTP code to email** — both are required to log in.

Nothing in this repo contains your real password or API keys. Everything
secret is set as an **environment variable in Vercel**, not committed to
code. Follow the steps below in order.

## 1. Create a Twilio account (for WhatsApp OTP)
1. Sign up at https://www.twilio.com/try-twilio (you do this yourself — I can't create accounts for you).
2. From the Twilio Console, copy your **Account SID** and **Auth Token**.
3. For WhatsApp, the easiest way to start is the **Twilio Sandbox for WhatsApp**
   (free, works immediately): Console → Messaging → Try it out → Send a WhatsApp message.
   It gives you a sandbox number like `whatsapp:+14155238886`.
   - **Important:** in sandbox mode, the receiving number (9258358235) must first
     send the join code shown in the console (e.g. "join xxxx-xxxx") to that
     sandbox number on WhatsApp once, or it won't receive messages.
   - When you're ready for production, apply for a real WhatsApp Business sender
     in Twilio (requires Meta/Facebook Business verification, takes longer).

## 2. Create a SendGrid account (for email OTP)
1. Sign up at https://signup.sendgrid.com/ (also owned by Twilio, but a separate signup).
2. Create an **API key**: Settings → API Keys → Create API Key (Full Access or "Mail Send" only).
3. Verify a **sender identity**: Settings → Sender Authentication → verify a single
   sender email address (this is the "From" address emails will come from —
   it can be your own address, e.g. `manikchahal400@gmail.com`, once verified).

## 3. Deploy this site to Vercel
1. Sign up at https://vercel.com (free tier is enough).
2. Push this folder to a GitHub repository, then in Vercel: **Add New → Project → Import** that repo.
   *(If you'd rather not use GitHub, Vercel's CLI (`vercel deploy`) also works, but requires Node.js installed on your computer.)*
3. Vercel will detect the static files + the `/api` folder automatically — no build configuration needed.

## 4. Set these environment variables in Vercel
Project → Settings → Environment Variables. Add each of these (Production **and** Preview):

| Name | Value |
|---|---|
| `ADMIN_USER_HASH` | `d68ddb5271e366573f2f24420ff3b98f273ab116ebc67fb9bacb0e0044af89b3` |
| `ADMIN_PASS_HASH` | `294d057cf02e4a7107d0e718ced2d474597c09c5f1ffce29198d0f07559bc6fd` |
| `OTP_SECRET` | `c994681ca1c098f124d54dea9d06860ad9e3ce6d0f3cbac6e66e5e16eb9213b2` |
| `SESSION_SECRET` | `c4cb32c23d0a3a8aa4a4795ce8b639191c3e61d9ee1e3abc36fa126163b1f470` |
| `TWILIO_ACCOUNT_SID` | *(from Twilio console)* |
| `TWILIO_AUTH_TOKEN` | *(from Twilio console)* |
| `TWILIO_WHATSAPP_FROM` | `whatsapp:+14155238886` *(or your approved sender)* |
| `ADMIN_WHATSAPP_TO` | `+919258358235` |
| `SENDGRID_API_KEY` | *(from SendGrid)* |
| `SENDGRID_FROM` | *(your verified SendGrid sender email)* |
| `ADMIN_EMAIL_TO` | `manikchahal400@gmail.com` |
| `ALLOWED_ORIGIN` | `https://your-project-name.vercel.app` *(your real deployed URL, once you know it)* |

`ADMIN_USER_HASH` / `ADMIN_PASS_HASH` are SHA-256 hashes of the username/password
you chose earlier — the real values are never stored in this repo. If you ever
want to change the password, tell me the new one and I'll give you a new hash
to paste in here (nothing needs to change in the code).

## 5. Redeploy and test
After saving the environment variables, trigger a redeploy (Vercel does this
automatically on the next git push, or click "Redeploy" in the dashboard).
Then open `https://your-project-name.vercel.app/admin.html` and log in.

## What I could not test myself
I don't have your Twilio/SendGrid accounts, and this machine has no Node.js
installed to run the backend locally — so I syntax-checked all the backend
code carefully, but the actual WhatsApp/email sending has **not** been tested
end-to-end. The most likely first-time hiccups are: the Twilio sandbox
join-code step being skipped, or the SendGrid sender not being verified yet.
If either OTP doesn't arrive after deploying, check the function logs in
Vercel (Project → Deployments → your deployment → Functions) — they'll show
the exact Twilio/SendGrid error.
