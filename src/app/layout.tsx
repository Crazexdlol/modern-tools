import type { Metadata } from "next";
import "./globals.css";
import { ActivityHeartbeat } from "@/components/activity-heartbeat";
import { HenryFloatingLauncher } from "@/components/henry-floating-launcher";
import { RemindersPushBootstrap } from "@/components/reminders/reminders-push-bootstrap";
import { DialogRoot } from "@/components/ui/dialog-root";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "HamsPortal",
  description: "HamsPortal — the platform Modern Appraisers uses to handle auto-appraisal claims.",
  manifest: "/manifest.json",
  applicationName: "HamsPortal",
  appleWebApp: { capable: true, title: "HamsPortal", statusBarStyle: "default" },
};

// Inline before-hydration script: reads localStorage.hp-theme and applies
// `.dark` on <html> before React paints, so refresh doesn't flash the
// light background on dark-mode users. Mirror of the logic in
// ThemeProvider — any change here must stay in sync.
const themeInitScript = `(function(){try{var t=localStorage.getItem('hp-theme');var d=t==='dark';var r=document.documentElement;if(d){r.classList.add('dark');r.style.colorScheme='dark';}else{r.style.colorScheme='light';}}catch(e){}})();`;

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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="antialiased">
        <ThemeProvider>
          <ActivityHeartbeat />
          {children}
          <HenryFloatingLauncher />
          <RemindersPushBootstrap />
          <DialogRoot />
        </ThemeProvider>
      </body>
    </html>
  );
}
