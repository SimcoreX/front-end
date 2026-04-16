import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Manrope, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SIMCOREX",
  description: "SIMCOREX trading platform frontend",
  icons: {
    icon: "/simcorex-logo-only.png",
    shortcut: "/simcorex-logo-only.png",
    apple: "/simcorex-logo-only.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${manrope.variable} ${spaceGrotesk.variable} text-white antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
