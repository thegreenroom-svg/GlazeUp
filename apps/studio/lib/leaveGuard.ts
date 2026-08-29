// From the app review: tapping Home mid-session on Floor -- photo taken,
// booking not yet finished -- silently threw the whole session's state
// away, with nothing telling you the QR re-scan would get you back. Both
// ways out of a flow (the floating Home button AND the swipe-back
// gesture) live in AppShell, so one flag checked in one place guards
// them both.
//
// A plain mutable module variable, not context or state -- AppShell only
// needs to READ it at the moment of a tap, never re-render because of it.

let guardMessage: string | null = null;

export function setLeaveGuard(message: string | null) {
  guardMessage = message;
}

export function confirmLeaveIfGuarded(): boolean {
  if (!guardMessage) return true;
  const ok = window.confirm(guardMessage);
  if (ok) guardMessage = null; // leaving clears it -- the state it protected is gone
  return ok;
}
