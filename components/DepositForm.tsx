"use client";

import { useState } from "react";
import { useActionState } from "react";
import { submitDepositAction, type ActionState } from "@/app/actions";
import type { DepositMethodView } from "@/lib/queries";

const initialState: ActionState = { ok: false };

export function DepositForm({
  methods,
  disabled,
}: {
  methods: DepositMethodView[];
  disabled?: boolean;
}) {
  const [state, formAction, pending] = useActionState(submitDepositAction, initialState);
  const [methodId, setMethodId] = useState(methods[0]?.id ?? "");
  const [copied, setCopied] = useState(false);
  const method = methods.find((m) => m.id === methodId);

  function copyAddress() {
    const address = method?.wallet_address;
    if (!address) return;
    void navigator.clipboard
      ?.writeText(address)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        const ta = document.createElement("textarea");
        ta.value = address;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
  }

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label htmlFor="deposit-method" className="label">
          Deposit channel
        </label>
        <select
          id="deposit-method"
          name="methodId"
          value={methodId}
          onChange={(e) => {
            setMethodId(e.target.value);
            setCopied(false);
          }}
          className="input"
          disabled={disabled || pending || methods.length === 0}
        >
          {methods.length === 0 ? (
            <option value="">No channels available yet</option>
          ) : (
            methods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.symbol} — {m.name} · {m.network}
              </option>
            ))
          )}
        </select>
      </div>

{method ? (
        <div
          key={method.id}
          className="rounded-lg border border-line bg-surface2 px-3 py-2 text-xs"
        >
          <p className="text-muted">
            Receiving address for <span className="font-semibold text-foreground">{method.symbol}</span>:
          </p>
          <div className="mt-1 flex items-start gap-2">
            <p className="min-w-0 flex-1 break-all font-mono text-sm text-gold-300">
              {method.wallet_address || "Receiving address not configured yet"}
            </p>
            {method.wallet_address ? (
              <button
                type="button"
                onClick={copyAddress}
                className="inline-flex flex-none items-center gap-1 rounded-md border border-line bg-surface2 px-2 py-1 text-xs font-medium text-foreground transition-colors hover:border-gold-500/50 hover:text-gold-400"
              >
                {copied ? "Copied ✓" : "Copy"}
              </button>
            ) : null}
          </div>
          <p className="mt-1 text-muted">
            Network: <span className="text-foreground">{method.network}</span>
          </p>
          {method.instructions ? (
            <p className="mt-1 text-muted">⚠ {method.instructions}</p>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="deposit-amount" className="label">
            Amount ({method?.symbol ?? "coin"})
          </label>
          <input
            id="deposit-amount"
            name="amount"
            type="number"
            inputMode="decimal"
            step="0.000001"
            min="0.000001"
            required
            className="input"
            placeholder="0.00"
            disabled={disabled || pending}
          />
        </div>
        <div>
          <label htmlFor="deposit-txid" className="label">
            Transaction hash
          </label>
          <input
            id="deposit-txid"
            name="txid"
            type="text"
            className="input font-mono"
            placeholder="0x… transaction ID"
            disabled={disabled || pending}
          />
          <p className="mt-1 text-xs text-muted">
            The on-chain Txn Hash — <span className="font-mono">0x</span> + 64 characters —
            found in the transfer details, not the destination address.
          </p>
        </div>
      </div>
      <div>
        <label htmlFor="deposit-note" className="label">
          Reference (optional)
        </label>
        <input
          id="deposit-note"
          name="note"
          type="text"
          className="input"
          placeholder="e.g. memo visible on-chain"
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
        {pending ? "Submitting…" : "Submit crypto deposit"}
      </button>
      <p className="text-xs text-muted">
        Deposits are recorded as pending and, once an admin verifies the transfer, are valued in
        USD from a sourced price observation and posted to your ledger.
      </p>
    </form>
  );
}