import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { getAdAccountCampaigns } from '../lib/metaAds'

const router = Router()

const createAccountSchema = z.object({
  metaAccountId: z.string().min(1),
  name: z.string().min(1),
  accessToken: z.string().min(1),
  userId: z.string().min(1),
})

// Listar todas las cuentas (agencia)
router.get('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const accounts = await prisma.adAccount.findMany({
    include: {
      user: { select: { id: true, name: true, email: true } },
      campaigns: { select: { id: true, name: true, status: true } },
    },
  })
  res.json(accounts)
})

// Crear cuenta y sincronizar campañas
router.post('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = createAccountSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', details: parsed.error.errors })
    return
  }

  const { metaAccountId, name, accessToken, userId } = parsed.data

  const account = await prisma.adAccount.create({
    data: { metaAccountId, name, accessToken, userId },
  })

  // Sincronizar campañas desde Meta
  try {
    const campaigns = await getAdAccountCampaigns(metaAccountId, accessToken)
    await prisma.campaign.createMany({
      data: campaigns.map((c: any) => ({
        metaCampaignId: c.id,
        name: c.name,
        status: c.status,
        objective: c.objective ?? null,
        adAccountId: account.id,
      })),
      skipDuplicates: true,
    })
  } catch (err) {
    console.error('Error sincronizando campañas:', err)
  }

  res.status(201).json(account)
})

// Sincronizar campañas manualmente
router.post('/:id/sync', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const account = await prisma.adAccount.findUnique({ where: { id: req.params.id } })
  if (!account) {
    res.status(404).json({ error: 'Cuenta no encontrada' })
    return
  }

  const campaigns = await getAdAccountCampaigns(account.metaAccountId, account.accessToken)
  await prisma.campaign.createMany({
    data: campaigns.map((c: any) => ({
      metaCampaignId: c.id,
      name: c.name,
      status: c.status,
      objective: c.objective ?? null,
      adAccountId: account.id,
    })),
    skipDuplicates: true,
  })

  res.json({ synced: campaigns.length })
})

export default router
