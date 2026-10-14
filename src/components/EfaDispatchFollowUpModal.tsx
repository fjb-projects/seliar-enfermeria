import { useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Server-side limit for a follow-up note (see `addEfaDispatchContactAttempt`). */
export const FOLLOW_UP_NOTE_MAX_LENGTH = 1000;

export type FollowUpTimeMode = "now" | "manual";

/** The follow-up entry point exists only for an editable, non-cancelled selected dispatch. */
// eslint-disable-next-line react-refresh/only-export-components -- Pure helper exported for deterministic tests.
export function followUpButtonState(input: {
  hasDispatch: boolean;
  canEdit: boolean;
  cancelled: boolean;
  busy: boolean;
}): "hidden" | "disabled" | "enabled" {
  if (!input.hasDispatch || !input.canEdit || input.cancelled) return "hidden";
  return input.busy ? "disabled" : "enabled";
}

// eslint-disable-next-line react-refresh/only-export-components -- Pure helper exported for deterministic tests.
export function isFollowUpTimeValid(value: string) {
  if (!value) return false;
  return Number.isFinite(new Date(value).getTime());
}

// eslint-disable-next-line react-refresh/only-export-components -- Pure helper exported for deterministic tests.
export function canSaveFollowUp(input: { busy: boolean; mode: FollowUpTimeMode; at: string }) {
  if (input.busy) return false;
  return input.mode === "now" || isFollowUpTimeValid(input.at);
}

export function FollowUpOpenButton({
  disabled,
  onClick,
}: {
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex min-h-11 items-center gap-2 rounded border-2 border-primary bg-accent px-3 text-sm font-semibold text-accent-foreground shadow-sm hover:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <MessageSquarePlus aria-hidden="true" className="size-4 shrink-0" />
      Comunicaciones de seguimiento
    </button>
  );
}

export function FollowUpNoteField({
  note,
  onNoteChange,
}: {
  note: string;
  onNoteChange: (value: string) => void;
}) {
  return (
    <label className="block">
      Nota del seguimiento
      <textarea
        rows={3}
        maxLength={FOLLOW_UP_NOTE_MAX_LENGTH}
        className="mt-1 w-full min-w-0 max-w-full rounded border px-3 py-2"
        value={note}
        onChange={(event) => onNoteChange(event.target.value)}
      />
      <span className="block text-right text-xs text-muted-foreground">
        {note.length}/{FOLLOW_UP_NOTE_MAX_LENGTH}
      </span>
    </label>
  );
}

export function FollowUpTimeField({
  at,
  onAtChange,
  label = "Hora de la novedad",
}: {
  at: string;
  onAtChange: (value: string) => void;
  label?: string;
}) {
  return (
    <label className="block">
      {label}
      <input
        type="datetime-local"
        step="0.001"
        className="mt-1 h-11 w-full min-w-0 max-w-full rounded border px-3"
        value={at}
        onChange={(event) => onAtChange(event.target.value)}
      />
    </label>
  );
}

export function FollowUpFeedback({
  error,
  message,
}: {
  error: string | null;
  message: string | null;
}) {
  return (
    <>
      {error && (
        <p role="alert" className="text-sm text-destructive" aria-live="assertive">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm" aria-live="polite">
          {message}
        </p>
      )}
    </>
  );
}

type FollowUpFormProps = {
  busy: boolean;
  note: string;
  at: string;
  onNoteChange: (value: string) => void;
  onAtChange: (value: string) => void;
  onRegisterNow: () => void;
  onRegisterAt: () => void;
  error: string | null;
  message: string | null;
};

/** Body of the modal; kept separate so the markup can be rendered without a portal. */
export function FollowUpModalForm({
  busy,
  note,
  at,
  onNoteChange,
  onAtChange,
  onRegisterNow,
  onRegisterAt,
  onCancel,
  error,
  message,
}: FollowUpFormProps & { onCancel: () => void }) {
  const [mode, setMode] = useState<FollowUpTimeMode>("now");
  const canSave = canSaveFollowUp({ busy, mode, at });
  return (
    <form
      className="min-w-0 space-y-3"
      aria-busy={busy}
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSave) return;
        if (mode === "now") onRegisterNow();
        else onRegisterAt();
      }}
    >
      <FollowUpNoteField note={note} onNoteChange={onNoteChange} />
      <fieldset className="min-w-0 space-y-1">
        <legend className="font-medium">Hora de la novedad</legend>
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="radio"
            name="follow-up-time-mode"
            checked={mode === "now"}
            onChange={() => setMode("now")}
          />
          Ahora
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="radio"
            name="follow-up-time-mode"
            checked={mode === "manual"}
            onChange={() => setMode("manual")}
          />
          Otra hora
        </label>
        {mode === "manual" && (
          <FollowUpTimeField at={at} onAtChange={onAtChange} label="Fecha y hora de la novedad" />
        )}
      </fieldset>
      <FollowUpFeedback error={error} message={message} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          className="min-h-11 rounded border px-4"
          disabled={busy}
          onClick={onCancel}
        >
          Cancelar
        </button>
        <button
          type="submit"
          className="min-h-11 rounded border border-primary bg-primary px-4 font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!canSave}
        >
          {busy ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </form>
  );
}

export function DispatchFollowUpModal({
  open,
  onOpenChange,
  ...form
}: FollowUpFormProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Keep the dialog (and its feedback) visible while a save is in flight.
        if (!next && form.busy) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-lg p-4 sm:p-6">
        <DialogHeader className="pr-10">
          <DialogTitle>Comunicaciones de seguimiento</DialogTitle>
          <DialogDescription>
            Registro de contactos y novedades con el móvil, con hora y nota.
          </DialogDescription>
        </DialogHeader>
        <FollowUpModalForm {...form} onCancel={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
