// Voice assistant client using OpenAI Agents SDK (RealtimeAgent + RealtimeSession)
// Keeps the same simple start/stop/status surface for reuse across sites.
import { RealtimeAgent, RealtimeSession, tool } from '@openai/agents/realtime';
import * as z from 'zod';
import { COFFEE_PRODUCTS, findProduct } from '@/data/products';
import * as Cart from '@/lib/cart';
// Local end-intent detection imports removed - now agent-driven only
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
  // Session state tracking
  private lastAssistantText?: string;
  private lastAssistantAt?: number;
  private hasEnded = false;
  private endingByTool = false;
  private bookingMade = false;
  private ratingRecorded = false;
  private pendingRating = false;
  private lastUserText?: string;
  private lastUserAt?: number;
  private lastBookingAt?: number;
  private lastCartActionAt?: number;
  private isInBookingFlow = false;

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
        '- ENDING CONVERSATIONS: Only end when the user explicitly expresses farewell intent (goodbye, farewell, etc.). NEVER end during active booking flows, while collecting reservation details, immediately after completing actions (booking/adding items), or for acknowledgment responses. NEVER end for transitional phrases, expressions of satisfaction, or clarifying questions. When ending, say a brief goodbye in the user\'s language, then call end_session.',
        '- RATING COLLECTION: After successfully creating a reservation, proactively ask for a 1-5 rating of the assistant experience. Call record_rating with their response. If they decline to rate, acknowledge politely. Rating collection is separate from conversation ending - do not automatically end after collecting ratings.',
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
              this.bookingMade = true;
              this.lastBookingAt = Date.now();
              this.isInBookingFlow = false;
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
            this.lastCartActionAt = Date.now();
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
        description: 'End the conversation ONLY when user explicitly expresses farewell intent (goodbye, farewell, etc. in any language). NEVER use during booking flows, immediately after completing actions, or for acknowledgment phrases.',
        strict: true,
        parameters: z.object({
          // Structured outputs require fields to be required or nullable; avoid optional-only
          reason: z.string().nullable().describe('Reason like "user_goodbye" (nullable)'),
        }),
        execute: async ({ reason }) => {
          const now = Date.now();
          
          // Contextual guards to prevent premature endings
          
          // Guard 1: Prevent ending if currently in booking flow
          if (this.isInBookingFlow) {
            return { ended: false, reason: 'blocked_booking_flow', message: 'Cannot end during active booking process.' } as any;
          }
          
          // Guard 2: Prevent ending if booking was just completed (within 30 seconds)
          if (this.lastBookingAt && (now - this.lastBookingAt) < 30000) {
            return { ended: false, reason: 'blocked_recent_booking', message: 'Cannot end immediately after booking completion.' } as any;
          }
          
          // Guard 3: Prevent ending if cart action was just completed (within 15 seconds)
          if (this.lastCartActionAt && (now - this.lastCartActionAt) < 15000) {
            return { ended: false, reason: 'blocked_recent_cart_action', message: 'Cannot end immediately after cart action.' } as any;
          }
          
          // Guard 4: Prevent ending if assistant just asked a question (within 10 seconds)
          if (this.lastAssistantAt && (now - this.lastAssistantAt) < 10000 && 
              this.lastAssistantText && 
              (this.lastAssistantText.includes('?') || /\?\s*$/.test(this.lastAssistantText))) {
            return { ended: false, reason: 'blocked_recent_question', message: 'Cannot end immediately after asking a question.' } as any;
          }
          
          // Rating collection logic (separate from ending guards)
          if (this.bookingMade && !this.ratingRecorded) {
            const userDeclined = looksLikeRatingRefusal(this.lastUserText || '');
            if (!userDeclined) {
              // Don't block ending, but note that rating should be collected
              try {
                (this.session as any).sendMessage?.(
                  'I noticed you made a booking. Would you like to rate your experience from 1-5 before we end? If so, please share your rating.'
                );
              } catch {}
              // Allow ending to proceed - rating is optional, not blocking
            }
          }
          const inferredReason = this.pendingRating && !this.ratingRecorded && looksLikeRatingRefusal(this.lastUserText || '')
            ? 'rating_declined'
            : 'agent_tool_end';
          const r = reason || inferredReason;
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

      // Rating tool for dashboard analytics (gated to successful bookings)
      const recordRatingTool = tool({
        name: 'record_rating',
        description: 'Record a user rating (1-5) only if a reservation was created successfully in this session and the conversation is ending.',
        strict: true,
        parameters: z.object({
          rating: z.number().int().min(1).max(5).describe('User rating from 1 to 5'),
        }),
        async execute({ rating }) {
          // Only allow rating if a booking was successfully created in this session
          if (!this.bookingMade) {
            try { await log('status', { state: 'rating_skipped_no_booking' }); } catch {}
            return { ok: false, skip: true, reason: 'no_booking' } as any;
          }
          await log('rating', { rating });
          this.ratingRecorded = true;
          // If we deferred ending to get the rating, schedule a graceful end with a short goodbye
          if (this.pendingRating) {
            const goodbyeDelayMs = clampInt((import.meta.env.VITE_VOICE_GOODBYE_DELAY_MS as any) ?? 1200, 0, 5000);
            try {
              (this.session as any).sendMessage?.(
                "Thank you. Please say a brief, natural goodbye in the user's language and no further content."
              );
            } catch {}
            setTimeout(() => {
              this.smartEnd('rating_done', { allowGoodbyeMs: goodbyeDelayMs, doInterrupt: false, speakConfirmation: false });
            }, 50);
            this.pendingRating = false;
          }
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
            
            // Detect if assistant is starting/in booking flow
            if (looksLikeBookingContext(lastAssistant.text)) {
              this.isInBookingFlow = true;
            }
          }

          const lastUser = findLastText(history, 'user');
          if (!lastUser?.text) return;
          this.lastUserText = lastUser.text;
          this.lastUserAt = Date.now();
          
          // Detect if user is providing booking information
          if (this.isInBookingFlow && !this.bookingMade) {
            // Check if user provided booking-related info (keep flow active)
            const bookingResponse = /(\d{1,2}|january|february|march|april|may|june|july|august|september|october|november|december|today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|morning|afternoon|evening|\d{1,2}:\d{2}|\d{1,2}pm|\d{1,2}am|people|person|party)/i.test(lastUser.text);
            if (!bookingResponse) {
              // User didn't provide booking info, maybe they're done with booking
              this.isInBookingFlow = false;
            }
          }

          // Local end-intent detection is completely disabled. The agent should handle all ending logic via the end_session tool.
          return;

          // All local detection logic has been removed. The agent handles ending via end_session tool only.
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

function looksLikeRatingRefusal(text: string): boolean {
  const s = String(text || '').toLowerCase();
  // Only used when a rating prompt is pending. Be liberal in refusal patterns.
  return /(\bno\b|\bnope\b|\bnot now\b|\bmaybe later\b|\bskip\b|\bpass\b|don't want|do not want|rather not|no thanks|\bnah\b)/i.test(s)
    || /\b(no|skip|pass)\b.*\b(rate|rating|feedback)\b/i.test(s)
    || /\b(rate|rating|feedback)\b.*\b(no|skip|pass)\b/i.test(s);
}
