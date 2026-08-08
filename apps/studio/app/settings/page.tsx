'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useSupabaseClient, useSessionContext } from '@supabase/auth-helpers-react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Settings, LogOut, Mail, User } from 'lucide-react';

interface UserSettings {
  email: string;
  studio_name: string;
  notifications_enabled: boolean;
  theme: 'light' | 'dark';
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings>({
    email: '',
    studio_name: '',
    notifications_enabled: true,
    theme: 'light',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const supabase = useSupabaseClient();
  const router = useRouter();
  const { session } = useSessionContext();

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      if (session?.user?.email) {
        setSettings((prev) => ({
          ...prev,
          email: session.user.email || '',
        }));
      }
    } catch (err) {
      setError('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      // Simulate saving settings
      await new Promise((resolve) => setTimeout(resolve, 500));
      setSuccess('Settings saved successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      router.push('/auth/login');
    } catch (err) {
      setError('Failed to sign out');
    }
  };

  const SettingRow = ({ icon: Icon, label, value, onChange, type = 'text' }: any) => (
    <div style={{ padding: '1rem', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', gap: '1rem' }}>
      <Icon size={20} color="#0066cc" />
      <div style={{ flex: 1 }}>
        <label style={{ display: 'block', fontWeight: '500', marginBottom: '0.25rem' }}>{label}</label>
        {type === 'toggle' ? (
          <button
            onClick={() => onChange(!value)}
            style={{
              padding: '0.25rem 0.75rem',
              backgroundColor: value ? '#00aa00' : '#ccc',
              color: 'white',
              border: 'none',
              borderRadius: '9999px',
              cursor: 'pointer',
              fontSize: '0.75rem',
              fontWeight: '500',
            }}
          >
            {value ? 'On' : 'Off'}
          </button>
        ) : (
          <input
            type={type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '0.875rem',
              boxSizing: 'border-box',
            }}
          />
        )}
      </div>
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '2rem', maxWidth: '600px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2rem' }}>
        <Settings size={32} color="#0066cc" />
        <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold' }}>Settings</h1>
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{ padding: '1rem', backgroundColor: '#fee', color: '#c33', borderRadius: '4px', marginBottom: '1rem' }}
        >
          {error}
        </motion.div>
      )}

      {success && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{ padding: '1rem', backgroundColor: '#efe', color: '#3a3', borderRadius: '4px', marginBottom: '1rem' }}
        >
          {success}
        </motion.div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <p>Loading settings...</p>
        </div>
      ) : (
        <>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              backgroundColor: 'white',
              border: '1px solid #ddd',
              borderRadius: '8px',
              marginBottom: '2rem',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '1.5rem', borderBottom: '1px solid #eee', backgroundColor: '#f9f9f9' }}>
              <h2 style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>Account</h2>
              <p style={{ fontSize: '0.875rem', color: '#666' }}>Manage your account and preferences</p>
            </div>

            <SettingRow
              icon={Mail}
              label="Email"
              value={settings.email}
              onChange={(value: string) => setSettings({ ...settings, email: value })}
              type="email"
            />

            <SettingRow
              icon={User}
              label="Studio Name"
              value={settings.studio_name}
              onChange={(value: string) => setSettings({ ...settings, studio_name: value })}
            />

            <div style={{ padding: '1rem', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <Settings size={20} color="#0066cc" />
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontWeight: '500', marginBottom: '0.25rem' }}>Notifications</label>
                <button
                  onClick={() => setSettings({ ...settings, notifications_enabled: !settings.notifications_enabled })}
                  style={{
                    padding: '0.25rem 0.75rem',
                    backgroundColor: settings.notifications_enabled ? '#00aa00' : '#ccc',
                    color: 'white',
                    border: 'none',
                    borderRadius: '9999px',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    fontWeight: '500',
                  }}
                >
                  {settings.notifications_enabled ? 'On' : 'Off'}
                </button>
              </div>
            </div>
          </motion.div>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <button
              onClick={handleSaveSettings}
              disabled={saving}
              style={{
                flex: 1,
                padding: '0.75rem 1rem',
                backgroundColor: '#0066cc',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: saving ? 'not-allowed' : 'pointer',
                fontWeight: '500',
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>

            <button
              onClick={handleSignOut}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1rem',
                backgroundColor: '#cc0000',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: '500',
              }}
            >
              <LogOut size={18} /> Sign Out
            </button>
          </div>
        </>
      )}
    </motion.div>
  );
}
