/**
 * Minimal className joiner. Deliberately not `clsx`/`cva` — zero new
 * dependencies for the M03 design system. Falsy values are skipped.
 */
export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}
