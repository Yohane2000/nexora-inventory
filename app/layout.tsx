import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import PWARegister from "./components/PWARegister";
import AppShell from "../components/AppShell";


const geistSans = Geist({
variable: "--font-geist-sans",
subsets: ["latin"],
display: "swap",
});

const geistMono = Geist_Mono({
variable: "--font-geist-mono",
subsets: ["latin"],
display: "swap",
});

export const metadata: Metadata = {
title: {
default: "Nexora Inventory",
template: "%s | Nexora Inventory",
},
description:
"Gérez intelligemment vos stocks, produits et mouvements, même hors ligne.",
applicationName: "Nexora Inventory",
keywords: [
"Nexora Inventory",
"gestion de stock",
"inventaire",
"gestion commerciale",
"offline inventory",
],
appleWebApp: {
capable: true,
statusBarStyle: "default",
title: "Nexora Inventory",
},
};

export const viewport: Viewport = {
themeColor: "#173B72",
width: "device-width",
initialScale: 1,
};

export default function RootLayout({
children,
}: Readonly<{
children: React.ReactNode;
}>) {
return (
  <html
    lang="fr"
    className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
  >
    <body className="flex min-h-full flex-col">
      <PWARegister />
      <AppShell>{children}</AppShell>
    </body>
  </html>
);
}
