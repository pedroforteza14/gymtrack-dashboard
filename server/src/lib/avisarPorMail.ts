/* ═══════════════════════════════════════════════════════════
   AVISOS POR MAIL (Resend)

   Se activa solo si están cargadas las variables de entorno.
   Si faltan, la app sigue funcionando igual: el aviso queda
   en la campanita y nada más.

   En Render hay que cargar:
     RESEND_API_KEY   la clave de resend.com
     AVISOS_PARA      a quién le llega (puede ser más de uno, separados por coma)
     AVISOS_DESDE     remitente verificado. Si no está, usa el de prueba de Resend.
   ═══════════════════════════════════════════════════════════ */

const API_KEY = process.env.RESEND_API_KEY ?? "";
const PARA = (process.env.AVISOS_PARA ?? "")
  .split(",").map((s) => s.trim()).filter(Boolean);
const DESDE = process.env.AVISOS_DESDE ?? "The Promise Machine <onboarding@resend.dev>";

export const mailConfigurado = () => !!API_KEY && PARA.length > 0;

const plata = (n: number) => "$" + Math.round(n).toLocaleString("es-AR");

function plantilla(opts: {
  titulo: string; lineas: [string, string][]; pie?: string; link?: string;
}): string {
  const filas = opts.lineas.map(([k, v]) => `
    <tr>
      <td style="padding:7px 0;color:#8a8a8a;font-size:13px">${k}</td>
      <td style="padding:7px 0;color:#141414;font-size:14px;font-weight:600;text-align:right">${v}</td>
    </tr>`).join("");

  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,sans-serif">
  <div style="max-width:480px;margin:28px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7">
    <div style="background:#0a0a0a;padding:18px 24px">
      <p style="margin:0;color:#fff;font-size:13px;letter-spacing:.18em;text-transform:uppercase">The Promise Machine</p>
    </div>
    <div style="padding:24px">
      <h1 style="margin:0 0 18px;font-size:19px;color:#141414">${opts.titulo}</h1>
      <table style="width:100%;border-collapse:collapse">${filas}</table>
      ${opts.link ? `<a href="${opts.link}" style="display:inline-block;margin-top:20px;background:#0a0a0a;color:#fff;padding:11px 22px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600">Ver en el panel</a>` : ""}
      ${opts.pie ? `<p style="margin:18px 0 0;color:#8a8a8a;font-size:12px;line-height:1.5">${opts.pie}</p>` : ""}
    </div>
  </div></body></html>`;
}

/** Manda un mail. Nunca lanza: un aviso que falla no debe romper la venta. */
async function enviar(asunto: string, html: string): Promise<boolean> {
  if (!mailConfigurado()) return false;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: DESDE, to: PARA, subject: asunto, html }),
    });
    if (!r.ok) {
      console.error("Resend rechazó el envío:", r.status, (await r.text()).slice(0, 200));
      return false;
    }
    return true;
  } catch (e) {
    console.error("No se pudo enviar el mail:", (e as Error).message);
    return false;
  }
}

/** Aviso de venta cargada por un vendedor. */
export async function mailVentaDeVendedor(d: {
  vendedor: string; saleNumber: string; cliente?: string | null;
  total: number; comision?: number | null; productos: string;
  cobrada: boolean;
}): Promise<boolean> {
  const lineas: [string, string][] = [
    ["Vendedora", d.vendedor],
    ["Venta", d.saleNumber],
    ["Cliente", d.cliente || "sin asignar"],
    ["Productos", d.productos],
    ["Total", plata(d.total)],
  ];
  if (d.comision) lineas.push(["Comisión", plata(d.comision)]);
  lineas.push(["Cobro", d.cobrada ? "Cobrada" : "Pendiente de cobro"]);

  return enviar(
    `${d.vendedor} cargó una venta de ${plata(d.total)}`,
    plantilla({
      titulo: "Nueva venta",
      lineas,
      link: (process.env.FRONTEND_URL ?? "") + "/sales",
      pie: d.comision
        ? "La comisión queda en proceso hasta que la venta esté cobrada."
        : "Esta venta no genera comisión.",
    })
  );
}

/** Aviso de que se anuló una venta cuya comisión ya se había pagado. */
export async function mailComisionAnulada(d: {
  saleNumber: string; total: number; comision: number; vendedor?: string | null;
}): Promise<boolean> {
  return enviar(
    `Se anuló ${d.saleNumber}: hay ${plata(d.comision)} de comisión a descontar`,
    plantilla({
      titulo: "Venta anulada con comisión pagada",
      lineas: [
        ["Venta", d.saleNumber],
        ["Vendedora", d.vendedor || "—"],
        ["Monto de la venta", plata(d.total)],
        ["Comisión a descontar", plata(d.comision)],
      ],
      link: (process.env.FRONTEND_URL ?? "") + "/comisiones",
      pie: "Descontalo de la próxima liquidación.",
    })
  );
}

/** Mail de prueba, para verificar la configuración desde el panel. */
export async function mailDePrueba(): Promise<boolean> {
  return enviar(
    "Prueba de avisos — The Promise Machine",
    plantilla({
      titulo: "Los avisos por mail están andando",
      lineas: [
        ["Estado", "Configurado"],
        ["Llega a", PARA.join(", ")],
      ],
      pie: "Vas a recibir un mail como este cada vez que un vendedor cargue una venta.",
    })
  );
}
