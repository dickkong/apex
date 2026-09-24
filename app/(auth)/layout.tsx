import Link from "next/link";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-12">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-maroon-800/25 blur-3xl" />
        <div className="absolute bottom-0 right-10 h-64 w-64 rounded-full bg-gold-600/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="text-4xl font-semibold tracking-tight text-gold-500">◆</div>
          <h1 className="mt-3 font-display text-3xl font-semibold leading-tight tracking-wide text-foreground sm:text-4xl">
            Apex Yield Profit Render Inc
          </h1>
          <p className="mt-2 text-sm text-muted">
            A transparent portfolio console — real deposits, real prices, honest returns.
          </p>
        </div>
        <div className="card p-6 sm:p-8">{children}</div>
        <p className="mt-6 text-center text-xs text-muted">
          <Link href="/login" className="hover:text-gold-400">
            Sign in
          </Link>
          &nbsp;·&nbsp;
          <Link href="/register" className="hover:text-gold-400">
            Create account
          </Link>
        </p>
      </div>
    </div>
  );
}