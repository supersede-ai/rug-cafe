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
  // Completely disabled local detection; rely entirely on the agent to call the end_session tool.
  phrases: [],
  allowFuzzy: false,
  fuzzyMinLength: 3,
  // Longer window to avoid ending right after assistant questions
  riskyConfirmWindowMs: 10000,
};

export function detectEndIntentFromText(
  raw: string | undefined | null,
  config: Partial<EndIntentConfig> = {}
): EndIntentDetection {
  // Local detection is completely disabled. Always return no match.
  // The agent should use the end_session tool explicitly when the user indicates farewell intent.
  return { match: false, confidence: 0, reason: 'local_detection_disabled' };
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
  // Disabled since local detection is no longer used
  return false;
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
