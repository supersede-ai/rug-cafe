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
      const tokenRes = await fetch(this.opts.tokenUrl);
      if (!tokenRes.ok) {
        let body = '';
        try { body = await tokenRes.text(); } catch {}
        throw new Error(`Token error: ${tokenRes.status}${body ? ` - ${body}` : ''}`);
      }
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
    this.opts.onStatus('stopped');
  }

  private safeClip(text: string, limit: number) {
    return text.length > limit ? text.slice(0, limit) + '\n…' : text;
  }
}
