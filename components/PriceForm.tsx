"use client";

import { useActionState } from "react";
import { addAssetPriceAction, type ActionState } from "@/app/actions";

export interface AssetOption {
  id: string;
  name: string;
  ticker: string | null;
}

const initialState: ActionState = { ok: false };

export function PriceForm({ assets }: { assets: AssetOption[] }) {
  const [state, formAction, pending] = useActionState(addAssetPriceAction, initialState);

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="price-asset" className="label">
            Asset
          </label>
          <select id="price-asset" name="assetId" className="input" required disabled={pending}>
            {assets.length === 0 ? (
              <option value="">No assets yet</option>
            ) : (
              assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.ticker ? ` (${a.ticker})` : ""}
                </option>
              ))
            )}
          </select>
        </div>
        <div>
          <label htmlFor="price-date" className="label">
            Date (YYYY-MM-DD)
          </label>
          <input
            id="price-date"
            name="date"
            type="date"
            required
            className="input"
            defaultValue={new Date().toISOString().slice(0, 10)}
            disabled={pending}
          />
        </div>
        <div>
          <label htmlFor="price-value" className="label">
            Price (USD)
          </label>
          <input
            id="price-value"
            name="price"
            type="number"
            inputMode="decimal"
            step="0.000001"
            min="0.000001"
            required
            className="input"
            placeholder="0.00"
            disabled={pending}
          />
        </div>
        <div>
          <label htmlFor="price-source" className="label">
            Source
          </label>
          <input
            id="price-source"
            name="source"
            type="text"
            className="input"
            placeholder="e.g. fund factsheet, exchange close"
            disabled={pending}
          />
        </div>
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

      <button type="submit" disabled={pending || assets.length === 0} className="btn-primary">
        {pending ? "Recording…" : "Record price observation"}
      </button>
      <p className="text-xs text-muted">
        Record only real, sourced prices — portfolio values are computed from these observations.
      </p>
    </form>
  );
}