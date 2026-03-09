import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import { GlobalProvider } from "@/context/GlobalContext";
import ThemeScript from "@/components/ThemeScript";
import LayoutWrapper from "@/components/LayoutWrapper";
import { I18nClientBridge } from "@/i18n/I18nClientBridge";

export const metadata: Metadata = {
  title: "NexusLearn - AI Learning Studio",
  description: "AI-Powered Learning with Avatar, Voice, Code Studio & Mastery Tracking",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="font-sans">
        <GlobalProvider>
          <I18nClientBridge>
            <LayoutWrapper>
              <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden transition-colors duration-200">
                <Sidebar />
                <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-900">
                  {children}
                </main>
              </div>
            </LayoutWrapper>
          </I18nClientBridge>
        </GlobalProvider>
      </body>
    </html>
  );
}
