import { LoaderCircle } from "lucide-react";

export function RoutePending({ overlay = false }: { overlay?: boolean }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={
        overlay
          ? "grid h-full w-full place-items-center p-4"
          : "workflow-background grid min-h-screen place-items-center px-4 py-8"
      }
    >
      <div className="flex items-center gap-3 rounded-lg border bg-card px-5 py-4 text-card-foreground shadow-sm">
        <LoaderCircle
          aria-hidden="true"
          className="size-5 shrink-0 animate-spin text-primary motion-reduce:animate-none"
        />
        <span className="text-sm font-medium">Espere...</span>
        <span className="sr-only">Cargando</span>
      </div>
    </div>
  );
}
