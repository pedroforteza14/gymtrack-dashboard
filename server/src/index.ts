import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cron from "node-cron";
import authRouter from "./routes/auth";
import productsRouter from "./routes/products";
import salesRouter from "./routes/sales";
import stockRouter from "./routes/stock";
import dashboardRouter from "./routes/dashboard";
import clientsRouter from "./routes/clients";
import quotesRouter from "./routes/quotes";
import adAccountsRouter from "./routes/adAccounts";
import campaignsRouter from "./routes/campaigns";
import analyticsRouter from "./routes/analytics";
import meliRouter from "./routes/meli";
import purchaseOrdersRouter from "./routes/purchaseOrders";
import googleAdsRouter from "./routes/googleAds";
import expensesRouter from "./routes/expenses";
import planosRouter from "./routes/planos";
import fichasRouter from "./routes/fichas";
import { syncAllMetrics } from "./lib/syncMetrics";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({
  origin: (origin, cb) => cb(null, true),
  credentials: true,
}));
app.use(express.json({ limit: "10mb" }));

app.use("/api/auth", authRouter);
app.use("/api/products", productsRouter);
app.use("/api/sales", salesRouter);
app.use("/api/stock", stockRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/clients", clientsRouter);
app.use("/api/quotes", quotesRouter);
app.use("/api/ad-accounts", adAccountsRouter);
app.use("/api/campaigns", campaignsRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/integrations/meli", meliRouter);
app.use("/api/purchase-orders", purchaseOrdersRouter);
app.use("/api/integrations/google-ads", googleAdsRouter);
app.use("/api/expenses", expensesRouter);
app.use("/api/planos", planosRouter);
app.use("/api/fichas", fichasRouter);

app.get("/health", (_req, res) => res.json({ ok: true }));

// ── Importación temporal del catálogo desde la tienda (protegido por secreto) ──
const CATEGORY_KEYWORDS: [RegExp, string][] = [
  [/banco/i, "Bancos"],
  [/rack|smith/i, "Racks"],
  [/dorsalera|polea/i, "Dorsaleras"],
  [/pino|porta ?barra/i, "Pinos"],
  [/mancuern/i, "Mancuernas"],
  [/prensa|sentadilla|hip ?thrust|femoral|isquio|sill[oó]n|cu[aá]driceps|b[uú]lgara|sissy|gemelo/i, "Piernas"],
  [/remo|peck|espalda/i, "Espalda"],
  [/barra/i, "Barras"],
  [/disco/i, "Discos"],
  [/placa|piso|caucho/i, "Pisos"],
  [/soga|tr[ií]ceps/i, "Tríceps"],
];
function inferCategory(name: string): string | null {
  for (const [re, cat] of CATEGORY_KEYWORDS) if (re.test(name)) return cat;
  return null;
}

app.post("/admin-import-catalog", async (req, res) => {
  if (req.query.secret !== "tpm-import-2026") { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    const axios = (await import("axios")).default;
    const { PrismaClient } = await import("@prisma/client");
    const db = new PrismaClient();
    const catalog: { name: string; sku: string; price: number; imgUrl: string; line: string | null; category: string | null }[] = req.body.catalog ?? [];
    const reset = req.query.reset === "1";

    if (reset) {
      await db.priceHistory.deleteMany({});
      await db.stockMovement.deleteMany({});
      await db.saleItem.deleteMany({});
      await db.quoteItem.deleteMany({});
      await db.purchaseOrderItem.deleteMany({});
      await db.sale.deleteMany({});
      await db.quote.deleteMany({});
      await db.purchaseOrder.deleteMany({});
      await db.product.deleteMany({});
    }

    const catCache: Record<string, string> = {};
    const ensureCat = async (name: string | null): Promise<string | null> => {
      if (!name) return null;
      if (catCache[name]) return catCache[name];
      const c = await db.category.upsert({ where: { name }, update: {}, create: { name } });
      catCache[name] = c.id;
      return c.id;
    };

    let created = 0, withImg = 0;
    const errs: string[] = [];
    for (const p of catalog) {
      let imageData: string | null = null, imageType: string | null = null, imageName: string | null = null;
      try {
        if (p.imgUrl) {
          const r = await axios.get<ArrayBuffer>(p.imgUrl, { responseType: "arraybuffer", timeout: 25000 });
          imageData = Buffer.from(r.data).toString("base64");
          imageType = (r.headers["content-type"] as string) || "image/webp";
          imageName = `${p.sku}.webp`;
          withImg++;
        }
      } catch { errs.push(`${p.sku}:img`); }
      const categoryId = await ensureCat(p.category || inferCategory(p.name));
      await db.product.create({
        data: { name: p.name, sku: p.sku, sellPrice: p.price, costPrice: 0, line: p.line || null, categoryId, imageData, imageType, imageName, stock: 0, stockMinAlert: 2, active: true },
      });
      created++;
    }
    await db.$disconnect();
    res.json({ ok: true, reset, created, withImg, errs });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});


// Sincronizar métricas cada hora
cron.schedule("0 * * * *", () => {
  syncAllMetrics().catch(console.error);
});

app.listen(PORT, () => {
  console.log(`GymTrack API running on http://localhost:${PORT}`);
});
