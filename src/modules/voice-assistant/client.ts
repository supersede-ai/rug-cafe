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
  private awaitingEndConfirm = false;
  private lastAssistantText?: string;
  private lastAssistantAt?: number;
  private hasEnded = false;
  private lastDetection?: { confidence: number; strategy?: string };
  private endingByTool = false;

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
        '- If the user clearly indicates the conversation should end (e.g., "goodbye", "that\'s all", "we\'re done"), say a brief, natural goodbye in the user\'s language and then call the end_session tool with a short reason to end the session.',
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
            throw new Error(`Booking failed: ${res.status}${text ? ` - ${text}` : ''}`);
          }
          return await res.json();
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

      this.agent = new RealtimeAgent({
        name: 'Rug Assistant',
        instructions,
        tools: [bookTableTool, addToBasketTool, endSessionTool],
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
          const needsConfirm = risky || det.confidence < STRONG;
          if (needsConfirm && det.confidence >= WEAK) {
            try { (this.session as any).sendMessage?.('Do you want to end here?'); } catch {}
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
    } catch (e) {
      this.opts.onError(e);
      const msg = (e as any)?.message || String(e);
      // Surface a more helpful state for mobile issues
      if (/secure context/i.test(msg)) this.opts.onStatus('insecure-context');
      else if (/Microphone access not supported/i.test(msg)) this.opts.onStatus('no-mic');
      else if (/permission denied|allow mic/i.test(msg)) this.opts.onStatus('mic-denied');
      else if (/no microphone detected/i.test(msg)) this.opts.onStatus('no-mic');
      else if (/connect-timeout/i.test(msg)) this.opts.onStatus('timeout');
      else this.opts.onStatus('error');
      this.started = false;
      await this.stop();
    }
  }

  async stop() {
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

  private async logAnalytics(meta: { reason: string; source: string; confidence?: number; strategy?: string }) {
    try {
      const payload = {
        type: 'session_end',
        ...meta,
      };
      // Best-effort; don't block UX
      fetch('/api/voice/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true as any,
      }).catch(() => {});
    } catch {}
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
