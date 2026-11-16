import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CompensatoryOperationalWorkspace,
  getRequestEmailPromotionAttempt,
  type OperationalWorkspaceData,
} from "./CompensatoryOperationalWorkspace";
import { CompensatoryBankPanel } from "./CompensatoryBankPanel";

describe("CompensatoryOperationalWorkspace", () => {
  it("offers a consolidated export independently of the selected agent", () => {
    const html = renderToStaticMarkup(<CompensatoryOperationalWorkspace initialStaff={[]} />);
    expect(html).toContain("Exportar horas");
    expect(html).toContain("Herramientas");
    expect(html).toContain("Cargar solicitud");
  });
  it("removes an expired unresolved request from pending and keeps its history read-only", () => {
    const initialWorkspace = {
      serviceDay: "2026-11-05", staff: [], audits: [],
      requests: [{ id: "expired", staffId: "staff-one", requesterName: "Expired Synthetic Agent", requestedDate: "2026-11-04", requestedMinutes: 120, compensatoryDate: "2026-11-04", hours: "2", phase: "pending", createdAt: "2026-11-03T12:00:00Z" }],
    } as unknown as OperationalWorkspaceData;
    const html = renderToStaticMarkup(<CompensatoryOperationalWorkspace initialStaff={[]} initialWorkspace={initialWorkspace} />);
    expect(html).toContain("No hay solicitudes pendientes de decisión.");
    expect(html).toContain("Sin resolución · Fecha vencida");
    expect(html).toContain("Expired Synthetic Agent");
    expect(initialWorkspace.requests[0]?.phase).toBe("pending");
  });
  it("keeps coverage management separate from approval and hours entry", () => {
    const html = renderToStaticMarkup(
      <CompensatoryOperationalWorkspace
        initialStaff={[]}
        initialWorkspace={
          {
            serviceDay: "2026-10-30",
            staff: [],
            audits: [],
            requests: [
              {
                id: "coverage-request",
                staffId: "staff-one",
                phase: "approved",
                requestedDate: "2026-11-02",
                requestedMinutes: 120,
                requesterName: "Synthetic Agent",
                compensatoryDate: "2026-11-02",
                hours: "2",
                createdAt: "2026-10-30T12:00:00Z",
              },
            ],
          } as unknown as OperationalWorkspaceData
        }
      />,
    );
    expect(html).toContain("Registrar quién cubre");
    expect(html).toContain("Sin modificar aprobación ni saldo");
  });
  it("offers a distinct administrative request action in the pending workspace", () => {
    const html = renderToStaticMarkup(<CompensatoryOperationalWorkspace initialStaff={[]} />);
    expect(html).toContain("Cargar solicitud");
    expect(html).toContain("Registrar un pedido recibido por otro medio");
  });
  it("keeps agent hours history on the main history tab instead of a separate ledger tool", () => {
    const html = renderToStaticMarkup(<CompensatoryOperationalWorkspace initialStaff={[]} />);
    expect(html).toContain("Selecciona un agente para consultar sus períodos y movimientos");
    expect(html).not.toContain("Movimientos del agente");
  });
  it("renders compact navigation without duplicating the page title", () => {
    const html = renderToStaticMarkup(<CompensatoryOperationalWorkspace initialStaff={[]} />);
    expect(html).toContain('aria-label="Actualizar solicitudes"');
    expect(html).toContain('role="tablist"');
    expect(html).toContain("Pendientes");
    expect(html).toContain("Programados");
    expect(html).toContain("Historial");
    expect(html).not.toContain(">Compensatorios</h");
    expect(html).not.toContain("Aprobar solicitud");
  });
  it("shows public contact email as unverified in the authenticated request workspace", () => {
    const initialWorkspace = {
      serviceDay: "2026-10-30",
      timeZone: "America/Argentina/Buenos_Aires",
      staff: [],
      audits: [],
      requests: [
        {
          id: "request-public",
          staffId: "staff-one",
          requesterName: "Synthetic Agent",
          requesterEmail: "contact@example.org",
          requesterEmailVerifiedAt: null,
          submissionSource: "public",
          requesterMobile: "+54 11 1234-5678",
          submittedAt: "2026-10-30T12:00:00.000Z",
          compensatoryDate: "2026-10-30",
          hours: "2",
          phase: "pending",
          requestedDate: null,
          requestedMinutes: null,
          version: 1,
          classifiedAt: null,
          classifiedByUserId: null,
          decisionAt: null,
          decisionByUserId: null,
          decisionReason: null,
          cancelledAt: null,
          cancellationByUserId: null,
          cancellationReason: null,
          consumedAt: null,
          consumptionLedgerId: null,
          createdByUserId: null,
          clientOperationId: "operation-public",
          createdAt: "2026-10-30T12:00:00.000Z",
        },
      ],
    } as unknown as OperationalWorkspaceData;
    const html = renderToStaticMarkup(
      <CompensatoryOperationalWorkspace initialStaff={[]} initialWorkspace={initialWorkspace} />,
    );
    expect(html).toContain("contact@example.org");
    expect(html).toContain("Correo sin verificar");
  });
  it("retries a lost response with the exact frozen profile-promotion operation", async () => {
    const first = getRequestEmailPromotionAttempt(null, {
      requestId: "request-public", expectedVersion: 4, reason: "Reviewed explicitly",
    }, () => "stable-operation");
    const accepted = new Map<string, string>();
    const sent: typeof first[] = [];
    let loseFirstResponse = true;
    const write = async (payload: typeof first) => {
      sent.push(payload);
      if (accepted.has(payload.clientOperationId)) return { id: accepted.get(payload.clientOperationId)! };
      accepted.set(payload.clientOperationId, "staff-one");
      if (loseFirstResponse) {
        loseFirstResponse = false;
        throw new Error("response lost after commit");
      }
      return { id: "staff-one" };
    };

    await expect(write(first)).rejects.toThrow("response lost after commit");
    const retry = getRequestEmailPromotionAttempt(first, {
      requestId: "request-public", expectedVersion: 99, reason: "Changed payload",
    }, () => "must-not-be-used");
    await expect(write(retry)).resolves.toEqual({ id: "staff-one" });
    expect(retry).toBe(first);
    expect(sent[1]).toEqual(sent[0]);
    expect(accepted.size).toBe(1);
  });
  it("keeps the existing movement form isolated from unrelated agent actions", () => {
    const html = renderToStaticMarkup(
      <CompensatoryBankPanel
        initialStaff={[
          {
            id: "staff-one",
            dni: "00000001",
            name: "Synthetic Agent",
            email: null,
            isActive: true,
            balanceMinutes: 120,
            monthlyLimitMinutes: 1440,
            version: 1,
            createdAt: "2026-10-01",
          },
        ]}
        initialSelectedId="staff-one"
        tool="movement"
      />,
    );
    expect(html).toContain("movement-kind");
    expect(html).not.toContain("new-dni");
    expect(html).not.toContain("profile-name");
    expect(html).not.toContain('id="staff-select"');
    expect(html).not.toContain(">Compensatorios</h");
  });
  it("retains the standalone import workflow without the old bank navigation", () => {
    const html = renderToStaticMarkup(<CompensatoryBankPanel initialStaff={[]} tool="import" />);
    expect(html).toContain("source-requests");
    expect(html).toContain("source-roster");
    expect(html).not.toContain("movement-kind");
    expect(html).not.toContain(">Compensatorios</h");
  });
});
