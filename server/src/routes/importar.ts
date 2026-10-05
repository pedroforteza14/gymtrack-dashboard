import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { cargarUsuario, soloDueño } from "../middleware/roles";

const router = Router();
router.use(authMiddleware);
router.use(cargarUsuario);
router.use(soloDueño);

/* ═══════════════════════════════════════════════════════════
   IMPORTACIÓN DE VENTAS HISTÓRICAS

   Pensado para traer la planilla de ventas al sistema. Cada fila
   trae fecha, producto, cliente, canal y monto.

   · Busca el producto por nombre; si no existe lo crea inactivo,
     para que no ensucie el catálogo de venta pero quede trazable.
   · Crea el cliente si no estaba.
   · Es idempotente: si se corre dos veces no duplica, porque marca
     cada venta importada con su origen en las notas.
   ═══════════════════════════════════════════════════════════ */

const MARCA = "[importado]";

const filaSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  producto: z.string().min(1),
  cliente: z.string().optional().nullable(),
  canal: z.enum(["WHATSAPP", "MERCADO_LIBRE", "TIENDA_NUBE", "LOCAL", "OTRO"]).optional().nullable(),
  monto: z.number(),
  referencia: z.string().min(1),      // identifica la fila para no duplicarla
  linea: z.string().optional().nullable(),   // familia, para agrupar en los rankings
});

function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}

router.post("/ventas", async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = z.object({
    filas: z.array(filaSchema).min(1).max(600),
    simular: z.boolean().optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const { filas, simular } = parsed.data;

  // Lo ya importado, para no repetir
  const previas = await prisma.sale.findMany({
    where: { notes: { contains: MARCA } },
    select: { notes: true },
  });
  const yaEstan = new Set(
    previas.map((p) => p.notes?.match(/\[importado:([^\]]+)\]/)?.[1]).filter(Boolean) as string[]
  );

  const productos = await prisma.product.findMany({ select: { id: true, name: true, sellPrice: true } });
  const indiceProd = new Map(productos.map((p) => [normalizar(p.name), p]));
  const clientes = await prisma.client.findMany({ select: { id: true, name: true } });
  const indiceCli = new Map(clientes.map((c) => [normalizar(c.name), c]));

  const resultado = { creadas: 0, salteadas: 0, productosNuevos: 0, clientesNuevos: 0, errores: [] as string[] };

  for (const f of filas) {
    if (yaEstan.has(f.referencia)) { resultado.salteadas++; continue; }
    if (f.monto <= 0) { resultado.salteadas++; continue; }   // devoluciones: se cargan aparte

    try {
      // ── producto ──
      const clave = normalizar(f.producto);
      let prod = indiceProd.get(clave);
      if (!prod) {
        // match parcial: el nombre de la planilla suele ser más largo
        const parcial = productos.find(
          (p) => clave.includes(normalizar(p.name)) || normalizar(p.name).includes(clave)
        );
        prod = parcial;
      }
      if (!prod) {
        if (simular) { resultado.productosNuevos++; }
        else {
          const creado = await prisma.product.create({
            data: {
              name: f.producto.slice(0, 120),
              sku: `IMP-${Date.now().toString(36)}-${resultado.creadas}`,
              costPrice: 0,
              sellPrice: f.monto,
              active: false,          // no se ofrece, pero queda registrado
              line: f.linea || "Importados",
            },
            select: { id: true, name: true, sellPrice: true },
          });
          prod = creado;
          productos.push(creado);
          indiceProd.set(normalizar(creado.name), creado);
          resultado.productosNuevos++;
        }
      }

      // ── cliente ──
      let cliId: string | undefined;
      if (f.cliente) {
        const ck = normalizar(f.cliente);
        let cli = indiceCli.get(ck);
        if (!cli && !simular) {
          cli = await prisma.client.create({
            data: { name: f.cliente.slice(0, 80) },
            select: { id: true, name: true },
          });
          indiceCli.set(ck, cli);
          resultado.clientesNuevos++;
        } else if (!cli) {
          resultado.clientesNuevos++;
        }
        cliId = cli?.id;
      }

      if (simular) { resultado.creadas++; continue; }

      // ── venta ──
      const count = await prisma.sale.count();
      await prisma.sale.create({
        data: {
          saleNumber: `VTA-${String(count + 1).padStart(5, "0")}`,
          notes: `${MARCA}:${f.referencia}]`.replace("]", "") + "]",
          createdAt: new Date(f.fecha + "T12:00:00"),
          totalCost: 0,
          totalRevenue: f.monto,
          totalProfit: f.monto,
          paymentStatus: "PAID",
          ...(f.canal ? { channel: f.canal } : {}),
          ...(cliId ? { clientId: cliId } : {}),
          items: {
            create: [{
              productId: prod!.id,
              quantity: 1,
              unitCost: 0,
              unitPrice: f.monto,
              subtotal: f.monto,
              profit: f.monto,
            }],
          },
        },
      });
      resultado.creadas++;
    } catch (e) {
      resultado.errores.push(`${f.referencia}: ${(e as Error).message.slice(0, 90)}`);
    }
  }

  res.json({ ...resultado, simulacion: !!simular });
});

/** Deshace una importación: borra todas las ventas marcadas como importadas. */
router.delete("/ventas", async (_req: AuthRequest, res: Response): Promise<void> => {
  const ventas = await prisma.sale.findMany({
    where: { notes: { contains: MARCA } },
    select: { id: true },
  });
  await prisma.$transaction([
    prisma.saleItem.deleteMany({ where: { saleId: { in: ventas.map((v) => v.id) } } }),
    prisma.sale.deleteMany({ where: { id: { in: ventas.map((v) => v.id) } } }),
  ]);
  res.json({ ok: true, borradas: ventas.length });
});

export default router;
