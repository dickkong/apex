"use client";

import { useState } from "react";
import { closeTicketAction, reopenTicketAction } from "@/app/actions";
import { Badge } from "@/components/ui";
import { fmtDateTime } from "@/lib/money";
import { TicketReplyForm } from "@/components/TicketReplyForm";

export interface TicketCardReply {
  id: string;
  authorType: "user" | "admin";
  authorName?: string;
  createdAt: string;
  message: string;
}

export interface TicketCardData {
  id: string;
  subject: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  closedAt?: string | null;
  memberLabel?: string;
  replies: TicketCardReply[];
}

const LONG_THREAD = 3;

export function TicketCard({ ticket, view }: { ticket: TicketCardData; view: "user" | "admin" }) {
  const long = ticket.replies.length > LONG_THREAD;
  const [expanded, setExpanded] = useState(() => !long);

  const replyLabel = (r: TicketCardReply) => {
    if (r.authorType === "admin") return "Oversight admin";
    return view === "admin" ? `${r.authorName ?? "Member"} (member)` : "You";
  };

  return (
    <section className="card space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium leading-snug">{ticket.subject}</p>
          <p className="mt-0.5 text-xs text-muted">
            {view === "admin" ? `${ticket.memberLabel ?? ""} · ` : ""}
            {ticket.replies.length} message{ticket.replies.length === 1 ? "" : "s"} · updated{" "}
            {fmtDateTime(ticket.updatedAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={ticket.status === "open" ? "gold" : "neutral"}>{ticket.status}</Badge>
          {long && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="btn-ghost px-3 py-1.5 text-sm"
              aria-expanded={expanded}
            >
              {expanded ? "Collapse thread" : `Show thread (${ticket.replies.length})`}
            </button>
          )}
        </div>
      </div>

      {expanded ? (
        <>
          <div className="space-y-3">
            {ticket.replies.map((r) => (
              <div
                key={r.id}
                className={`rounded-lg border px-3 py-2.5 ${
                  r.authorType === "admin"
                    ? "border-gold-600/40 bg-maroon-900/40"
                    : "border-line/60 bg-surface2"
                }`}
              >
                <p className="text-xs text-muted">
                  <span className={`font-semibold ${r.authorType === "admin" ? "text-gold-300" : "text-foreground"}`}>
                    {replyLabel(r)}
                  </span>{" "}
                  · {fmtDateTime(r.createdAt)}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{r.message}</p>
              </div>
            ))}
          </div>

          {ticket.status === "open" ? (
            <TicketReplyForm ticketId={ticket.id} />
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted">
                Closed {ticket.closedAt ? fmtDateTime(ticket.closedAt) : ""}.
              </p>
              {view === "user" && (
                <form action={reopenTicketAction}>
                  <input type="hidden" name="ticketId" value={ticket.id} />
                  <button type="submit" className="btn-ghost px-3 py-1.5 text-sm">
                    Reopen
                  </button>
                </form>
              )}
            </div>
          )}
        </>
      ) : (
        <p className="truncate text-sm text-muted">
          {ticket.replies[ticket.replies.length - 1]?.message}
        </p>
      )}

      {view === "admin" && ticket.status === "open" ? (
        <form action={closeTicketAction} className="flex items-end">
          <input type="hidden" name="ticketId" value={ticket.id} />
          <button type="submit" className="btn-ghost px-3 py-1.5 text-sm">
            Close ticket
          </button>
        </form>
      ) : null}
    </section>
  );
}