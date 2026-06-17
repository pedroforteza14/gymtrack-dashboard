import axios from 'axios'

const META_API_VERSION = 'v19.0'
const BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`

export async function getAdAccountCampaigns(adAccountId: string, accessToken: string) {
  const { data } = await axios.get(`${BASE_URL}/act_${adAccountId}/campaigns`, {
    params: {
      fields: 'id,name,status,objective',
      access_token: accessToken,
      limit: 100,
    },
  })
  return data.data
}

export async function getCampaignInsights(
  campaignId: string,
  accessToken: string,
  datePreset = 'last_30d'
) {
  const { data } = await axios.get(`${BASE_URL}/${campaignId}/insights`, {
    params: {
      fields: 'spend,impressions,clicks,ctr,cpm,actions,action_values,date_start',
      date_preset: datePreset,
      time_increment: 1,
      access_token: accessToken,
    },
  })
  return data.data ?? []
}

export function extractConversions(actions: any[]): number {
  if (!actions) return 0
  const conversion = actions.find((a: any) => a.action_type === 'offsite_conversion.fb_pixel_purchase')
  return conversion ? parseInt(conversion.value) : 0
}

export function extractROAS(actionValues: any[]): number {
  if (!actionValues) return 0
  const roas = actionValues.find((a: any) => a.action_type === 'offsite_conversion.fb_pixel_purchase')
  return roas ? parseFloat(roas.value) : 0
}
