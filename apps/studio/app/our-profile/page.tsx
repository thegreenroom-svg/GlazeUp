'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';

interface Profile {
  name: string;
  instagram_handle: string | null;
  facebook_url: string | null;
  tiktok_handle: string | null;
  website_url: string | null;
  public_bio: string | null;
  city: string | null;
  country: string | null;
  directory_visible: boolean | null;
}

export default function OurProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/studio-profile`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setProfile)
      .catch(() => setError('Could not load your profile.'))
      .finally(() => setLoading(false));
  }, []);

  const field = (key: keyof Profile, label: string, placeholder: string) => (
    <div style={{ marginBottom: '0.8rem' }}>
      <label style={{ fontSize: '0.78rem', color: '#666', display: 'block', marginBottom: '0.25rem' }}>{label}</label>
      <input
        value={(profile?.[key] as string) || ''}
        onChange={(e) => setProfile((p) => (p ? { ...p, [key]: e.target.value } : p))}
        placeholder={placeholder}
        style={{ width: '100%', padding: '0.5rem 0.7rem', border: '1px solid #ddd', borderRadius: '6px', fontSize: '0.88rem', boxSizing: 'border-box' }}
      />
    </div>
  );

  const save = async () => {
    if (!profile) return;
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/studio-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instagram_handle: profile.instagram_handle,
          facebook_url: profile.facebook_url,
          tiktok_handle: profile.tiktok_handle,
          website_url: profile.website_url,
          public_bio: profile.public_bio,
          city: profile.city,
          country: profile.country,
          directory_visible: profile.directory_visible,
        }),
      });
      if (!res.ok) throw new Error();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError('Could not save your profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '2rem', maxWidth: '520px' }}>
      <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>Our Profile</h1>
      <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
        What other studios and the Studios Worldwide directory see about you.
      </p>

      {loading && <p style={{ color: '#666' }}>Loading...</p>}
      {error && <div style={{ padding: '1rem', backgroundColor: '#fee', color: '#c33', borderRadius: '4px' }}>{error}</div>}

      {profile && (
        <>
          <p style={{ fontWeight: 600, fontSize: '1.05rem', marginBottom: '1rem' }}>{profile.name}</p>

          {field('city', 'City', 'Langport')}
          {field('country', 'Country', 'United Kingdom')}

          <div style={{ marginBottom: '0.8rem' }}>
            <label style={{ fontSize: '0.78rem', color: '#666', display: 'block', marginBottom: '0.25rem' }}>Bio</label>
            <textarea
              value={profile.public_bio || ''}
              onChange={(e) => setProfile({ ...profile, public_bio: e.target.value })}
              rows={3}
              placeholder="A family-run pottery painting studio in Somerset..."
              style={{ width: '100%', padding: '0.5rem 0.7rem', border: '1px solid #ddd', borderRadius: '6px', fontSize: '0.88rem', boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
          </div>

          {field('instagram_handle', 'Instagram', 'thekilncafe')}
          {field('facebook_url', 'Facebook', 'https://facebook.com/...')}
          {field('tiktok_handle', 'TikTok', 'thekilncafe')}
          {field('website_url', 'Website', 'https://thekilncafe.com')}

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '1rem 0 1.25rem', fontSize: '0.88rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={profile.directory_visible ?? false}
              onChange={(e) => setProfile({ ...profile, directory_visible: e.target.checked })}
            />
            Show us in the Studios Worldwide directory
          </label>

          <button
            onClick={save}
            disabled={saving}
            style={{ width: '100%', padding: '0.6rem', backgroundColor: 'var(--clay)', color: 'white', border: 'none', borderRadius: '6px', cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
          >
            {saved ? <><Check size={16} /> Saved</> : saving ? 'Saving...' : 'Save profile'}
          </button>
        </>
      )}
    </motion.div>
  );
}
