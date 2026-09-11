"use client";

import { useEffect, useRef, ReactNode } from "react";
import { cn } from "@/lib/cn";

interface SectionRevealProps {
  children: ReactNode;
  className?: string;
  delay?: 0 | 1 | 2 | 3 | 4;
  threshold?: number;
}

export function SectionReveal({
  children,
  className,
  delay = 0,
  threshold = 0.15,
}: SectionRevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("revealed");
          observer.disconnect();
        }
      },
      { threshold }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return (
    <div
      ref={ref}
      className={cn("reveal", delay > 0 && `reveal-delay-${delay}`, className)}
    >
      {children}
    </div>
  );
}
