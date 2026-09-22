"use client";

import { useMemo, useState } from "react";
import { Badge, EmptyState, PnlText } from "@/components/ui";
import { parseLedgerMeta } from "@/lib/ledger-meta";
import { fmtDateTime, fmtMoney, fmtUnits } from "@/lib/money";
import type { LedgerView } from "@/lib/queries";

const KIND_LABEL: Record<string, string> = {
  deposit: "Deposit",
  withdraw: "Withdrawal",
  buy: "Purchase",
  sell: "Sale",
  adjustment: "Adjustment",
  yield: "Yield accrual",
};

const KIND_OPTIONS = ["all", "deposit", "withdraw", "buy", "sell", "adjustment", "yield"] as const;
const STATUS_OPTIONS = ["all", "pending", "verified", "posted", "rejected"] as const;

type SortKey = "date" | "amount";

function detailOf(row: LedgerView): { primary: string; secondary: string | null } {
  const m = parseLedgerMeta(row);
  if (m.channel === "crypto") {
    return {
      primary: `${fmtUnits(row.units ?? 0)} ${m.symbol ?? "coin"}`,
      secondary: `tx ${m.txid ?? "—"}${m.network ? ` · ${m.network}` : ""}`,
    };
  }
  if (row.kind === "withdraw" && m.destination) {
    return { primary: row.note ?? "Withdrawal", secondary: `→ ${m.destination}` };
  }
  return {
    primary: row.note ?? (row.asset_name ? row.asset_name : "—"),
    secondary: row.asset_name && row.kind === "buy" ? `≈ ${fmtUnits(row.units ?? 0)} units` : null,
  };
}

export function LedgerHistory({
  rows,
  members,
}: {
  rows: LedgerView[];
  members: { id: string; name: string; email: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<(typeof KIND_OPTIONS)[number]>("all");
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]>("all");
  const [member, setMember] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortKey>("date");
  const [order, setOrder] = useState<"desc" | "asc">("desc");

  const filtered = useMemo(() => {
    let out = rows.filter((r) => {
      if (kind !== "all" && r.kind !== kind) return false;
      if (status !== "all" && r.status !== status) return false;
      if (member !== "all" && r.user_id !== member) return false;
      return true;
    });
    const dir = order === "desc" ? -1 : 1;
    out = out.slice().sort((a, b) => {
      if (sortBy === "amount") return (a.amount - b.amount) * dir;
      return a.created_at < b.created_at ? dir : a.created_at > b.created_at ? -dir : 0;
    });
    return out;
  }, [rows, kind, status, member, sortBy, order]);

  const totalCashEffect = filtered.reduce((s, r) => s + (r.cash_effect ?? 0), 0);

  return (
    <section className="card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Ledger history</h2>
          <p className="mt-0.5 text-xs text-muted">
            Every entry across all members — filter by type, status, or member, and sort by date or
            amount.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted">
            {rows.length} total entries · {filtered.length} matching filters
          </span>
          <button type="button" onClick={() => setOpen((o) => !o)} className="btn-ghost">
            {open ? "− Collapse" : "+ Expand"}
          </button>
        </div>
      </div>

      {open ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="label">Type</span>
              <select value={kind} onChange={(e) => setKind(e.target.value as never)} className="input">
                {KIND_OPTIONS.map((k) => (
                  <option key={k} value={k}>
                    {k === "all" ? "All types" : KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value as never)} className="input">
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s === "all" ? "All statuses" : s}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Member</span>
              <select value={member} onChange={(e) => setMember(e.target.value)} className="input">
                <option value="all">All members</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.email})
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Sort by</span>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortKey)} className="input">
                <option value="date">Date</option>
                <option value="amount">Amount</option>
              </select>
            </label>
            <label className="block">
              <span className="label">Order</span>
              <select value={order} onChange={(e) => setOrder(e.target.value as never)} className="input">
                <option value="desc">Newest first</option>
                <option value="asc">Oldest first</option>
              </select>
            </label>
            <p className="mb-1 ml-auto text-xs text-muted">
              net cash effect {fmtMoney(totalCashEffect)}
            </p>
          </div>

          {filtered.length === 0 ? (
            <EmptyState>No ledger entries match these filters.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
                    <th className="py-2 pr-3 font-medium">#</th>
                    <th className="py-2 pr-3 font-medium">Date</th>
                    <th className="py-2 pr-3 font-medium">Member</th>
                    <th className="py-2 pr-3 font-medium">Type</th>
                    <th className="py-2 pr-3 font-medium">Detail</th>
                    <th className="py-2 pr-3 text-right font-medium">Amount</th>
                    <th className="py-2 pr-3 text-right font-medium">Cash effect</th>
                    <th className="py-2 text-right font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => {
                    const detail = detailOf(row);
                    return (
                      <tr key={row.id} className="border-b border-line/60 align-middle">
                        <td className="py-2.5 pr-3 text-muted">#{row.id}</td>
                        <td className="whitespace-nowrap py-2.5 pr-3 text-muted">
                          {fmtDateTime(row.created_at)}
                        </td>
                        <td className="max-w-44 whitespace-nowrap py-2.5 pr-3">
                          <p className="truncate font-medium">{row.user_name}</p>
                          <p className="truncate text-xs text-muted">{row.user_email}</p>
                        </td>
                        <td className="py-2.5 pr-3 font-medium">{KIND_LABEL[row.kind] ?? row.kind}</td>
                        <td className="max-w-56 py-2.5 pr-3">
                          <p className="truncate text-muted">{detail.primary}</p>
                          {detail.secondary ? (
                            <p className="truncate text-xs text-muted">{detail.secondary}</p>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap py-2.5 pr-3 text-right tabular-nums">
                          {parseLedgerMeta(row).channel === "crypto" ? (
                            <>
                              <span className="font-medium">
                                {fmtUnits(row.units ?? 0)} {parseLedgerMeta(row).symbol ?? "coin"}
                              </span>
                              {row.status === "posted" ? (
                                <span className="ml-1 text-muted">({fmtMoney(row.amount)})</span>
                              ) : null}
                            </>
                          ) : (
                            fmtMoney(row.amount)
                          )}
                        </td>
                        <td className="whitespace-nowrap py-2.5 pr-3 text-right tabular-nums">
                          {row.cash_effect === 0 ? (
                            <span className="text-muted">—</span>
                          ) : (
                            <PnlText value={row.cash_effect} />
                          )}
                        </td>
                        <td className="py-2.5 text-right">
                          <Badge
                            tone={
                              row.status === "posted"
                                ? "positive"
                                : row.status === "pending"
                                  ? "gold"
                                  : "negative"
                            }
                          >
                            {row.status}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted">
          History is collapsed so it never stretches the page. Expand to browse all member
          transactions.
        </p>
      )}
    </section>
  );
}