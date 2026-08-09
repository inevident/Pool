import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const title = "POOL — Turn patience into bargaining power";
const description =
  "Declare what you want, fully fund your commitment, and join patient buyers who make merchants compete for the whole order.";

const PRODUCTION_ORIGIN_FALLBACK =
  "https://pool-agentic-market-preview-20260808-yeayea.vercel.app";

function trustedConfiguredOrigin() {
  const configured = process.env.POOL_PUBLIC_ORIGIN?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (
        url.protocol === "https:" &&
        url.pathname === "/" &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash
      ) {
        return url.origin;
      }
    } catch {
      // Invalid deployment configuration falls through to trusted platform data.
    }
  }

  const vercelHost =
    process.env.VERCEL_URL?.trim() ??
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelHost && /^[a-z0-9.-]+$/i.test(vercelHost)) {
    return `https://${vercelHost}`;
  }

  return PRODUCTION_ORIGIN_FALLBACK;
}

export async function generateMetadata(): Promise<Metadata> {
  let origin = trustedConfiguredOrigin();
  if (process.env.NODE_ENV !== "production") {
    const requestHeaders = await headers();
    const host = requestHeaders.get("host") ?? "localhost:3000";
    if (/^(?:localhost|127\.0\.0\.1|\[::1\])(?::[0-9]{1,5})?$/i.test(host)) {
      origin = `http://${host}`;
    }
  }
  const imageUrl = `${origin}/og.png`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: imageUrl, width: 1200, height: 630, alt: "POOL turns patient, fully funded buyers into collective purchasing power." }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
