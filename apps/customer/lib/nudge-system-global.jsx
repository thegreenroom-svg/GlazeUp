/**
 * GlazeUp Global Nudge System
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Soft workflow instructions across both apps (customer + studio)
 * Shared library, used anywhere
 */

'use client';

import React, { useState, useContext, createContext } from 'react';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// NUDGE REGISTRY - ALL WORKFLOWS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const NUDGES = {
  // ━━━━━━━ CUSTOMER APP ━━━━━━━
  
  // Bookings flow
  booking_search: {
    title: '🔍 Find Your Studio',
    body: 'Search for a pottery studio near you or browse by location. Check opening times and available sessions.',
    icon: '🎨'
  },
  booking_date: {
    title: '📅 Pick a Date & Time',
    body: 'Choose when you want to paint. Session length usually 2 hours. Sessions fill up on weekends!',
    icon: '⏰'
  },
  booking_party: {
    title: '👥 How Many Coming?',
    body: 'Tell us group size. Kids count too! We\'ll reserve space for everyone.',
    icon: '👨‍👩‍👧‍👦'
  },
  booking_special: {
    title: '📝 Anything Special?',
    body: 'Add notes: allergies, birthday celebrations, accessibility needs, etc.',
    icon: '💌'
  },
  booking_confirm: {
    title: '✅ All Set!',
    body: 'Booking confirmed. You\'ll get a reminder 24 hours before. Have fun painting!',
    icon: '🎉'
  },

  // My Pieces flow
  pieces_gallery: {
    title: '🖼️ Your Pottery',
    body: 'Browse all the pieces you\'ve painted. Filter by date, status (painting/ready/collected), or studio.',
    icon: '🎨'
  },
  pieces_status: {
    title: '🔄 Piece Status',
    body: 'Painting = being fired. Ready = collect or ship. Collected = all yours! We keep photos forever.',
    icon: '📦'
  },
  pieces_collect: {
    title: '📮 How to Get Them',
    body: 'Collect from studio, or we\'ll ship anywhere in UK. Shipping costs added to receipt at till.',
    icon: '📬'
  },

  // ━━━━━━━ STUDIO APP (STAFF) ━━━━━━━

  // Daily floor flow
  floor_start: {
    title: '🎨 Start a Session',
    body: 'Click the table or space to check in the booking. Customers can now paint!',
    icon: '📍'
  },
  floor_booking: {
    title: '👥 Check in Group',
    body: 'Tap the booking to mark them in. You\'ll see their names, group size, any special notes.',
    icon: '✓'
  },
  floor_paste: {
    title: '🎨 Pottery Blanks Ready',
    body: 'Staff puts out blank pottery for the group. They\'ll paint and glaze it.',
    icon: '🏺'
  },

  // Phase 1-2 (painting)
  phase1_table: {
    title: '🪑 Pick a Table',
    body: 'Tap a table number or space name. This tracks where the group is painting.',
    icon: '📍'
  },
  phase1_photo: {
    title: '📸 Take a Floor Photo',
    body: 'Take a quick photo of the table while they\'re painting (optional). Helps with tracking.',
    icon: '📸'
  },

  // Phase 3 till
  phase3_split: {
    title: '💡 Split or Single?',
    body: 'Ask the table: "Paying together or separately?" YES = enter names. NO = one bill.',
    icon: '💳'
  },
  phase3_names: {
    title: '✍️ Who\'s Paying?',
    body: 'Enter each person\'s name (one per line). We\'ll track their items separately.',
    icon: '👤'
  },
  phase3_collection: {
    title: '📦 Where to Send Pieces?',
    body: '🏠 Pickup here. 📮 We ship (need postcode). 🔀 Some each way.',
    icon: '🚚'
  },
  phase3_person: {
    title: '👤 Select Person',
    body: 'Tap a name to choose who you\'re adding items for. Watch their total update.',
    icon: '🔄'
  },
  phase3_category: {
    title: '🍽️ Choose Pottery Type',
    body: 'Mugs, Plates, Animals, Bowls, etc. We have blanks for everything they painted.',
    icon: '🎨'
  },
  phase3_add: {
    title: '➕ Add Items',
    body: 'Tap item to add to their bill. Postal shipping auto-calculates. Total updates live.',
    icon: '💰'
  },

  // Phase 4 photo
  phase4_photo: {
    title: '📸 Photograph Pieces',
    body: 'Take a clear photo of all finished pieces. This verifies what they made for records.',
    icon: '📷'
  },
  phase4_return: {
    title: '🏷️ Mark Returns',
    body: 'If a piece isn\'t finished, write on orange return ticket. Photograph with ticket visible.',
    icon: '📝'
  },

  // Phase 5 handoff
  phase5_receipt: {
    title: '🧾 Review Receipt',
    body: 'Each person sees their items, total, collection method. Check it looks right.',
    icon: '✓'
  },
  phase5_qr: {
    title: '📲 QR Code',
    body: 'Encodes booking + person + total. Helps track after they leave (pickup/shipping).',
    icon: '🔍'
  },
  phase5_print: {
    title: '🖨️ Print & Hand Over',
    body: 'Print receipts. Hand each person theirs with their pottery. Done!',
    icon: '👋'
  },

  // Dashboard/analytics
  dashboard_revenue: {
    title: '💷 Revenue Today',
    body: 'Shows total takings, bookings, average spend. Tracks postal shipping income too.',
    icon: '📊'
  },
  dashboard_pending: {
    title: '⏳ Pending Pieces',
    body: 'Pieces still being fired or waiting for pickup. Number should decrease daily.',
    icon: '🏭'
  },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// NUDGE CONTEXT & PROVIDER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const NudgeContext = createContext();

export function NudgeProvider({ children }) {
  const [dismissed, setDismissed] = useState(new Set());
  const [helpMode, setHelpMode] = useState(false);

  const dismiss = (nudgeId) => {
    setDismissed(prev => new Set([...prev, nudgeId]));
  };

  const isDismissed = (nudgeId) => dismissed.has(nudgeId);

  const resetDismissals = () => setDismissed(new Set());

  return (
    <NudgeContext.Provider value={{ dismiss, isDismissed, resetDismissals, helpMode, setHelpMode }}>
      {children}
    </NudgeContext.Provider>
  );
}

export function useNudges() {
  const context = useContext(NudgeContext);
  if (!context) {
    throw new Error('useNudges must be used within NudgeProvider');
  }
  return context;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// NUDGE CARD (Bottom slide-in)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function NudgeCard({ nudgeId }) {
  const nudges = useNudges();
  const nudge = NUDGES[nudgeId];

  if (!nudge || nudges.isDismissed(nudgeId)) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 bg-cream border-2 border-clay rounded-lg p-4 shadow-lg z-40 animate-slideUp">
      <div className="flex items-start gap-3">
        <div className="text-2xl flex-shrink-0">{nudge.icon}</div>
        <div className="flex-1">
          <p className="font-bold text-charcoal text-sm">{nudge.title}</p>
          <p className="text-charcoal text-xs mt-1 leading-relaxed">{nudge.body}</p>
          <button
            onClick={() => nudges.dismiss(nudgeId)}
            className="text-clay text-xs font-medium mt-2 underline"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HELP BUTTON (Header)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function HelpButton({ nudgeId }) {
  const nudges = useNudges();

  return (
    <button
      onClick={() => nudges.setHelpMode(true)}
      className="p-2 bg-sand rounded-full text-charcoal hover:bg-clay transition text-lg"
      title="Show workflow help"
    >
      ❓
    </button>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HELP PANEL (Full screen, all nudges for this flow)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function HelpPanel({ nudgeIds, title }) {
  const nudges = useNudges();

  if (!nudges.helpMode) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end z-50">
      <div className="bg-charcoal text-white w-full rounded-t-2xl p-6 max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">{title}</h2>
          <button
            onClick={() => nudges.setHelpMode(false)}
            className="text-2xl cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          {nudgeIds.map((id, idx) => {
            const nudge = NUDGES[id];
            if (!nudge) return null;
            return (
              <div key={id} className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{idx + 1}️⃣</span>
                  <div>
                    <h3 className="font-bold">{nudge.title}</h3>
                    <p className="text-sm text-sand">{nudge.body}</p>
                  </div>
                </div>
                {idx < nudgeIds.length - 1 && <hr className="border-clay/30" />}
              </div>
            );
          })}
        </div>

        <button
          onClick={() => nudges.setHelpMode(false)}
          className="w-full py-3 bg-terracotta rounded-lg font-bold mt-6"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// USAGE EXAMPLES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/*
// CUSTOMER APP - Booking page
export default function BookingPage() {
  return (
    <div>
      <div className="flex justify-between">
        <h1>Find a Studio</h1>
        <HelpButton />
      </div>
      
      {/* Nudge appears automatically at each step * /}
      <NudgeCard nudgeId="booking_search" />
      
      {/* Full help panel * /}
      <HelpPanel 
        nudgeIds={['booking_search', 'booking_date', 'booking_party', 'booking_special', 'booking_confirm']}
        title="Booking Workflow"
      />
      
      {/* Your content * /}
      ...
    </div>
  );
}

// STUDIO APP - Phase 3 Till page
export default function Phase3Till() {
  return (
    <div>
      <div className="flex justify-between">
        <h1>Till</h1>
        <HelpButton />
      </div>
      
      <NudgeCard nudgeId="phase3_split" />
      {/* Modal shows * /}
      
      {/* After split choice * /}
      <NudgeCard nudgeId="phase3_names" />
      
      {/* Collection choice * /}
      <NudgeCard nudgeId="phase3_collection" />
      
      {/* Till open * /}
      <NudgeCard nudgeId="phase3_person" />
      <NudgeCard nudgeId="phase3_category" />
      <NudgeCard nudgeId="phase3_add" />
      
      <HelpPanel
        nudgeIds={['phase3_split', 'phase3_names', 'phase3_collection', 'phase3_person', 'phase3_category', 'phase3_add']}
        title="Phase 3 Till Workflow"
      />
    </div>
  );
}
*/
