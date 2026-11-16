# Continuity v2 setup

What's new: Google sign-in (separate accounts), Google Calendar sync (busy times, your visits, medication and
booking reminders), several medications, your own care team with booking links, recurring visits, a voice call
in the browser (no Chert), and a cleaner UI.

Do the steps in order. Keys go only in `.env.local` files and Vercel (mark them Sensitive), never in chat or git.

## 1. Database (Tiger SQL editor, once)

Run `web/db/v2-accounts.sql`. It's safe to run more than once.

## 2. Google sign-in and Calendar (Google Cloud console)

1. console.cloud.google.com → pick a project (your Gemini one is fine).
2. **APIs & Services → Library** → enable **Google Calendar API**.
3. **Google Auth Platform → Branding**: app name "Continuity", your email as support and developer contact.
4. **Audience**: User type **External**, publishing status **Testing**. Under **Test users**, add your Gmail
   and your friend's. Only these accounts can sign in while the app is in Testing (up to 100).
5. **Data Access → Add or remove scopes**: `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`,
   `.../auth/calendar.freebusy`, `.../auth/calendar.events`.
6. **Clients → Create client → Web application.** Authorized redirect URIs:
   - `http://localhost:3000/api/auth/google/callback`
   - `https://www.continuitynow.health/api/auth/google/callback`
7. Copy the client ID and secret into `web/.env.local` and Vercel (Production + Preview):

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
SESSION_SECRET=...          # run: openssl rand -base64 32
DEMO_USER_ID=1              # optional: "Try the demo" signs in as Maya; leave unset to hide the demo
```

In Vercel (Production only) also set `APP_URL=https://www.continuitynow.health`.

Things to know:
- In Testing mode Google expires calendar access after 7 days. Profile will say "Reconnect needed"; tap
  Connect Google Calendar again. Publishing the app removes this, but Google reviews apps that use calendar scopes.
- School Google accounts (like @emory.edu) may block outside apps. Use a personal Gmail if sign-in is refused.

## 3. Browser voice call

In `web/`:

```
npm install livekit-client
```

Commit the updated `package.json` and `package-lock.json` (Vercel needs both). Then add the LiveKit values
(the same ones the agent uses) to `web/.env.local` and Vercel:

```
LIVEKIT_URL=wss://...
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
AGENT_NAME=continuity-agent
```

### Run the agent on LiveKit Cloud (works without your laptop)

1. Install the LiveKit CLI: `brew install livekit-cli`, then `lk cloud auth` and pick your project.
2. In `agent/`, make `.env.cloud` (never commit it) with the values the agent needs in the cloud:

```
GOOGLE_API_KEY=...
AGENT_API_KEY=...                              # same as web's AGENT_API_KEY
CONTINUITY_API_URL=https://www.continuitynow.health
AGENT_NAME=continuity-agent
```

3. `lk agent create --secrets-file .env.cloud` (uses `agent/Dockerfile`). Later updates: `lk agent deploy`.
4. Stop any local `npm start` agent once the cloud one is running, or calls may go to your laptop instead.

To test locally instead: keep `CONTINUITY_API_URL=http://localhost:3000` in `agent/.env.local` and run `npm start`.

## 4. Try it

1. `npm run dev` in `web/`, open http://localhost:3000, **Continue with Google**.
2. Finish setup, allow Google Calendar. Add a medication with a reminder time and check your calendar.
3. **My care**: paste a Zocdoc / Grow Therapy / Psychology Today link, add a visit that repeats every 2 weeks.
4. Home → **Talk to Continuity** → Start call. Use Chrome or Safari and allow the microphone.
