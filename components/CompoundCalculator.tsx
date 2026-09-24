"use client";

import { useMemo, useState } from "react";
import { round2, fmtMoney } from "@/lib/money";

const MIN_RATE_PCT = 0.5;
const MAX_RATE_PCT = 1.0;
const MAX_DAYS = 365;

function schedule(initial: number, rate: number, days: number): number[] {
  const pts: number[] = [round2(initial)];
  let bal = round2(initial);
  for (let d = 1; d <= days; d++) {
    bal = round2(bal + round2(bal * rate));
    pts.push(bal);
  }
  return pts;
}

export default function CompoundCalculator() {
  const [initial, setInitial] = useState<string>("130");
  const [ratePct, setRatePct] = useState<string>("0.9");
  const [days, setDays] = useState<string>("30");

  const parsedInitial = Number.parseFloat(initial);
  const parsedRate = Number.parseFloat(ratePct);
  const parsedDays = Number.parseInt(days, 10);

  const initialN = Number.isFinite(parsedInitial) ? Math.max(0, parsedInitial) : 0;
  const rateN = Number.isFinite(parsedRate) ? Math.min(MAX_RATE_PCT, Math.max(MIN_RATE_PCT, parsedRate)) / 100 : 0;
  const daysN = Number.isFinite(parsedDays) ? Math.min(MAX_DAYS, Math.max(1, Math.round(parsedDays))) : 0;

  const pts = useMemo(() => schedule(initialN, rateN, daysN), [initialN, rateN, daysN]);
  const finalValue = pts[pts.length - 1];
  const interest = round2(finalValue - initialN);
  const apy = (1 + rateN) ** 365 - 1;

  const milestones = [1, 30, 90, 180, 365].filter((d) => d <= daysN);

  const containerW = 600;
  const containerH = 160;
  const maxY = Math.max(...pts, 1);
  const stepX = containerW / Math.max(pts.length - 1, 1);
  const path = pts.map((v, i) => `${i === 0 ? "M" : "L"}${(i * stepX).toFixed(1)},${(containerH - (v / maxY) * (containerH - 16) - 8).toFixed(1)}`).join(" ");
  const area = `${path} L${containerW},${containerH} L0,${containerH} Z`;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-5">
        <div>
          <label className="label" htmlFor="calc-initial">Initial deposit</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gold-400">$</span>
            <input
              id="calc-initial"
              className="input pl-7"
              type="number"
              min={1}
              step={10}
              value={initial}
              onChange={(e) => setInitial(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="calc-rate">
            Daily rate — {(rateN * 100).toFixed(2)}%
          </label>
          <input
            id="calc-rate"
            className="w-full accent-gold-500"
            type="range"
            min={MIN_RATE_PCT}
            max={MAX_RATE_PCT}
            step={0.01}
            value={Math.min(MAX_RATE_PCT, Math.max(MIN_RATE_PCT, parsedRate || MIN_RATE_PCT))}
            onChange={(e) => setRatePct(e.target.value)}
          />
          <div className="mt-1 flex justify-between text-[11px] text-muted">
            <span>0.50%</span>
            <span>1.00%</span>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="calc-days">Duration — {daysN} day{daysN === 1 ? "" : "s"}</label>
          <input
            id="calc-days"
            className="w-full accent-gold-500"
            type="range"
            min={1}
            max={MAX_DAYS}
            step={1}
            value={Math.min(MAX_DAYS, Math.max(1, parsedDays || 1))}
            onChange={(e) => setDays(e.target.value)}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {[30, 90, 180, 365].map((d) => (
              <button
                key={d}
                type="button"
                className={`btn-outline ${daysN === d ? "!border-gold-500/60 !text-gold-400" : ""}`}
                onClick={() => setDays(String(d))}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="card border-gold-600/40 bg-maroon-900/40 p-4">
            <p className="stat-label">Value after {daysN} days</p>
            <p className="mt-1 font-display text-2xl font-semibold tracking-wide text-gold-300">
              {fmtMoney(finalValue)}
            </p>
          </div>
          <div className="card p-4">
            <p className="stat-label">Interest earned</p>
            <p className="mt-1 font-display text-2xl font-semibold tracking-wide text-positive">
              +{fmtMoney(interest)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="card p-4">
            <p className="stat-label">Effective APY</p>
            <p className="mt-1 font-display text-2xl font-semibold tracking-wide text-foreground">
              {(apy * 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}%
            </p>
          </div>
          <div className="card p-4">
            <p className="stat-label">Day 1 credit</p>
            <p className="mt-1 font-display text-2xl font-semibold tracking-wide text-foreground">
              +{fmtMoney(round2(initialN * rateN))}
            </p>
          </div>
        </div>

        <div className="card p-4">
          <p className="stat-label mb-2">Growth curve</p>
          <svg viewBox={`0 0 ${containerW} ${containerH}`} className="h-40 w-full" preserveAspectRatio="none" aria-hidden="true">
            <path d={area} fill="rgba(212, 175, 55, 0.10)" />
            <path d={path} fill="none" stroke="#d4af37" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
            <circle
              cx={containerW}
              cy={(containerH - (finalValue / maxY) * (containerH - 16) - 8).toFixed(1)}
              r={4}
              fill="#ecdcae"
            />
          </svg>
          <div className="mt-1 flex justify-between text-[11px] text-muted">
            <span>{fmtMoney(initialN)} · day 0</span>
            <span>{fmtMoney(finalValue)} · day {daysN}</span>
          </div>
        </div>

        {milestones.length > 0 && (
          <div className="card overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-muted">
                  <th className="px-4 py-2 font-medium">Day</th>
                  <th className="px-4 py-2 text-right font-medium">Balance</th>
                  <th className="px-4 py-2 text-right font-medium">Interest</th>
                </tr>
              </thead>
              <tbody>
                {milestones.map((d) => (
                  <tr key={d} className="border-b border-line last:border-0">
                    <td className="px-4 py-2 text-muted">{d === 1 ? "1" : d}</td>
                    <td className="px-4 py-2 text-right font-medium">{fmtMoney(pts[d] ?? 0)}</td>
                    <td className="px-4 py-2 text-right text-positive">+{fmtMoney(round2((pts[d] ?? 0) - initialN))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[11px] leading-relaxed text-muted">
          Daily compounding with per-day cent rounding, exactly as the platform books it in your ledger. Illustrative —
          the configured daily rate governs actual accruals. APY assumes the rate holds every day of the year.
        </p>
      </div>
    </div>
  );
}