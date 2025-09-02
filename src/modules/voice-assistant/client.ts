// Voice assistant client using OpenAI Agents SDK (RealtimeAgent + RealtimeSession)
// Keeps the same simple start/stop/status surface for reuse across sites.
import { RealtimeAgent, RealtimeSession } from '@openai/agents/realtime';

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
    if (this.started) return;
    this.started = true;
    this.opts.onStatus('requesting-mic');

    try {
      // Fetch ephemeral key from our backend
      const tokenRes = await fetch(this.opts.tokenUrl);
      if (!tokenRes.ok) throw new Error(`Token error: ${tokenRes.status}`);
      const tokenJson = await tokenRes.json();
      const ephemeral = tokenJson?.value || tokenJson?.client_secret?.value;
      if (!ephemeral) throw new Error('No ephemeral key returned');
      // Build instructions with a page snapshot for grounded answers
      const pageText = this.safeClip(document.body?.innerText || '', 6000);
      const instructions = [
        this.opts.instructions,
        '',
        'Context (page snapshot):',
        pageText,
        '',
        'Guidelines:',
        '- If unsure, say so and direct to Menu or Hours.',
        '- Keep answers concise and friendly.',
      ].join('\n');

      // Initialize SDK agent + session
      this.agent = new RealtimeAgent({
        name: 'Rug Assistant',
        instructions,
      });
      this.session = new RealtimeSession(this.agent);

      this.opts.onStatus('connecting');
      await this.session.connect({ apiKey: ephemeral });
      this.opts.onStatus('ready');
    } catch (e) {
      this.opts.onError(e);
      this.opts.onStatus('error');
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
    this.opts.onStatus('stopped');
  }

  private safeClip(text: string, limit: number) {
    return text.length > limit ? text.slice(0, limit) + '\n…' : text;
  }
}
