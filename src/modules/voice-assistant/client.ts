// Voice assistant client using OpenAI Agents SDK (RealtimeAgent + RealtimeSession)
// Keeps the same simple start/stop/status surface for reuse across sites.
import { RealtimeAgent, RealtimeSession, tool } from '@openai/agents/realtime';
import * as z from 'zod';
import { COFFEE_PRODUCTS, findProduct } from '@/data/products';
import * as Cart from '@/lib/cart';

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
  private sessionId: string = '';

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
      try { await log('session_start'); } catch {}
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
          const out = await res.json();
          try { await log('booking_created'); } catch {}
          return out;
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
          const addedCount = (items || []).reduce((acc, it) => acc + Math.max(1, Number(it.quantity || 1)), 0);
          try { await log('add_to_basket', { delta: Math.max(1, addedCount || 1) }); } catch {}
          return {
            added,
            notFound,
            count: Cart.count(),
            total: Cart.total(),
          };
        },
      });

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
        tools: [bookTableTool, addToBasketTool, recordRatingTool],
        voice: this.opts.voice,
      });
      this.session = new RealtimeSession(this.agent);

      this.opts.onStatus('connecting');
      // Add a connection timeout so the UI doesn't hang forever
      const timeoutMs = 15000;
      await Promise.race([
        this.session.connect({ apiKey: ephemeral }),
        new Promise((_resolve, reject) => setTimeout(() => reject(new Error('connect-timeout')), timeoutMs)),
      ]);
      this.opts.onStatus('ready');
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
      if (anySession?.disconnect) await anySession.disconnect();
      else if (anySession?.close) anySession.close();
      else if (anySession?.destroy) anySession.destroy();
    } catch {}
    this.session = undefined;
    this.agent = undefined;
    this.started = false;
    try { if (this.sessionId) await this.logAction('session_end'); } catch {}
    this.opts.onStatus('stopped');
  }

  private safeClip(text: string, limit: number) {
    return text.length > limit ? text.slice(0, limit) + '\n…' : text;
  }

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
}
