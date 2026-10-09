import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  CalendarDays,
  ChevronRight,
  ClipboardClock,
  ClockPlus,
  HeartPulse,
  LogIn,
} from "lucide-react";
import { useSeliarNavigation } from "@/components/SeliarNavigationProvider";
import { navigationSessionQueryOptions } from "@/lib/navigation-query-options";

export const Route = createFileRoute("/")({
  beforeLoad: async ({ context }) => {
    const snapshot = await context.queryClient.fetchQuery(navigationSessionQueryOptions());
    if (snapshot.status === "authenticated") throw redirect({ href: "/panel" });
  },
  head: () => ({
    meta: [
      { title: "SeLIAR Enfermería" },
      {
        name: "description",
        content: "Panel operativo de los flujos de Enfermería SeLIAR.",
      },
    ],
  }),
  component: Home,
});

const managementWorkflows = [
  {
    to: "/horarios" as const,
    title: "Horarios de guardia",
    description: "Consultá el cronograma vigente.",
    icon: CalendarDays,
  },
  {
    to: "/cambio-guardia" as const,
    title: "Cambio de guardia",
    description: "Iniciá una solicitud de cambio de guardia.",
    icon: ArrowLeftRight,
  },
  {
    to: "/compensatorio" as const,
    title: "Compensatorio",
    description: "Gestioná solicitudes de horas compensatorias.",
    icon: ClockPlus,
  },
  {
    to: "/lao" as const,
    title: "Solicitud de LAO",
    description: "Prepará tu solicitud de licencia anual ordinaria.",
    icon: HeartPulse,
  },
];

const guardiaWorkflows = [
  {
    to: "/ingreso" as const,
    title: "Registrar ingreso",
    description: "Completá el registro de ingreso a tu guardia.",
    cta: "Registrar ingreso →",
    icon: LogIn,
  },
  {
    to: "/control-guardia" as const,
    title: "Control de guardia",
    description: "Registrá el ingreso, egreso e inventario de cada guardia.",
    cta: "Ir a control de guardia →",
    icon: ClipboardClock,
  },
];

function ManagementLink({
  to,
  title,
  description,
  icon: Icon,
}: (typeof managementWorkflows)[number]) {
  return (
    <Link
      to={to}
      className="group flex min-h-16 items-center gap-3 border-b border-border px-1 py-4 text-foreground transition-colors motion-safe:duration-150 hover:bg-muted focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset active:brightness-95 motion-reduce:transition-none"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
        <Icon className="size-5" strokeWidth={2} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-lg font-bold leading-tight">{title}</span>
        <span className="mt-0.5 block text-sm leading-5 text-muted-foreground">{description}</span>
      </span>
      <ChevronRight
        className="size-5 shrink-0 text-muted-foreground transition-transform motion-safe:duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none"
        aria-hidden="true"
      />
    </Link>
  );
}

function Home() {
  const navigation = useSeliarNavigation();

  if (navigation.sessionStatus === "unavailable") {
    return (
      <main className="workflow-background flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 py-8">
        <section className="max-w-md space-y-3 rounded-xl bg-card p-5 text-center shadow-sm" aria-labelledby="session-unavailable-title">
          <h1 id="session-unavailable-title" className="text-lg font-semibold">No se pudo verificar la sesión</h1>
          <p className="text-sm text-muted-foreground">Inténtalo nuevamente para continuar.</p>
          <button onClick={navigation.retrySession} className="min-h-11 rounded-lg bg-primary px-4 font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">Reintentar</button>
        </section>
      </main>
    );
  }

  return (
    <main className="workflow-background min-h-screen">
      <div className="mx-auto min-h-screen w-full max-w-lg px-4 pb-24 pt-2 sm:px-5 sm:pt-4 md:pb-8">
        <header className="rounded-2xl bg-primary px-4 py-1.5 text-primary-foreground shadow-[0_12px_32px_oklch(0.27_0.035_202/0.22)] sm:px-5 sm:py-4 md:rounded-none md:bg-transparent md:p-0 md:text-foreground md:shadow-none">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[3px] bg-white p-1 sm:h-9 sm:w-14 md:hidden">
              <img src="/logoSIES.jpg" alt="Logo SIES" className="h-full w-full object-contain" />
            </span>
            <h1 className="min-w-0 font-display text-lg font-bold leading-tight sm:text-2xl md:text-xl">
              Enfermería SeLIAR
            </h1>
          </div>
          <p className="mt-0 max-w-md text-[10px] leading-3 text-primary-foreground/85 sm:mt-2 sm:text-sm sm:leading-5 md:mt-1 md:text-sm md:leading-5 md:text-muted-foreground">
            Panel operativo para el equipo de enfermería de la SeLIAR de Santa Fe.
          </p>
        </header>

        <section
          className="mt-3 rounded-2xl bg-primary p-4 text-primary-foreground shadow-[0_18px_40px_oklch(0.2_0.04_202/0.28)] sm:mt-5 sm:p-5"
          aria-labelledby="tu-guardia-heading"
        >
          <h2
            id="tu-guardia-heading"
            className="font-display text-2xl font-bold leading-tight sm:text-3xl"
          >
            Tu guardia
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {guardiaWorkflows.map(({ to, title, description, cta, icon: Icon }) => (
              <article
                key={to}
                className="rounded-xl border border-primary-foreground/20 bg-primary-foreground/5 p-3 sm:p-4"
              >
                <div className="flex items-center gap-2">
                  <Icon className="size-5 shrink-0" aria-hidden="true" />
                  <h3 className="font-display text-lg font-bold leading-tight">{title}</h3>
                </div>
                <p className="mt-2 min-h-12 text-sm leading-6 text-primary-foreground/85">
                  {description}
                </p>
                <Link
                  to={to}
                  className="mt-3 flex min-h-12 w-full items-center justify-center rounded-xl bg-[var(--brand-orange)] px-4 py-3 text-center text-sm font-bold text-primary transition-colors hover:bg-[var(--brand-orange)]/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary active:brightness-95 motion-safe:duration-150 motion-reduce:transition-none"
                >
                  {cta}
                </Link>
              </article>
            ))}
          </div>
        </section>

        <section
          className="mt-4 min-h-[calc(100vh-15rem)] rounded-t-[24px] bg-white px-4 pb-8 pt-5 shadow-[0_-10px_28px_oklch(0.27_0.035_202/0.12)] sm:mt-5 sm:px-6 sm:pt-6"
          aria-labelledby="gestiones-title"
        >
          <h2 id="gestiones-title" className="font-display text-2xl font-semibold text-foreground">
            Gestiones
          </h2>
          <div className="mt-2 divide-y divide-border">
            {managementWorkflows.map((workflow) => (
              <ManagementLink key={workflow.to} {...workflow} />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
