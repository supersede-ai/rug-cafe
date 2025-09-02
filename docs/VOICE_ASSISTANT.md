# Rug Café Voice Assistant (SDK)

On-brand, floating voice assistant that lets visitors ask questions like “What time are you open today?” or “Do you have vegan options?” and get spoken answers in real time. This module is reusable across sites and built on the OpenAI Agents SDK Realtime API.

## Quick Start

Prereqs
- Node.js >= 18 (recommended >= 18.18)
- An OpenAI API key (server-side only)
- A modern browser (Chrome/Edge recommended) with microphone access

Steps
1) Install deps: `npm install`
2) Copy env file: `cp .env.example .env` and set `OPENAI_API_KEY=<your_key>`
3) Start token server (terminal 1): `npm run voice:server`
4) Start Vite dev (terminal 2): `npm run dev`
5) Open the printed localhost URL (e.g., http://localhost:8080 or http://localhost:8082)
6) Click the “Ask The Rug” mic button, allow microphone access, and speak

## How It Works

High level
- The browser UI shows a floating, on-brand mic button sitewide.
- On click, the frontend asks our tiny Node server for an ephemeral token.
- The frontend uses that token to connect a Realtime session via the Agents SDK, which automatically handles microphone input and audio output over WebRTC.

Components
- `server/index.js` (Node server)
  - `GET /api/voice/token` mints an ephemeral client token using your standard API key (server-side).
  - Sets defaults (model/voice) via env variables.
- `src/modules/voice-assistant/client.ts` (SDK client)
  - Uses `@openai/agents/realtime` (`RealtimeAgent`, `RealtimeSession`).
  - Builds concise on-brand instructions and includes a clipped snapshot of the current page’s visible text to ground the assistant’s answers.
  - Exposes `start()`/`stop()` and status updates.
- `src/components/VoiceAssistantButton.tsx` (UI)
  - Floating gradient mic button with status text and pulse animation.
  - Calls the client’s `start()`/`stop()`.
- `src/components/Layout.tsx`
  - Renders the Voice Assistant button in the site layout so it appears on every page.

Data/Context
- Default approach: page-snapshot grounding.
  - When the mic starts, the client captures a clipped snapshot of the page’s visible text (innerText) and includes it in the agent’s instructions.
  - If your Hours/Menu/Address are present on the page, the assistant will use that content to answer.
- Optional (advanced): callable tools for “hours”/“menu”.
  - You can extend the assistant with SDK tools that fetch canonical data from your server (e.g., `/api/voice/context`).
  - We reverted this for now to keep things stable, but see “Adding Rich Context Later” below for how to re-enable.

Security
- Your standard API key lives only on the server in `.env`.
- The browser gets only an ephemeral token, valid for a short time.
- `.env` is git-ignored.

## Configuration

Environment variables (see `.env.example`)
- `OPENAI_API_KEY` (server only): Your standard API key for minting ephemeral client tokens.
- `REALTIME_MODEL` (default: `gpt-realtime`): Realtime model to use.
- `REALTIME_VOICE` (default: `marin`): Voice for spoken responses.
- `VITE_VOICE_TOKEN_URL` (default: `/api/voice/token`): Frontend path to your token endpoint.

Branding & Prompt
- Change voice: set `REALTIME_VOICE` in `.env`.
- Adjust the assistant’s personality/tone: update the `instructions` string passed from `VoiceAssistantButton.tsx` to the client.
- Placement/look: tweak classes in `src/components/VoiceAssistantButton.tsx`.

Ports
- Token server: `http://localhost:8787`
- Vite dev server: tries `8080` then auto-increments to the next free port (e.g., `8082`).

## Key Files
- `server/index.js` — ephemeral token server
- `src/modules/voice-assistant/client.ts` — Agents SDK-based voice client
- `src/components/VoiceAssistantButton.tsx` — floating mic UI
- `src/components/Layout.tsx` — global integration
- `vite.config.ts` — proxies `/api` to `:8787` during dev
- `.env.example` — environment template

## Adding Rich Context Later (Optional)

If you want the model to have reliable, structured access to opening hours, address, and the full menu:
1) Add a server endpoint (e.g., `GET /api/voice/context`) that returns JSON for hours/address and menu markdown/content.
2) Define SDK tools in `client.ts` (via `tool(...)`) that fetch from `/api/voice/context` and return structured data.
3) Add those tools to the `new RealtimeAgent({ tools: [...] })` so the model can call them when needed.

We briefly implemented this and then reverted for now so you can commit a stable baseline. Reintroducing it is straightforward and keeps the default behavior intact.

## Production Notes
- Keep the token server behind HTTPS and a reverse proxy (e.g., Nginx) in production.
- Do not expose `OPENAI_API_KEY` to the browser; only the ephemeral token should be sent to clients.
- Set `VITE_VOICE_TOKEN_URL` to your deployed `/api/voice/token` endpoint.
- Ensure outbound access to `https://api.openai.com` from your server.

## Troubleshooting
- Mic prompt doesn’t appear: check browser site permissions; try Chrome.
- Button opens `/book`: ensure the mic button sits above other floating links; we set a higher z-index. If needed, move the mic to the left or raise it slightly.
- Token errors: make sure `npm run voice:server` is running and `OPENAI_API_KEY` is set.
- Port conflicts: Vite auto-increments; check terminal output for the final URL.

