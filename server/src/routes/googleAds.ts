import { Router } from "express";
import { prisma } from "../lib/prisma";
import { authMiddleware } from "../middleware/auth";
import axios from "axios";

const router = Router();
router.use(authMiddleware);

const CLIENT_ID = process.env.GOOGLE_ADS_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.GOOGLE_ADS_CLIENT_SECRET ?? "";
const REDIRECT_URI = process.env.GOOGLE_ADS_REDIRECT_URI ?? "";
const DEVELOPER_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "";
const FRONTEND_URL = process.env.FRONTEND_URL ?? "https://gymtrack-dashboard.vercel.app";

router.get("/auth", (_req, res) => {
  const scopes = "https://www.googleapis.com/auth/adwords";
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(scopes)}&access_type=offline&prompt=consent`;
  res.redirect(url);
});

router.get("/callback", async (req, res) => {
  const { code } = req.query as { code?: string };
  if (!code) { res.status(400).send("Missing code"); return; }
  try {
    const { data } = await axios.post("https://oauth2.googleapis.com/token", {
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    });

    // Get customer ID from Google Ads API
    const { data: cusData } = await axios.get(
      "https://googleads.googleapis.com/v16/customers:listAccessibleCustomers",
      { headers: { Authorization: `Bearer ${data.access_token}`, "developer-token": DEVELOPER_TOKEN } }
    );
    const customerId = (cusData.resourceNames?.[0] ?? "").replace("customers/", "");
    if (!customerId) throw new Error("No customer found");

    const expiresAt = new Date(Date.now() + data.expires_in * 1000);
    await prisma.googleAdsToken.upsert({
      where: { customerId },
      update: { accessToken: data.access_token, refreshToken: data.refresh_token ?? "", expiresAt },
      create: { customerId, accessToken: data.access_token, refreshToken: data.refresh_token ?? "", expiresAt },
    });
    res.redirect(`${FRONTEND_URL}/ads/google?connected=true`);
  } catch (err) {
    console.error("Google Ads OAuth error:", err);
    res.redirect(`${FRONTEND_URL}/ads/google?error=true`);
  }
});

router.get("/status", async (_req, res) => {
  const token = await prisma.googleAdsToken.findFirst();
  res.json({ connected: !!token, customerId: token?.customerId ?? null });
});

router.get("/campaigns", async (_req, res) => {
  const token = await prisma.googleAdsToken.findFirst();
  if (!token) { res.json([]); return; }

  // Refresh token if expired
  let accessToken = token.accessToken;
  if (token.expiresAt < new Date()) {
    const { data } = await axios.post("https://oauth2.googleapis.com/token", {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: token.refreshToken,
      grant_type: "refresh_token",
    });
    accessToken = data.access_token;
    await prisma.googleAdsToken.update({
      where: { customerId: token.customerId },
      data: { accessToken, expiresAt: new Date(Date.now() + data.expires_in * 1000) },
    });
  }

  const query = `SELECT campaign.id, campaign.name, campaign.status, campaign.start_date, campaign.end_date, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions FROM campaign WHERE segments.date DURING LAST_30_DAYS`;
  const { data } = await axios.post(
    `https://googleads.googleapis.com/v16/customers/${token.customerId}/googleAds:search`,
    { query },
    { headers: { Authorization: `Bearer ${accessToken}`, "developer-token": DEVELOPER_TOKEN, "login-customer-id": token.customerId } }
  );
  res.json(data.results ?? []);
});

export default router;
