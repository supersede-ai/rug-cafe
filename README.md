# The Rug Café — Website & Voice Assistant

This repo contains the Rug Café site (Vite + React + Tailwind + shadcn) and an on-brand, floating voice assistant powered by the OpenAI Agents SDK (Realtime, WebRTC).

## Project Info
- Live URL: https://rug-cafe-vibe-maker.com
- Tech: Vite, TypeScript, React, Tailwind, shadcn-ui

## Quick Start

Prereqs
- Node.js >= 18 (recommended >= 18.18)
- An OpenAI API key (server-side only)

Setup
```sh
git clone <YOUR_GIT_URL>
cd <YOUR_PROJECT_NAME>
npm install
cp .env.example .env
# edit .env and set OPENAI_API_KEY=<your_key>
# optional (required to log voice analytics in local dev):
# set SUPABASE_URL=... and SUPABASE_SERVICE_ROLE_KEY=...
```

Run (two terminals)
```sh
# Terminal 1: token server (mints ephemeral client tokens)
npm run voice:server

# Terminal 2: dev server (auto-picks port if 8080 is busy)
npm run dev
```

Open the printed localhost URL, click the “Ask The Rug” mic button, allow mic access, and speak.

## Voice Assistant Docs
- Overview & detailed guide: docs/VOICE_ASSISTANT.md
- Requirements & setup checklist: docs/REQUIREMENTS.md

## How It Works (Current)
- The browser asks our tiny Node server (`server/index.js`) for an ephemeral token (never exposes the standard key to the client).
- The frontend initializes a Realtime session via the OpenAI Agents SDK (WebRTC), which handles microphone input and audio output.
- To ground answers, the assistant includes a clipped snapshot of the current page’s visible text in its instructions. If Hours or Menu are visible on the page, it can answer based on that.
- You can later add server-backed tools (e.g., `getHours`, `getMenu`) for canonical data. We’ve kept the baseline simple for now; see “Adding Rich Context Later” in docs/VOICE_ASSISTANT.md.

## Editing the Site
Use your preferred IDE or edit in GitHub. For local dev, install Node, clone, install deps, and run `npm run dev`.

## Deployment
Bring your own hosting. Ensure the token server runs behind HTTPS, set `VITE_VOICE_TOKEN_URL` to your deployed `/api/voice/token`, and keep `OPENAI_API_KEY` server-side.

## Custom Domain
Configure DNS and hosting according to your platform’s guidance.

## Database (Supabase)
- Production API routes (`/api/booking`, `/api/bookings`) are wired to Supabase via the REST API. Local dev continues to use the Node server at `:8787` which persists to a JSON file.
- Create a table `bookings` in your Supabase project (SQL below) and set env vars in Vercel:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY` (server-only; never exposed to the browser)

SQL to create the table and index:

```
CREATE TABLE IF NOT EXISTS bookings (
  id                text PRIMARY KEY,
  status            text NOT NULL DEFAULT 'confirmed',
  source            text NOT NULL DEFAULT 'voice',
  created_at        timestamptz NOT NULL DEFAULT now(),
  venue             text NOT NULL DEFAULT 'The Rug Café',
  date              date NOT NULL,
  time              time NOT NULL,
  party_size        integer NOT NULL,
  name              text NOT NULL,
  email             text,
  phone             text,
  special_requests  text
);

CREATE INDEX IF NOT EXISTS idx_bookings_date_time ON bookings (date, time);
```

Notes
- The serverless functions use the service role key and parameterized REST calls. RLS can be enabled; the service role bypasses RLS.
- The Admin Bookings dashboard reads from `/api/bookings` and expects camelCase fields; the API maps DB fields accordingly.

### Voice Analytics (User Actions + Ratings)

Create the `voice_sessions` table to track per-session actions from the voice assistant. This records how many times a user added items to the basket, how many bookings were created via the bot, and an end-of-session rating.

SQL:

```
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid()

CREATE TABLE IF NOT EXISTS voice_sessions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  session_id         text NOT NULL UNIQUE,
  user_agent         text,
  started_at         timestamptz DEFAULT now(),
  ended_at           timestamptz,
  -- Engagement & timing
  turn_count         integer NOT NULL DEFAULT 0,
  connection_ms      integer,
  first_response_ms  integer,
  total_duration_s   integer,
  -- Tool reliability
  tool_success_count integer NOT NULL DEFAULT 0,
  tool_error_count   integer NOT NULL DEFAULT 0,
  last_tool_latency_ms integer,
  -- Outcomes
  completed          boolean NOT NULL DEFAULT false,
  end_reason         text, -- user_stop | timeout | error | rating_done
  basket_add_count   integer NOT NULL DEFAULT 0,
  basket_item_qty    integer NOT NULL DEFAULT 0,
  booking_count      integer NOT NULL DEFAULT 0,
  rating             smallint CHECK (rating BETWEEN 1 AND 5)
  ,assistant_version text
  ,page_path         text
  ,utm_source        text
  ,utm_medium        text
  ,utm_campaign      text
  ,device_type       text
  ,browser           text
  ,os                text
);

-- Recommended for data hygiene (code no longer depends on this)
CREATE UNIQUE INDEX IF NOT EXISTS idx_voice_sessions_session_id
  ON voice_sessions (session_id);

-- Optional: enable RLS. Service role bypasses RLS.
ALTER TABLE voice_sessions ENABLE ROW LEVEL SECURITY;
```

Integration:
- Client generates a `sessionId` when the voice session starts, then posts events to `/api/voice/actions`.
- Events are recorded into `voice_sessions` and counters are incremented server-side.
- The agent asks for a rating (1–5) at the end and posts it via the `record_rating` tool.
- Metrics captured: turns, timing (connection/first response/total), tool success/error counts, basket item qty, outcome flags, version, page path, UTM, and coarse device/browser/OS from UA.

Verify:
- Start a voice session, add basket items, make a booking, end the conversation with a rating.
- Inspect rows in `voice_sessions` for `basket_add_count`, `booking_count`, and `rating`.

Troubleshooting
- If you see 400 from `/api/voice/actions` in dev, your table may be missing or columns differ. Run:
  - `ALTER TABLE voice_sessions ADD COLUMN IF NOT EXISTS basket_add_count integer NOT NULL DEFAULT 0;`
  - `ALTER TABLE voice_sessions ADD COLUMN IF NOT EXISTS basket_item_qty integer NOT NULL DEFAULT 0;`
  - `ALTER TABLE voice_sessions ADD COLUMN IF NOT EXISTS booking_count integer NOT NULL DEFAULT 0;`
  - `ALTER TABLE voice_sessions ADD COLUMN IF NOT EXISTS rating smallint;`
  - `ALTER TABLE voice_sessions ADD COLUMN IF NOT EXISTS user_agent text;`
  - `ALTER TABLE voice_sessions ADD COLUMN IF NOT EXISTS started_at timestamptz;`
  - `ALTER TABLE voice_sessions ADD COLUMN IF NOT EXISTS ended_at timestamptz;`
  - `ALTER TABLE voice_sessions ADD COLUMN IF NOT EXISTS turn_count integer NOT NULL DEFAULT 0;`
  - `ALTER TABLE voice_sessions ADD COLUMN IF NOT EXISTS connection_ms integer;`
  - `ALTER TABLE voice_sessions ADD COLUMN IF NOT EXISTS first_response_ms integer;`
  - `ALTER TABLE voice_sessions ADD COLUMN IF NOT EXISTS total_duration_s integer;`
  - `ALTER TABLE voice_sessions ADD COLUMN IF NOT EXISTS tool_success_count integer NOT NULL DEFAULT 0;`
  - `ALTER TABLE voice_sessions ADD COLUMN IF NOT EXISTS tool_error_count integer NOT NULL DEFAULT 0;`
  - `ALTER TABLE voice_sessions ADD COLUMN IF NOT EXISTS last_tool_latency_ms integer;`
  - `ALTER TABLE voice_sessions ADD COLUMN IF NOT EXISTS completed boolean NOT NULL DEFAULT false;`
  - `ALTER TABLE voice_sessions ADD COLUMN IF NOT EXISTS end_reason text;`
  - `ALTER TABLE voice_sessions ADD COLUMN IF NOT EXISTS assistant_version text;`
  - `ALTER TABLE voice_sessions ADD COLUMN IF NOT EXISTS page_path text;`
  - `ALTER TABLE voice_sessions ADD COLUMN IF NOT EXISTS utm_source text;`
  - `ALTER TABLE voice_sessions ADD COLUMN IF NOT EXISTS utm_medium text;`
  - `ALTER TABLE voice_sessions ADD COLUMN IF NOT EXISTS utm_campaign text;`
  - `ALTER TABLE voice_sessions ADD COLUMN IF NOT EXISTS device_type text;`
  - `ALTER TABLE voice_sessions ADD COLUMN IF NOT EXISTS browser text;`
  - `ALTER TABLE voice_sessions ADD COLUMN IF NOT EXISTS os text;`
- Ensure local `.env` includes `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` and restart `npm run voice:server`.
