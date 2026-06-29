import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { authMiddleware, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

router.get("/owner", async (_req: AuthRequest, res: Response): Promise<void> => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    revenueByCategory,
    topClients,
    monthlyTrend,
    stockHealth,
    avgTicket,
    salesByDayOfWeek,
  ] = await Promise.all([
    prisma.$queryRaw<{ category: string; revenue: number; profit: number; qty: number }[]>`
      SELECT COALESCE(c.name, 'Sin categoría') as category,
        SUM(si.subtotal)::numeric as revenue,
        SUM(si.profit)::numeric as profit,
        SUM(si.quantity)::int as qty
      FROM "SaleItem" si
      JOIN "Product" p ON p.id = si."productId"
      LEFT JOIN "Category" c ON c.id = p."categoryId"
      JOIN "Sale" s ON s.id = si."saleId"
      WHERE s."createdAt" >= ${startOfMonth}
      GROUP BY c.name
      ORDER BY revenue DESC
    `,

    prisma.$queryRaw<{ id: string; name: string; revenue: number; salesCount: number }[]>`
      SELECT cl.id, cl.name,
        SUM(s."totalRevenue")::numeric as revenue,
        COUNT(s.id)::int as "salesCount"
      FROM "Sale" s
      JOIN "Client" cl ON cl.id = s."clientId"
      WHERE s."clientId" IS NOT NULL
      GROUP BY cl.id, cl.name
      ORDER BY revenue DESC
      LIMIT 5
    `,

    prisma.$queryRaw<{ month: Date; revenue: number; profit: number; count: number }[]>`
      SELECT DATE_TRUNC('month', "createdAt") as month,
        SUM("totalRevenue")::numeric as revenue,
        SUM("totalProfit")::numeric as profit,
        COUNT(*)::int as count
      FROM "Sale"
      WHERE "createdAt" >= NOW() - INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month', "createdAt")
      ORDER BY month ASC
    `,

    prisma.$queryRaw<{ sin_stock: number; stock_bajo: number; stock_ok: number }[]>`
      SELECT
        COUNT(*) FILTER (WHERE stock = 0)::int as sin_stock,
        COUNT(*) FILTER (WHERE stock > 0 AND stock <= "stockMinAlert")::int as stock_bajo,
        COUNT(*) FILTER (WHERE stock > "stockMinAlert")::int as stock_ok
      FROM "Product"
      WHERE active = true
    `,

    prisma.$queryRaw<{ avg: number; max: number; min: number; total: number }[]>`
      SELECT
        AVG("totalRevenue")::numeric as avg,
        MAX("totalRevenue")::numeric as max,
        MIN("totalRevenue")::numeric as min,
        COUNT(*)::int as total
      FROM "Sale"
      WHERE "createdAt" >= ${startOfMonth}
    `,

    prisma.$queryRaw<{ day: number; revenue: number; count: number }[]>`
      SELECT EXTRACT(DOW FROM "createdAt")::int as day,
        SUM("totalRevenue")::numeric as revenue,
        COUNT(*)::int as count
      FROM "Sale"
      WHERE "createdAt" >= NOW() - INTERVAL '3 months'
      GROUP BY EXTRACT(DOW FROM "createdAt")
      ORDER BY day
    `,
  ]);

  const dayNames = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

  res.json({
    revenueByCategory: revenueByCategory.map((r) => ({
      category: r.category,
      revenue: Number(r.revenue),
      profit: Number(r.profit),
      qty: Number(r.qty),
    })),
    topClients: topClients.map((c) => ({
      id: c.id,
      name: c.name,
      revenue: Number(c.revenue),
      salesCount: Number(c.salesCount),
    })),
    monthlyTrend: monthlyTrend.map((m) => ({
      month: new Date(m.month).toLocaleDateString("es-AR", { month: "short", year: "2-digit" }),
      revenue: Number(m.revenue),
      profit: Number(m.profit),
      count: Number(m.count),
    })),
    stockHealth: stockHealth[0] ? {
      sinStock: Number(stockHealth[0].sin_stock),
      stockBajo: Number(stockHealth[0].stock_bajo),
      stockOk: Number(stockHealth[0].stock_ok),
    } : { sinStock: 0, stockBajo: 0, stockOk: 0 },
    avgTicket: avgTicket[0] ? {
      avg: Number(avgTicket[0].avg ?? 0),
      max: Number(avgTicket[0].max ?? 0),
      min: Number(avgTicket[0].min ?? 0),
      total: Number(avgTicket[0].total ?? 0),
    } : { avg: 0, max: 0, min: 0, total: 0 },
    salesByDayOfWeek: salesByDayOfWeek.map((d) => ({
      day: dayNames[d.day] ?? `Día ${d.day}`,
      revenue: Number(d.revenue),
      count: Number(d.count),
    })),
  });
});

router.get("/marketing", async (_req: AuthRequest, res: Response): Promise<void> => {
  const [dailyMetrics, campaignPerformance, spendByAccount] = await Promise.all([
    prisma.$queryRaw<{ date: Date; spend: number; impressions: number; clicks: number; conversions: number }[]>`
      SELECT date,
        SUM(spend)::numeric as spend,
        SUM(impressions)::int as impressions,
        SUM(clicks)::int as clicks,
        SUM(conversions)::int as conversions
      FROM "AdMetrics"
      WHERE date >= NOW() - INTERVAL '30 days'
      GROUP BY date
      ORDER BY date ASC
    `,

    prisma.$queryRaw<{ name: string; status: string; spend: number; conversions: number; roas: number; ctr: number; impressions: number; clicks: number }[]>`
      SELECT c.name, c.status,
        SUM(m.spend)::numeric as spend,
        SUM(m.conversions)::int as conversions,
        CASE WHEN SUM(m.spend) > 0 THEN (SUM(m.conversions)::numeric / SUM(m.spend)::numeric) ELSE 0 END as roas,
        CASE WHEN SUM(m.impressions) > 0 THEN (SUM(m.clicks)::numeric / SUM(m.impressions)::numeric * 100) ELSE 0 END as ctr,
        SUM(m.impressions)::int as impressions,
        SUM(m.clicks)::int as clicks
      FROM "Campaign" c
      JOIN "AdMetrics" m ON m."campaignId" = c.id
      WHERE m.date >= NOW() - INTERVAL '30 days'
      GROUP BY c.id, c.name, c.status
      ORDER BY spend DESC
    `,

    prisma.$queryRaw<{ name: string; spend: number; conversions: number; campaigns: number }[]>`
      SELECT a.name,
        SUM(m.spend)::numeric as spend,
        SUM(m.conversions)::int as conversions,
        COUNT(DISTINCT c.id)::int as campaigns
      FROM "AdAccount" a
      JOIN "Campaign" c ON c."adAccountId" = a.id
      JOIN "AdMetrics" m ON m."campaignId" = c.id
      WHERE m.date >= NOW() - INTERVAL '30 days'
      GROUP BY a.id, a.name
      ORDER BY spend DESC
    `,
  ]);

  const totalImpressions = campaignPerformance.reduce((s, c) => s + Number(c.impressions), 0);
  const totalClicks = campaignPerformance.reduce((s, c) => s + Number(c.clicks), 0);
  const totalConversions = campaignPerformance.reduce((s, c) => s + Number(c.conversions), 0);

  res.json({
    dailyMetrics: dailyMetrics.map((d) => ({
      date: new Date(d.date).toLocaleDateString("es-AR", { day: "2-digit", month: "short" }),
      spend: Number(d.spend),
      impressions: Number(d.impressions),
      clicks: Number(d.clicks),
      conversions: Number(d.conversions),
    })),
    campaignPerformance: campaignPerformance.map((c) => ({
      name: c.name,
      status: c.status,
      spend: Number(c.spend),
      conversions: Number(c.conversions),
      roas: Number(Number(c.roas).toFixed(2)),
      ctr: Number(Number(c.ctr).toFixed(2)),
      impressions: Number(c.impressions),
      clicks: Number(c.clicks),
    })),
    spendByAccount: spendByAccount.map((a) => ({
      name: a.name,
      spend: Number(a.spend),
      conversions: Number(a.conversions),
      campaigns: Number(a.campaigns),
    })),
    funnel: {
      impressions: totalImpressions,
      clicks: totalClicks,
      conversions: totalConversions,
      ctr: totalImpressions > 0 ? Number(((totalClicks / totalImpressions) * 100).toFixed(2)) : 0,
      convRate: totalClicks > 0 ? Number(((totalConversions / totalClicks) * 100).toFixed(2)) : 0,
    },
  });
});

export default router;
