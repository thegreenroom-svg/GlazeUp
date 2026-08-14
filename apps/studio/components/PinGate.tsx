'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Delete } from 'lucide-react';

const SESSION_KEY = 'glazeup_shift';

// A plain fetch() has no timeout of its own -- if the request genuinely
// hangs (not just a slow-but-working cold start, a real stalled
// connection), it can sit pending forever. Every submit here gates the
// whole PinPad on a `busy` flag while its fetch is in flight, so a fetch
// that never settles would leave the pad permanently unresponsive --
// exactly what "stuck" looks like. This guarantees every call here
// resolves or rejects within 20s either way.
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 20000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

interface Shift {
  id: string | null;
  name: string | null;
  role: string | null;
  at: number;
}

interface TeamMember {
  id: string;
  name: string;
  role: string | null;
  active: boolean;
}

// Same roles the backend checks for admin-reset -- kept in sync manually
// since the two apps don't share code. This only gates which UI shows;
// the backend re-validates the role itself before actually resetting
// anything, so this list being out of date would just hide/show a button,
// never grant or block the real action.
const ADMIN_ROLES = ['General Manager', 'Co-Director', 'Studio Executive'];

// A shift lasts a working day. Long enough that nobody re-enters a PIN
// between every task, short enough that a shared iPad doesn't stay unlocked
// under yesterday's name.
const SHIFT_MS = 14 * 60 * 60 * 1000;

// Reusable 4-digit pad -- the same dots + numpad UI, parameterised so it
// can drive the main PIN entry, setting a new personal PIN, confirming it,
// and both steps of an admin reset, without four copies of the same JSX.
function PinPad({
  value,
  onPress,
  onDelete,
  error,
}: {
  value: string;
  onPress: (d: string) => void;
  onDelete: () => void;
  error: string | null;
}) {
  return (
    <>
      <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1.5rem' }}>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              width: 14, height: 14, borderRadius: '50%',
              backgroundColor: i < value.length ? 'white' : 'rgba(255,255,255,0.3)',
            }}
          />
        ))}
      </div>

      {error && (
        <p style={{ color: 'var(--charcoal)', fontSize: '0.85rem', marginBottom: '1rem', fontWeight: 600, backgroundColor: 'rgba(255,255,255,0.85)', padding: '0.4rem 0.8rem', borderRadius: '6px' }}>{error}</p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 72px)', gap: '0.7rem' }}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button
            key={d}
            onClick={() => onPress(d)}
            style={{
              height: 72, borderRadius: '50%', border: 'none', cursor: 'pointer',
              background: 'rgba(255,255,255,0.2)', color: 'white', fontSize: '1.5rem', fontWeight: 300,
            }}
          >
            {d}
          </button>
        ))}
        <div />
        <button
          onClick={() => onPress('0')}
          style={{ height: 72, borderRadius: '50%', border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.2)', color: 'white', fontSize: '1.5rem', fontWeight: 300 }}
        >
          0
        </button>
        <button
          onClick={onDelete}
          style={{ height: 72, borderRadius: '50%', border: 'none', cursor: 'pointer', background: 'transparent', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          aria-label="Delete"
        >
          <Delete size={22} />
        </button>
      </div>
    </>
  );
}

type EntryMode = 'enter' | 'offer-personalize' | 'personalize-name' | 'personalize-pin' | 'personalize-confirm';

export default function PinGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [shift, setShift] = useState<Shift | null>(null);
  const [checked, setChecked] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Personalising a shared PIN -- see EntryMode above.
  const [mode, setMode] = useState<EntryMode>('enter');
  const [sharedPinUsed, setSharedPinUsed] = useState('');
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [personalizing, setPersonalizing] = useState<TeamMember | null>(null);
  const [newPin1, setNewPin1] = useState('');
  const [newPin2, setNewPin2] = useState('');
  const [personalizeError, setPersonalizeError] = useState<string | null>(null);
  const [personalizeBusy, setPersonalizeBusy] = useState(false);

  // Admin: reset a colleague's PIN. Separate from the flow above -- this
  // runs from inside the signed-in app, not the lock screen, and needs
  // the admin to re-enter THEIR OWN pin to authorise it (nothing sensitive
  // is kept from the login moment -- session storage only ever holds
  // name/role/id, never a raw PIN).
  const [adminResetOpen, setAdminResetOpen] = useState(false);
  const [adminResetStage, setAdminResetStage] = useState<'confirm-self' | 'pick-target' | 'new-pin' | 'confirm-new-pin'>('confirm-self');
  const [adminPinEntry, setAdminPinEntry] = useState('');
  const [resetTarget, setResetTarget] = useState<TeamMember | null>(null);
  const [resetPin1, setResetPin1] = useState('');
  const [resetPin2, setResetPin2] = useState('');
  const [adminResetError, setAdminResetError] = useState<string | null>(null);
  const [adminResetBusy, setAdminResetBusy] = useState(false);
  const [adminResetDone, setAdminResetDone] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) {
        const s: Shift = JSON.parse(raw);
        if (Date.now() - s.at < SHIFT_MS) setShift(s);
        else sessionStorage.removeItem(SESSION_KEY);
      }
    } catch { /* first run or private mode */ }
    setChecked(true);
  }, []);

  const loadTeam = async () => {
    if (team.length > 0 || teamLoading) return;
    setTeamLoading(true);
    try {
      const res = await fetchWithTimeout(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/team`);
      const data = res.ok ? await res.json() : [];
      setTeam((Array.isArray(data) ? data : []).filter((m: TeamMember) => m.active));
    } catch { /* leave team empty, pickers will just show nothing to choose */ }
    finally { setTeamLoading(false); }
  };

  const finishLogin = (s: Shift) => {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch { /* private mode */ }
    setShift(s);
    setMode('enter');
    setPin('');
    setSharedPinUsed('');
    setPersonalizing(null);
    setNewPin1('');
    setNewPin2('');
    setPersonalizeError(null);
    // A fresh PIN entry should always land on the Dashboard, regardless of
    // which URL happened to be loaded when the shift started or expired.
    router.push('/');
  };

  const submit = async (value: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetchWithTimeout(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/pin/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: value }),
      });
      if (!res.ok) {
        setError('PIN not recognised');
        setPin('');
        return;
      }
      const data = await res.json();
      if (data.shared) {
        // Shared PIN -- offer to personalise instead of logging straight
        // in as nobody-in-particular. Skipping still works exactly as
        // before.
        setSharedPinUsed(value);
        setMode('offer-personalize');
        return;
      }
      const s: Shift = {
        id: data.staff?.id ?? null,
        name: data.staff?.name ?? null,
        role: data.staff?.role ?? null,
        at: Date.now(),
      };
      finishLogin(s);
    } catch (err: any) {
      setError(err?.name === 'AbortError' ? "Taking too long to check — try again" : 'Could not check that PIN');
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  const press = (d: string) => {
    if (busy) return;
    const next = (pin + d).slice(0, 4);
    setPin(next);
    if (next.length === 4) submit(next);
  };

  const skipPersonalize = () => {
    finishLogin({ id: null, name: null, role: null, at: Date.now() });
  };

  const startPersonalize = () => {
    setPersonalizeError(null);
    loadTeam();
    setMode('personalize-name');
  };

  const pickPersonalizeName = (member: TeamMember) => {
    setPersonalizing(member);
    setNewPin1('');
    setPersonalizeError(null);
    setMode('personalize-pin');
  };

  const pressNewPin1 = (d: string) => {
    if (personalizeBusy) return;
    const next = (newPin1 + d).slice(0, 4);
    setNewPin1(next);
    if (next.length === 4) {
      setNewPin2('');
      setMode('personalize-confirm');
    }
  };

  const pressNewPin2 = async (d: string) => {
    if (personalizeBusy) return;
    const next = (newPin2 + d).slice(0, 4);
    setNewPin2(next);
    if (next.length === 4) {
      if (next !== newPin1) {
        setPersonalizeError("Those didn't match -- try again");
        setNewPin1('');
        setNewPin2('');
        setMode('personalize-pin');
        return;
      }
      if (!personalizing) return;
      setPersonalizeBusy(true);
      setPersonalizeError(null);
      try {
        const res = await fetchWithTimeout(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/pin/set`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ staff_member_id: personalizing.id, old_pin: sharedPinUsed, new_pin: next }),
        });
        if (!res.ok) {
          const d2 = await res.json().catch(() => ({}));
          setPersonalizeError(d2.error || 'Could not set that PIN');
          setNewPin1(''); setNewPin2('');
          setMode('personalize-pin');
          return;
        }
        finishLogin({ id: personalizing.id, name: personalizing.name, role: personalizing.role, at: Date.now() });
      } catch (err: any) {
        setPersonalizeError(err?.name === 'AbortError' ? 'Taking too long -- try again' : 'Could not set that PIN');
        setNewPin1(''); setNewPin2('');
        setMode('personalize-pin');
      } finally {
        setPersonalizeBusy(false);
      }
    }
  };

  const signOut = () => {
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
    setShift(null);
    setPin('');
    setMode('enter');
  };

  // ---- Admin reset flow ----

  const openAdminReset = () => {
    setAdminResetOpen(true);
    setAdminResetStage('confirm-self');
    setAdminPinEntry('');
    setResetTarget(null);
    setResetPin1('');
    setResetPin2('');
    setAdminResetError(null);
    setAdminResetDone(null);
    loadTeam();
  };

  const closeAdminReset = () => {
    setAdminResetOpen(false);
  };

  const pressAdminSelfPin = (d: string) => {
    if (adminResetBusy) return;
    const next = (adminPinEntry + d).slice(0, 4);
    setAdminPinEntry(next);
    if (next.length === 4) {
      // Not verified against the server yet -- that happens on final
      // submit, together with the role check, so a wrong PIN here is
      // only actually rejected once (avoids two round trips for the
      // same check).
      setAdminResetStage('pick-target');
    }
  };

  const pickResetTarget = (member: TeamMember) => {
    setResetTarget(member);
    setResetPin1('');
    setAdminResetError(null);
    setAdminResetStage('new-pin');
  };

  const pressResetPin1 = (d: string) => {
    if (adminResetBusy) return;
    const next = (resetPin1 + d).slice(0, 4);
    setResetPin1(next);
    if (next.length === 4) {
      setResetPin2('');
      setAdminResetStage('confirm-new-pin');
    }
  };

  const pressResetPin2 = async (d: string) => {
    if (adminResetBusy) return;
    const next = (resetPin2 + d).slice(0, 4);
    setResetPin2(next);
    if (next.length === 4) {
      if (next !== resetPin1) {
        setAdminResetError("Those didn't match -- try again");
        setResetPin1(''); setResetPin2('');
        setAdminResetStage('new-pin');
        return;
      }
      if (!shift?.id || !resetTarget) return;
      setAdminResetBusy(true);
      setAdminResetError(null);
      try {
        const res = await fetchWithTimeout(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/pin/admin-reset`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            admin_staff_member_id: shift.id,
            admin_pin: adminPinEntry,
            target_staff_member_id: resetTarget.id,
            new_pin: next,
          }),
        });
        if (!res.ok) {
          const d2 = await res.json().catch(() => ({}));
          setAdminResetError(d2.error || 'Could not reset that PIN');
          setResetPin1(''); setResetPin2('');
          setAdminResetStage('new-pin');
          return;
        }
        setAdminResetDone(`${resetTarget.name}'s PIN has been reset.`);
      } catch (err: any) {
        setAdminResetError(err?.name === 'AbortError' ? 'Taking too long -- try again' : 'Could not reset that PIN');
        setResetPin1(''); setResetPin2('');
        setAdminResetStage('new-pin');
      } finally {
        setAdminResetBusy(false);
      }
    }
  };

  if (!checked) return null;

  const lockScreenShell = (content: React.ReactNode) => (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', background: 'linear-gradient(135deg, var(--clay) 0%, #9A6435 100%)' }}>
      <img
        src="https://static.wixstatic.com/media/d0e5bd_2acf96e6189f4fbcb2159fae9f0a5674~mv2.png"
        alt="The Kiln Cafe"
        style={{ height: 40, filter: 'brightness(0) invert(1)', marginBottom: '1.5rem' }}
      />
      {content}
    </div>
  );

  if (!shift) {
    if (mode === 'offer-personalize') {
      return lockScreenShell(
        <div style={{ textAlign: 'center', maxWidth: 300 }}>
          <p style={{ color: 'white', fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>This PIN is shared by the team</p>
          <p style={{ color: 'white', opacity: 0.75, fontSize: '0.85rem', marginBottom: '1.75rem' }}>Want to set your own, just for you?</p>
          <button
            onClick={startPersonalize}
            style={{ width: '100%', padding: '0.9rem', borderRadius: 10, border: 'none', cursor: 'pointer', background: 'white', color: 'var(--clay)', fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.7rem' }}
          >
            Set my own PIN
          </button>
          <button
            onClick={skipPersonalize}
            style={{ width: '100%', padding: '0.9rem', borderRadius: 10, border: '1px solid rgba(255,255,255,0.4)', cursor: 'pointer', background: 'transparent', color: 'white', fontWeight: 600, fontSize: '0.9rem' }}
          >
            Not now
          </button>
        </div>
      );
    }

    if (mode === 'personalize-name') {
      return lockScreenShell(
        <div style={{ textAlign: 'center', maxWidth: 300, width: '100%' }}>
          <p style={{ color: 'white', fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Which one are you?</p>
          {teamLoading && <p style={{ color: 'white', opacity: 0.7, fontSize: '0.85rem' }}>Loading team...</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {team.map((m) => (
              <button
                key={m.id}
                onClick={() => pickPersonalizeName(m)}
                style={{ padding: '0.8rem', borderRadius: 10, border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.15)', color: 'white', fontWeight: 600, fontSize: '0.95rem', textAlign: 'left' }}
              >
                {m.name}
                {m.role && <span style={{ display: 'block', fontSize: '0.75rem', opacity: 0.7, fontWeight: 400 }}>{m.role}</span>}
              </button>
            ))}
          </div>
          <button
            onClick={() => setMode('offer-personalize')}
            style={{ marginTop: '1.25rem', background: 'none', border: 'none', color: 'white', opacity: 0.7, fontSize: '0.8rem', cursor: 'pointer' }}
          >
            ← Back
          </button>
        </div>
      );
    }

    if (mode === 'personalize-pin') {
      return lockScreenShell(
        <>
          <p style={{ color: 'white', fontSize: '0.95rem', fontWeight: 600, marginBottom: '1.25rem' }}>
            {personalizing?.name}, choose your new PIN
          </p>
          <PinPad value={newPin1} onPress={pressNewPin1} onDelete={() => setNewPin1(newPin1.slice(0, -1))} error={personalizeError} />
        </>
      );
    }

    if (mode === 'personalize-confirm') {
      return lockScreenShell(
        <>
          <p style={{ color: 'white', fontSize: '0.95rem', fontWeight: 600, marginBottom: '1.25rem' }}>
            Enter it again to confirm
          </p>
          <PinPad value={newPin2} onPress={pressNewPin2} onDelete={() => setNewPin2(newPin2.slice(0, -1))} error={personalizeError} />
          {personalizeBusy && <p style={{ color: 'white', opacity: 0.7, fontSize: '0.8rem', marginTop: '1rem' }}>Saving...</p>}
        </>
      );
    }

    return lockScreenShell(
      <>
        <PinPad value={pin} onPress={press} onDelete={() => setPin(pin.slice(0, -1))} error={error} />
        {busy ? (
          <p style={{ color: 'white', opacity: 0.75, fontSize: '0.8rem', marginTop: '1.5rem' }}>Checking...</p>
        ) : (
          <p style={{ color: 'white', opacity: 0.65, fontSize: '0.75rem', marginTop: '1.5rem', textAlign: 'center', maxWidth: 260 }}>
            Staff PIN to open the studio app.
          </p>
        )}
      </>
    );
  }

  const isAdmin = !!(shift.role && ADMIN_ROLES.includes(shift.role));

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.9rem', padding: '0.4rem 0.8rem' }}>
        {isAdmin && (
          <button
            onClick={openAdminReset}
            style={{ background: 'none', border: 'none', color: '#999', fontSize: '0.75rem', cursor: 'pointer' }}
          >
            Reset a PIN
          </button>
        )}
        <button
          onClick={signOut}
          style={{ background: 'none', border: 'none', color: '#999', fontSize: '0.75rem', cursor: 'pointer' }}
        >
          {shift.name ? `${shift.name} · sign out` : 'Sign out'}
        </button>
      </div>
      {children}

      {adminResetOpen && (
        <div
          onClick={closeAdminReset}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1.5rem' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: 'linear-gradient(135deg, var(--clay) 0%, #9A6435 100%)', borderRadius: 14, padding: '1.75rem', maxWidth: 340, width: '100%', textAlign: 'center' }}
          >
            {adminResetDone ? (
              <>
                <p style={{ color: 'white', fontWeight: 700, fontSize: '1rem', marginBottom: '1.5rem' }}>{adminResetDone}</p>
                <button
                  onClick={closeAdminReset}
                  style={{ width: '100%', padding: '0.8rem', borderRadius: 10, border: 'none', cursor: 'pointer', background: 'white', color: 'var(--clay)', fontWeight: 700 }}
                >
                  Done
                </button>
              </>
            ) : (
              <>
                {adminResetStage === 'confirm-self' && (
                  <>
                    <p style={{ color: 'white', fontWeight: 600, marginBottom: '1.25rem' }}>Confirm your PIN</p>
                    <PinPad value={adminPinEntry} onPress={pressAdminSelfPin} onDelete={() => setAdminPinEntry(adminPinEntry.slice(0, -1))} error={null} />
                  </>
                )}
                {adminResetStage === 'pick-target' && (
                  <>
                    <p style={{ color: 'white', fontWeight: 600, marginBottom: '1rem' }}>Reset whose PIN?</p>
                    {teamLoading && <p style={{ color: 'white', opacity: 0.7, fontSize: '0.85rem' }}>Loading team...</p>}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {team.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => pickResetTarget(m)}
                          style={{ padding: '0.7rem', borderRadius: 10, border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.15)', color: 'white', fontWeight: 600, fontSize: '0.9rem', textAlign: 'left' }}
                        >
                          {m.name}
                          {m.role && <span style={{ display: 'block', fontSize: '0.72rem', opacity: 0.7, fontWeight: 400 }}>{m.role}</span>}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {adminResetStage === 'new-pin' && (
                  <>
                    <p style={{ color: 'white', fontWeight: 600, marginBottom: '1.25rem' }}>New PIN for {resetTarget?.name}</p>
                    <PinPad value={resetPin1} onPress={pressResetPin1} onDelete={() => setResetPin1(resetPin1.slice(0, -1))} error={adminResetError} />
                  </>
                )}
                {adminResetStage === 'confirm-new-pin' && (
                  <>
                    <p style={{ color: 'white', fontWeight: 600, marginBottom: '1.25rem' }}>Confirm the new PIN</p>
                    <PinPad value={resetPin2} onPress={pressResetPin2} onDelete={() => setResetPin2(resetPin2.slice(0, -1))} error={adminResetError} />
                    {adminResetBusy && <p style={{ color: 'white', opacity: 0.7, fontSize: '0.8rem', marginTop: '1rem' }}>Saving...</p>}
                  </>
                )}
                <button
                  onClick={closeAdminReset}
                  style={{ marginTop: '1.25rem', background: 'none', border: 'none', color: 'white', opacity: 0.7, fontSize: '0.8rem', cursor: 'pointer' }}
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}
