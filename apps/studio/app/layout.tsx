import type { Metadata } from 'next';
import './globals.css';
import { StudioNavigation } from '@/components/StudioNavigation';

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
        <div className="flex h-screen">
          <StudioNavigation />
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
