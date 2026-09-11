"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { useTheme } from "@/components/theme/theme-provider";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/report", label: "Report Emergency" },
  { href: "/ask", label: "Ask RescueMesh" },
  { href: "/about", label: "About" },
] as const;

export function NavBar() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/80 backdrop-blur-md transition-colors">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex items-center gap-2 text-base font-extrabold tracking-tight text-foreground"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500 text-black font-black text-xs shadow-md">
            RM
          </span>
          <span>RescueMesh <span className="text-cyan-500 font-normal">AI</span></span>
        </Link>

        <div className="flex items-center gap-3">
          <nav aria-label="Main navigation" className="flex items-center gap-1 sm:gap-2">
            {LINKS.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-semibold transition-all",
                    active
                      ? "bg-cyan-500/10 text-cyan-500 border border-cyan-500/30 shadow-sm"
                      : "text-muted-foreground hover:bg-surface-elevated hover:text-foreground"
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            aria-label="Toggle dark/light theme"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/80 bg-surface-elevated text-foreground hover:bg-border transition-colors"
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
        </div>
      </div>
    </header>
  );
}
