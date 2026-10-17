import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { logoutGuardDialogDescription } from "@/lib/efa-quick-guard-end";

export function EfaLogoutGuardDialog({
  open,
  startedAt,
  canEndGuard,
  pending,
  error,
  onCancel,
  onEndAndLogout,
  onLogout,
}: {
  open: boolean;
  startedAt: string | null;
  canEndGuard: boolean;
  pending: boolean;
  error: string;
  onCancel: () => void;
  onEndAndLogout: () => void;
  onLogout: () => void;
}) {
  return (
    <AlertDialog
      open={open && startedAt !== null}
      onOpenChange={(next) => {
        if (!next && !pending) onCancel();
      }}
    >
      <AlertDialogContent className="w-[calc(100%-2rem)] max-w-md gap-4 border-amber-500/60 p-4 sm:p-6">
        <AlertDialogHeader>
          <AlertDialogTitle>Tenés una guardia en curso</AlertDialogTitle>
          <AlertDialogDescription>
            {startedAt ? logoutGuardDialogDescription(startedAt, canEndGuard) : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <AlertDialogFooter className="grid gap-2 sm:flex sm:flex-wrap sm:gap-2">
          <AlertDialogCancel
            disabled={pending}
            className="mt-0 h-auto min-h-11 whitespace-normal px-3 text-center leading-tight"
          >
            Cancelar
          </AlertDialogCancel>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={onLogout}
            className="h-auto min-h-11 whitespace-normal px-3 text-center leading-tight"
          >
            Salir sin terminar
          </Button>
          {canEndGuard && (
            <Button
              type="button"
              disabled={pending}
              onClick={onEndAndLogout}
              className="h-auto min-h-11 whitespace-normal bg-amber-700 px-3 text-center leading-tight text-white hover:bg-amber-800 focus-visible:ring-amber-600"
            >
              {pending ? "Terminando…" : "Terminar guardia y salir"}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
