'use client';

import { ReactNode } from 'react';

// Replaces window.confirm(). On iOS the native dialog is prefixed with
// "glazeup-api.onrender.com says..." -- which breaks the illusion that
// this is an app rather than a web page, at exactly the moment (a
// destructive action) when it most needs to look trustworthy. It also
// can't be styled, so it ignores the brand entirely.
//
// Deliberately minimal: no animation library, no portal, no focus-trap
// dependency. It renders above everything, dims what's behind it, and
// puts the destructive action in the danger colour so the risky choice
// is the one that looks risky.

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(20,16,14,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1.5rem',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{
          width: '100%', maxWidth: 340,
          background: 'white',
          borderRadius: 'var(--radius-lg)',
          padding: '1.25rem',
          boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
        }}
      >
        <p style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--charcoal)', margin: 0 }}>
          {title}
        </p>
        {body && (
          <div style={{ fontSize: 'var(--text-base)', color: 'var(--muted)', marginTop: '0.5rem', lineHeight: 1.45 }}>
            {body}
          </div>
        )}
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem' }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, minHeight: 44, padding: '0.65rem',
              borderRadius: 'var(--radius-md)', border: '1px solid var(--stone)',
              background: 'white', color: 'var(--charcoal)',
              fontSize: 'var(--text-base)', fontWeight: 600, cursor: 'pointer',
            }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1, minHeight: 44, padding: '0.65rem',
              borderRadius: 'var(--radius-md)', border: 'none',
              background: destructive ? 'var(--danger)' : 'var(--clay)',
              color: 'white',
              fontSize: 'var(--text-base)', fontWeight: 700, cursor: 'pointer',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
