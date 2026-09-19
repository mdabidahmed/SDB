/** Drives ⌘ vs Ctrl in shortcut hints and key handling. */
export const isApplePlatform = (): boolean =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent);
