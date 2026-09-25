import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { logoutUserAction } from "@/app/actions";
import { NavLinks } from "@/components/NavLinks";
import { getSessionUser } from "@/lib/auth";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const statusLabel =
    user.status === "verified"
      ? "Verified"
      : user.status === "rejected"
        ? "Rejected"
        : "Pending verification";

  return (
    <div className="min-h-screen md:flex">
      <aside className="flex flex-col border-b border-line bg-surface/60 md:min-h-screen md:w-64 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-5 py-5">
          <Link href="/dashboard" className="flex items-start gap-2">
            <span className="mt-0.5 text-lg text-gold-500">◆</span>
            <span className="font-display text-lg font-semibold leading-tight tracking-wide">
              Apex Yield Profit Render Inc
            </span>
          </Link>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3 md:mt-2">
          <NavLinks
            isAdmin={user.role === "admin"}
            links={[
              { href: "/dashboard", label: "Portfolio" },
              { href: "/holdings", label: "Holdings" },
              { href: "/transactions", label: "Transactions" },
              { href: "/support", label: "Support" },
            ]}
          />
        </nav>

        <div className="border-t border-line p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-maroon-800 text-sm font-semibold text-gold-300">
              {user.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user.name}</p>
              <p className="truncate text-xs text-muted">{user.email}</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs">
                <span
                  className={
                    user.status === "verified"
                      ? "text-positive"
                      : user.status === "rejected"
                        ? "text-negative"
                        : "text-gold-400"
                  }
                >
                  ●
                </span>
                <span className="text-muted">{statusLabel}</span>
              </p>
            </div>
          </div>
          <form action={logoutUserAction} className="mt-3">
            <button type="submit" className="btn-ghost w-full">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10">{children}</main>
    </div>
  );
}