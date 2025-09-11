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
   - Optional (for analytics dashboard): set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
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
  - Generates a `sessionId` and logs lightweight analytics to `/api/voice/actions` (connection timing, first response, tool results, session end, rating).
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
- `VITE_VOICE_GOODBYE_DELAY_MS` (default: `4000`): Delay before disconnect when the agent says a goodbye and calls the tool, to avoid cutting off audio.
- `VITE_VOICE_LOCAL_END_DETECT_ENABLED` (default: `false`): Toggle client-side end-of-session heuristics. Off by default; we rely on the agent to infer the end and call the `end_session` tool.
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (server only): Enable serverless analytics endpoints to persist session metrics and ratings.

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
- Rating prompt: The assistant asks for a 1–5 rating only if a reservation was successfully created during the session and the conversation is ending. Otherwise, it does not ask for a rating.

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

## Ending Sessions (Goodbye)

Default behavior (agent-driven)
- The agent infers when the conversation has ended from user intent. When appropriate, it says a brief, natural goodbye in the user’s language and then calls the `end_session` tool to close the connection.
- We increased the goodbye delay (`VITE_VOICE_GOODBYE_DELAY_MS`) so the spoken goodbye is not cut off before disconnect.
- The client does not use local keyword detection by default.

Optional local detection (off by default)
- You can experiment with client-side end-intent detection by setting `VITE_VOICE_LOCAL_END_DETECT_ENABLED=true`.
- We deliberately ship with no local keyword list configured. If you enable this flag without adding phrases, local detection will remain effectively inactive.
- To customize, edit `src/modules/voice-assistant/end-intent.ts` to add phrases and heuristics. Be cautious: overly broad keywords (e.g., “stop”) can cause mid-task session endings.

UX guardrails
- The agent is instructed not to end the session while it is collecting details or before executing a requested action (e.g., during reservation flow).
- If you do enable local detection, the client will require explicit confirmation in risky contexts (e.g., immediately after the assistant asked a question), preventing premature disconnects.

You can still stop the assistant manually at any time by clicking the mic button again.

## Ratings & Analytics

The assistant records session analytics; rating collection is gated to successful bookings.

- Session lifecycle: the client generates a `sessionId` at start and posts events to `/api/voice/actions`.
- Captured metrics: connection and first-response timing, turn counts, tool success/error counts, basket adds and item quantity, booking count, end reason, completion, version, page path, UTM, and coarse device/browser/OS.
- Rating: the assistant may ask for a 1–5 rating only if a reservation was successfully created in the current session and the conversation is ending. The `record_rating` tool will no-op if no booking occurred (logged as `rating_skipped_no_booking`).
- Admin: open `/admin/voice` to see aggregates. Serverless routes: `/api/voice/actions`, `/api/voice/metrics`, `/api/voice/sessions`.

Disable ratings: remove the `record_rating` tool and the related prompt line from the instructions in `client.ts`.
