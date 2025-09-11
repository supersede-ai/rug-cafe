// Voice assistant client using OpenAI Agents SDK (RealtimeAgent + RealtimeSession)
// Keeps the same simple start/stop/status surface for reuse across sites.
import { RealtimeAgent, RealtimeSession, tool } from '@openai/agents/realtime';
import * as z from 'zod';
import { COFFEE_PRODUCTS, findProduct } from '@/data/products';
import * as Cart from '@/lib/cart';
import { detectAffirmation, detectEndIntentFromText, detectNegation, shouldConfirmEnd } from './end-intent';
import { endSessionGracefully } from './session-teardown';
import type { EndOptions } from './session-teardown';

export type VoiceAssistantOptions = {
  tokenUrl?: string; // Defaults to '/api/voice/token'
  model?: string; // Defaults to 'gpt-realtime'
  voice?: string; // e.g. 'marin'
  instructions?: string; // System prompt
  onStatus?: (s: string) => void;
  onError?: (e: unknown) => void;
};

export class VoiceAssistantClient {
  private started = false;
  private opts: Required<VoiceAssistantOptions>;
  private agent?: RealtimeAgent;
  private session?: RealtimeSession;
  // End-intent detection state (from integrating-MCP)
  private awaitingEndConfirm = false;
  private lastAssistantText?: string;
  private lastAssistantAt?: number;
  private hasEnded = false;
  private lastDetection?: { confidence: number; strategy?: string };
  private endingByTool = false;

  // Analytics + session tracking (from dashboard-integration)
  private sessionId: string = '';
  private connectStartMs: number | null = null;
  private firstResponseSent = false;
  private readonly assistantVersion = (import.meta.env.VITE_VOICE_ASSISTANT_VERSION as string) || 'v1';

  constructor(opts: VoiceAssistantOptions = {}) {
    this.opts = {
      tokenUrl: opts.tokenUrl || 
        (import.meta.env.VITE_VOICE_TOKEN_URL as string) || '/api/voice/token',
      model: opts.model || 'gpt-realtime',
      voice: opts.voice || 'marin',
      instructions: opts.instructions || 'You are a friendly cafe voice assistant. Answer succinctly and accurately. If you are unsure or information is not available, politely say so and point the guest to the correct page (Menu, Hours, Location).',
      onStatus: opts.onStatus || (() => {}),
      onError: opts.onError || (() => {}),
    };
  }

  isActive() {
    return this.started;
  }

  async start() {
    console.log('VoiceAssistantClient: Starting...');
    if (this.started) return;
    this.started = true;
    this.opts.onStatus('requesting-mic');

    try {
      // Basic environment checks (especially for mobile)
      const isLocalhost = /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(location.hostname);
      if (!isLocalhost && typeof window !== 'undefined' && !window.isSecureContext) {
        throw new Error('Microphone requires a secure context (HTTPS) on mobile browsers.');
      }
      if (!(navigator as any).mediaDevices || !(navigator as any).mediaDevices.getUserMedia) {
        throw new Error('Microphone access not supported in this browser.');
      }

      // Proactively request the microphone to trigger the iOS permission sheet
      // and warm up audio capture before the SDK session connects.
      try {
        const warmup = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
          } as MediaTrackConstraints,
        });
        // Immediately stop tracks; the SDK will acquire its own stream.
        warmup.getTracks().forEach((t) => t.stop());
      } catch (permErr: any) {
        const name = permErr?.name || '';
        if (/NotAllowedError|Permission/i.test(name)) {
          throw new Error('Microphone permission denied. Please allow mic access.');
        }
        if (/NotFoundError|DevicesNotFound/i.test(name)) {
          throw new Error('No microphone detected on this device.');
        }
        // Unknown error; rethrow to surface details
        throw permErr;
      }
      // Fetch ephemeral key from our backend
      console.log('VoiceAssistantClient: Fetching token from:', this.opts.tokenUrl);
      const tokenRes = await fetch(this.opts.tokenUrl);
      if (!tokenRes.ok) {
        let body = '';
        try { body = await tokenRes.text(); } catch {}
        throw new Error(`Token error: ${tokenRes.status}${body ? ` - ${body}` : ''}`);
      }
      const tokenJson = await tokenRes.json();
      console.log('VoiceAssistantClient: Token response:', tokenJson);
      const ephemeral = tokenJson?.value || tokenJson?.client_secret?.value;
      if (!ephemeral) throw new Error('No ephemeral key returned');
      this.sessionId = this.makeSessionId();
      const log = (action: string, extra: Record<string, any> = {}) => this.logAction(action, extra);
      try {
        const { path, utm } = this.getPageContext();
        await log('session_start', {
          assistant_version: this.assistantVersion,
          page_path: path,
          utm_source: utm.source,
          utm_medium: utm.medium,
          utm_campaign: utm.campaign,
        });
      } catch {}
      // Build instructions with a page snapshot for grounded answers
      const pageText = this.safeClip(document.body?.innerText || '', 6000);
      // Build a compact product catalogue to ground shopping queries
      const catalogueLines = COFFEE_PRODUCTS.map(p => `- ${p.name} [${p.category}] — notes: ${p.notes}; from £${p.priceFrom.toFixed(2)}`).join('\n');

      const instructions = [
        this.opts.instructions,
        '',
        'Context (page snapshot):',
        pageText,
        '',
        'Rug Coffee Catalogue:',
        catalogueLines,
        '',
        'Guidelines:',
        '- If unsure, say so and direct to Menu or Hours.',
        '- Keep answers concise and friendly.',
        '- When a guest wants a reservation, gather date, time, party size, name, and at least one contact (email or phone). Confirm details aloud, then call the book_table tool.',
        '- When a guest asks to buy/add coffee, resolve which product from the catalogue they want and call add_to_basket. If you are uncertain which item, clarify before adding.',
        '- Only end the session after requested tasks are finished or the user explicitly asks you to end it (clear farewells like "goodbye"/"bye", or explicit "end the session"). Do not end while you are collecting details or before executing an action. Phrases like "that\'s it" or "that\'s all" usually mean the guest has finished providing details — proceed with the task rather than ending.',
        '- When the conversation wraps up, ask the guest to rate the assistant from 1 to 5, then call record_rating with that number.',
      ].join('\n');

      // Initialize SDK agent + session
      const bookTableTool = tool({
        name: 'book_table',
        description: 'Create a table reservation at The Rug Café. Use when a guest asks to book/reserve a table.',
        strict: true,
        parameters: z.object({
          date: z.string().describe('Booking date in YYYY-MM-DD'),
          time: z.string().describe('Booking time in HH:MM 24h'),
          partySize: z.number().int().min(1).max(20).describe('Number of guests'),
          name: z.string().min(2).describe('Guest full name'),
          contact: z
            .object({
              email: z.string().email().optional().nullable(),
              phone: z.string().min(7).optional().nullable(),
            })
            .refine((c) => !!c.email || !!c.phone, {
              message: 'Provide at least an email or phone',
            }),
          specialRequests: z.string().optional().nullable(),
        }),
        async execute(input) {
          const t0 = Date.now();
          try {
            const res = await fetch('/api/booking', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                date: input.date,
                time: input.time,
                partySize: input.partySize,
                name: input.name,
                email: input.contact?.email,
                phone: input.contact?.phone,
                specialRequests: input.specialRequests,
              }),
            });
            if (!res.ok) {
              let text = '';
              try { text = await res.text(); } catch {}
              await log('tool_result', { name: 'book_table', success: false, latency_ms: Date.now() - t0 });
              throw new Error(`Booking failed: ${res.status}${text ? ` - ${text}` : ''}`);
            }
            const out = await res.json();
            try {
              await log('tool_result', { name: 'book_table', success: true, latency_ms: Date.now() - t0, delta: 1 });
              await log('turn');
              await this.markFirstResponse();
            } catch {}
            return out;
          } catch (err) {
            // already logged above in failure case
            throw err;
          }
        },
      });

      // Shopping basket tool (adds items to local cart)
      const addToBasketTool = tool({
        name: 'add_to_basket',
        description:
          'Add one or more coffee products to the shopping basket. Use when a guest asks to buy/put coffee in their bag. Match names to the Rug Coffee Catalogue.',
        strict: true,
        parameters: z.object({
          items: z
            .array(
              z.object({
                product: z
                  .string()
                  .describe('Product name or id, e.g., "Resolute House Blend" or "resolute-blend"'),
                quantity: z.number().int().min(1).max(10).default(1).describe('How many to add'),
              })
            )
            .min(1)
            .describe('List of items to add'),
        }),
        async execute({ items }) {
          const added: any[] = [];
          const notFound: any[] = [];
          const t0 = Date.now();
          for (const it of items) {
            const product = findProduct(it.product);
            if (!product) {
              notFound.push({ query: it.product });
              continue;
            }
            Cart.add(
              { id: product.id, name: product.name, price: product.priceFrom, image: product.image },
              it.quantity || 1,
            );
            added.push({ id: product.id, name: product.name, quantity: it.quantity || 1, price: product.priceFrom });
          }
          const addedCount = (items || []).reduce((acc, it) => acc + Math.max(1, Number(it.quantity || 1)), 0);
          try {
            await log('tool_result', { name: 'add_to_basket', success: true, latency_ms: Date.now() - t0, delta: Math.max(1, items?.length || 1), item_qty_delta: Math.max(1, addedCount || 1) });
            await log('turn');
            await this.markFirstResponse();
          } catch {}
          return {
            added,
            notFound,
            count: Cart.count(),
            total: Cart.total(),
          };
        },
      });

      // End-session tool: lets the agent explicitly end on user request
      const endSessionTool = tool({
        name: 'end_session',
        description: 'End the realtime session immediately and say a short goodbye. Use when the user clearly indicates they are done.',
        strict: true,
        parameters: z.object({
          // Structured outputs require fields to be required or nullable; avoid optional-only
          reason: z.string().nullable().describe('Reason like "user_goodbye" (nullable)'),
        }),
        execute: async ({ reason }) => {
          const r = reason || 'agent_tool_end';
          this.logAnalytics({ reason: r, source: 'tool' });
          const goodbyeDelayMs = clampInt((import.meta.env.VITE_VOICE_GOODBYE_DELAY_MS as any) ?? 1200, 0, 5000);
          // Mark tool-driven ending to avoid detector races, schedule teardown after tool result posts
          this.endingByTool = true;
          setTimeout(() => {
            this.smartEnd(r, { allowGoodbyeMs: goodbyeDelayMs, doInterrupt: false, speakConfirmation: false });
          }, 50);
          return { ended: true } as any;
        },
      });

      // Rating tool for dashboard analytics
      const recordRatingTool = tool({
        name: 'record_rating',
        description: 'Record a user rating (1-5) for the voice assistant at the end of the conversation. Ask the guest first, then call this.',
        strict: true,
        parameters: z.object({
          rating: z.number().int().min(1).max(5).describe('User rating from 1 to 5'),
        }),
        async execute({ rating }) {
          await log('rating', { rating });
          return { ok: true } as any;
        },
      });

      this.agent = new RealtimeAgent({
        name: 'Rug Assistant',
        instructions,
        tools: [bookTableTool, addToBasketTool, endSessionTool, recordRatingTool],
        voice: this.opts.voice,
      });
      const transcribeEnabled = strToBool((import.meta.env.VITE_VOICE_TRANSCRIBE_ENABLED as string) ?? 'true');
      const transcribeModel = (import.meta.env.VITE_VOICE_TRANSCRIBE_MODEL as string) || 'gpt-4o-mini-transcribe';

      this.session = new RealtimeSession(this.agent, {
        model: this.opts.model,
        config: {
          ...(transcribeEnabled
            ? { inputAudioTranscription: { model: transcribeModel } }
            : {}),
        },
      });

      this.opts.onStatus('connecting');
      // Add a connection timeout so the UI doesn't hang forever
      const timeoutMs = 15000;
      this.connectStartMs = Date.now();
      await Promise.race([
        this.session.connect({ apiKey: ephemeral }),
        new Promise((_resolve, reject) => setTimeout(() => reject(new Error('connect-timeout')), timeoutMs)),
      ]);
      this.opts.onStatus('ready');
      // Wire session events for end-intent detection and state tracking
      this.session.on('history_updated', (history: any[]) => {
        try {
          // Track last assistant text for risk assessment
          const lastAssistant = findLastText(history, 'assistant');
          if (lastAssistant) {
            this.lastAssistantText = lastAssistant.text;
            this.lastAssistantAt = Date.now();
          }

          const lastUser = findLastText(history, 'user');
          if (!lastUser?.text) return;

          // If a tool-driven ending is already in progress, ignore local detection
          if (this.endingByTool) return;

          // If we're waiting on explicit confirmation, short-circuit
          if (this.awaitingEndConfirm) {
            if (detectAffirmation(lastUser.text)) {
              this.awaitingEndConfirm = false;
              this.logAnalytics({ reason: 'user_goodbye_confirmed', source: 'detector_confirm', ...this.lastDetection });
              // Speak a brief, natural goodbye (multilingual) then end
              const goodbyeDelayMs = clampInt((import.meta.env.VITE_VOICE_GOODBYE_DELAY_MS as any) ?? 1200, 0, 5000);
              try {
                (this.session as any).sendMessage?.(
                  "Please say a brief, natural goodbye in the user's language and no further content."
                );
              } catch {}
              this.smartEnd('user_goodbye_confirmed', {
                allowGoodbyeMs: goodbyeDelayMs,
                doInterrupt: false,
                speakConfirmation: false,
              });
              return;
            }
            if (detectNegation(lastUser.text)) {
              this.awaitingEndConfirm = false;
              // Carry on; no end.
              return;
            }
            // Ambiguous; ignore and continue.
            return;
          }

          // Run detector on the latest user utterance
          const det = detectEndIntentFromText(lastUser.text);
          if (!det.match) return;
          this.lastDetection = { confidence: det.confidence, strategy: det.strategy };
          const STRONG = 0.7;
          const WEAK = 0.5;

          const risky = shouldConfirmEnd(this.lastAssistantText, this.lastAssistantAt);
          const bookingCue = looksLikeBookingContext(this.lastAssistantText || '');
          const needsConfirm = risky || bookingCue || det.confidence < STRONG;
          if (needsConfirm && det.confidence >= WEAK) {
            try {
              (this.session as any).sendMessage?.(
                "Please ask the user, in their language, a concise confirmation question to verify they intended to end the conversation. Ask only the question and nothing else."
              );
            } catch {}
            this.awaitingEndConfirm = true;
            return;
          }

          if (det.confidence >= STRONG) {
            this.logAnalytics({ reason: 'user_goodbye', source: 'detector', ...this.lastDetection });
            // Multilingual goodbye via the model, then disconnect without cutting off audio
            const goodbyeDelayMs = clampInt((import.meta.env.VITE_VOICE_GOODBYE_DELAY_MS as any) ?? 1200, 0, 5000);
            try {
              (this.session as any).sendMessage?.(
                "Please say a brief, natural goodbye in the user's language and no further content."
              );
            } catch {}
            this.smartEnd('user_goodbye', {
              allowGoodbyeMs: goodbyeDelayMs,
              doInterrupt: false,
              speakConfirmation: false,
            });
          }
        } catch (e) {
          // non-fatal
          console.warn('history_updated handler error', e);
        }
      });

      // Log connection ready timing for analytics
      try {
        const ms = this.connectStartMs ? Date.now() - this.connectStartMs : undefined;
        if (typeof ms === 'number') await log('status', { state: 'ready', connection_ms: ms });
      } catch {}
    } catch (e) {
      this.opts.onError(e);
      const msg = (e as any)?.message || String(e);
      // Surface a more helpful state for mobile issues
      let endReason: 'timeout' | 'error' | undefined;
      if (/secure context/i.test(msg)) this.opts.onStatus('insecure-context');
      else if (/Microphone access not supported/i.test(msg)) this.opts.onStatus('no-mic');
      else if (/permission denied|allow mic/i.test(msg)) this.opts.onStatus('mic-denied');
      else if (/no microphone detected/i.test(msg)) this.opts.onStatus('no-mic');
      else if (/connect-timeout/i.test(msg)) { this.opts.onStatus('timeout'); endReason = 'timeout'; }
      else { this.opts.onStatus('error'); endReason = 'error'; }
      this.started = false;
      try {
        if (endReason) await this.logAction('status', { state: endReason });
        await this.stop(endReason || undefined);
      } catch {}
    }
  }

  async stop(reason?: 'user_stop' | 'timeout' | 'error') {
    try {
      const anySession: any = this.session as any;
      if (anySession) {
        this.logAnalytics({ reason: 'manual', source: 'user_ui' });
        await endSessionGracefully(anySession, { reason: 'manual' });
      }
    } catch {}
    this.session = undefined;
    this.agent = undefined;
    this.started = false;
    try { if (this.sessionId) await this.logAction('session_end', { end_reason: reason || 'user_stop' }); } catch {}
    this.opts.onStatus('stopped');
  }

  private safeClip(text: string, limit: number) {
    return text.length > limit ? text.slice(0, limit) + '\n…' : text;
  }

  private async smartEnd(reason: string, options?: Partial<EndOptions>) {
    if (this.hasEnded) return;
    this.hasEnded = true;
    try {
      this.opts.onStatus('ending');
      await endSessionGracefully(this.session, { reason, ...(options || {}) });
    } finally {
      this.session = undefined;
      this.agent = undefined;
      this.started = false;
      this.awaitingEndConfirm = false;
      this.endingByTool = false;
      this.opts.onStatus('stopped');
      this.hasEnded = false;
    }
  }

  // Bridge end-intent analytics to dashboard action logging
  private async logAnalytics(meta: { reason: string; source: string; confidence?: number; strategy?: string }) {
    try {
      // Use the unified actions endpoint with a session_end event
      await this.logAction('session_end', {
        end_reason: meta.reason,
        detector_source: meta.source,
        confidence: typeof meta.confidence === 'number' ? meta.confidence : undefined,
        strategy: meta.strategy || undefined,
      });
    } catch {}
  }

  // --- Dashboard analytics helpers as class methods ---
  private makeSessionId() {
    try {
      const v = (globalThis as any).crypto?.randomUUID?.();
      if (v) return v;
    } catch {}
    return `vs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private async logAction(action: string, extra: Record<string, any> = {}) {
    if (!this.sessionId) return;
    try {
      const res = await fetch('/api/voice/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, sessionId: this.sessionId, ...extra }),
      });
      if (!res.ok) {
        // Non-fatal: keep UX smooth but surface a console hint for devs
        const txt = await res.text().catch(() => '');
        console.warn('[voice] logAction failed', action, res.status, txt);
      }
    } catch (e) {
      // Swallow network errors silently to avoid interrupting the session
    }
  }

  private getPageContext() {
    try {
      const url = new URL(location.href);
      return {
        path: url.pathname,
        utm: {
          source: url.searchParams.get('utm_source') || '',
          medium: url.searchParams.get('utm_medium') || '',
          campaign: url.searchParams.get('utm_campaign') || '',
        },
      };
    } catch {
      return { path: '/', utm: { source: '', medium: '', campaign: '' } };
    }
  }

  private async markFirstResponse() {
    if (this.firstResponseSent) return;
    this.firstResponseSent = true;
    const ms = this.connectStartMs ? Date.now() - this.connectStartMs : undefined;
    if (typeof ms === 'number') await this.logAction('first_response', { first_response_ms: ms });
  }
}

// -------- helpers --------
function findLastText(history: any[], role: 'user' | 'assistant'): { text: string } | undefined {
  for (let i = history.length - 1; i >= 0; i--) {
    const item = history[i];
    if (!item) continue;
    if (item.type !== 'message' || item.role !== role) continue;
    // content can be array of parts with different types
    const parts: any[] = Array.isArray(item.content) ? item.content : [];
    // Prefer explicit text fields
    for (const p of parts) {
      const text = p?.text || p?.content || p?.transcript || p?.value;
      if (typeof text === 'string' && text.trim()) {
        return { text };
      }
    }
    // Sometimes there may be a top-level text
    if (typeof (item as any).text === 'string') {
      const t = (item as any).text.trim();
      if (t) return { text: t };
    }
  }
  return undefined;
}

function strToBool(v: string): boolean {
  return /^(1|true|yes|y)$/i.test(String(v || '').trim());
}

function clampInt(v: any, min: number, max: number): number {
  const n = Number.parseInt(String(v), 10);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

// Dashboard analytics helpers are implemented above as class methods.

function looksLikeBookingContext(text: string): boolean {
  const s = String(text || '').toLowerCase();
  // Heuristics for booking/reservation flow prompts from the assistant
  return /(book|reservation|reserve|date|time|party\s*size|party\b|name|contact|email|phone|confirm|go ahead|shall i)/i.test(s);
}
