"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavLinksProps {
  links: { href: string; label: string }[];
  isAdmin: boolean;
}

export function NavLinks({ links, isAdmin }: NavLinksProps) {
  const pathname = usePathname();

  const all = isAdmin ? [...links, { href: "/oversight", label: "Oversight" }] : links;

  return (
    <ul className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
      {all.map((link) => {
        const active = pathname === link.href || pathname.startsWith(link.href + "/");
        return (
          <li key={link.href} className="shrink-0">
            <Link
              href={link.href}
              className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-maroon-900 text-gold-300"
                  : "text-muted hover:bg-surface2 hover:text-foreground"
              }`}
            >
              {link.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}