import { getArenaEmailId } from '@/lib/arena-email'
import { ArenaEmailProvider } from '@/components/arena-email-provider'
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Poppins } from 'next/font/google';
import './globals.css';

const poppins = Poppins({ subsets: ['latin'], weight: ['400', '500', '600', '700'] });

export const metadata: Metadata = {
  title: 'Keyword Research',
  description: 'Live streaming keyword research — expand a seed keyword into a validated, competitor-backed shortlist.',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const emailId = await getArenaEmailId()

  return (
    <html lang="en">
      <body className={`${poppins.className} min-h-screen bg-slate-50 text-slate-900 antialiased`}><ArenaEmailProvider emailId={emailId}>{children}</ArenaEmailProvider></body>
    </html>
  );
}
