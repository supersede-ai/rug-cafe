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

2) Detection (two sources)
   - Model‑driven: The agent infers end intent and calls the `end_session` tool after saying a brief goodbye.
   - Local detector: On `history_updated`, we inspect the latest user transcript and run detection:
     - Keywords list (multi‑lingual friendly strings), word‑boundary matching.
     - Fuzzy‑ish short‑token match with Levenshtein ≤ 1 for short terms like “bye”.
     - Quote heuristic ignores indirect mentions (e.g., “he said ‘goodbye’”).

3) Confidence and risk handling
   - Strong (≥ 0.70): end immediately (no extra confirmation).
   - Borderline (0.50–0.70) or risky timing (assistant just asked a question): ask once in the user’s language to confirm intent to end; end only on an explicit yes.
   - Weak (< 0.50): ignore to minimize false positives.

4) End sequence
   - Tool path: the assistant says a natural goodbye, then calls `end_session`.
     - We wait `VITE_VOICE_GOODBYE_DELAY_MS` so the goodbye finishes, do not interrupt, then disconnect.
   - Detector path: on strong signals, we ask the model to speak a brief, natural goodbye in the user’s language, then end with a short delay. On confirm flow, we do the same after a “yes”.

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
  - `VITE_VOICE_GOODBYE_DELAY_MS` (default: `1200`)
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

- Say “goodbye” during a normal turn → assistant speaks goodbye → session ends after a short delay.
- Say “stop” immediately after the assistant asks a question → assistant asks once; “yes” ends, “no” continues.
- Click mic again → ends immediately with no extra speech.
- Check analytics are recorded locally in `server/data/events.json` (dev) or function logs (Vercel).

## Extensibility

- LLM fallback: Add a silent classification check for borderline cases (feature‑flagged).
- needsApproval: Mark `end_session` with `needsApproval: true` for a UI confirmation gate.
- Phrase config: Externalize phrases into a content/config service and add multi‑lingual variants.
- SIP/Telephony: Respect provider hangup events and call `endSessionGracefully` on hangup.
