"use client";

import { usePathname } from "next/navigation";
import { NavBar } from "./nav-bar";
import { AppLayout } from "./app-layout";
import { Footer } from "./footer";

const APP_ROUTES = ["/dashboard", "/report", "/ask", "/incidents", "/map"];

function isAppRoute(pathname: string): boolean {
  return APP_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"));
}

export function LayoutRouter({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const app = isAppRoute(pathname);

  if (app) {
    return <AppLayout>{children}</AppLayout>;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <NavBar />
      <div className="flex-1">{children}</div>
      <Footer />
    </div>
  );
}
