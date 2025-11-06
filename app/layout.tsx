import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Xuans Bridge - Stream Platform Bridge',
  description: 'Stream Platform Bridge - Manage your videos and auto post to multiple streaming platforms',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

