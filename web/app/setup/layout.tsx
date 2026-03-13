import type { ReactNode } from "react";

export default function SetupLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-slate-100 dark:from-slate-900 dark:to-indigo-950 flex items-center justify-center p-4">
      {children}
    </div>
  );
}
