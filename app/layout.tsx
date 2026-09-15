import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Paytm for Business · DESK",
  description: "Autonomous AI Teammate for Paytm Merchant Support",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen bg-[#F5F7FB]">{children}</body>
    </html>
  );
}
