"use client";

import { useActionState } from "react";
import { adminAdjustBalanceAction, type ActionState } from "@/app/actions";

const initialState: ActionState = { ok: false };

export function AdminAdjustForm({ userId, userName }: { userId: string; userName: string }) {
  const [state, formAction, pending] = useActionState(adminAdjustBalanceAction, initialState);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="userId" value={userId} />
      <div>
        <label className="label">Signed amount (negative = debit)</label>
        <input
          name="amount"
          type="number"
          inputMode="decimal"
          step="0.01"
          required
          className="input"
          placeholder="e.g. -100.00"
          disabled={pending}
        />
      </div>
      <div>
        <label className="label">Note</label>
        <input
          name="note"
          type="text"
          className="input"
          placeholder="Why this entry is posted"
          disabled={pending}
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

      <button type="submit" disabled={pending} className="btn-outline">
        {pending ? "Posting…" : `Adjust ${userName}`}
      </button>
    </form>
  );
}