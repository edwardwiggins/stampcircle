import type { Metadata } from "next";
import { Inter } from 'next/font/google';
import "./globals.css";
import SupabaseListener from './components/SupabaseListener';
import { UserProvider } from './context/user-context';

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
   <body className={inter.className}>
    <SupabaseListener />
    <UserProvider>
     {children}
    </UserProvider>
   </body>
  </html>
 );
}