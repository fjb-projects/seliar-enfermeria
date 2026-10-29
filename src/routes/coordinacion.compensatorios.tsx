import { createFileRoute } from "@tanstack/react-router";
import { CompensatoryOperationalWorkspace } from "@/components/CompensatoryOperationalWorkspace";
import { listCompensatoryStaff, type StaffView } from "@/lib/compensatory-bank.functions";

export const Route = createFileRoute("/coordinacion/compensatorios")({
  loader: async () => ({ staff: (await listCompensatoryStaff()) as StaffView[] }),
  component: CompensatoryBankPage,
});

function CompensatoryBankPage() {
  const { staff } = Route.useLoaderData();
  return <CompensatoryOperationalWorkspace initialStaff={staff} />;
}
