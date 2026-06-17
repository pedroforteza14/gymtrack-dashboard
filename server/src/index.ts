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
import { syncAllMetrics } from "./lib/syncMetrics";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());
app.use(cors({ origin: /^http:\/\/localhost:\d+$/, credentials: true }));
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

app.get("/health", (_req, res) => res.json({ ok: true }));

// Sincronizar métricas cada hora
cron.schedule("0 * * * *", () => {
  syncAllMetrics().catch(console.error);
});

app.listen(PORT, () => {
  console.log(`GymTrack API running on http://localhost:${PORT}`);
});
