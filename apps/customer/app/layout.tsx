import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { Navigation } from '@/components/Navigation';
import { Toaster } from 'react-hot-toast';

export const metadata: Metadata = {
  title: 'GlazeUp - Book Your Pottery Studio',
  description: 'Discover, book, create and collect pottery with GlazeUp',
  viewport: 'width=device-width, initial-scale=1'
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gradient-to-br from-cream via-sand to-cream min-h-screen">
        <Providers>
          <Navigation />
          <main className="pt-16 pb-20">
            {children}
          </main>
          <Toaster position="bottom-right" />
        </Providers>
      </body>
    </html>
  );
}
