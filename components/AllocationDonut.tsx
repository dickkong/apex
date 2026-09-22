"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { fmtMoney } from "@/lib/money";

export function AllocationDonut({
  cash,
  invested,
  currency,
}: {
  cash: number;
  invested: number;
  currency: string;
}) {
  const data = [
    { name: "Cash", value: Math.max(0, cash), color: "#d4af37" },
    { name: "Invested", value: Math.max(0, invested), color: "#7a2238" },
  ];

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="55%"
            outerRadius="85%"
            paddingAngle={2}
            stroke="#171110"
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload || payload.length === 0) return null;
              const row = payload[0];
              return (
                <div className="rounded-lg border border-line bg-surface2 px-3 py-2 text-xs shadow-lg">
                  <span className="text-muted">{row.name}: </span>
                  <span className="font-medium text-foreground">
                    {fmtMoney(Number(row.value), currency)}
                  </span>
                </div>
              );
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="mt-1 flex items-center justify-center gap-6 text-xs text-muted">
        {data.map((d) => (
          <span key={d.name} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />
            {d.name}
          </span>
        ))}
      </div>
    </div>
  );
}