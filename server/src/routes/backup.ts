import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { authMiddleware, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

// Backup completo del negocio (sin datos sensibles: no incluye contraseñas ni tokens)
router.get("/", async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [
      products, categories, clients, sales, quotes, fichas, expenses, planos, employees,
    ] = await Promise.all([
      prisma.product.findMany({
        select: {
          id: true, name: true, sku: true, description: true, line: true, supplier: true,
          costPrice: true, sellPrice: true, stock: true, active: true,
          createdAt: true, category: { select: { name: true } },
        },
        orderBy: { name: "asc" },
      }),
      prisma.category.findMany({ select: { name: true }, orderBy: { name: "asc" } }),
      prisma.client.findMany({ orderBy: { name: "asc" } }),
      prisma.sale.findMany({
        include: {
          client: { select: { name: true } },
          items: { include: { product: { select: { name: true, sku: true } } } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.quote.findMany({
        include: {
          client: { select: { name: true } },
          items: { include: { product: { select: { name: true, sku: true } } } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.fichaPedido.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.expense.findMany({ orderBy: { date: "desc" } }),
      prisma.plano.findMany({
        select: {
          id: true, title: true, notes: true, status: true, fileName: true,
          createdAt: true, employee: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.employee.findMany({ where: { active: true }, select: { name: true, role: true } }),
    ]);

    res.json({
      generatedAt: new Date().toISOString(),
      negocio: "The Promise Machine",
      resumen: {
        productos: products.length,
        clientes: clients.length,
        ventas: sales.length,
        presupuestos: quotes.length,
        fichas: fichas.length,
        gastos: expenses.length,
        planos: planos.length,
        empleados: employees.length,
      },
      products, categories, clients, sales, quotes, fichas, expenses, planos, employees,
    });
  } catch (err) {
    console.error("Error generando backup:", err);
    res.status(500).json({ error: "No se pudo generar el backup" });
  }
});

export default router;
