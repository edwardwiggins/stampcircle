import type { Metadata } from "next";
import { Inter } from 'next/font/google';
import "./globals.css";
import SupabaseListener from './components/SupabaseListener';
import { UserProvider } from './context/user-context';
import OfflineBanner from "./components/OfflineBanner";
// **NEW**: Import the Toaster component
import { Toaster } from 'react-hot-toast';

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
    {/* **NEW**: The Toaster component is placed here to be available on all pages */}
    <Toaster position="bottom-right" />
    <SupabaseListener />
    <UserProvider>
     {children}
     <OfflineBanner />
    </UserProvider>
   </body>
  </html>
 );
}