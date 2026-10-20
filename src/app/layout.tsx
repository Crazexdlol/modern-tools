import type { Metadata } from "next";
import "./globals.css";
import { ActivityHeartbeat } from "@/components/activity-heartbeat";
import { HenryFloatingLauncher } from "@/components/henry-floating-launcher";
import { RemindersPushBootstrap } from "@/components/reminders/reminders-push-bootstrap";
import { DialogRoot } from "@/components/ui/dialog-root";

export const metadata: Metadata = {
  title: "HamsPortal",
  description: "HamsPortal — the platform Modern Appraisers uses to handle auto-appraisal claims.",
  manifest: "/manifest.json",
  applicationName: "HamsPortal",
  appleWebApp: { capable: true, title: "HamsPortal", statusBarStyle: "default" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Font family is Times New Roman everywhere — pinned via globals.css
  // (--font-sans + explicit html/body overrides). We deliberately do NOT
  // import a Google font here; see CLAUDE.md "HARD RULE: Times New Roman
  // everywhere".
  return (
    <html lang="en">
      <body className="antialiased">
        <ActivityHeartbeat />
        {children}
        <HenryFloatingLauncher />
        <RemindersPushBootstrap />
        <DialogRoot />
      </body>
    </html>
  );
}
