"use client";

import { useActionState } from "react";
import { sellAssetAction, type ActionState } from "@/app/actions";

const initialState: ActionState = { ok: false };

export function SellForm({
  holdingId,
  assetName,
  maxUnits,
  hasPrice,
}: {
  holdingId: string;
  assetName: string;
  maxUnits: number;
  hasPrice: boolean;
}) {
  const [state, formAction, pending] = useActionState(sellAssetAction, initialState);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="holdingId" value={holdingId} />
      <div>
        <label htmlFor={`sell-units-${holdingId}`} className="sr-only">
          Units to sell
        </label>
        <input
          id={`sell-units-${holdingId}`}
          name="units"
          type="number"
          inputMode="decimal"
          step="any"
          min="0.000001"
          max={maxUnits}
          required
          className="input py-1.5 text-sm"
          placeholder={`Sell units (max ${maxUnits.toLocaleString()})`}
          disabled={pending || !hasPrice}
        />
      </div>

      {state.message ? (
        <p
          className={`rounded-lg border px-2 py-1.5 text-xs ${
            state.ok
              ? "border-positive/40 bg-positive/10 text-positive"
              : "border-negative/40 bg-negative/10 text-negative"
          }`}
        >
          {state.message}
        </p>
      ) : null}

      <button type="submit" disabled={pending || !hasPrice} className="btn-ghost w-full">
        {pending ? "Processing…" : `Sell units · ${assetName}`}
      </button>
      {!hasPrice ? (
        <p className="text-[11px] leading-snug text-gold-400">
          No price recorded yet — sales unlock once an admin records a price for this asset.
        </p>
      ) : null}
    </form>
  );
}