import type { ReactNode } from "react";
import { fmtMoneyCompact } from "@/lib/money";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-wide">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p> : null}
      </div>
      {actions}
    </div>
  );
}

export function Card({
  title,
  subtitle,
  children,
  className = "",
  actions,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
}) {
  return (
    <section className={`card p-5 ${className}`}>
      {(title || actions) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title ? <h2 className="text-base font-semibold text-foreground">{title}</h2> : null}
            {subtitle ? <p className="mt-0.5 text-xs text-muted">{subtitle}</p> : null}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
  emphasis = false,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
}) {
  return (
    <div className={`card p-5 ${emphasis ? "border-gold-600/40 bg-maroon-900/40" : ""}`}>
      <p className="stat-label">{label}</p>
      <p
        className={`mt-2 font-display font-semibold tracking-wide ${
          emphasis ? "text-3xl text-gold-300" : "text-2xl text-foreground"
        }`}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function PnlText({ value, currency }: { value: number; currency?: string }) {
  const color = value > 0 ? "text-positive" : value < 0 ? "text-negative" : "text-muted";
  return <span className={color}>{value > 0 ? "+" : ""}{fmtMoneyCompact(value, currency)}</span>;
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "positive" | "negative" | "gold" }) {
  const tones: Record<string, string> = {
    neutral: "border-line bg-surface2 text-muted",
    positive: "border-positive/40 bg-positive/10 text-positive",
    negative: "border-negative/40 bg-negative/10 text-negative",
    gold: "border-gold-600/40 bg-gold-600/10 text-gold-300",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
      {children}
    </div>
  );
}