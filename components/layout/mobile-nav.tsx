"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, AlertTriangle, FileText, Brain } from "lucide-react";
import { cn } from "@/lib/cn";

const ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/incidents", label: "Incidents", icon: AlertTriangle },
  { href: "/report", label: "Report", icon: FileText },
  { href: "/ask", label: "Ask AI", icon: Brain },
];

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav
      className="lg:hidden flex border-t border-border bg-surface safe-area-pb"
      aria-label="Mobile navigation"
    >
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-semibold transition-colors",
              active ? "text-primary" : "text-muted-foreground"
            )}
          >
            <Icon size={18} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
