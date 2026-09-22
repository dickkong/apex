import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Badge, Card, EmptyState, PageHeader, PnlText } from "@/components/ui";
import { getSessionUser } from "@/lib/auth";
import { fmtDateTime, fmtMoney, fmtUnits } from "@/lib/money";
import { getAllLedger, parseLedgerMeta, type LedgerView } from "@/lib/queries";

export const metadata: Metadata = { title: "Transactions" };

const KIND_LABEL: Record<string, string> = {
  deposit: "Deposit",
  withdraw: "Withdrawal",
  buy: "Purchase",
  sell: "Sale",
  adjustment: "Adjustment",
  yield: "Yield accrual",
};

function ledgerDetail(row: LedgerView): { primary: string; secondary: string | null } {
  const m = parseLedgerMeta(row);
  if (m.channel === "crypto") {
    return {
      primary: `${fmtUnits(row.units ?? 0)} ${m.symbol ?? "coin"}`,
      secondary: `tx ${m.txid ?? "—"}${m.network ? ` · ${m.network}` : ""}`,
    };
  }
  if (row.kind === "withdraw" && m.destination) {
    return {
      primary: row.note ?? "Withdrawal",
      secondary: `→ ${m.destination}`,
    };
  }
  return {
    primary: row.note ?? (row.asset_name ? row.asset_name : "—"),
    secondary:
      row.asset_name && row.kind === "buy" ? `≈ ${fmtUnits(row.units ?? 0)} units` : null,
  };
}

export default async function TransactionsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const ledger = getAllLedger().filter((row) => row.user_id === user.id);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Transaction ledger"
        subtitle="The complete, immutable record of cash movements and unit trades against your account."
      />

      <Card>
        {ledger.length === 0 ? (
          <EmptyState>No ledger entries yet. Submit a deposit once your account is verified.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
                  <th className="py-2 pr-3 font-medium">#</th>
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="py-2 pr-3 font-medium">Type</th>
                  <th className="py-2 pr-3 font-medium">Detail</th>
                  <th className="py-2 pr-3 text-right font-medium">Amount</th>
                  <th className="py-2 pr-3 text-right font-medium">Cash effect</th>
                  <th className="py-2 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((row) => (
                  <tr key={row.id} className="border-b border-line/60 align-middle">
                    <td className="py-2.5 pr-3 text-muted">#{row.id}</td>
                    <td className="whitespace-nowrap py-2.5 pr-3 text-muted">
                      {fmtDateTime(row.created_at)}
                    </td>
                    <td className="py-2.5 pr-3 font-medium">{KIND_LABEL[row.kind] ?? row.kind}</td>
                    <td className="max-w-56 py-2.5 pr-3">
                      <p className="truncate text-muted">{ledgerDetail(row).primary}</p>
                      {ledgerDetail(row).secondary ? (
                        <p className="truncate text-xs text-muted">{ledgerDetail(row).secondary}</p>
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}