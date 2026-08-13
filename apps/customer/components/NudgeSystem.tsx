'use client';

import { createContext, useContext, useState, ReactNode } from 'react';
import { HelpCircle, X } from 'lucide-react';

// ============================================================================
// NUDGE SYSTEM — Customer app
// ----------------------------------------------------------------------------
// Same mechanism as the studio app's NudgeSystem (apps/studio/components/
// NudgeSystem.tsx) but themed with this app's own Tailwind tokens rather
// than the studio app's CSS custom properties -- the two apps don't share
// a package, so this is a deliberate parallel copy, not an import.
// ============================================================================

export interface Nudge {
  title: string;
  body: string;
}

export const CUSTOMER_NUDGES: Record<string, Nudge> = {
  bookings_empty: {
    title: 'No bookings yet',
    body: 'Once you book a session at a studio, it\u2019ll show up here with the date, time and party size.',
  },
  bookings_list: {
    title: 'Your bookings',
    body: 'Tap any booking to see full details, including the pieces made in that session as they\u2019re fired and ready.',
  },
  collection_pieces: {
    title: 'Your pottery',
    body: 'Every piece you\u2019ve painted shows up here as it moves through firing \u2014 from just made, to ready for collection, to collected.',
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

export function NudgeCard({ id }: { id: string }) {
  const { isDismissed, dismiss } = useNudgeContext();
  const nudge = CUSTOMER_NUDGES[id];
  if (!nudge || isDismissed(id)) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-40 rounded-xl p-4 shadow-soft-lg bg-white border-2 border-clay animate-slide-up">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <p className="font-bold text-sm text-charcoal">{nudge.title}</p>
          <p className="text-xs mt-1 leading-relaxed text-charcoal/75">{nudge.body}</p>
          <button onClick={() => dismiss(id)} className="text-xs font-semibold mt-2 underline text-clay">
            Got it
          </button>
        </div>
        <button onClick={() => dismiss(id)} aria-label="Dismiss" className="text-charcoal/40">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

export function HelpButton({ pageIds }: { pageIds: string[] }) {
  const { openHelp, setActiveHelpIds } = useNudgeContext();
  return (
    <button
      onClick={() => {
        setActiveHelpIds(pageIds);
        openHelp();
      }}
      aria-label="Show help for this page"
      className="p-2 hover:bg-sand/30 rounded-lg text-clay"
    >
      <HelpCircle className="w-5 h-5" />
    </button>
  );
}

export function HelpPanel({ title }: { title: string }) {
  const { helpOpen, closeHelp, activeHelpIds } = useNudgeContext();
  if (!helpOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center bg-black/50"
      onClick={closeHelp}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-6 max-h-[80vh] overflow-y-auto bg-white"
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-charcoal">{title}</h2>
          <button onClick={closeHelp} aria-label="Close help" className="text-charcoal/60"><X size={22} /></button>
        </div>
        <div className="space-y-4">
          {activeHelpIds.map((id, idx) => {
            const nudge = CUSTOMER_NUDGES[id];
            if (!nudge) return null;
            return (
              <div key={id}>
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold bg-clay text-white">
                    {idx + 1}
                  </span>
                  <div>
                    <p className="font-bold text-sm text-charcoal">{nudge.title}</p>
                    <p className="text-xs mt-1 text-charcoal/60">{nudge.body}</p>
                  </div>
                </div>
                {idx < activeHelpIds.length - 1 && <hr className="mt-4 border-sand" />}
              </div>
            );
          })}
        </div>
        <button onClick={closeHelp} className="w-full py-3 rounded-lg font-bold mt-6 bg-clay text-white">
          Got it
        </button>
      </div>
    </div>
  );
}
