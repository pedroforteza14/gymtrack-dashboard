import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { authMiddleware, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

router.get("/", async (_req: AuthRequest, res: Response): Promise<void> => {
  const now = new Date();
  const startOfMonth    = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth  = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

  const [
    monthlySales,
    lastMonthSales,
    totalProducts,
    lowStockProducts,
    recentSales,
    revenueByDay,
    topProducts,
  ] = await prisma.$transaction([
    prisma.sale.aggregate({
      where: { createdAt: { gte: startOfMonth } },
      _sum: { totalRevenue: true, totalProfit: true, totalCost: true },
      _count: true,
    }),
    prisma.sale.aggregate({
      where: { createdAt: { gte: startOfLastMonth, lte: endOfLastMonth } },
      _sum: { totalRevenue: true, totalProfit: true },
      _count: true,
    }),
    prisma.product.count({ where: { active: true } }),
    // PostgreSQL: identifiers case-sensitive → quoted
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM "Product"
      WHERE active = true AND stock <= "stockMinAlert"
    `,
    prisma.sale.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { items: { include: { product: { select: { name: true } } } } },
    }),
    // PostgreSQL interval syntax
    prisma.$queryRaw<{ day: string; revenue: number; profit: number }[]>`
      SELECT
        DATE("createdAt") as day,
        SUM("totalRevenue")  as revenue,
        SUM("totalProfit")   as profit
      FROM "Sale"
      WHERE "createdAt" >= NOW() - INTERVAL '30 days'
      GROUP BY DATE("createdAt")
      ORDER BY day ASC
    `,
    prisma.$queryRaw<{ productId: string; name: string; sku: string; totalQty: number; totalRevenue: number; totalProfit: number }[]>`
      SELECT
        si."productId",
        p.name,
        p.sku,
        SUM(si.quantity)    as "totalQty",
        SUM(si.subtotal)    as "totalRevenue",
        SUM(si.profit)      as "totalProfit"
      FROM "SaleItem" si
      JOIN "Product" p ON p.id = si."productId"
      JOIN "Sale"    s ON s.id = si."saleId"
      WHERE s."createdAt" >= ${startOfMonth}
      GROUP BY si."productId", p.name, p.sku
      ORDER BY "totalRevenue" DESC
      LIMIT 5
    `,
  ]);

  const lowCount = Number(lowStockProducts[0]?.count ?? 0);

  res.json({
    thisMonth: {
      revenue:    Number(monthlySales._sum.totalRevenue ?? 0),
      profit:     Number(monthlySales._sum.totalProfit  ?? 0),
      cost:       Number(monthlySales._sum.totalCost    ?? 0),
      salesCount: monthlySales._count,
      margin:
        monthlySales._sum.totalRevenue && Number(monthlySales._sum.totalRevenue) > 0
          ? (Number(monthlySales._sum.totalProfit ?? 0) / Number(monthlySales._sum.totalRevenue)) * 100
          : 0,
    },
    lastMonth: {
      revenue:    Number(lastMonthSales._sum.totalRevenue ?? 0),
      profit:     Number(lastMonthSales._sum.totalProfit  ?? 0),
      salesCount: lastMonthSales._count,
    },
    totalProducts,
    lowStockCount: lowCount,
    recentSales,
    revenueByDay: revenueByDay.map((r) => ({
      day:     String(r.day),
      revenue: Number(r.revenue),
      profit:  Number(r.profit),
    })),
    topProducts: topProducts.map((p) => ({
      productId:    p.productId,
      name:         p.name,
      sku:          p.sku,
      totalQty:     Number(p.totalQty),
      totalRevenue: Number(p.totalRevenue),
      totalProfit:  Number(p.totalProfit),
    })),
  });
});

export default router;
