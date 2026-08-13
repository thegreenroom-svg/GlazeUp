import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GlazeUp Studio',
  description: 'GlazeUp studio management'
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50">
        {children}
      </body>
    </html>
  );
}
