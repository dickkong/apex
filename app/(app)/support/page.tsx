import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TicketCard } from "@/components/TicketCard";
import { TicketCreateForm } from "@/components/TicketCreateForm";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { getSessionUser } from "@/lib/auth";
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
            <TicketCard
              key={t.id}
              view="user"
              ticket={{
                id: t.id,
                subject: t.subject,
                status: t.status,
                createdAt: t.created_at,
                updatedAt: t.updated_at,
                closedAt: t.closed_at,
                replies: replies.map((r) => ({
                  id: r.id,
                  authorType: r.author_type,
                  createdAt: r.created_at,
                  message: r.message,
                })),
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}