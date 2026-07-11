import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Grant Claim Review",
  description: "Actuals ingest, grant rule review, and claim package approval.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
