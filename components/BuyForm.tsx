"use client";

import { useState, useActionState } from "react";
import { buyAssetAction, type ActionState } from "@/app/actions";
import { fmtMoney } from "@/lib/money";

export interface AssetOption {
  id: string;
  name: string;
  ticker: string | null;
  price: number | null;
  priceDate: string | null;
}

const initialState: ActionState = { ok: false };

export function BuyForm({ assets }: { assets: AssetOption[] }) {
  const [state, formAction, pending] = useActionState(buyAssetAction, initialState);
  const [selectedId, setSelectedId] = useState(assets[0]?.id ?? "");

  const selected = assets.find((a) => a.id === selectedId);

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label htmlFor="buy-asset" className="label">
          Asset
        </label>
        <select
          id="buy-asset"
          name="assetId"
          className="input"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          required
          disabled={pending}
        >
          {assets.length === 0 ? (
            <option value="">No assets configured yet</option>
          ) : (
            assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.ticker ? ` (${a.ticker})` : ""}
              </option>
            ))
          )}
        </select>
        {selected ? (
          selected.price !== null ? (
            <p className="mt-1 text-xs text-muted">
              Latest price:{" "}
              <span className="text-foreground">{fmtMoney(selected.price)}</span>
              {selected.priceDate ? ` as of ${selected.priceDate}` : ""}
            </p>
          ) : (
            <p className="mt-1 text-xs text-gold-400">
              No price observation yet — an admin must add one before you can buy.
            </p>
          )
        ) : null}
      </div>
      <div>
        <label htmlFor="buy-amount" className="label">
          Amount to invest (USD)
        </label>
        <input
          id="buy-amount"
          name="amount"
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0.01"
          required
          className="input"
          placeholder="0.00"
          disabled={pending}
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

      <button type="submit" disabled={pending || assets.length === 0} className="btn-primary w-full">
        {pending ? "Executing…" : "Buy units"}
      </button>
      <p className="text-xs text-muted">
        Units are priced at the latest recorded price observation on your ledger.
      </p>
    </form>
  );
}