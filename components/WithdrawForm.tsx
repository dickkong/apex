"use client";

import { useState, useActionState } from "react";
import { requestWithdrawalAction, type ActionState } from "@/app/actions";
import { fmtMoney } from "@/lib/money";

const initialState: ActionState = { ok: false };

export function WithdrawForm({
  maxCash,
  disabled,
  defaultAddress,
  lockInfo,
}: {
  maxCash: number;
  disabled?: boolean;
  defaultAddress?: string | null;
  lockInfo?: { untilDate: string; daysRemaining: number } | null;
}) {
  const [state, formAction, pending] = useActionState(requestWithdrawalAction, initialState);
  const [dest, setDest] = useState(defaultAddress ?? "");
  const locked = Boolean(lockInfo);
  const blocked = disabled || pending || locked;

  return (
    <form action={formAction} className="space-y-3">
      {locked ? (
        <p className="rounded-lg border border-gold-600/40 bg-maroon-900/40 px-3 py-2 text-xs leading-relaxed text-muted">
          <span className="font-semibold text-gold-300">
            AML withdrawal lockdown active.
          </span>{" "}
          New accounts are bound by the anti-money-laundering policy: a{" "}
          <span className="font-semibold text-foreground">30-day money-bind</span> is placed on
          your deposit. Withdrawals unlock on <span className="font-semibold text-foreground">{lockInfo?.untilDate}</span>{" "}
          ({lockInfo?.daysRemaining} day{lockInfo?.daysRemaining === 1 ? "" : "s"} remaining). Your
          capital keeps growing at the 0.5%–1% daily accrual rate during this period.
        </p>
      ) : null}

      <div>
        <label htmlFor="withdraw-amount" className="label">
          Amount (USD)
        </label>
        <input
          id="withdraw-amount"
          name="amount"
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0.01"
          max={maxCash}
          required
          className="input"
          placeholder="0.00"
          disabled={blocked}
        />
        <p className="mt-1 text-xs text-muted">Available cash: {fmtMoney(maxCash)}</p>
      </div>
      <div>
        <label htmlFor="withdraw-destination" className="label">
          Payout destination
        </label>
        <input
          id="withdraw-destination"
          name="destination"
          type="text"
          className="input font-mono"
          placeholder="0x… wallet or bank reference"
          value={dest}
          onChange={(e) => setDest(e.target.value)}
          disabled={blocked}
        />
        <p className="mt-1 text-xs text-muted">
          {dest ? "Destination for this payout." : "No default set yet — add one below or type it here."}
        </p>
      </div>
      <div>
        <label htmlFor="withdraw-note" className="label">
          Reference (optional)
        </label>
        <input
          id="withdraw-note"
          name="note"
          type="text"
          className="input"
          placeholder="Internal reference for the payout"
          disabled={blocked}
        />
      </div>

      {state.message ? (
        <p
          className={`rounded-lg border px-3 py-2 text-sm ${
            state.ok
              ? "border-positive/40 bg-positive/10 text-positive"
              : "border-negative/40 bg-negative/10 text-negative"
          }`}
        >
          {state.message}
        </p>
      ) : null}

      <button type="submit" disabled={blocked} className="btn-primary w-full">
        {locked ? "Locked until lockdown ends" : pending ? "Requesting…" : "Request withdrawal"}
      </button>
      <p className="text-xs text-muted">
        Withdrawals require admin verification before the outgoing ledger posting is made.
      </p>
    </form>
  );
}