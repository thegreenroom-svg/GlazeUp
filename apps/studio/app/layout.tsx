import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { StudioNavigation } from '@/components/StudioNavigation';
import { Toaster } from 'react-hot-toast';

export const metadata: Metadata = {
  title: 'GlazeUp Studio - Management & Operations',
  description: 'Manage your pottery studio with GlazeUp - bookings, pieces, kiln workflow',
  viewport: 'width=device-width, initial-scale=1'
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50">
        <Providers>
          <div className="flex h-screen">
            <StudioNavigation />
            <main className="flex-1 overflow-auto">
              {children}
            </main>
            <Toaster position="bottom-right" />
          </div>
        </Providers>
      </body>
    </html>
  );
}
