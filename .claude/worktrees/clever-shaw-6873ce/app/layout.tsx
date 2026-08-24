import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";
import { SessionProviderClient } from "@/components/SessionProviderClient";

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800", "900"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "NoteNest — Notes & Graph",
  description: "Duolingo-style note taking with a linked node graph",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={nunito.variable}>
      <body className="antialiased">
        <SessionProviderClient>{children}</SessionProviderClient>
      </body>
    </html>
  );
}
