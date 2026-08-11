import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'HYFE eSIM Trial',
  description: 'Panduan pendaftaran eSIM Trial HYFE dengan kendali penuh di tangan pengguna.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
