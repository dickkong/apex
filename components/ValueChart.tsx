"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtMoney } from "@/lib/money";
import type { SeriesPoint } from "@/lib/portfolio";

export function ValueChart({ points, currency }: { points: SeriesPoint[]; currency: string }) {
  if (!points.length) return null;

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="valueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#d4af37" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#d4af37" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#332a26" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: "#a49a90", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "#332a26" }}
            minTickGap={40}
          />
          <YAxis
            tick={{ fill: "#a49a90", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={70}
            tickFormatter={(v: number) => fmtMoney(v, currency)}
          />
          <Tooltip
            cursor={{ stroke: "#7a2238" }}
            content={({ active, payload }) => {
              if (!active || !payload || payload.length === 0) return null;
              const row = payload[0]?.payload as SeriesPoint | undefined;
              if (!row) return null;
              return (
                <div className="rounded-lg border border-line bg-surface2 px-3 py-2 text-xs shadow-lg">
                  <p className="mb-1 font-semibold text-foreground">{row.date}</p>
                  <p className="text-muted">
                    Portfolio value:{" "}
                    <span className="font-medium text-gold-300">{fmtMoney(row.value, currency)}</span>
                  </p>
                  <p className="text-muted">
                    Cash: <span className="font-medium text-foreground">{fmtMoney(row.cash, currency)}</span>
                  </p>
                  <p className="text-muted">
                    Invested:{" "}
                    <span className="font-medium text-foreground">{fmtMoney(row.invested, currency)}</span>
                  </p>
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#d4af37"
            strokeWidth={2}
            fill="url(#valueFill)"
            name="Portfolio value"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}