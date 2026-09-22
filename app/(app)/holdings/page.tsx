import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BuyForm, type AssetOption } from "@/components/BuyForm";
import { SellForm } from "@/components/SellForm";
import { PnlText, Card, EmptyState, PageHeader } from "@/components/ui";
import { getSessionUser } from "@/lib/auth";
import { fmtDate, fmtMoney, fmtPct, fmtUnits } from "@/lib/money";
import { getSummary } from "@/lib/portfolio";
import { getEffectivePriceAsOf } from "@/lib/yield";
import { getAssetsWithPrice } from "@/lib/queries";

export const metadata: Metadata = { title: "Holdings" };

export default async function HoldingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const summary = getSummary(user.id);
  const verified = user.status === "verified";

  const today = new Date().toISOString().slice(0, 10);
  const assets = getAssetsWithPrice();
  const assetOptions: AssetOption[] = assets
    .filter((a) => a.price !== null)
    .map((a) => {
      const eff = getEffectivePriceAsOf(a.id, today);
      return {
        id: a.id,
        name: a.name,
        ticker: a.ticker,
        price: eff?.price ?? a.price,
        priceDate: eff?.obs_date ?? a.price_date,
      };
    });
  const unpriced = assets.filter((a) => a.price === null);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Holdings"
        subtitle="Open positions are valued at the latest real price observation, marked up daily by the agreed yield rate."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card
          title="Invested"
          subtitle="Open positions at latest prices"
        >
          <p className="mb-2 text-2xl font-semibold text-foreground">
            {fmtMoney(summary.investedValue)}
          </p>
          <div className="space-y-1 text-sm text-muted">
            <p>
              Cost basis: <span className="text-foreground">{fmtMoney(summary.investedCost)}</span>
            </p>
            <p>
              Unrealized P/L: <PnlText value={summary.unrealized} />
              {summary.investedCost > 0 ? (
                <span className="text-muted"> ({fmtPct(summary.unrealized / summary.investedCost)})</span>
              ) : null}
            </p>
            <p>
              Realized P/L: <PnlText value={summary.realized} />
            </p>
          </div>
        </Card>

        <Card title="Buy units" subtitle="Deploy cash into a configured asset." className="lg:col-span-2">
          {verified ? (
            assetOptions.length > 0 ? (
              <BuyForm assets={assetOptions} />
            ) : (
              <EmptyState>
                No assets with price observations yet. An admin needs to create an asset and record
                a sourced price before purchases can execute.
              </EmptyState>
            )
          ) : (
            <EmptyState>Your account must be verified before you can buy units.</EmptyState>
          )}
        </Card>
      </div>

      {unpriced.length > 0 && (
        <div className="mt-6">
          <Card
            title="Assets awaiting prices"
            subtitle="These assets exist but have no price observations, so they cannot be bought or sold yet."
          >
            <ul className="space-y-2">
              {unpriced.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 rounded-lg border border-line/60 px-3 py-2 text-sm">
                  <span className="font-medium">{a.name}</span>
                  <span className="text-xs text-gold-400">no price recorded</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      <div className="mt-6">
        <Card title="Open positions">
          {summary.holdings.length === 0 ? (
            <EmptyState>No open positions. Use the buy form once an asset has a price.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
                    <th className="py-2 pr-3 font-medium">Asset</th>
                    <th className="py-2 pr-3 text-right font-medium">Units</th>
                    <th className="py-2 pr-3 text-right font-medium">Avg cost</th>
                    <th className="py-2 pr-3 text-right font-medium">Latest price</th>
                    <th className="py-2 pr-3 text-right font-medium">Market value</th>
                    <th className="py-2 pr-3 text-right font-medium">Unrealized P/L</th>
                    <th className="py-2 text-right font-medium">Sell</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.holdings.map((h) => (
                    <tr key={h.id} className="border-b border-line/60 align-middle">
                      <td className="py-3 pr-3">
                        <p className="font-medium">{h.name}</p>
                        <p className="text-xs text-muted">
                          {h.category}
                          {h.price_source ? ` · ${h.price_source}` : ""}
                          {h.price_date ? ` · ${fmtDate(h.price_date)}` : ""}
                        </p>
                      </td>
                      <td className="py-3 pr-3 text-right tabular-nums">{fmtUnits(h.units)}</td>
                      <td className="py-3 pr-3 text-right tabular-nums">{fmtMoney(h.avg_cost)}</td>
                      <td className="py-3 pr-3 text-right tabular-nums">
                        {h.price !== null ? fmtMoney(h.price) : <span className="text-muted">—</span>}
                      </td>
                      <td className="py-3 pr-3 text-right tabular-nums font-medium">
                        {fmtMoney(h.market_value)}
                      </td>
                      <td className="py-3 pr-3 text-right tabular-nums">
                        <PnlText value={h.unrealized} />
                        {h.unrealized_pct !== null && (
                          <span className="text-xs text-muted"> ({fmtPct(h.unrealized_pct)})</span>
                        )}
                      </td>
                      <td className="py-3 text-right">
                        {verified ? (
                          <SellForm
                            holdingId={h.id}
                            assetName={h.name}
                            maxUnits={h.units}
                            hasPrice={h.price !== null}
                          />
                        ) : null}
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