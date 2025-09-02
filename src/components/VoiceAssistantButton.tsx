import React, { useMemo, useState } from 'react';
import { VoiceAssistantClient } from '@/modules/voice-assistant/client';

type Props = {
  position?: 'right' | 'left';
  label?: string;
};

const VoiceAssistantButton: React.FC<Props> = ({ position = 'right', label = 'Ask The Rug' }) => {
  const [status, setStatus] = useState<string>('idle');
  const [active, setActive] = useState(false);

  const client = useMemo(() => new VoiceAssistantClient({
    instructions: (
      [
        '# Identity',
        'You are The Rug Café voice assistant: friendly, warm, concise.',
        '',
        '# Task',
        'Help guests with opening hours, today’s hours, menu highlights, dietary options, booking, and location.',
        'If info is not reliable from the current page context, clearly say so and guide them to the Menu, About, or Booking pages.',
        '',
        '# Demeanor & Tone',
        'Calm, upbeat, welcoming. Use short sentences and natural pauses.',
        'Avoid over-promising. Confirm spellings for names or numbers.',
      ].join('\n')
    ),
    onStatus: setStatus,
    onError: (e) => console.error('Voice assistant error:', e),
  }), []);

  const toggle = async () => {
    if (!active) {
      setActive(true);
      await client.start();
    } else {
      await client.stop();
      setActive(false);
    }
  };

  const isBusy = active && status !== 'ready';

  const preventDnD = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      className={[
        'fixed z-[100]',
        position === 'right' ? 'right-6 md:right-8' : 'left-6 md:left-8',
        'bottom-8',
      ].join(' ')}
      onDragOver={preventDnD}
      onDrop={preventDnD}
    >
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(); }}
        draggable={false}
        aria-pressed={active}
        aria-label={active ? 'Stop voice assistant' : 'Start voice assistant'}
        className={[
          'flex items-center space-x-3 rounded-full shadow-xl transition-all duration-300 touch-manipulation',
          'px-5 py-4 md:px-6 md:py-5',
          'bg-gradient-to-r from-[#E3833B] to-[#FFB347] text-white',
          active ? 'scale-105' : 'hover:scale-105 hover:shadow-2xl',
        ].join(' ')}
      >
        <MicIcon active={active} busy={isBusy} />
        <span className="font-bold text-base md:text-lg">
          {active ? (isBusy ? 'Connecting…' : 'Listening… tap to stop') : label}
        </span>
      </button>
      <div className="mt-2 ml-1 text-xs md:text-sm text-[#514640] bg-white/80 backdrop-blur rounded-full px-3 py-1 shadow">
        {active ? `Status: ${status}` : 'Ask about hours, menu, vegan options'}
      </div>
    </div>
  );
};

const MicIcon: React.FC<{ active: boolean; busy: boolean }> = ({ active, busy }) => (
  <div className={[
    'relative w-6 h-6 md:w-7 md:h-7 flex items-center justify-center',
  ].join(' ')}>
    {/* Pulse ring when active */}
    {active && (
      <span className={[
        'absolute inline-flex h-full w-full rounded-full',
        busy ? 'animate-ping bg-white/40' : 'animate-pulse bg-white/30',
      ].join(' ')} />
    )}
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="relative z-10 w-5 h-5 md:w-6 md:h-6">
      <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V20H9v2h6v-2h-2v-2.08A7 7 0 0 0 19 11h-2Z" />
    </svg>
  </div>
);

export default VoiceAssistantButton;
