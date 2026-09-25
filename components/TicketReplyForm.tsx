"use client";

import { useActionState } from "react";
import { replyTicketAction, type ActionState } from "@/app/actions";

const initialState: ActionState = { ok: false };

export function TicketReplyForm({ ticketId }: { ticketId: string }) {
  const [state, formAction, pending] = useActionState(replyTicketAction, initialState);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="ticketId" value={ticketId} />
      <textarea
        name="message"
        required
        minLength={1}
        maxLength={4000}
        rows={2}
        className="input resize-y"
        placeholder="Write a reply…"
      />
      {state.message && (
        <p
          className={`rounded-lg border px-3 py-2 text-sm ${
            state.ok
              ? "border-positive/40 bg-positive/10 text-positive"
              : "border-negative/40 bg-negative/10 text-negative"
          }`}
        >
          {state.message}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="btn-primary px-4 py-1.5 text-sm">
          {pending ? "Posting…" : "Reply"}
        </button>
      </div>
    </form>
  );
}