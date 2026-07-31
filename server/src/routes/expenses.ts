import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authMiddleware, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

const PAYMENT_SOURCES = ["VISA", "MASTER", "PAPA", "EFECTIVO_MP", "OTRO"] as const;

const expenseSchema = z.object({
  date: z.string(),
  concept: z.string().min(1),
  amount: z.number().positive(),
  paymentSource: z.enum(PAYMENT_SOURCES).default("EFECTIVO_MP"),
  category: z.string().optional(),
  notes: z.string().optional(),
});

// month = "YYYY-MM"; returns [start, endExclusive]
function monthRange(month?: string): { start: Date; end: Date } {
  const now = new Date();
  let year = now.getFullYear();
  let m = now.getMonth();
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, mm] = month.split("-").map(Number);
    year = y; m = mm - 1;
  }
  return { start: new Date(year, m, 1), end: new Date(year, m + 1, 1) };
}

// List expenses (optionally filtered by month)
router.get("/", async (req: AuthRequest, res: Response): Promise<void> => {
  const { month } = req.query as { month?: string };
  const where = month ? { date: { gte: monthRange(month).start, lt: monthRange(month).end } } : {};
  const expenses = await prisma.expense.findMany({ where, orderBy: { date: "desc" } });
  res.json(expenses);
});

// Monthly balance: ventas vs gastos, con desglose por medio de pago
router.get("/summary", async (req: AuthRequest, res: Response): Promise<void> => {
  const { month } = req.query as { month?: string };
  const { start, end } = monthRange(month);

  const [expenses, sales] = await Promise.all([
    prisma.expense.findMany({ where: { date: { gte: start, lt: end } } }),
    prisma.sale.findMany({ where: { createdAt: { gte: start, lt: end } }, select: { totalRevenue: true, totalProfit: true } }),
  ]);

  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const totalSales = sales.reduce((s, v) => s + Number(v.totalRevenue), 0);
  const salesProfit = sales.reduce((s, v) => s + Number(v.totalProfit), 0);

  const bySource: Record<string, number> = {};
  for (const src of PAYMENT_SOURCES) bySource[src] = 0;
  for (const e of expenses) bySource[e.paymentSource] = (bySource[e.paymentSource] ?? 0) + Number(e.amount);

  const byCategory: Record<string, number> = {};
  for (const e of expenses) {
    const cat = e.category?.trim() || "Sin categoría";
    byCategory[cat] = (byCategory[cat] ?? 0) + Number(e.amount);
  }

  res.json({
    totalSales,
    totalExpenses,
    salesProfit,
    balance: totalSales - totalExpenses,
    salesCount: sales.length,
    expensesCount: expenses.length,
    bySource,
    byCategory,
  });
});

router.post("/", async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = expenseSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const expense = await prisma.expense.create({
    data: { ...parsed.data, date: new Date(parsed.data.date) },
  });
  res.status(201).json(expense);
});

router.put("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = expenseSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.date) data.date = new Date(parsed.data.date);
  const expense = await prisma.expense.update({ where: { id: req.params.id }, data });
  res.json(expense);
});

router.delete("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  await prisma.expense.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

export default router;
