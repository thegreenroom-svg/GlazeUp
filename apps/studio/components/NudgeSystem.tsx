'use client';

import { createContext, useContext, useState, ReactNode } from 'react';
import { HelpCircle, X } from 'lucide-react';

// ============================================================================
// NUDGE SYSTEM — Studio (staff) app
// ----------------------------------------------------------------------------
// Soft, dismissible workflow guidance. Non-blocking: shown once per nudge id
// per session, dismissible, never re-shown after "Got it". A persistent
// help (?) button (mirrors the existing Home button pattern in AppShell)
// opens the full workflow for whichever page registers one.
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

interface NudgeContextValue {
  isDismissed: (id: string) => boolean;
  dismiss: (id: string) => void;
  helpOpen: boolean;
  openHelp: () => void;
  closeHelp: () => void;
  activeHelpIds: string[];
  setActiveHelpIds: (ids: string[]) => void;
}

const NudgeContext = createContext<NudgeContextValue | null>(null);

export function NudgeProvider({ children }: { children: ReactNode }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [helpOpen, setHelpOpen] = useState(false);
  const [activeHelpIds, setActiveHelpIds] = useState<string[]>([]);

  const isDismissed = (id: string) => dismissed.has(id);
  const dismiss = (id: string) => setDismissed((prev) => new Set(prev).add(id));

  return (
    <NudgeContext.Provider
      value={{
        isDismissed,
        dismiss,
        helpOpen,
        openHelp: () => setHelpOpen(true),
        closeHelp: () => setHelpOpen(false),
        activeHelpIds,
        setActiveHelpIds,
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
// once dismissed for this session.
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
  const { openHelp, setActiveHelpIds } = useNudgeContext();
  return (
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
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={closeHelp} aria-label="Close help"><X size={22} /></button>
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
                    <p className="font-bold text-sm">{nudge.title}</p>
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
