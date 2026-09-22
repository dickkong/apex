"use client";

import { useActionState } from "react";
import { updateYieldSettingsAction, type ActionState } from "@/app/actions";

const initialState: ActionState = { ok: false };

export function YieldSettingsForm({ ratePct }: { ratePct: number }) {
  const [state, formAction, pending] = useActionState(updateYieldSettingsAction, initialState);

  return (
    <form action={formAction} className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="yield-rate" className="label">
            Daily rate (%, 0 disables)
          </label>
          <input
            id="yield-rate"
            name="rate"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            max="100"
            required
            className="input"
            defaultValue={ratePct}
            disabled={pending}
          />
        </div>
        <button type="submit" disabled={pending} className="btn-ghost">
          {pending ? "Saving…" : "Save rate"}
        </button>
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

      <p className="text-xs text-muted">
        Applied daily to every member&apos;s total value (cash + holdings) and compounded. Missed
        days backfill automatically on the next read; stopping the rate freezes accrual, it never
        rewrites past entries.
      </p>
    </form>
  );
}