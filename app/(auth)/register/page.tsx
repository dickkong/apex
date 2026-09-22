import type { Metadata } from "next";
import { RegisterForm } from "@/components/RegisterForm";

export const metadata: Metadata = { title: "Create account" };

export default function RegisterPage() {
  return (
    <>
      <RegisterForm />
      <div className="mt-4 rounded-lg border border-gold-600/40 bg-maroon-900/40 px-3 py-2.5 text-xs leading-relaxed text-muted">
        <span className="font-semibold text-gold-300">AML money-bind:</span> new users are bound by
        the anti-money-laundering policy — a 30-day money-bind is placed on their deposit. During
        these 30 days you cannot withdraw, but your capital keeps growing at the 0.5%–1% daily
        accrual rate. After the lockdown, you may withdraw anytime.
      </div>
    </>
  );
}