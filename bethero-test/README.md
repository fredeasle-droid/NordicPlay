# BetHero isolated odds connection test

This test folder is isolated under `bethero-test/`. It does not change the TermoGo website files or the existing Aitracker project. No Vercel configuration or environment settings are changed.

## Run locally

Requires Node.js 22+ and network access.

```bash
cd bethero-test
npm install
npm run test:connection
```

The probe checks whether the WebSocket URL seen in the previous integration is reachable, counts received frames, and attempts MessagePack/Zstandard decoding. It does not write to a database.

Access must be authorized and comply with BetHero's terms. If the service rejects the connection or requires an authenticated browser session, this probe does not bypass authentication. Use an authorized session or an official API.
