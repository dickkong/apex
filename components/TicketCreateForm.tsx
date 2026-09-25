"use client";

import { useActionState } from "react";
import { createTicketAction, type ActionState } from "@/app/actions";

const initialState: ActionState = { ok: false };

export function TicketCreateForm() {
  const [state, formAction, pending] = useActionState(createTicketAction, initialState);

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label htmlFor="ticket-subject" className="label">
          Subject
        </label>
        <input
          id="ticket-subject"
          name="subject"
          type="text"
          required
          minLength={3}
          maxLength={200}
          className="input"
          placeholder="Brief summary of your issue"
        />
      </div>
      <div>
        <label htmlFor="ticket-message" className="label">
          Message
        </label>
        <textarea
          id="ticket-message"
          name="message"
          required
          minLength={10}
          maxLength={4000}
          rows={4}
          className="input resize-y"
          placeholder="Describe what happened, what you expected, and any details that help us help you."
        />
      </div>

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

      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Raising ticket…" : "Raise ticket"}
      </button>
    </form>
  );
}