import { useEffect } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function isActionConfirmationCurrent(
  capturedTargetKey: string | null,
  currentTargetKey: string | null,
): boolean {
  return Boolean(capturedTargetKey && currentTargetKey && capturedTargetKey === currentTargetKey);
}

export function EfaActionConfirmation({
  open,
  onOpenChange,
  capturedTargetKey,
  currentTargetKey,
  title,
  description,
  confirmLabel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  capturedTargetKey: string | null;
  currentTargetKey: string | null;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: (targetKey: string) => void;
}) {
  const targetIsCurrent = isActionConfirmationCurrent(capturedTargetKey, currentTargetKey);

  useEffect(() => {
    if (open && !targetIsCurrent) onOpenChange(false);
  }, [onOpenChange, open, targetIsCurrent]);

  return (
    <AlertDialog open={open && targetIsCurrent} onOpenChange={onOpenChange}>
      <AlertDialogContent className="w-[calc(100%-2rem)] max-w-md gap-4 border-amber-500/60 p-4 sm:p-6">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="grid grid-cols-2 gap-2 sm:flex sm:gap-2">
          <AlertDialogCancel className="mt-0 h-auto min-h-11 min-w-0 whitespace-normal px-2 text-center leading-tight">
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            className="h-auto min-h-11 min-w-0 whitespace-normal bg-amber-700 px-2 text-center leading-tight text-white hover:bg-amber-800 focus-visible:ring-amber-600"
            onClick={() => {
              if (targetIsCurrent && capturedTargetKey) onConfirm(capturedTargetKey);
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
