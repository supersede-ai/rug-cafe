# Rug Café Voice Assistant — Requirements & Setup

## System Requirements
- Node.js: >= 18 (recommended >= 18.18)
- npm: v9+ (bundled with Node)
- Browser: Chrome/Edge recommended (WebRTC + mic supported)
- Network: outbound HTTPS to `api.openai.com`

## Repository Setup
1) Clone the repo
2) Install dependencies: `npm install`
3) Create env file: `cp .env.example .env`
4) Edit `.env` and set:
   - `OPENAI_API_KEY=<your_server_key>`
   - Optionally tune: `REALTIME_MODEL`, `REALTIME_VOICE`, `VITE_VOICE_TOKEN_URL`
   - Ensure `PORT=8787` so Vite proxy matches the token server during dev

## Running Locally
Open two terminals:

Terminal 1 — token server
```
# Option A (recommended for first run / easy debugging)
export OPENAI_API_KEY=sk-... && npm run voice:server

# Option B (if OPENAI_API_KEY is already exported in your shell)
npm run voice:server
```
Listens on `http://localhost:8787`.

Terminal 2 — Vite dev server
```
npm run dev
```
Vite starts on `http://localhost:8080` (auto-increments to next free port if needed).

Then open the printed local URL, click the “Ask The Rug” button, allow mic access, and speak.

### Important: Environment variables
- The token server (`server/index.js`) loads `.env` via `dotenv/config`, so putting `OPENAI_API_KEY` in `.env` works.
- Alternatively, you can export it in your shell: `export OPENAI_API_KEY=sk-... && npm run voice:server` (PowerShell: `$env:OPENAI_API_KEY='sk-...'; npm run voice:server`).
- Keep `PORT=8787` so Vite (`vite.config.ts`) proxies `/api` traffic to the correct port.

## Important Paths
- `server/index.js` — Ephemeral token server (no extra deps)
- `src/modules/voice-assistant/client.ts` — Agents SDK voice client
- `src/components/VoiceAssistantButton.tsx` — Floating mic button
- `src/components/Layout.tsx` — Global integration point
- `.env.example` — Environment variables template

## Notes for Collaborators
- Do not commit `.env` (ignored by `.gitignore`).
- Keep the standard API key server-only. The client uses ephemeral tokens.
- If your local dev uses a non-default token URL, update `VITE_VOICE_TOKEN_URL` in `.env`.
