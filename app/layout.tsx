// app/layout.tsx

import type { Metadata } from "next";
import { Inter } from 'next/font/google';
import "./globals.css";
import { Providers } from './providers';
import Header from "./components/Header"; // --- NEW --- Import the Header

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
 <html lang="en" suppressHydrationWarning={true}>
  <head>
    <link rel="manifest" href="/manifest.json" />
    <meta name="theme-color" content="#000000" />
   </head>
   <body className={inter.className}>
    <Providers>
          <Header className='z-100'/> {/* --- NEW --- Render the Header globally */}
     {children}
    </Providers>
   </body>
 </html>
);
}