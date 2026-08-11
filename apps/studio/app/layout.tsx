import type { Metadata } from 'next';
import './globals.css';
import { AppShell } from './AppShell';
import PinGate from '../components/PinGate';

export const metadata: Metadata = {
  title: 'GlazeUp Studio - Read-only Demo',
  description: 'Read-only demo view of GlazeUp studio management'
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50">
        <PinGate>
          <AppShell>{children}</AppShell>
        </PinGate>
      </body>
    </html>
  );
}
