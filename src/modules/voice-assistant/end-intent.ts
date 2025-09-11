// Lightweight, configurable end-of-session intent detection
// Hybrid strategy: keyword + fuzzy-like heuristics, optional confirmation checks.

export type EndIntentConfig = {
  phrases: string[]; // canonical lowercase phrases
  allowFuzzy: boolean;
  fuzzyMinLength: number; // only fuzzy-match short tokens like "bye", "stop"
  riskyConfirmWindowMs: number; // if assistant just asked a question, confirm instead of ending
};

export type EndIntentDetection = {
  match: boolean;
  confidence: number; // 0..1
  reason?: string;
  strategy?: 'keyword' | 'fuzzy';
};

export const defaultEndIntentConfig: EndIntentConfig = {
  // No hardcoded phrases; rely on the agent to call the end_session tool.
  phrases: [],
  allowFuzzy: false,
  fuzzyMinLength: 3,
  // Slightly longer window to avoid ending right after assistant questions
  riskyConfirmWindowMs: 5000,
};

export function detectEndIntentFromText(
  raw: string | undefined | null,
  config: Partial<EndIntentConfig> = {}
): EndIntentDetection {
  const cfg = { ...defaultEndIntentConfig, ...config } as EndIntentConfig;
  const text = (raw || '').trim();
  if (!text) return { match: false, confidence: 0 };

  const normalized = normalize(text);

  // Guard common false positives around the token "stop"
  // e.g., "we'll stop by at 7", "stop in", "stop at" should NOT end the session.
  if (/\bstop\s+(by|in|at|for|over|into)\b/i.test(normalized)) {
    return { match: false, confidence: 0, reason: 'stop_contextual' };
  }
  if (looksQuotedMention(normalized)) {
    return { match: false, confidence: 0.1, reason: 'quoted_mention' };
  }

  // If there are no phrases configured, do not attempt local detection.
  if (!cfg.phrases || cfg.phrases.length === 0) {
    return { match: false, confidence: 0 };
  }

  // Exact keyword/phrase match (word-boundary or whole-utterance)
  for (const p of cfg.phrases) {
    const pattern = toWordBoundaryRegex(p);
    if (pattern.test(normalized)) {
      return { match: true, confidence: 0.95, reason: `keyword:${p}` , strategy: 'keyword' };
    }
  }

  // Heuristic / fuzzy-ish: allow small edit variants for short tokens
  if (cfg.allowFuzzy) {
    const tokens = normalized.split(/\s+/).filter(Boolean);
    for (const t of tokens) {
      if (t.length < cfg.fuzzyMinLength) continue;
      for (const p of cfg.phrases) {
        if (p.length > 12) continue; // limit fuzzy to short phrases
        const base = p.split(' ')[0];
        const d = levenshtein(base, t);
        if (d === 0) {
          return { match: true, confidence: 0.85, reason: `fuzzy:${base}=0`, strategy: 'fuzzy' };
        }
        if (d === 1 && Math.abs(base.length - t.length) <= 1) {
          return { match: true, confidence: 0.7, reason: `fuzzy:${base}=1`, strategy: 'fuzzy' };
        }
      }
    }
  }

  return { match: false, confidence: 0 };
}

export function detectAffirmation(raw: string | undefined | null): boolean {
  const s = normalize(raw || '');
  if (!s) return false;
  // lightweight yes detection across common variants
  return /^(yes|yep|yeah|sure|ok(ay)?|please do|affirmative|indeed)([.!?\s]|$)/i.test(s);
}

export function detectNegation(raw: string | undefined | null): boolean {
  const s = normalize(raw || '');
  if (!s) return false;
  return /^(no(pe)?|not now|cancel|keep going|continue|wait)([.!?\s]|$)/i.test(s);
}

export function shouldConfirmEnd(
  lastAssistantUtterance: string | undefined,
  lastAssistantAt: number | undefined,
  now = Date.now(),
  cfg: Partial<EndIntentConfig> = {}
): boolean {
  const { riskyConfirmWindowMs } = { ...defaultEndIntentConfig, ...cfg };
  const text = normalize(lastAssistantUtterance || '');
  const justAskedAQuestion = text.endsWith('?') || /\?\s*$/.test(text);
  const withinWindow = lastAssistantAt ? now - lastAssistantAt < riskyConfirmWindowMs : false;
  return Boolean(justAskedAQuestion || withinWindow);
}

// ---------- internals ----------
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[^\p{L}\p{N}\s'"-]/gu, ' ') // keep quotes, letters, numbers, spaces
    .replace(/\s+/g, ' ')
    .trim();
}

function toWordBoundaryRegex(phrase: string): RegExp {
  const escaped = phrase.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // match as standalone or at boundaries, e.g., "bye" or "good bye" fragments
  return new RegExp(`(?:^|\\b)${escaped}(?:\\b|$)`);
}

function looksQuotedMention(text: string): boolean {
  // If the phrase is inside quotes, likely a mention rather than an intent.
  // e.g., He said "goodbye" to me.
  // Simple heuristic: quoted segments exist and contain an end phrase.
  const quoted = Array.from(text.matchAll(/"([^"]+)"|'([^']+)'/g)).map(m => m[1] || m[2] || '');
  if (!quoted.length) return false;
  const phrases = defaultEndIntentConfig.phrases;
  return quoted.some(q => phrases.some(p => toWordBoundaryRegex(p).test(q)));
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;
  const v0 = new Array(bl + 1);
  const v1 = new Array(bl + 1);
  for (let i = 0; i <= bl; i++) v0[i] = i;
  for (let i = 0; i < al; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < bl; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= bl; j++) v0[j] = v1[j];
  }
  return v0[bl];
}
