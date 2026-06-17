import { Router, Response } from 'express'
import { prisma } from '../lib/prisma'
import { authMiddleware, AuthRequest } from '../middleware/auth'

const router = Router()

// Todas las campañas (con su cuenta y métricas)
router.get('/', authMiddleware, async (_req: AuthRequest, res: Response): Promise<void> => {
  const campaigns = await prisma.campaign.findMany({
    include: {
      adAccount: { select: { id: true, name: true } },
      metrics: {
        orderBy: { date: 'desc' },
        take: 30,
      },
    },
    orderBy: { createdAt: 'desc' },
  })
  res.json(campaigns)
})

// Campañas de una cuenta
router.get('/account/:accountId', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const campaigns = await prisma.campaign.findMany({
    where: { adAccountId: req.params.accountId },
    include: {
      metrics: {
        orderBy: { date: 'desc' },
        take: 30,
      },
    },
  })
  res.json(campaigns)
})

// Métricas de una campaña
router.get('/:id/metrics', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { from, to } = req.query

  const metrics = await prisma.adMetrics.findMany({
    where: {
      campaignId: req.params.id,
      ...(from && to
        ? { date: { gte: new Date(from as string), lte: new Date(to as string) } }
        : {}),
    },
    orderBy: { date: 'asc' },
  })
  res.json(metrics)
})

// Dashboard de agencia: resumen de todas las cuentas
router.get('/summary', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const accounts = await prisma.adAccount.findMany({
    include: {
      user: { select: { id: true, name: true } },
      campaigns: {
        include: {
          metrics: {
            orderBy: { date: 'desc' },
            take: 7,
          },
        },
      },
    },
  })

  const summary = accounts.map((acc) => {
    const allMetrics = acc.campaigns.flatMap((c) => c.metrics)
    const totalSpend = allMetrics.reduce((sum, m) => sum + Number(m.spend), 0)
    const totalConversions = allMetrics.reduce((sum, m) => sum + m.conversions, 0)
    const avgROAS = allMetrics.length
      ? allMetrics.reduce((sum, m) => sum + Number(m.roas), 0) / allMetrics.length
      : 0

    return {
      accountId: acc.id,
      accountName: acc.name,
      client: acc.user,
      totalSpend,
      totalConversions,
      avgROAS,
      campaignCount: acc.campaigns.length,
    }
  })

  res.json(summary)
})

export default router
