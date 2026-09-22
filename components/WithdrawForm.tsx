"use client";

import { useState, useActionState } from "react";
import { requestWithdrawalAction, type ActionState } from "@/app/actions";
import { fmtMoney } from "@/lib/money";

const initialState: ActionState = { ok: false };

export function WithdrawForm({
  maxCash,
  disabled,
  defaultAddress,
}: {
  maxCash: number;
  disabled?: boolean;
  defaultAddress?: string | null;
}) {
  const [state, formAction, pending] = useActionState(requestWithdrawalAction, initialState);
  const [dest, setDest] = useState(defaultAddress ?? "");

  return (
    <form action={formAction} className="space-y-3">
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
          disabled={disabled || pending}
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
          disabled={disabled || pending}
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
          disabled={disabled || pending}
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

      <button type="submit" disabled={disabled || pending} className="btn-primary w-full">
        {pending ? "Requesting…" : "Request withdrawal"}
      </button>
      <p className="text-xs text-muted">
        Withdrawals require admin verification before the outgoing ledger posting is made.
      </p>
    </form>
  );
}