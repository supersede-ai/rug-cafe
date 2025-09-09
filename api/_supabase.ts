// Utility helpers used by multiple API routes
export function toHHMM(time: string | null | undefined) {
  if (!time) return '';
  // normalize variants like 'HH:MM', 'HH:MM:SS', 'HH:MM:SS+TZ'
  const m = String(time).match(/^(\d{2}:\d{2})(?::\d{2})?(?:[.+-].*)?$/);
  return m ? m[1] : String(time).slice(0, 5);
}
