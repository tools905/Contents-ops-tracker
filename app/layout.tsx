import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Content Ops Tracker | AAFM India',
  description: 'Internal content pipeline, approvals and performance tracking for AAFM India.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
