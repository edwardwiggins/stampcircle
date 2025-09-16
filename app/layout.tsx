import type { Metadata } from "next";
import { Inter } from 'next/font/google';
import "./globals.css";
import SupabaseListener from './components/SupabaseListener';
import { UserProvider } from './context/user-context';
// **NEW**: Import the OfflineBanner component.
import OfflineBanner from "./components/OfflineBanner";

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
    <SupabaseListener />
    <UserProvider>
     {children}
     {/* **NEW**: The OfflineBanner is placed here, inside the UserProvider. */}
     <OfflineBanner />
    </UserProvider>
   </body>
  </html>
 );
}