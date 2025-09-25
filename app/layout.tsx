// app/layout.tsx

import type { Metadata } from "next";
import { Inter } from 'next/font/google';
import "./globals.css";
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
  // --- THIS IS THE FIX ---
  <html lang="en" suppressHydrationWarning={true}>
    <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#000000" />
      </head>
      <body className={inter.className}>
        <Providers>
        {children}
        </Providers>
      </body>
  </html>
 );
}