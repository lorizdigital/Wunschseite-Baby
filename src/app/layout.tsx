import type { Metadata } from "next";
import { PRODUCT_NAME, PRODUCT_ORIGIN } from "@/lib/brand";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(PRODUCT_ORIGIN),
  title: PRODUCT_NAME,
  description:
    "Wünschi – private Wunschlisten für Familien, unkompliziert ansehen und ohne Konto reservieren.",
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
