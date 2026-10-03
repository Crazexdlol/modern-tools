import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ActivityHeartbeat } from "@/components/activity-heartbeat";
import { HenryFloatingLauncher } from "@/components/henry-floating-launcher";
import { RemindersRealtimeProvider } from "@/components/reminders/reminders-realtime-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "HamsPortal",
  description: "HamsPortal — the platform Modern Appraisers uses to handle auto-appraisal claims.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ActivityHeartbeat />
        {children}
        <HenryFloatingLauncher />
        <RemindersRealtimeProvider />
      </body>
    </html>
  );
}
