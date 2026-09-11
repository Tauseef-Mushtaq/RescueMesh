"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { Sidebar } from "./sidebar";
import { MobileNav } from "./mobile-nav";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isReportPage = pathname === "/report";

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden relative">
        {/* Mobile top header */}
        <div className="flex lg:hidden items-center justify-between border-b border-border bg-surface px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground font-black text-xs shadow-sm">
              RM
            </span>
            <span className="font-bold text-sm text-foreground">
              RescueMesh <span className="text-primary font-semibold">AI</span>
            </span>
          </div>

          <Link
            href="/report"
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-md hover:bg-primary-strong transition-colors"
          >
            <AlertCircle size={14} />
            <span>Report Emergency</span>
          </Link>
        </div>

        <main className="flex-1 overflow-y-auto relative">
          {children}
        </main>

        {/* Floating Action Button (FAB) for Emergency Reporting */}
        {!isReportPage && (
          <Link
            href="/report"
            aria-label="Report Emergency Now"
            className="fixed bottom-16 right-4 lg:bottom-6 lg:right-6 z-40 flex items-center gap-2.5 rounded-full bg-primary px-5 py-3 text-sm font-black text-primary-foreground shadow-xl shadow-primary/40 hover:scale-105 hover:bg-primary-strong transition-all border border-white/20 animate-pulse"
          >
            <AlertCircle size={18} />
            <span className="tracking-wide">REPORT EMERGENCY</span>
          </Link>
        )}

        <MobileNav />
      </div>
    </div>
  );
}
