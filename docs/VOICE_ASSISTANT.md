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
- `VITE_VOICE_TRANSCRIBE_ENABLED` (default: `true`): Enable input audio transcription for text-based features.
- `VITE_VOICE_TRANSCRIBE_MODEL` (default: `gpt-4o-mini-transcribe`): Transcription model name.
- `VITE_VOICE_GOODBYE_DELAY_MS` (default: `1200`): Delay before disconnect when the agent says a goodbye and calls the tool, to avoid cutting off audio.

Branding & Prompt
- Change voice: set `REALTIME_VOICE` in `.env`.
- Adjust the assistant’s personality/tone: update the `instructions` string passed from `VoiceAssistantButton.tsx` to the client.
- Placement/look: tweak classes in `src/components/VoiceAssistantButton.tsx`.

Ports
- Token server: defaults to `http://localhost:8787` but will auto-increment if busy; it writes the chosen port to `server/.port`.
- Vite dev server: tries `8080` then auto-increments.
- During dev, Vite reads `server/.port` to proxy `/api` to the correct token server port automatically.

## Key Files
- `server/index.js` — ephemeral token server
- `src/modules/voice-assistant/client.ts` — Agents SDK-based voice client
- `src/components/VoiceAssistantButton.tsx` — floating mic UI
- `src/components/Layout.tsx` — global integration
- `vite.config.ts` — proxies `/api` to `:8787` during dev
- `.env.example` — environment template

## UI States

- The floating mic button reflects session lifecycle: “Connecting…”, “Listening…”, “Ending…”, then returns to the idle label.
- On end, the button auto-toggles off after teardown to avoid stale active state.

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

## Ending Sessions (Goodbye Detection)

The assistant can now end sessions automatically when the user clearly signals they’re done, e.g., “bye”, “goodbye”, “that’s all”, “we’re done”, “stop”.

How it works
- Model path: The agent says a brief, natural goodbye (in the user’s language), then calls the `end_session` tool when confident.
- Detector path: As a fallback, the client detects end intent. On strong signals, it asks the model to speak a brief multilingual goodbye, then disconnects after a short delay.
- Borderline/risky: The assistant asks once: “Do you want to end here?” and ends only on an explicit yes (then also speaks a short goodbye before disconnecting).
- Teardown: The tool performs a clean disconnect and waits a short, configurable delay so the goodbye finishes; the tool itself does not add more speech (to avoid double-goodbyes).

Notes
- Audio-only inputs require transcription if you want client-side text checks; when disabled, the agent can still end via the `end_session` tool, but local keyword detection won’t run.
- You can still stop the assistant manually by clicking the mic button again.

Cost considerations
- Transcription uses the configured transcription model and is billed separately from the realtime model’s generation. Keep it lightweight (mini/nano tier if available) and rely on turn detection to reduce silence.
- You can disable transcription via `VITE_VOICE_TRANSCRIBE_ENABLED=false` if you prefer purely model-driven endings via the `end_session` tool.
