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
import { syncAllMetrics } from "./lib/syncMetrics";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());
app.use(cors({
  origin: (origin, cb) => cb(null, true),
  credentials: true,
}));
app.use(express.json());

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

app.get("/health", (_req, res) => res.json({ ok: true }));


// Sincronizar métricas cada hora
cron.schedule("0 * * * *", () => {
  syncAllMetrics().catch(console.error);
});

app.listen(PORT, () => {
  console.log(`GymTrack API running on http://localhost:${PORT}`);
});
