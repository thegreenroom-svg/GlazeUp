'use client';

import { NudgeProvider } from '@/lib/nudge-system-global';

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <NudgeProvider>
      {children}
    </NudgeProvider>
  );
}
