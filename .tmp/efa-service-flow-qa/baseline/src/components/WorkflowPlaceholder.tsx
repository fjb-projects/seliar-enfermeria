import { Link } from "@tanstack/react-router";
import { ArrowLeft, Clock3, type LucideIcon } from "lucide-react";

export function WorkflowPlaceholder({
  eyebrow,
  title,
  description,
  icon: Icon,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col px-4 pb-28 pt-6">
      <Link
        to="/"
        className="inline-flex min-h-11 w-fit items-center gap-2 rounded-md px-2 text-sm font-bold text-primary transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Volver al inicio
      </Link>

      <section className="mt-8 border-l-4 border-[var(--brand-orange)] bg-primary p-6 text-primary-foreground shadow-[0_12px_40px_oklch(0.27_0.035_202/0.16)]">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary-foreground/75">
          {eyebrow}
        </p>
        <div className="mt-5 flex items-start gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary-foreground/12">
            <Icon className="size-6" aria-hidden="true" />
          </span>
          <div>
            <h1 className="font-display text-3xl font-bold leading-none">{title}</h1>
            <p className="mt-3 text-sm leading-6 text-primary-foreground/85">{description}</p>
          </div>
        </div>
      </section>

      <section
        className="mt-5 border border-border bg-card p-5 shadow-sm"
        aria-labelledby="estado-vista"
      >
        <div className="flex items-center gap-3 text-[var(--warning-foreground)]">
          <Clock3 className="size-5" aria-hidden="true" />
          <h2 id="estado-vista" className="font-display text-lg font-bold">
            Próximamente
          </h2>
        </div>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Esta vista ya está preparada dentro de SeLIAR. En la próxima etapa se conectará con su
          formulario y flujo de envío correspondiente.
        </p>
      </section>
    </main>
  );
}
