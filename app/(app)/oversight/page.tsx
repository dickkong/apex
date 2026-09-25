import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  closeTicketAction,
  createDepositMethodAction,
  resolveDepositAction,
  resolveWithdrawalAction,
  updateDepositMethodAction,
  verifyUserAction,
} from "@/app/actions";
import { AdminAdjustForm } from "@/components/AdminAdjustForm";
import { AssetForm } from "@/components/AssetForm";
import { InstallAppButton } from "@/components/InstallAppButton";
import { LedgerHistory } from "@/components/LedgerHistory";
import { PriceForm } from "@/components/PriceForm";
import { TicketReplyForm } from "@/components/TicketReplyForm";
import { YieldSettingsForm } from "@/components/YieldSettingsForm";
import { Badge, Card, EmptyState, PageHeader, PnlText } from "@/components/ui";
import { getSessionUser } from "@/lib/auth";
import { fmtDate, fmtDateTime, fmtMoney, fmtMoneyFull, fmtUnits } from "@/lib/money";
import { getPriceAsOf } from "@/lib/portfolio";
import { getWithdrawalLock } from "@/lib/lockdown";
import { getYieldStats } from "@/lib/yield";
import {
  getAllTickets,
  getAssetsWithPrice,
  getDepositMethods,
  getAllLedger,
  getLedgerByKind,
  getPendingUsers,
  getPriceHistory,
  getTicketReplies,
  getUsersWithBalances,
  parseLedgerMeta,
} from "@/lib/queries";

export const metadata: Metadata = { title: "Oversight" };

export default async function OversightPage() {
  const admin = await getSessionUser();
  if (!admin) redirect("/login");
  if (admin.role !== "admin") redirect("/dashboard");

  const [pendingUsers, pendingDeposits, pendingWithdrawals, members, ledgerHistory, assets, depositMethods, yieldStats, tickets] =
    await Promise.all([
      getPendingUsers(),
      getLedgerByKind("deposit", "pending"),
      getLedgerByKind("withdraw", "pending"),
      getUsersWithBalances(),
      getAllLedger(),
      getAssetsWithPrice(),
      getDepositMethods(false),
      getYieldStats(),
      getAllTickets(),
    ]);

  const priceHistories = await Promise.all(assets.map((a) => getPriceHistory(a.id, 10)));
  const ticketsWithReplies = await Promise.all(
    tickets.map(async (t) => ({ ticket: t, replies: await getTicketReplies(t.id) }))
  );

  const previewPrices = new Map<number, number>();
  await Promise.all(
    pendingDeposits.map(async (d) => {
      const meta = parseLedgerMeta(d);
      const crypto = meta.channel === "crypto";
      if (crypto && d.asset_id) {
        const pp = await getPriceAsOf(d.asset_id, new Date().toISOString().slice(0, 10));
        if (pp) previewPrices.set(d.id, pp.price);
      }
    })
  );
  const pricedAssets = assets.map((a) => ({
    id: a.id,
    name: a.name,
    ticker: a.ticker,
  }));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Oversight"
        subtitle="Operational control: verify identities, validate incoming commitments, and process distribution requests."
        actions={<InstallAppButton />}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card
          title="Identity verifications"
          subtitle="Approve or reject accounts pending verification."
        >
          {pendingUsers.length === 0 ? (
            <EmptyState>No pending verifications.</EmptyState>
          ) : (
            <div className="space-y-3">
              {pendingUsers.map((u) => (
                <div
                  key={u.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line/60 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{u.name}</p>
                    <p className="truncate text-xs text-muted">
                      {u.email} · registered {fmtDate(u.created_at)}
                    </p>
                  </div>
                  <form action={verifyUserAction} className="flex gap-2">
                    <input type="hidden" name="userId" value={u.id} />
                    <button type="submit" name="decision" value="approve" className="btn-success">
                      Approve
                    </button>
                    <button type="submit" name="decision" value="reject" className="btn-danger">
                      Reject
                    </button>
                  </form>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card
          title="Pending capital commitments"
          subtitle="Deposits awaiting validation and posting."
        >
          {pendingDeposits.length === 0 ? (
            <EmptyState>No pending deposits.</EmptyState>
          ) : (
            <div className="space-y-3">
              {pendingDeposits.map((d) => {
                const meta = parseLedgerMeta(d);
                const crypto = meta.channel === "crypto";
                const previewPrice = previewPrices.get(d.id) ?? null;
                return (
                  <form
                    key={d.id}
                    action={resolveDepositAction}
                    className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-line/60 px-3 py-2.5"
                  >
                    <input type="hidden" name="ledgerId" value={d.id} />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-positive">
                        {crypto ? (
                          <>
                            +{fmtUnits(d.units ?? 0)} {meta.symbol ?? "coin"}
                            {previewPrice && previewPrice > 0 ? (
                              <span className="ml-2 font-normal text-muted">
                                ≈ {fmtMoneyFull((d.units ?? 0) * previewPrice)}
                              </span>
                            ) : (
                              <span className="ml-2 font-normal text-gold-400">
                                value pending a price observation
                              </span>
                            )}
                          </>
                        ) : (
                          <>+{fmtMoneyFull(d.amount)}</>
                        )}
                      </p>
                      {crypto && (!previewPrice || previewPrice <= 0) ? (
                        <p className="max-w-md pt-1 text-xs text-gold-400">
                          To post this deposit, record a sourced price for {meta.symbol ?? "this asset"}{" "}
                          (e.g. $1.00) in “Assets & price observations” below, then Verify & post.
                        </p>
                      ) : null}
                      <p className="truncate text-xs text-muted">
                        {d.user_name} ({d.user_email}) · {fmtDateTime(d.created_at)}
                      </p>
                      {crypto ? (
                        <p className="mt-0.5 truncate font-mono text-xs text-muted">
                          tx {meta.txid ?? "—"}
                          {meta.network ? ` · ${meta.network}` : ""}
                        </p>
                      ) : null}
                      {d.note ? <p className="truncate text-xs text-muted">Ref: {d.note}</p> : null}
                      <input
                        name="note"
                        type="text"
                        placeholder="Verification note (optional)"
                        className="input mt-2 max-w-56"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button type="submit" name="decision" value="approve" className="btn-success">
                        Verify & post
                      </button>
                      <button type="submit" name="decision" value="reject" className="btn-danger">
                        Reject
                      </button>
                    </div>
                  </form>
                );
              })}
            </div>
          )}
        </Card>

        <Card
          title="Pending distribution requests"
          subtitle="Withdrawals awaiting verification and ledger posting."
        >
          {pendingWithdrawals.length === 0 ? (
            <EmptyState>No pending withdrawals.</EmptyState>
          ) : (
            <div className="space-y-3">
              {pendingWithdrawals.map((w) => {
                const wmeta = parseLedgerMeta(w);
                return (
                <form
                  key={w.id}
                  action={resolveWithdrawalAction}
                  className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-line/60 px-3 py-2.5"
                >
                  <input type="hidden" name="ledgerId" value={w.id} />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-negative">−{fmtMoneyFull(w.amount)}</p>
                    <p className="truncate text-xs text-muted">
                      {w.user_name} ({w.user_email}) · {fmtDateTime(w.created_at)}
                    </p>
                    {wmeta.destination ? (
                      <p className="mt-0.5 truncate font-mono text-xs text-muted">
                        → {wmeta.destination}
                      </p>
                    ) : null}
                    {w.note ? <p className="truncate text-xs text-muted">Ref: {w.note}</p> : null}
                    <input
                      name="note"
                      type="text"
                      placeholder="Verification note (optional)"
                      className="input mt-2 max-w-56"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" name="decision" value="approve" className="btn-success">
                      Verify & post
                    </button>
                    <button type="submit" name="decision" value="reject" className="btn-danger">
                      Reject
                    </button>
                  </div>
                </form>
                );
              })}
            </div>
          )}
        </Card>

        <Card
          title="Member capital"
          subtitle="Cash balances and net contributed capital per member."
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
                  <th className="py-2 pr-3 font-medium">Member</th>
                  <th className="py-2 pr-3 font-medium">Role</th>
                  <th className="py-2 pr-3 text-right font-medium">Cash</th>
                  <th className="py-2 pr-3 text-right font-medium">Net contributed</th>
                  <th className="py-2 text-right font-medium">Adjust</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const lock = getWithdrawalLock({ role: m.role, anchorDate: m.first_deposit_at });
                  return (
                  <tr key={m.id} className="border-b border-line/60 align-top">
                    <td className="py-2.5 pr-3">
                      <p className="font-medium">{m.name}</p>
                      <p className="text-xs text-muted">{m.email}</p>
                      {lock.locked ? (
                        <p className="mt-0.5 text-[11px] text-gold-400">
                          {lock.pending
                            ? "AML 30-day lockdown begins once the first deposit posts"
                            : `AML withdrawal lockdown until ${lock.untilDate}`}
                        </p>
                      ) : null}
                      {m.withdraw_address ? (
                        <p className="mt-0.5 max-w-56 truncate font-mono text-[11px] text-muted">
                          payout {m.withdraw_address}
                        </p>
                      ) : null}
                    </td>
                    <td className="py-2.5 pr-3">
                      <Badge tone={m.role === "admin" ? "gold" : "neutral"}>{m.role}</Badge>
                      <div className="mt-1">
                        <Badge
                          tone={
                            m.status === "verified"
                              ? "positive"
                              : m.status === "rejected"
                                ? "negative"
                                : "neutral"
                          }
                        >
                          {m.status}
                        </Badge>
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">
                      <PnlText value={m.cash} />
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">
                      {fmtMoney(m.net_deposits)}
                    </td>
                    <td className="py-2.5 text-right">
                      <details className="text-left">
                        <summary className="cursor-pointer text-sm text-gold-400 hover:text-gold-300">
                          Adjust
                        </summary>
                        <div className="mt-2 rounded-lg border border-line bg-surface2 p-3">
                          <AdminAdjustForm userId={m.id} userName={m.name.split(" ")[0]} />
                        </div>
                      </details>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card
        className="mt-6"
        title="Support tickets"
        subtitle="In-app support inbox. Reply here and the member sees it on their Support page."
      >
        {tickets.length === 0 ? (
          <EmptyState>No tickets yet.</EmptyState>
        ) : (
          <div className="space-y-4">
            {ticketsWithReplies.map(({ ticket: t, replies }) => (
              <div
                key={t.id}
                className="rounded-lg border border-line/60 p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-snug">{t.subject}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {t.user_name} ({t.user_email}) · opened {fmtDateTime(t.created_at)}
                    </p>
                  </div>
                  <Badge tone={t.status === "open" ? "gold" : "neutral"}>{t.status}</Badge>
                </div>

                <div className="mt-3 space-y-2">
                  {replies.map((r) => (
                    <div
                      key={r.id}
                      className={`rounded-lg border px-3 py-2 text-sm ${
                        r.author_type === "admin"
                          ? "border-gold-600/40 bg-maroon-900/40"
                          : "border-line/60 bg-surface2"
                      }`}
                    >
                      <p className="text-[11px] uppercase tracking-wide text-muted">
                        {r.author_type === "admin" ? "Oversight admin" : `${r.author_name} (member)`} ·{" "}
                        {fmtDateTime(r.created_at)}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap leading-relaxed">{r.message}</p>
                    </div>
                  ))}
                </div>

                {t.status === "open" ? (
                  <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
                    <TicketReplyForm ticketId={t.id} />
                    <form action={closeTicketAction} className="flex items-end">
                      <input type="hidden" name="ticketId" value={t.id} />
                      <button type="submit" className="btn-ghost px-3 py-1.5 text-sm">
                        Close ticket
                      </button>
                    </form>
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-muted">
                    Closed {t.closed_at ? fmtDateTime(t.closed_at) : ""}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="mt-6">
        <LedgerHistory
          rows={ledgerHistory}
          members={members.map((m) => ({ id: m.id, name: m.name, email: m.email }))}
        />
      </div>

      <div className="mt-6">
        <Card
          title="Yield program"
          subtitle="Operator-set daily rate applied to every member's total value. Cash share is credited as a ledger entry; invested share is marked up via model prices chained from real observations."
        >
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-line/60 p-3">
                <p className="stat-label">Rate</p>
                <p className="mt-1 font-display text-lg font-semibold text-gold-300">
                  +{(yieldStats.rate * 100).toFixed(2)}%/day
                </p>
              </div>
              <div className="rounded-lg border border-line/60 p-3">
                <p className="stat-label">Accrued through</p>
                <p className="mt-1 font-display text-lg font-semibold">
                  {yieldStats.lastAccrued ?? "—"}
                </p>
              </div>
              <div className="rounded-lg border border-line/60 p-3">
                <p className="stat-label">Credited to date</p>
                <p className="mt-1 font-display text-lg font-semibold">
                  {fmtMoney(yieldStats.totalCredited)}
                </p>
              </div>
            </div>
            <div className="lg:col-span-2">
              <YieldSettingsForm ratePct={Math.round(yieldStats.rate * 10000) / 100} />
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-6">
        <Card
          title="Crypto deposit channels"
          subtitle="Stablecoin channels offered to members. Configure the receiving address, record a real price observation for the backing asset, and deposits can be valued and posted."
        >
          <div className="mb-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="space-y-3">
              {depositMethods.length === 0 ? (
                <EmptyState>No channels configured.</EmptyState>
              ) : (
                depositMethods.map((m) => (
                  <form
                    key={m.id}
                    action={updateDepositMethodAction}
                    className="space-y-2 rounded-lg border border-line/60 px-3 py-2.5"
                  >
                    <input type="hidden" name="methodId" value={m.id} />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">
                          {m.name}
                          <span className="ml-1 text-muted">({m.symbol})</span>
                        </p>
                        <p className="text-xs text-muted">
                          {m.asset_name}
                          {m.asset_ticker ? ` · ${m.asset_ticker}` : ""}
                          {m.enabled ? (
                            <span className="ml-2 text-positive">enabled</span>
                          ) : (
                            <span className="ml-2 text-negative">disabled</span>
                          )}
                        </p>
                      </div>
                      <label className="flex items-center gap-2 text-xs text-muted">
                        <input
                          type="checkbox"
                          name="enabled"
                          defaultChecked={m.enabled === 1}
                          className="h-4 w-4"
                        />
                        Accepting funds
                      </label>
                    </div>
                    <input
                      name="walletAddress"
                      defaultValue={m.wallet_address}
                      type="text"
                      placeholder="Receiving address"
                      className="input font-mono"
                    />
                    <input
                      name="network"
                      defaultValue={m.network}
                      type="text"
                      placeholder="Network (e.g. Ethereum (ERC-20))"
                      className="input"
                    />
                    <input
                      name="instructions"
                      defaultValue={m.instructions ?? ""}
                      type="text"
                      placeholder="Instructions shown to members (optional)"
                      className="input"
                    />
                    <button type="submit" className="btn-ghost w-full">
                      Save channel
                    </button>
                  </form>
                ))
              )}
            </div>

            <form action={createDepositMethodAction} className="h-fit space-y-3 rounded-lg border border-line/60 bg-surface2 px-3 py-2.5">
              <p className="font-medium">Add a channel</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">Symbol</label>
                  <input name="symbol" type="text" className="input" placeholder="e.g. USDT" required />
                </div>
                <div>
                  <label className="label">Name</label>
                  <input name="name" type="text" className="input" placeholder="Tether USD" required />
                </div>
              </div>
              <div>
                <label className="label">Backing asset</label>
                <select name="assetId" className="input" required>
                  <option value="">Choose asset…</option>
                  {pricedAssets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {a.ticker ? ` (${a.ticker})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <input name="network" type="text" className="input" placeholder="Network (e.g. Ethereum (ERC-20))" />
              <input name="walletAddress" type="text" className="input font-mono" placeholder="Receiving address" />
              <input name="instructions" type="text" className="input" placeholder="Instructions (optional)" />
              <button type="submit" className="btn-primary w-full">
                Create channel
              </button>
            </form>
          </div>
        </Card>
      </div>

      <div className="mt-6">
        <Card
          title="Assets & price observations"
          subtitle="Create real assets and record sourced price observations that drive portfolio valuations."
          actions={<AssetForm />}
        >
          <div className="mb-5 border-b border-line pb-5">
            <PriceForm assets={pricedAssets} />
          </div>

          {assets.length === 0 ? (
            <EmptyState>No assets configured. Use “Add asset” to create the first one.</EmptyState>
          ) : (
            <div className="space-y-3">
              {assets.map((a, ai) => {
                const history = priceHistories[ai] ?? [];
                return (
                  <details
                    key={a.id}
                    className="group rounded-lg border border-line/60 transition-colors open:border-gold-600/40"
                  >
                    <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {a.name}
                          {a.ticker ? <span className="text-muted"> ({a.ticker})</span> : null}
                        </p>
                        <p className="text-xs text-muted">
                          {a.category}
                          {a.isin ? ` · ISIN ${a.isin}` : ""} · {a.obs_count} price{" "}
                          {a.obs_count === 1 ? "observation" : "observations"}
                        </p>
                      </div>
                      <div className="text-right">
                        {a.price !== null ? (
                          <>
                            <p className="font-semibold text-gold-300 tabular-nums">
                              {fmtMoney(a.price)}
                            </p>
                            <p className="text-xs text-muted">
                              {a.price_date}
                              {a.price_source ? ` · ${a.price_source}` : ""}
                            </p>
                          </>
                        ) : (
                          <p className="text-xs text-gold-400">no price recorded</p>
                        )}
                      </div>
                    </summary>
                    {history.length > 0 ? (
                      <div className="border-t border-line px-3 py-2">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-left uppercase tracking-wider text-muted">
                              <th className="py-1 pr-3 font-medium">Date</th>
                              <th className="py-1 pr-3 text-right font-medium">Price</th>
                              <th className="py-1 text-right font-medium">Source</th>
                            </tr>
                          </thead>
                          <tbody>
                            {history.map((h) => (
                              <tr key={`${h.obs_date}-${h.created_at}`} className="border-t border-line/50">
                                <td className="py-1 pr-3">{h.obs_date}</td>
                                <td className="py-1 pr-3 text-right tabular-nums">
                                  {fmtMoney(h.price)}
                                </td>
                                <td className="py-1 text-right text-muted">{h.source}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                  </details>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}