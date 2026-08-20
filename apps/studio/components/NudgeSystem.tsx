'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { HelpCircle, X, Settings2 } from 'lucide-react';

// ============================================================================
// NUDGE SYSTEM — Studio (staff) app
// ----------------------------------------------------------------------------
// Soft, dismissible workflow guidance. Non-blocking, dismissible.
//
// Daisy: "I wanna turn off the nudges now. They're annoying. I want them
// selectively on if possible." Two real changes from the original design:
// 1. Dismissal is now PERSISTENT (localStorage), not just per-session --
//    a nudge dismissed once stays dismissed after a reload, rather than
//    reappearing and becoming exactly the kind of repeated annoyance
//    that prompted this.
// 2. A real settings panel (gear icon, next to the existing help button)
//    lists every nudge individually with its own on/off toggle -- "turn
//    them all off" is one tap, but any specific one can be selectively
//    switched back on, rather than an all-or-nothing choice.
// ============================================================================

export interface Nudge {
  title: string;
  body: string;
}

// Real nudges tied to real staff workflows. Extend this registry as more
// pages get nudges -- do not invent ids without a matching NudgeCard call.
export const STAFF_NUDGES: Record<string, Nudge> = {
  // Start Floor (apps/studio/app/(staff)/floor/page.tsx)
  floor_home: {
    title: 'Start Floor or Seated Bookings?',
    body: '"Start Floor" is for a brand new table just sitting down. "Seated Bookings" is for a table already painting who wants more drinks or pieces added to their till.',
  },
  floor_select_table: {
    title: 'Select a table',
    body: "Real bookings for the date shown. Tap a name to open their till.",
  },
  floor_seated_totals: {
    title: 'Running totals',
    body: 'Each table shows its live till total so you know who already has items on their bill before you tap in.',
  },
  floor_till: {
    title: 'Add items as they order',
    body: "Tap a category, then an item. It's added to the till instantly \u2014 no need to wait until the end of the session.",
  },
  floor_split_bill: {
    title: 'Splitting the bill',
    body: 'If the table wants to split, choose how many people are paying \u2014 the per-person amount updates automatically.',
  },
  floor_completion: {
    title: 'Collection and payment',
    body: 'Before finishing, choose how the pieces are getting to the customer (studio pickup or postal) and how they\u2019re paying (card via Square, or cash).',
  },
  floor_photo: {
    title: 'Photograph the pieces',
    body: 'This photo is matched to the booking and shows up under this customer\u2019s AI Matched Photos afterwards \u2014 it\u2019s the real record, not just for the receipt.',
  },
  floor_handoff: {
    title: 'Hand-off QR code',
    body: 'The customer can scan this to track their pieces and order more drinks later without needing to flag down staff.',
  },
};

const STORAGE_KEY = 'glazeup_nudges_disabled';

function loadDisabled(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    // Daisy: "turn off the nudges now." No saved preference yet means a
    // fresh load of this new persistent system -- defaults to everything
    // off, satisfying that immediately rather than requiring her to find
    // and use the new settings panel first. Selective re-enabling from
    // there is exactly "selectively on if possible".
    if (raw === null) return new Set(Object.keys(STAFF_NUDGES));
    return new Set(JSON.parse(raw));
  } catch {
    return new Set(Object.keys(STAFF_NUDGES));
  }
}

function saveDisabled(ids: Set<string>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(ids)));
  } catch { /* localStorage unavailable -- nudges just fall back to showing every time */ }
}

interface NudgeContextValue {
  isDismissed: (id: string) => boolean;
  dismiss: (id: string) => void;
  disabledIds: Set<string>;
  setNudgeEnabled: (id: string, enabled: boolean) => void;
  disableAll: () => void;
  enableAll: () => void;
  helpOpen: boolean;
  openHelp: () => void;
  closeHelp: () => void;
  activeHelpIds: string[];
  setActiveHelpIds: (ids: string[]) => void;
  settingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
}

const NudgeContext = createContext<NudgeContextValue | null>(null);

export function NudgeProvider({ children }: { children: ReactNode }) {
  const [disabledIds, setDisabledIds] = useState<Set<string>>(new Set());
  const [helpOpen, setHelpOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeHelpIds, setActiveHelpIds] = useState<string[]>([]);

  // Real persisted state loads after mount (localStorage isn't available
  // during server render) -- nudges may flash once on a very first load,
  // then respect the real saved preference from then on.
  useEffect(() => { setDisabledIds(loadDisabled()); }, []);

  const isDismissed = (id: string) => disabledIds.has(id);

  const dismiss = (id: string) => {
    setDisabledIds((prev) => {
      const next = new Set(prev).add(id);
      saveDisabled(next);
      return next;
    });
  };

  const setNudgeEnabled = (id: string, enabled: boolean) => {
    setDisabledIds((prev) => {
      const next = new Set(prev);
      if (enabled) next.delete(id); else next.add(id);
      saveDisabled(next);
      return next;
    });
  };

  const disableAll = () => {
    const all = new Set(Object.keys(STAFF_NUDGES));
    setDisabledIds(all);
    saveDisabled(all);
  };

  const enableAll = () => {
    setDisabledIds(new Set());
    saveDisabled(new Set());
  };

  return (
    <NudgeContext.Provider
      value={{
        isDismissed,
        dismiss,
        disabledIds,
        setNudgeEnabled,
        disableAll,
        enableAll,
        helpOpen,
        openHelp: () => setHelpOpen(true),
        closeHelp: () => setHelpOpen(false),
        activeHelpIds,
        setActiveHelpIds,
        settingsOpen,
        openSettings: () => setSettingsOpen(true),
        closeSettings: () => setSettingsOpen(false),
      }}
    >
      {children}
    </NudgeContext.Provider>
  );
}

function useNudgeContext() {
  const ctx = useContext(NudgeContext);
  if (!ctx) throw new Error('Nudge components must be used within NudgeProvider');
  return ctx;
}

// Bottom-anchored, dismissible card for a single nudge. Renders nothing
// once dismissed (now persistent, not just for this session).
export function NudgeCard({ id }: { id: string }) {
  const { isDismissed, dismiss } = useNudgeContext();
  const nudge = STAFF_NUDGES[id];
  if (!nudge || isDismissed(id)) return null;

  return (
    <div
      className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-40 rounded-xl p-4 shadow-lg animate-in fade-in slide-in-from-bottom-4"
      style={{ backgroundColor: 'var(--ivory)', border: '2px solid var(--clay)' }}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <p className="font-bold text-sm" style={{ color: 'var(--charcoal)' }}>{nudge.title}</p>
          <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--charcoal)', opacity: 0.75 }}>{nudge.body}</p>
          <button
            onClick={() => dismiss(id)}
            className="text-xs font-semibold mt-2 underline"
            style={{ color: 'var(--clay)' }}
          >
            Got it
          </button>
        </div>
        <button onClick={() => dismiss(id)} aria-label="Dismiss" style={{ color: 'var(--stone)' }}>
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

// Persistent (?) button, styled to match AppShell's existing fixed Home
// button. Registers which nudge ids the full help panel should list for
// the current page.
export function HelpButton({ pageIds }: { pageIds: string[] }) {
  const { openHelp, setActiveHelpIds, openSettings } = useNudgeContext();
  return (
    <>
      <button
        onClick={() => {
          setActiveHelpIds(pageIds);
          openHelp();
        }}
        aria-label="Show help for this page"
        style={{
          position: 'fixed', top: '0.75rem', right: '3.25rem', zIndex: 20,
          width: 38, height: 38, borderRadius: '50%', border: 'none', cursor: 'pointer',
          backgroundColor: 'var(--clay)', color: 'var(--ivory)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
        }}
      >
        <HelpCircle size={18} />
      </button>
      <button
        onClick={openSettings}
        aria-label="Nudge settings"
        style={{
          position: 'fixed', top: '0.75rem', right: '5.75rem', zIndex: 20,
          width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--clay)', cursor: 'pointer',
          backgroundColor: 'var(--ivory)', color: 'var(--clay)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
        }}
      >
        <Settings2 size={15} />
      </button>
    </>
  );
}

// Real settings panel -- lists every registered nudge with its own on/off
// toggle, plus quick "turn off all" / "turn on all" actions. Selective
// control, not just a blanket switch.
export function NudgeSettingsPanel() {
  const { settingsOpen, closeSettings, disabledIds, setNudgeEnabled, disableAll, enableAll } = useNudgeContext();
  if (!settingsOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={closeSettings}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-6 max-h-[80vh] overflow-y-auto"
        style={{ backgroundColor: 'var(--charcoal)', color: 'var(--ivory)' }}
      >
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-bold" style={{ color: 'var(--ivory)' }}>Workflow tips</h2>
          <button onClick={closeSettings} aria-label="Close settings" style={{ color: 'var(--ivory)' }}><X size={22} /></button>
        </div>
        <p className="text-xs mb-4" style={{ color: 'var(--stone)' }}>
          Turn any of these on or off. Saved on this device.
        </p>

        <div className="flex gap-2 mb-4">
          <button
            onClick={disableAll}
            className="flex-1 py-2 rounded-lg text-xs font-semibold"
            style={{ backgroundColor: 'var(--ivory)', color: 'var(--charcoal)' }}
          >
            Turn all off
          </button>
          <button
            onClick={enableAll}
            className="flex-1 py-2 rounded-lg text-xs font-semibold border"
            style={{ borderColor: 'var(--stone)', color: 'var(--ivory)' }}
          >
            Turn all on
          </button>
        </div>

        <div className="space-y-3">
          {Object.entries(STAFF_NUDGES).map(([id, nudge]) => {
            const enabled = !disabledIds.has(id);
            return (
              <div key={id} className="flex items-center justify-between gap-3">
                {/* Real contrast fix -- this had no colour set at all, so
                    on the panel's dark background the label rendered
                    invisible, leaving eight unlabelled toggles with no
                    way to know what any of them controlled. Same class
                    of bug found earlier on the Daily Cards buttons. */}
                <p className="text-sm flex-1" style={{ color: 'var(--ivory)' }}>{nudge.title}</p>
                <button
                  onClick={() => setNudgeEnabled(id, !enabled)}
                  aria-label={`${enabled ? 'Disable' : 'Enable'} ${nudge.title}`}
                  style={{
                    width: 42, height: 24, borderRadius: 999, flexShrink: 0,
                    backgroundColor: enabled ? 'var(--clay)' : 'var(--stone)',
                    position: 'relative', border: 'none', cursor: 'pointer',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute', top: 2, left: enabled ? 20 : 2,
                      width: 20, height: 20, borderRadius: '50%', backgroundColor: 'white',
                      transition: 'left 0.15s ease',
                    }}
                  />
                </button>
              </div>
            );
          })}
        </div>

        <button
          onClick={closeSettings}
          className="w-full py-3 rounded-lg font-bold mt-6"
          style={{ backgroundColor: 'var(--clay)', color: 'var(--ivory)' }}
        >
          Done
        </button>
      </div>
    </div>
  );
}

// Full workflow panel, listing every nudge registered for the current page
// in order, regardless of dismissed state.
export function HelpPanel({ title }: { title: string }) {
  const { helpOpen, closeHelp, activeHelpIds } = useNudgeContext();
  if (!helpOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={closeHelp}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-6 max-h-[80vh] overflow-y-auto"
        style={{ backgroundColor: 'var(--charcoal)', color: 'var(--ivory)' }}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold" style={{ color: 'var(--ivory)' }}>{title}</h2>
          <button onClick={closeHelp} aria-label="Close help" style={{ color: 'var(--ivory)' }}><X size={22} /></button>
        </div>
        <div className="space-y-4">
          {activeHelpIds.map((id, idx) => {
            const nudge = STAFF_NUDGES[id];
            if (!nudge) return null;
            return (
              <div key={id}>
                <div className="flex items-start gap-3">
                  <span
                    className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ backgroundColor: 'var(--clay)', color: 'var(--ivory)' }}
                  >
                    {idx + 1}
                  </span>
                  <div>
                    <p className="font-bold text-sm" style={{ color: 'var(--ivory)' }}>{nudge.title}</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--stone)' }}>{nudge.body}</p>
                  </div>
                </div>
                {idx < activeHelpIds.length - 1 && <hr className="mt-4" style={{ borderColor: 'var(--stone)', opacity: 0.3 }} />}
              </div>
            );
          })}
        </div>
        <button
          onClick={closeHelp}
          className="w-full py-3 rounded-lg font-bold mt-6"
          style={{ backgroundColor: 'var(--clay)', color: 'var(--ivory)' }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}
