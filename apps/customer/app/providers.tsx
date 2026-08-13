'use client';

import { ReactNode } from 'react';
import { SessionContextProvider } from '@supabase/auth-helpers-react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { NudgeProvider, HelpPanel } from '@/components/NudgeSystem';

export function Providers({ children }: { children: ReactNode }) {
  const supabase = createClientComponentClient();

  return (
    <SessionContextProvider supabaseClient={supabase}>
      <NudgeProvider>
        {children}
        <HelpPanel title="How this page works" />
      </NudgeProvider>
    </SessionContextProvider>
  );
}
