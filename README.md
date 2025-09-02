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
