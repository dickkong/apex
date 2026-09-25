import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getSiteUrl } from "@/lib/site";
import CompoundCalculator from "@/components/CompoundCalculator";
import { TestimonialCarousel } from "@/components/TestimonialCarousel";

export const metadata: Metadata = {
  title: "Apex Yield Profit Render Inc — daily yield platform",
  description:
    "An investment platform built on real deposits and honest accruals. Daily interest between 0.5% and 1%, compounded on every dollar — cash and invested alike.",
  alternates: { canonical: "/" },
  openGraph: { url: "/" },
};

export default async function Home() {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");

  const siteUrl = getSiteUrl();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Apex Yield Profit Render Inc",
    url: siteUrl,
    logo: `${siteUrl}/icon-512x512.png`,
    description:
      "An investment platform that returns daily interest on all capital you deposit, compounded between 0.5% and 1% per day with a fully auditable ledger.",
    areaServed: "Worldwide",
  };

  return (
    <div className="relative min-h-screen px-4 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-maroon-800/25 blur-3xl" />
        <div className="absolute bottom-0 right-10 h-64 w-64 rounded-full bg-gold-600/10 blur-3xl" />
        <div className="absolute left-0 top-1/2 h-64 w-64 rounded-full bg-gold-600/5 blur-3xl" />
      </div>

      <div className="relative mx-auto w-full max-w-5xl space-y-10">
        <header className="text-center">
          <div className="text-4xl font-semibold tracking-tight text-gold-500">◆</div>
          <h1 className="mt-3 font-display text-4xl font-semibold leading-tight tracking-wide text-foreground sm:text-5xl">
            Apex Yield Profit Render Inc
          </h1>
          <p className="mt-3 text-sm text-muted sm:text-base">
            An investment platform built on real deposits and honest accruals.
          </p>
        </header>

        <section className="card space-y-5 p-6 sm:p-8">
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
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-line bg-surface2 p-4">
              <p className="text-sm font-semibold text-gold-300">Daily, compounded</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Interest between 0.5% and 1% accrues daily, compounding on every dollar you hold.
              </p>
            </div>
            <div className="rounded-lg border border-line bg-surface2 p-4">
              <p className="text-sm font-semibold text-gold-300">Cash and invested</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Yield applies to your cash balance and your holdings alike — never double-counted.
              </p>
            </div>
            <div className="rounded-lg border border-line bg-surface2 p-4">
              <p className="text-sm font-semibold text-gold-300">Fully auditable</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Every deposit, yield credit, and payout appears as a line in your ledger.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/login" className="btn-primary">
              Sign in
            </Link>
            <Link href="/register" className="btn-ghost">
              Create account
            </Link>
          </div>
        </section>

        <section className="card space-y-5 p-6 sm:p-8">
          <div>
            <h2 className="text-base font-semibold text-foreground">Project your yield</h2>
            <p className="mt-1 text-sm text-muted">
              See what a deposit could grow to. The calculator mirrors the platform&apos;s accrual —
              daily compounding with per-day cent rounding.
            </p>
          </div>
          <CompoundCalculator />
        </section>

        <section className="card space-y-4 p-6 sm:p-8">
          <div>
            <h2 className="text-base font-semibold text-foreground">How to get started</h2>
            <ol className="mt-3 space-y-2 text-sm text-muted">
              <li>
                <span className="font-semibold text-gold-300">1.</span>{" "}
                Create an account — instant, email-verified.
              </li>
              <li>
                <span className="font-semibold text-gold-300">2.</span>{" "}
                Make your first deposit in USDC or USDT to your personal receiving address.
              </li>
              <li>
                <span className="font-semibold text-gold-300">3.</span>{" "}
                Watch your balance grow daily — every credit is booked in your ledger.
              </li>
            </ol>
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
            <Link href="/register" className="btn-primary">
              Create your account
            </Link>
            <Link href="/login" className="btn-ghost">
              I already have one
            </Link>
          </div>
        </section>

        <TestimonialCarousel />

        <footer className="pb-4 text-center">
          <p className="text-xs text-muted">
            Real deposits, real price observations, real payout tracking — no fabricated projections.
          </p>
          <p className="mt-2 text-xs text-muted/70">Powered by Render</p>
        </footer>
      </div>
    </div>
  );
}