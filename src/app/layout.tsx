import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PinhoLaw Mission Control",
  description: "Case management dashboard for PinhoLaw — Orlando Immigration & Business Law",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="noise-overlay" />
        {children}
      </body>
    </html>
  );
}
