import { Sidebar } from "./sidebar";
import { MobileNav } from "./mobile-nav";

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Mobile top header */}
        <div className="flex lg:hidden items-center justify-between border-b border-border bg-surface px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground font-black text-xs">
              RM
            </span>
            <span className="font-bold text-sm text-foreground">
              RescueMesh <span className="text-primary font-medium">AI</span>
            </span>
          </div>
        </div>
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
        <MobileNav />
      </div>
    </div>
  );
}
