// [6 Oct] Daisy: everything happens on the card. The table photo and
// collection screens open in a sheet over the card (an iframe of the same
// page) rather than navigating away, so the card is never left. Inside the
// sheet the app's own header and Home button are hidden, and the screen
// tells the card when it is finished or has something unsaved.

export function isEmbedded(): boolean {
  try { return typeof window !== 'undefined' && window.self !== window.top; } catch { return true; }
}

export type SheetMessage =
  | { type: 'glazeup:done' }
  | { type: 'glazeup:guard'; message: string | null };

export function tellCard(msg: SheetMessage) {
  if (!isEmbedded()) return;
  try { window.parent.postMessage(msg, window.location.origin); } catch { /* parent gone */ }
}
