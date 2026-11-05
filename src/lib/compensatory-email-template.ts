/** Format exact requested time without rounding fractional minutes into another duration. */
export function formatRequestedHours(minutes: number): string {
  if (!Number.isSafeInteger(minutes) || minutes <= 0) throw new Error("Invalid requested duration");
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} ${hours === 1 ? "hora" : "horas"}`;
  }
  if (minutes % 3 === 0) return `${String(minutes / 60).replace(".", ",")} horas`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

/** Presentation only: the persisted, reviewed text remains the source of every detail. */
export function renderResolutionEmailHtml(content: { subject: string; text: string }): string {
  const approved = /:\s*aprobada$/i.test(content.subject);
  const rejected = /:\s*rechazada$/i.test(content.subject);
  const title = approved ? "Solicitud aprobada" : rejected ? "Solicitud rechazada" : content.subject;
  const accent = rejected ? "#9b3434" : "#245354";
  const paragraphs = content.text.split(/\n\s*\n/).map((paragraph) => {
    const lines = paragraph.split("\n").map((line) => {
      const separator = line.indexOf(": ");
      return separator > 0
        ? `<strong>${escapeHtml(line.slice(0, separator + 1))}</strong>${escapeHtml(line.slice(separator + 1))}`
        : escapeHtml(line);
    }).join("<br>");
    return `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;overflow-wrap:anywhere;word-break:break-word;">${lines}</p>`;
  }).join("");
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(content.subject)}</title></head>
<body style="margin:0;padding:0;background-color:#f5f5ef;color:#243b3c;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;border-collapse:collapse;background-color:#ffffff;">
<tr><td bgcolor="#ff5500" style="padding:24px;background-color:#ff5500;background-image:linear-gradient(135deg,#ff5500,#ffb347);border-bottom:1px solid #dce5e1;">
<p style="margin:0 0 6px;font-size:22px;font-weight:bold;color:#1a1a1a;">SeLIAR</p>
<p style="margin:0;font-size:14px;line-height:1.5;color:#1a1a1a;">Coordinación de Enfermería</p></td></tr>
<tr><td bgcolor="#ffffff" style="padding:24px 24px 8px;">
<p style="margin:0 0 8px;font-size:13px;letter-spacing:1px;color:#5d7070;">RESOLUCIÓN DE COMPENSATORIO</p>
<h1 style="margin:0 0 24px;font-size:26px;line-height:1.3;color:${accent};overflow-wrap:anywhere;">${escapeHtml(title)}</h1>
${paragraphs}</td></tr>
<tr><td bgcolor="#ffffff" style="padding:16px 24px;border-top:1px solid #dce5e1;font-size:13px;line-height:1.6;color:#5d7070;">Coordinación de Enfermería · SeLIAR<br>Ante cualquier inconveniente comunicate con la coordinación: <a href="https://wa.me/5493425235985" style="color:#245354;font-weight:bold;text-decoration:underline;">+54 9 342 523-5985</a></td></tr>
</table></td></tr></table></body></html>`;
}
