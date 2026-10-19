export type EfaGuardMobileBase = { id: string; name: string; isActive: boolean };
export type EfaGuardMobileMembership<TBase extends EfaGuardMobileBase> = {
  id: string;
  version: number;
  bases: TBase[];
};

type MembershipIntent = {
  baseId: string;
  selected: boolean;
  resolve: (confirmed: boolean) => void;
};

export type EfaGuardMobileWorkspaceSnapshot<
  TGuard extends EfaGuardMobileMembership<TBase>,
  TBase extends EfaGuardMobileBase,
> = {
  confirmedGuard: TGuard;
  requestedBaseIds: string[];
  pendingBaseIds: string[];
  errors: Record<string, string>;
  unresolved: boolean;
  synchronizing: boolean;
  pendingMembership: boolean;
  arrivalPendingKeys: string[];
  closing: boolean;
  canChangeBases: boolean;
  canCapture: boolean;
  canClose: boolean;
};

export function sortGuardMobileBases<TBase extends EfaGuardMobileBase>(bases: readonly TBase[]) {
  const collator = new Intl.Collator("es", { numeric: true, sensitivity: "base" });
  return [...bases].sort(
    (left, right) => collator.compare(left.name, right.name) || compareIds(left.id, right.id),
  );
}

function compareIds(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sameIds(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function hasMembership(bases: readonly EfaGuardMobileBase[], ids: readonly string[]) {
  const actual = new Set(bases.map((base) => base.id));
  return actual.size === ids.length && ids.every((id) => actual.has(id));
}

export function createEfaGuardMobileWorkspace<
  TBase extends EfaGuardMobileBase,
  TGuard extends EfaGuardMobileMembership<TBase>,
  TArrival,
>({
  initialGuard,
  writeMembership,
  readGuard,
  readArrivals,
  isCurrent,
  onGuardConfirmed,
  onArrivalsConfirmed,
}: {
  initialGuard: TGuard;
  writeMembership: (input: {
    guardId: string;
    expectedVersion: number;
    baseIds: string[];
  }) => Promise<TGuard>;
  readGuard: (guardId: string) => Promise<TGuard | null>;
  readArrivals: (guardId: string) => Promise<TArrival[]>;
  isCurrent: (guardId: string) => boolean;
  onGuardConfirmed: (guard: TGuard) => void;
  onArrivalsConfirmed: (guardId: string, arrivals: TArrival[]) => void;
}) {
  const guardId = initialGuard.id;
  let confirmedGuard = initialGuard;
  const intents: MembershipIntent[] = [];
  const arrivalKeys = new Set<string>();
  const errors: Record<string, string> = {};
  const listeners = new Set<() => void>();
  let processing = false;
  let reconciling = false;
  let closing = false;
  let unresolved = false;
  let disposed = false;

  function current() {
    if (disposed) return false;
    try {
      return isCurrent(guardId);
    } catch {
      return false;
    }
  }

  function requestedBaseIds() {
    const selected = new Set(confirmedGuard.bases.map((base) => base.id));
    for (const intent of intents) {
      if (intent.selected) selected.add(intent.baseId);
      else selected.delete(intent.baseId);
    }
    return [...selected];
  }

  function canChangeBases() {
    return current() && !reconciling && !unresolved && !closing && arrivalKeys.size === 0;
  }

  function canCapture() {
    return (
      current() && !processing && intents.length === 0 && !reconciling && !unresolved && !closing
    );
  }

  function canClose() {
    return canCapture() && arrivalKeys.size === 0;
  }

  function snapshot(): EfaGuardMobileWorkspaceSnapshot<TGuard, TBase> {
    return {
      confirmedGuard,
      requestedBaseIds: requestedBaseIds(),
      pendingBaseIds: [...new Set(intents.map((intent) => intent.baseId))],
      errors: { ...errors },
      unresolved,
      synchronizing: reconciling,
      pendingMembership: processing || intents.length > 0,
      arrivalPendingKeys: [...arrivalKeys],
      closing,
      canChangeBases: canChangeBases(),
      canCapture: canCapture(),
      canClose: canClose(),
    };
  }

  function publish() {
    for (const listener of listeners) listener();
  }

  async function reconcileReads() {
    const [guardResult, arrivalsResult] = await Promise.allSettled([
      readGuard(guardId),
      readArrivals(guardId),
    ]);
    if (!current()) return false;

    const hasGuard =
      guardResult.status === "fulfilled" &&
      guardResult.value !== null &&
      guardResult.value.id === guardId;
    if (hasGuard && guardResult.status === "fulfilled" && guardResult.value) {
      confirmedGuard = guardResult.value;
      onGuardConfirmed(confirmedGuard);
    }
    if (hasGuard && arrivalsResult.status === "fulfilled")
      onArrivalsConfirmed(guardId, arrivalsResult.value);
    return hasGuard && arrivalsResult.status === "fulfilled";
  }

  async function applyIntent(intent: MembershipIntent) {
    const expectedGuard = confirmedGuard;
    const target = new Set(expectedGuard.bases.map((base) => base.id));
    if (intent.selected) target.add(intent.baseId);
    else target.delete(intent.baseId);
    const baseIds = [...target];
    const priorIds = expectedGuard.bases.map((base) => base.id);
    if (sameIds(baseIds, priorIds)) {
      delete errors[intent.baseId];
      return true;
    }

    try {
      const acknowledged = await writeMembership({
        guardId,
        expectedVersion: expectedGuard.version,
        baseIds,
      });
      if (!current()) return false;
      if (
        acknowledged.id !== guardId ||
        acknowledged.version < expectedGuard.version ||
        (acknowledged.version === expectedGuard.version &&
          !hasMembership(expectedGuard.bases, baseIds)) ||
        !hasMembership(acknowledged.bases, baseIds)
      ) {
        throw new Error("invalid-membership-acknowledgement");
      }
      confirmedGuard = acknowledged;
      onGuardConfirmed(acknowledged);
      try {
        const arrivals = await readArrivals(guardId);
        if (!current()) return false;
        onArrivalsConfirmed(guardId, arrivals);
        delete errors[intent.baseId];
        return true;
      } catch {
        if (!current()) return false;
        unresolved = true;
        errors[intent.baseId] =
          "El móvil se guardó, pero no se pudieron sincronizar sus ingresos. Reintentá la sincronización.";
        return false;
      }
    } catch {
      if (!current()) return false;
      errors[intent.baseId] =
        "No se pudo confirmar el cambio de móvil; se verificará el estado guardado.";
      const reconciled = await reconcileReads();
      if (!reconciled && current()) {
        unresolved = true;
        errors[intent.baseId] =
          "No se pudo confirmar ni sincronizar el móvil. Reintentá la sincronización.";
        return false;
      }
      if (hasMembership(confirmedGuard.bases, baseIds)) {
        delete errors[intent.baseId];
        return true;
      }
      errors[intent.baseId] = "El cambio no se guardó; se restauró la selección confirmada.";
      return false;
    }
  }

  function drain() {
    if (processing || disposed || unresolved || !intents.length) return;
    processing = true;
    publish();
    void (async () => {
      while (intents.length && !unresolved && current()) {
        const intent = intents[0]!;
        const result = await applyIntent(intent);
        intents.shift();
        intent.resolve(result);
        publish();
      }
      processing = false;
      publish();
    })();
  }

  function requestBaseSelection(baseId: string, selected: boolean) {
    if (!canChangeBases()) {
      errors[baseId] = "Esperá a que termine la sincronización o la operación del móvil.";
      publish();
      return Promise.resolve(false);
    }
    const selectedBase = confirmedGuard.bases.find((base) => base.id === baseId);
    if (selected && selectedBase && !selectedBase.isActive) {
      errors[baseId] = "Este móvil ya no está activo y no se puede volver a seleccionar.";
      publish();
      return Promise.resolve(false);
    }
    const selectedNow = requestedBaseIds().includes(baseId);
    if (selectedNow === selected) return Promise.resolve(true);

    const operation = new Promise<boolean>((resolve) => {
      intents.push({ baseId, selected, resolve });
    });
    delete errors[baseId];
    publish();
    drain();
    return operation;
  }

  function beginArrival(key: string) {
    if (!canCapture() || arrivalKeys.has(key)) return null;
    arrivalKeys.add(key);
    publish();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      arrivalKeys.delete(key);
      publish();
    };
  }

  function beginClose() {
    if (!canClose()) return null;
    closing = true;
    publish();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      closing = false;
      publish();
    };
  }

  async function reconcile() {
    if (!current() || reconciling) return false;
    reconciling = true;
    publish();
    try {
      const reconciled = await reconcileReads();
      if (reconciled && current()) {
        unresolved = false;
        for (const key of Object.keys(errors)) delete errors[key];
      } else if (current()) {
        unresolved = true;
      }
      return reconciled;
    } catch {
      if (current()) unresolved = true;
      return false;
    } finally {
      reconciling = false;
      publish();
      if (!unresolved) drain();
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    while (intents.length) intents.shift()!.resolve(false);
    listeners.clear();
  }

  return {
    getSnapshot: snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    requestBaseSelection,
    beginArrival,
    beginClose,
    reconcile,
    dispose,
  };
}
