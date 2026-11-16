import type { LucideIcon } from "lucide-react";
import { CalendarCheck, ClipboardClock, ClipboardList, ShieldCheck, Users } from "lucide-react";
import type { EfaPanelSummary } from "@/components/EfaPanelHome";

export type EfaPanelQuickAction = {
  id:
    | "start-guard"
    | "continue-episodes"
    | "manage-guard"
    | "consult-guards"
    | "manage-accounts"
    | "coordinate-guards";
  to: "/guardia-efa" | "/episodios-efa" | "/admin-usuarios" | "/coordinacion-efa";
  label: string;
  navLabel: string;
  icon: LucideIcon;
};

const actions: Record<EfaPanelQuickAction["id"], EfaPanelQuickAction> = {
  "start-guard": {
    id: "start-guard",
    to: "/guardia-efa",
    label: "Iniciar guardia EFA",
    navLabel: "Mi guardia",
    icon: ClipboardClock,
  },
  "continue-episodes": {
    id: "continue-episodes",
    to: "/episodios-efa",
    label: "Registrar o continuar atenciones",
    navLabel: "Atenciones",
    icon: CalendarCheck,
  },
  "manage-guard": {
    id: "manage-guard",
    to: "/guardia-efa",
    label: "Bases y dotación",
    navLabel: "Mi guardia",
    icon: ClipboardClock,
  },
  "consult-guards": {
    id: "consult-guards",
    to: "/guardia-efa",
    label: "Consultar mis guardias",
    navLabel: "Mi guardia",
    icon: ShieldCheck,
  },
  "manage-accounts": {
    id: "manage-accounts",
    to: "/admin-usuarios",
    label: "Administrar cuentas",
    navLabel: "Cuentas",
    icon: Users,
  },
  "coordinate-guards": {
    id: "coordinate-guards",
    to: "/coordinacion-efa",
    label: "Coordinación EFA",
    navLabel: "Coordinación EFA",
    icon: ClipboardList,
  },
};

export function getEfaPanelQuickActions(summary: EfaPanelSummary): EfaPanelQuickAction[] {
  const selected: EfaPanelQuickAction[] = [];

  if (summary.canWrite) {
    selected.push(actions[summary.openGuard ? "continue-episodes" : "start-guard"]);
    if (summary.openGuard) selected.push(actions["manage-guard"]);
  } else {
    selected.push(actions["consult-guards"]);
  }

  if (summary.isAdmin) {
    selected.push(actions["manage-accounts"]);
    selected.push(actions["coordinate-guards"]);
    if (!summary.openGuard) selected.push(actions["manage-guard"]);
  }

  return selected;
}
