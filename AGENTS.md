# Repository Guidelines

## Project Structure & Module Organization
- `src/` — React + TypeScript app: `components/` (UI), `pages/` (routes), `hooks/`, `lib/`, `modules/voice-assistant/` (SDK client).
- `server/` — Local Node token server (`server/index.js`).
- `api/voice/` — Vercel serverless endpoints (`token.ts`, `context.ts`).
- `public/` — Static assets; `dist/` — build output; `docs/` — project docs.

## Build, Test, and Development Commands
- `npm run dev`: Start Vite dev server (http://localhost:8080 → auto-increment if busy).
- `npm run voice:server`: Start local token server (needs `OPENAI_API_KEY`).
- `npm run build`: Production build to `dist/`.
- `npm run preview`: Preview the production build locally.
- `npm run lint`: Run ESLint against the repo.

Example local dev: `export OPENAI_API_KEY=sk-... && npm run voice:server` (terminal 1), `npm run dev` (terminal 2).

## Coding Style & Naming Conventions
- TypeScript + React; 2-space indent; prefer functional components and hooks.
- Components: `PascalCase` (`src/components/EnhancedMenu.tsx`). Hooks: `camelCase` file starting with `use-` (`src/hooks/use-mobile.tsx`).
- Modules: directory `kebab-case` (`src/modules/voice-assistant/`).
- Linting: ESLint (see `eslint.config.js`). Tailwind for styling (`tailwind.config.ts`).

## Testing Guidelines
- No automated tests yet. Validate via lint + manual QA:
  1) Run token server and Vite as above.
  2) Open the app, click “Ask The Rug”, allow mic, confirm spoken response.
- If adding tests, prefer Vitest + React Testing Library and collocate as `*.test.ts(x)` near source.

## Commit & Pull Request Guidelines
- Use Conventional Commits seen in history: `feat:`, `fix:`, `docs:`, `chore:`.
- PRs should include: clear description, linked issues, screenshots of UI changes, and steps to reproduce/verify.
- Note any env/config changes in PR (e.g., `VITE_VOICE_TOKEN_URL`, model/voice).

## Security & Configuration Tips
- Never expose `OPENAI_API_KEY` to the browser; only mint ephemeral tokens (`/api/voice/token`).
- Local dev uses Vite proxy to `:8787` (see `vite.config.ts`).
- Env template: `.env.example` (copy to `.env`).
