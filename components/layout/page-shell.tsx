import { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * Reusable page-level layout wrapper: consistent max width, horizontal
 * padding, and vertical spacing. Used by every route's top-level
 * content so pages don't each redefine layout constants.
 */
export function PageShell({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10 lg:px-8",
        className
      )}
      {...props}
    />
  );
}
