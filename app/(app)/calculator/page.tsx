import type { Metadata } from "next";
import { redirect } from "next/navigation";
import CompoundCalculator from "@/components/CompoundCalculator";
import { PageHeader } from "@/components/ui";
import { getSessionUser } from "@/lib/auth";
import { getSummary } from "@/lib/portfolio";

export const metadata: Metadata = { title: "Yield calculator" };

export default async function CalculatorPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const summary = await getSummary(user.id);
  const startingBalance = summary.totalValue > 0 ? summary.totalValue : 130;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Yield calculator"
        subtitle="See how your current portfolio value compounds at the configured daily rate — pre-filled with your live balance."
      />
      <CompoundCalculator defaultInitial={startingBalance} />
    </div>
  );
}