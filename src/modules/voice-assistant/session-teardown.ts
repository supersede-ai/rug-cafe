import type { RealtimeSession } from '@openai/agents/realtime';

export type EndOptions = {
  speakConfirmation?: boolean;
  confirmationText?: string;
  confirmationWaitMs?: number;
  reason?: string; // e.g., 'user_goodbye', 'manual', 'timeout'
  onEnded?: (reason: string) => void;
  // When the agent already spoke a goodbye before calling the tool, avoid cutting it off.
  // Wait this long before tearing down. Set to 0 to disable.
  allowGoodbyeMs?: number;
  // Whether to forcefully interrupt any ongoing speech before disconnect.
  // For tool-driven goodbyes you likely want false.
  doInterrupt?: boolean;
};

const defaultEndOptions: Required<Omit<EndOptions, 'onEnded' | 'reason'>> = {
  // Default: do not speak here. Prefer the agent to say a natural goodbye
  // and then call the end_session tool.
  speakConfirmation: false,
  confirmationText: 'Okay, ending our session now. Goodbye!',
  confirmationWaitMs: 1200,
  allowGoodbyeMs: 0,
  doInterrupt: true,
};

export async function endSessionGracefully(
  session: RealtimeSession | undefined,
  opts: EndOptions = {}
): Promise<void> {
  if (!session) return;
  const cfg = { ...defaultEndOptions, ...opts };
  const reason = opts.reason || 'ended';

  try {
    // Optionally wait to allow the agent's own goodbye to finish.
    if (cfg.allowGoodbyeMs && cfg.allowGoodbyeMs > 0) {
      await delay(cfg.allowGoodbyeMs);
    }

    // Stop any ongoing assistant speech/generation (unless caller opts out)
    if (cfg.doInterrupt) {
      try { (session as any).interrupt?.(); } catch {}
    }

    // Optionally speak a short confirmation
    if (cfg.speakConfirmation) {
      try {
        await (session as any).sendMessage?.(cfg.confirmationText);
      } catch {}
      // Wait briefly so the audio can play a snippet, then disconnect.
      await delay(cfg.confirmationWaitMs);
    }

    // Disconnect/teardown the session transport
    try { await (session as any).disconnect?.(); } catch {}
    try { (session as any).transport?.close?.(); } catch {}

    // Best-effort: stop any remaining local media tracks the transport might hold
    try {
      const t = (session as any).transport;
      const local: MediaStream | undefined = t?.mediaStream || t?.localStream || t?._localStream;
      local?.getTracks?.().forEach((track) => {
        try { track.stop(); } catch {}
      });
    } catch {}
  } finally {
    try { opts.onEnded?.(reason); } catch {}
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
