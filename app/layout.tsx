import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FlashReels",
  description: "Step-controlled generative video editor powered by RunwayML.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
