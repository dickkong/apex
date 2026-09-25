import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TicketCreateForm } from "@/components/TicketCreateForm";
import { TicketReplyForm } from "@/components/TicketReplyForm";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { reopenTicketAction } from "@/app/actions";
import { getSessionUser } from "@/lib/auth";
import { fmtDateTime } from "@/lib/money";
import { getTicketReplies, getTicketsForUser } from "@/lib/queries";

export const metadata: Metadata = { title: "Support" };

export default async function SupportPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const tickets = await getTicketsForUser(user.id);
  const ticketsWithReplies = await Promise.all(
    tickets.map(async (t) => ({ ticket: t, replies: await getTicketReplies(t.id) }))
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Support"
        subtitle="Raise a ticket and an oversight admin will respond here in the app. Nothing leaves the platform."
      />

      <Card title="Raise a ticket" subtitle="Tell us what you need — we reply here.">
        <TicketCreateForm />
      </Card>

      <div className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
          Your tickets ({tickets.length})
        </h2>
        {tickets.length === 0 ? (
          <Card>
            <EmptyState>No tickets yet — raise your first one above.</EmptyState>
          </Card>
        ) : (
          ticketsWithReplies.map(({ ticket: t, replies }) => (
            <Card key={t.id} className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium leading-snug">{t.subject}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    Raised {fmtDateTime(t.created_at)} · updated {fmtDateTime(t.updated_at)}
                  </p>
                </div>
                <Badge tone={t.status === "open" ? "gold" : "neutral"}>
                  {t.status === "open" ? "Open" : "Closed"}
                </Badge>
              </div>

              <div className="space-y-3">
                {replies.map((r) => {
                  const isAdminReply = r.author_type === "admin";
                  return (
                    <div
                      key={r.id}
                      className={`rounded-lg border px-3 py-2.5 ${
                        isAdminReply
                          ? "border-gold-600/40 bg-maroon-900/40"
                          : "border-line/60 bg-surface2"
                      }`}
                    >
                      <p className="text-xs text-muted">
                        <span className={`font-semibold ${isAdminReply ? "text-gold-300" : "text-foreground"}`}>
                          {isAdminReply ? "Oversight admin" : "You"}
                        </span>{" "}
                        · {fmtDateTime(r.created_at)}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{r.message}</p>
                    </div>
                  );
                })}
              </div>

              {t.status === "open" ? (
                <TicketReplyForm ticketId={t.id} />
              ) : (
                <form action={reopenTicketAction} className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted">This ticket is closed.</p>
                  <input type="hidden" name="ticketId" value={t.id} />
                  <button type="submit" className="btn-ghost px-3 py-1.5 text-sm">
                    Reopen
                  </button>
                </form>
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  );
}