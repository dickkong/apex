import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AllocationDonut } from "@/components/AllocationDonut";
import { DepositForm } from "@/components/DepositForm";
import { PayoutForm } from "@/components/PayoutForm";
import { ValueChart } from "@/components/ValueChart";
import { WithdrawForm } from "@/components/WithdrawForm";
import { Badge, Card, EmptyState, PageHeader, PnlText, Stat } from "@/components/ui";
import { getSessionUser } from "@/lib/auth";
import { fmtDate, fmtMoney, fmtPct, fmtMoneyCompact, fmtUnits } from "@/lib/money";
import { getSeries, getSummary } from "@/lib/portfolio";
import { getDepositMethods, getRecentLedger, parseLedgerMeta, type LedgerView } from "@/lib/queries";

export const metadata: Metadata = { title: "Portfolio" };

const KIND_LABEL: Record<string, string> = {
  deposit: "Deposit",
  withdraw: "Withdrawal",
  buy: "Purchase",
  sell: "Sale",
  adjustment: "Adjustment",
  yield: "Yield accrual",
};

function ledgerDetail(row: LedgerView): string {
  const m = parseLedgerMeta(row);
  if (m.channel === "crypto") {
    return `${fmtUnits(row.units ?? 0)} ${m.symbol ?? "coin"} · ${(m.txid ?? "").slice(0, 16)}…`;
  }
  const base = row.note ?? (row.asset_name ? row.asset_name : "—");
  if (row.kind === "withdraw" && m.destination) return `${base} → ${m.destination}`;
  return base;
}

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const summary = getSummary(user.id);
  const series = getSeries(user.id);
  const recent = getRecentLedger(user.id, 8);
  const channels = getDepositMethods(true);

  const verified = user.status === "verified";

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={`Welcome, ${user.name.split(" ")[0]}`}
        subtitle="Transparent account overview — values are computed from posted ledger entries, sourced price observations, and the agreed daily yield accrual."
      />

      {!verified && (
        <div className="mb-6 rounded-lg border border-gold-600/40 bg-maroon-900/40 px-4 py-3 text-sm">
          <span className="font-semibold text-gold-300">Identity verification pending.</span>{" "}
          <span className="text-muted">
            An oversight admin must approve your account before you can submit deposits, buy
            holdings, or withdraw. Deposits and withdraws shown here will unlock once approved.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Total portfolio value"
          value={fmtMoneyCompact(summary.totalValue)}
          hint="Cash + invested at latest prices"
          emphasis
        />
        <Stat
          label="Net contributed"
          value={fmtMoneyCompact(summary.netDeposits)}
          hint="Posted deposits minus posted withdrawals"
        />
        <Stat
          label="Total return"
          value={
            summary.totalReturnPct === null
              ? "—"
              : `${fmtPct(summary.totalReturnPct)}`
          }
          hint={
            summary.totalReturnPct === null
              ? "No net contributions recorded yet"
              : `${fmtMoney(summary.totalReturn)} vs net contributed`
          }
        />
        <Stat
          label="Unrealized P/L"
          value={fmtMoneyCompact(summary.unrealized)}
          hint={
            summary.holdings.length > 0
              ? "Open holdings at latest prices"
              : "No open holdings"
          }
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card
          title="Portfolio value over time"
          subtitle="Computed daily from posted cash flows, yield accruals, and prices as of each date."
          className="lg:col-span-2"
        >
          <ValueChart points={series} currency={summary.currency} />
        </Card>

        <div className="space-y-6">
          <Card title="Deposit capital" subtitle="Send a stablecoin to the operator address; value is credited from a real price observation.">
            <DepositForm methods={channels} disabled={!verified} />
          </Card>
          <Card title="Liquidity access" subtitle="Request a cash distribution.">
            <WithdrawForm maxCash={verified ? summary.cash : 0} disabled={!verified} defaultAddress={user.withdraw_address} />
          </Card>
          <Card title="Payout address" subtitle="Where verified withdrawals are sent.">
            <PayoutForm current={user.withdraw_address} />
          </Card>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Allocation" subtitle="Current split of cash vs invested.">
          {summary.totalValue > 0 ? (
            <AllocationDonut
              cash={summary.cash}
              invested={summary.investedValue}
              currency={summary.currency}
            />
          ) : (
            <EmptyState>No capital posted yet. Approved deposits will appear here.</EmptyState>
          )}
        </Card>

        <Card
          title="Recent activity"
          subtitle="Your latest ledger entries"
          className="lg:col-span-2"
        >
          {recent.length === 0 ? (
            <EmptyState>
              No transactions yet — once your account is verified you can submit a deposit.
            </EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
                    <th className="py-2 pr-3 font-medium">Date</th>
                    <th className="py-2 pr-3 font-medium">Type</th>
                    <th className="py-2 pr-3 font-medium">Detail</th>
                    <th className="py-2 pr-3 text-right font-medium">Amount</th>
                    <th className="py-2 text-right font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((row) => (
                    <tr key={row.id} className="border-b border-line/60 align-middle">
                      <td className="whitespace-nowrap py-2 pr-3 text-muted">{fmtDate(row.created_at)}</td>
                      <td className="py-2 pr-3 font-medium">{KIND_LABEL[row.kind] ?? row.kind}</td>
                      <td className="max-w-48 truncate py-2 pr-3 text-muted">
                        {ledgerDetail(row)}
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3 text-right font-medium">
                        {row.kind === "buy" || row.kind === "sell" ? (
                          <span className="text-muted">
                            {row.kind === "sell" ? "+" : "−"}
                            {fmtMoney(row.amount)}
                          </span>
                        ) : (
                          <PnlText value={row.cash_effect} />
                        )}
                      </td>
                      <td className="py-2 text-right">
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
    </div>
  );
}