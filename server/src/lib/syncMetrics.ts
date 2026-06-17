import { prisma } from './prisma'
import { getCampaignInsights, extractConversions, extractROAS } from './metaAds'

export async function syncAllMetrics() {
  const accounts = await prisma.adAccount.findMany({
    include: { campaigns: true },
  })

  for (const account of accounts) {
    for (const campaign of account.campaigns) {
      try {
        const insights = await getCampaignInsights(campaign.metaCampaignId, account.accessToken)

        for (const insight of insights) {
          const conversions = extractConversions(insight.actions)
          const roas = extractROAS(insight.action_values)

          await prisma.adMetrics.upsert({
            where: {
              campaignId_date: {
                campaignId: campaign.id,
                date: new Date(insight.date_start),
              },
            },
            update: {
              spend: parseFloat(insight.spend ?? '0'),
              impressions: parseInt(insight.impressions ?? '0'),
              clicks: parseInt(insight.clicks ?? '0'),
              ctr: parseFloat(insight.ctr ?? '0'),
              cpm: parseFloat(insight.cpm ?? '0'),
              conversions,
              roas,
            },
            create: {
              campaignId: campaign.id,
              date: new Date(insight.date_start),
              spend: parseFloat(insight.spend ?? '0'),
              impressions: parseInt(insight.impressions ?? '0'),
              clicks: parseInt(insight.clicks ?? '0'),
              ctr: parseFloat(insight.ctr ?? '0'),
              cpm: parseFloat(insight.cpm ?? '0'),
              conversions,
              roas,
            },
          })
        }
      } catch (err) {
        console.error(`Error sincronizando campaña ${campaign.name}:`, err)
      }
    }
  }

  console.log(`[${new Date().toISOString()}] Métricas sincronizadas`)
}
