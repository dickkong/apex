import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Cormorant_Garamond, Geist, Geist_Mono } from "next/font/google";
import { getSiteUrl } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const display = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: "Apex Yield Profit Render Inc · Portfolio Console",
    template: "%s · Apex Yield Profit Render Inc",
  },
  description:
    "A transparent investment tracking and portfolio console. Your deposits, your holdings, real prices, honest returns.",
  applicationName: "Apex Yield Profit Render Inc",
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Apex Yield Profit Render Inc",
    title: {
      default: "Apex Yield Profit Render Inc · Portfolio Console",
      template: "%s · Apex Yield Profit Render Inc",
    },
    description:
      "A transparent investment tracking and portfolio console. Your deposits, your holdings, real prices, honest returns.",
  },
  twitter: {
    card: "summary_large_image",
    title: {
      default: "Apex Yield Profit Render Inc · Portfolio Console",
      template: "%s · Apex Yield Profit Render Inc",
    },
    description:
      "A transparent investment tracking and portfolio console. Your deposits, your holdings, real prices, honest returns.",
    images: ["/opengraph-image.png"],
  },
  appleWebApp: {
    capable: true,
    title: "ApexYield",
    statusBarStyle: "default",
  },
  icons: {
    apple: "/apple-touch-icon.png",
    icon: [{ url: "/icon-192x192.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#3a1220",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${display.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}