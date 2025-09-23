// app/layout.tsx

import type { Metadata } from "next";
import { Inter } from 'next/font/google';
import "./globals.css";
// --- UPDATED --- We only need to import the Providers component now
import { Providers } from './providers';

export const metadata: Metadata = {
 title: "StampCircle",
 description: "A social network for philately enthusiasts.",
};

const inter = Inter({ subsets: ['latin'] });

export default function RootLayout({
 children,
}: Readonly<{
 children: React.ReactNode;
}>) {
 return (
  <html lang="en">
    <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#000000" />
      </head>
      <body className={inter.className}>
        {/* --- UPDATED --- The layout is now much cleaner --- */}
        <Providers>
        {children}
        </Providers>
      </body>
  </html>
 );
}