"use client";

import { useActionState } from "react";
import { updatePayoutAddressAction, type ActionState } from "@/app/actions";

const initialState: ActionState = { ok: false };

export function PayoutForm({ current }: { current: string | null }) {
  const [state, formAction, pending] = useActionState(updatePayoutAddressAction, initialState);

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label htmlFor="payout-address" className="label">
          Default payout address
        </label>
        <input
          id="payout-address"
          name="address"
          type="text"
          className="input font-mono"
          placeholder="0x… wallet or bank reference"
          defaultValue={current ?? ""}
          disabled={pending}
        />
        <p className="mt-1 text-xs text-muted">
          Withdrawal requests default to this destination. Keep it to an address you control —
          posted payouts are sent here.
        </p>
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

      <button type="submit" disabled={pending} className="btn-ghost">
        {pending ? "Saving…" : "Save payout address"}
      </button>
    </form>
  );
}