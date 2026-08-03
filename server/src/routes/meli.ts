import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import axios from "axios";

const router = Router();
const db = new PrismaClient();

const APP_ID = process.env.MELI_APP_ID!;
const CLIENT_SECRET = process.env.MELI_CLIENT_SECRET!;
const REDIRECT_URI = process.env.MELI_REDIRECT_URI!;
const FRONTEND_URL = process.env.FRONTEND_URL ?? "https://gymtrack-dashboard.vercel.app";

// Redirect to MELI OAuth
router.get("/auth", (_req, res) => {
  const url = `https://auth.mercadolibre.com.ar/authorization?response_type=code&client_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
  res.redirect(url);
});

// OAuth callback — exchange code for tokens
router.get("/callback", async (req, res) => {
  const { code } = req.query as { code?: string };
  if (!code) { res.status(400).send("Missing code"); return; }
  try {
    const { data } = await axios.post(
      "https://api.mercadolibre.com/oauth/token",
      new URLSearchParams({
        grant_type: "authorization_code",
        client_id: APP_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri: REDIRECT_URI,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );
    const expiresAt = new Date(Date.now() + data.expires_in * 1000);
    await db.meliToken.upsert({
      where: { meliUserId: String(data.user_id) },
      update: { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt },
      create: { meliUserId: String(data.user_id), accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt },
    });
    res.redirect(`${FRONTEND_URL}?meli=connected`);
  } catch (err) {
    console.error("MELI OAuth error:", err);
    res.redirect(`${FRONTEND_URL}?meli=error`);
  }
});

// Devuelve un access token válido, renovándolo si venció (los de MELI duran 6hs)
async function getValidAccessToken(tokenRecord: { meliUserId: string; accessToken: string; refreshToken: string; expiresAt: Date }): Promise<string> {
  if (tokenRecord.expiresAt.getTime() > Date.now() + 60_000) return tokenRecord.accessToken;
  const { data } = await axios.post(
    "https://api.mercadolibre.com/oauth/token",
    new URLSearchParams({
      grant_type: "refresh_token",
      client_id: APP_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: tokenRecord.refreshToken,
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);
  await db.meliToken.update({
    where: { meliUserId: tokenRecord.meliUserId },
    data: { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt },
  });
  return data.access_token;
}

// Webhook — receives order notifications from MELI
router.post("/webhook", async (req, res) => {
  res.sendStatus(200); // MELI requires immediate 200
  const { topic, resource, user_id } = req.body ?? {};
  if (topic !== "orders_v2" && topic !== "orders") return;
  try {
    const tokenRecord = await db.meliToken.findUnique({ where: { meliUserId: String(user_id) } });
    if (!tokenRecord) return;

    const accessToken = await getValidAccessToken(tokenRecord);
    const orderId = String(resource).replace(/^\/orders\//, "");
    const { data: order } = await axios.get(`https://api.mercadolibre.com/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (order.status !== "paid") return;

    const existing = await db.sale.findFirst({ where: { meliOrderId: String(order.id) } });
    if (existing) return;

    const items: { item: { title: string }; quantity: number }[] = order.order_items ?? [];
    const totalRevenue = Number(order.total_amount ?? 0);
    const notes = `MercadoLibre: ${items.map((i) => `${i.item.title} x${i.quantity}`).join(", ")}`;

    await db.sale.create({
      data: {
        saleNumber: `MELI-${order.id}`,
        meliOrderId: String(order.id),
        totalRevenue,
        totalCost: 0,
        totalProfit: totalRevenue,
        notes,
      },
    });
    console.log(`MELI order ${order.id} synced`);
  } catch (err) {
    console.error("MELI webhook error:", err);
  }
});

// Connection status
router.get("/status", async (_req, res) => {
  const token = await db.meliToken.findFirst();
  res.json({ connected: !!token, meliUserId: token?.meliUserId ?? null });
});

export default router;
