"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  AlertTriangle,
  Map,
  FileText,
  Brain,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  BookOpen,
} from "lucide-react";
import { useTheme } from "@/components/theme/theme-provider";
import { cn } from "@/lib/cn";

const NAV_SECTIONS = [
  {
    label: "Operations",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/incidents", label: "Incidents", icon: AlertTriangle },
      { href: "/map", label: "Live Map", icon: Map },
      { href: "/report", label: "Report Incident", icon: FileText },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { href: "/ask", label: "Ask RescueMesh", icon: Brain },
      { href: "/knowledge", label: "Knowledge Center", icon: BookOpen },
    ],
  },
];


export function Sidebar() {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "hidden lg:flex flex-col border-r border-border bg-surface transition-all duration-300",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Logo */}
      <div
        className={cn(
          "flex items-center gap-2.5 border-b border-border px-4 py-4",
          collapsed && "justify-center px-2"
        )}
      >
        <Link href="/" className="flex items-center gap-2.5 min-w-0">
          <span className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-black text-sm shadow">
            RM
          </span>
          {!collapsed && (
            <span className="font-bold text-sm tracking-tight text-foreground truncate">
              RescueMesh <span className="text-primary font-medium">AI</span>
            </span>
          )}
        </Link>
      </div>

      {/* Nav sections */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-6" aria-label="Main navigation">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            {!collapsed && (
              <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {section.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {section.items.map(({ href, label, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(href + "/");
                const isReport = href === "/report";
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      title={collapsed ? label : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-all",
                        isReport
                          ? "bg-primary text-primary-foreground font-bold shadow-md shadow-primary/30 hover:bg-primary-strong hover:scale-[1.02]"
                          : active
                            ? "bg-primary-soft text-primary border border-primary/20 font-semibold"
                            : "text-muted-foreground hover:bg-surface-elevated hover:text-foreground",
                        collapsed && "justify-center px-2"
                      )}
                    >
                      <Icon size={16} className="flex-shrink-0" />
                      {!collapsed && <span>{label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Bottom controls */}
      <div className="border-t border-border p-2 space-y-1">
        <button
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          title={resolvedTheme === "dark" ? "Switch to light" : "Switch to dark"}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium text-muted-foreground hover:bg-surface-elevated hover:text-foreground transition-colors",
            collapsed && "justify-center"
          )}
        >
          {resolvedTheme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          {!collapsed && <span>{resolvedTheme === "dark" ? "Light mode" : "Dark mode"}</span>}
        </button>

        <button
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium text-muted-foreground hover:bg-surface-elevated hover:text-foreground transition-colors",
            collapsed && "justify-center"
          )}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
