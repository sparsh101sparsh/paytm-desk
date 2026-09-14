import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Paytm for Business · DESK",
  description: "Autonomous AI Teammate for Paytm Merchant Support",
  icons: {
    icon: "/favicon.ico",
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
