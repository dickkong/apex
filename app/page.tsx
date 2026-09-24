import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";

export const metadata = {
  title: "Apex Yield Profit Render Inc — investment platform",
};

export default async function Home() {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-12">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-maroon-800/25 blur-3xl" />
        <div className="absolute bottom-0 right-10 h-64 w-64 rounded-full bg-gold-600/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-2xl space-y-6">
        <div className="text-center">
          <div className="text-4xl font-semibold tracking-tight text-gold-500">◆</div>
          <h1 className="mt-3 font-display text-3xl font-semibold leading-tight tracking-wide text-foreground sm:text-4xl">
            Apex Yield Profit Render Inc
          </h1>
          <p className="mt-2 text-sm text-muted">An investment platform built on real deposits and honest accruals.</p>
        </div>

        <div className="card space-y-5 p-6 sm:p-8">
          <div>
            <h2 className="text-base font-semibold text-foreground">What is Apex Yield Profit Render Inc?</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Apex Yield Profit Render Inc is an investment platform that returns daily interest on{" "}
              <span className="font-semibold text-foreground">all capital you deposit</span>. Your
              balance grows every day, compounded, at a daily rate that is always between{" "}
              <span className="font-semibold text-gold-300">0.5% and 1%</span>. Every accrual is
              booked transparently in your personal ledger — you can always see exactly where your
              growth comes from.
            </p>
            <ul className="mt-3 space-y-1.5 text-sm text-muted">
              <li>• Daily interest between 0.5% and 1%, compounded on your total value</li>
              <li>• Applied to every dollar you hold — cash and invested alike</li>
              <li>• Every deposit, yield credit, and payout appears in your ledger</li>
            </ul>
          </div>

          <div className="rounded-lg border border-gold-600/40 bg-maroon-900/40 px-4 py-3 text-sm leading-relaxed">
            <p className="font-semibold text-gold-300">Anti-money-laundering policy — 30-day money-bind</p>
            <p className="mt-1 text-muted">
              New users are bound by the anti-money-laundering (AML) policy. A{" "}
              <span className="font-semibold text-foreground">30-day money-bind</span> is placed on
              their deposit: during the first 30 days the account cannot make withdrawals, while the
              deposited capital still grows under the accrual policy at the 0.5%–1% daily interest
              rate. Once the 30-day lockdown ends, withdrawals may be requested at any time.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/login" className="btn-primary">
              Sign in
            </Link>
            <Link href="/register" className="btn-ghost">
              Create account
            </Link>
          </div>
        </div>

        <p className="text-center text-xs text-muted">
          Real deposits, real price observations, real payout tracking — no fabricated projections.
        </p>
      </div>
    </div>
  );
}