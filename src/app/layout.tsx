import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mats' Wunschliste",
  description:
    "Unsere persönliche Wunschliste für Mats – unkompliziert ansehen und ohne Konto reservieren.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
