"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ChainIntegrityBadge from "./ChainIntegrityBadge";
import HealthStatus from "./HealthStatus";
import ThemeToggle from "./ThemeToggle";

const NAV_LINKS = [
  { href: "/",          label: "Dashboard", exact: true  },
  { href: "/policies",  label: "Policies",  exact: false },
  { href: "/audit",     label: "Audit",     exact: false },
  { href: "/settings",  label: "Settings",  exact: false },
];

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 text-blue-500">
      <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5L12 1z" />
    </svg>
  );
}

export default function TopNav() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-30 border-b border-white/[0.06] bg-[var(--background)]/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center gap-1 px-6 py-2.5">
        {/* Brand */}
        <Link href="/" className="mr-5 flex items-center gap-2 font-bold text-foreground">
          <ShieldIcon />
          <span className="text-sm tracking-tight">BASTION</span>
        </Link>

        {/* Nav links */}
        {NAV_LINKS.map(({ href, label, exact }) => {
          const active = exact
            ? pathname === href
            : pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-white/10 text-white dark:bg-white/10 dark:text-white text-zinc-900 bg-zinc-100"
                  : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100/70 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-white/5"
              }`}
            >
              {label}
            </Link>
          );
        })}

        {/* Right side */}
        <div className="ml-auto flex items-center gap-2">
          <ChainIntegrityBadge />
          <HealthStatus />
          <ThemeToggle />
          {/* User avatar */}
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-xs font-bold text-white">
            VU
          </div>
        </div>
      </div>
    </nav>
  );
}
