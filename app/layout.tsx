import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Social Content Operations | AAFM India',
  description:
    'AAFM India social media planning, production, approvals, publishing, engagement, leads and reporting.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
