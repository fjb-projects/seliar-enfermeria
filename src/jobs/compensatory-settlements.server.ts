import {
  closeCompensatoryLifecycleDatabase,
  compensatoryLifecycle,
} from "../lib/compensatory-lifecycle.server.db";

export interface CompensatorySettlementService {
  processDue(): Promise<{ consumed: number }>;
}
export type SettlementClock = {
  now(): Date;
  sleep(milliseconds: number, signal?: AbortSignal): Promise<void>;
};
const systemClock: SettlementClock = {
  now: () => new Date(),
  sleep: (milliseconds, signal) =>
    new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(signal.reason ?? new Error("Settlement watch stopped."));
      const onAbort = () => {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", onAbort);
        reject(signal?.reason ?? new Error("Settlement watch stopped."));
      };
      const timeout = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      }, milliseconds);
      signal?.addEventListener("abort", onAbort, { once: true });
    }),
};

export async function runCompensatorySettlementPass(service: CompensatorySettlementService) {
  return service.processDue();
}

export async function runDueCompensatorySettlements() {
  return runCompensatorySettlementPass(compensatoryLifecycle);
}

export async function closeCompensatorySettlementDatabase() {
  await closeCompensatoryLifecycleDatabase();
}

export async function watchCompensatorySettlements(
  service: CompensatorySettlementService,
  options: { clock?: SettlementClock; signal?: AbortSignal } = {},
) {
  const clock = options.clock ?? systemClock;
  while (!options.signal?.aborted) {
    await runCompensatorySettlementPass(service);
    const now = clock.now();
    const wait = 60_000 - (now.getSeconds() * 1_000 + now.getMilliseconds()) + 25;
    await clock.sleep(wait, options.signal);
  }
}
