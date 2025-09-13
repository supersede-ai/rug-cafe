# Voice Session Ending — Design Brief

This document summarizes how the assistant detects a user’s intent to end a conversation and tears down a Realtime session cleanly. It reflects the implementation introduced in this branch.

## Overview

Goals
- Natural UX: the assistant says a short, language‑appropriate goodbye and ends without awkward pauses or double‑goodbyes.
- Low latency and resilient: end promptly when confident; confirm only when risky.
- Configurable and observable: env flags control transcription and goodbye delay; analytics log reasons and confidence.

Key parts
- Model tool: `end_session` tool lets the agent explicitly end the session.
- Local detector: keyword + fuzzy detector with confidence thresholds and quote heuristics.
- Transcription: optional `inputAudioTranscription` so audio‑only turns are detectable by text logic.
- Teardown: `endSessionGracefully` stops generation and disconnects, with optional delay to let the goodbye finish.

## Flow

1) User speaks
   - Realtime session receives audio; when transcription is enabled, we get a text transcript.

2) Detection (agent-only)
   - Model‑driven: The agent infers farewell intent and calls the `end_session` tool after saying a brief goodbye.
   - Local detector: Completely disabled for multilingual compatibility. All ending logic handled by the agent with contextual guards.

3) Contextual guards and safety checks
   - Blocks ending during active booking flows
   - Blocks ending within 30 seconds of booking completion
   - Blocks ending within 15 seconds of cart actions
   - Blocks ending within 10 seconds of assistant asking questions
   - Only allows ending when user expresses explicit farewell intent

4) End sequence
   - Agent-driven: the assistant says a natural goodbye in user's language, then calls `end_session`.
     - Contextual guards prevent premature endings during active flows
     - We wait `VITE_VOICE_GOODBYE_DELAY_MS` so the goodbye finishes, do not interrupt, then disconnect.
     - Rating collection is separate from ending - no longer blocks ending flow

## Files

- src/modules/voice-assistant/client.ts — wires session, tools, detection, analytics
- src/modules/voice-assistant/end-intent.ts — keyword/fuzzy detection + heuristics
- src/modules/voice-assistant/session-teardown.ts — graceful teardown helper
- api/voice/event.ts — production serverless analytics logging (console)
- server/index.js — local analytics endpoint and JSON persistence
- docs/VOICE_ASSISTANT.md — high‑level guide (with “Ending Sessions” section)
- docs/SESSION_ENDING.md — this detailed brief

## Configuration

- Realtime model/voice
  - `REALTIME_MODEL` (server): defaults to `gpt-realtime`
  - `REALTIME_VOICE` (server): defaults to `marin`
- Transcription
  - `VITE_VOICE_TRANSCRIBE_ENABLED` (default: `true`)
  - `VITE_VOICE_TRANSCRIBE_MODEL` (default: `gpt-4o-mini-transcribe`)
    - Use your org’s cheapest compatible transcribe model if available.
- Goodbye delay
  - `VITE_VOICE_GOODBYE_DELAY_MS` (default: `4000`)
- Local detection (disabled)
  - `VITE_VOICE_LOCAL_END_DETECT_ENABLED` (default: `false`) - Permanently disabled for multilingual support
- Token endpoint
  - `VITE_VOICE_TOKEN_URL` (default: `/api/voice/token`)

## Analytics

Client emits a best‑effort POST to `/api/voice/event` with:
```json
{
  "type": "session_end",
  "reason": "user_goodbye|user_goodbye_confirmed|tool|manual",
  "source": "detector|detector_confirm|tool|user_ui",
  "confidence": 0.0,
  "strategy": "keyword|fuzzy"
}
```

- Local dev: persisted to `server/data/events.json`.
- Vercel: `api/voice/event.ts` logs to function output.

## UX Choices & Guardrails

- Assistant speaks goodbye; tool does not add speech → avoids double‑goodbyes.
- Confirm only when borderline or risky (assistant just asked a question), to reduce annoyance.
- Guardrails are for assistant output, not user input; detection relies on input signals.
- Manual stop (UI button) always ends immediately.

## QA Checklist

- Say "goodbye" or farewell in any language during a normal turn → assistant speaks goodbye → session ends after delay.
- Try ending during booking flow → should be blocked with appropriate message.
- Try ending immediately after booking completion → should be blocked for 30 seconds.
- Try ending immediately after adding to cart → should be blocked for 15 seconds.
- Try ending immediately after assistant asks question → should be blocked for 10 seconds.
- Click mic again → ends immediately with no extra speech.
- Check analytics are recorded locally in `server/data/events.json` (dev) or function logs (Vercel).

## Extensibility

- LLM fallback: Add a silent classification check for borderline cases (feature‑flagged).
- needsApproval: Mark `end_session` with `needsApproval: true` for a UI confirmation gate.
- Phrase config: Externalize phrases into a content/config service and add multi‑lingual variants.
- SIP/Telephony: Respect provider hangup events and call `endSessionGracefully` on hangup.
