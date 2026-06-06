import { useChartEditStore } from '@/store/modules/chartEditStore/chartEditStore'
import { getEmbedDashboardApi } from '@/api/storage.api'
import { EmbedEnum } from '@/enums/pageEnum'
import router from '@/router'

const chartEditStore = useChartEditStore()

function getDashboardIdFromHash(): string | null {
  const urlHash = document.location.hash
  const parts = urlHash.split('/')
  let idStr = parts[parts.length - 1]
  if (!idStr) return null
  if (idStr.includes('?')) {
    idStr = idStr.split('?')[0]
  }
  return idStr || null
}

function getEmbedToken(): string | null {
  // @ts-ignore
  if (window.__TINIX_EMBED_TOKEN__) return window.__TINIX_EMBED_TOKEN__
  const params = new URLSearchParams(window.location.hash.split('?')[1] || '')
  return params.get('token')
}

export const loadEmbedDashboard = async () => {
  const dashboardId = getDashboardIdFromHash()
  const token = getEmbedToken()

  if (!dashboardId || !token) {
    router.replace({
      name: EmbedEnum.CHART_EMBED_ERROR_NAME,
      query: { code: '401', message: 'missing_token' },
    })
    return null
  }

  try {
    const projectData = await getEmbedDashboardApi(dashboardId, token)
    if (!projectData) {
      router.replace({
        name: EmbedEnum.CHART_EMBED_ERROR_NAME,
        query: { code: '403', message: 'not_published' },
      })
      return null
    }

    const { editCanvasConfig, requestGlobalConfig, componentList } = projectData
    const embedScale = projectData.embedSettings?.defaultScaleType

    chartEditStore.editCanvasConfig = {
      ...chartEditStore.editCanvasConfig,
      ...editCanvasConfig,
      width: editCanvasConfig.width || chartEditStore.editCanvasConfig.width || 1920,
      height: editCanvasConfig.height || chartEditStore.editCanvasConfig.height || 1080,
      ...(embedScale ? { previewScaleType: embedScale } : {}),
    }
    chartEditStore.requestGlobalConfig = {
      ...chartEditStore.requestGlobalConfig,
      ...requestGlobalConfig,
    }
    chartEditStore.componentList = componentList || []

    return projectData
  } catch (err: any) {
    const msg = err?.response?.data?.error || err?.message || ''
    const isExpired = msg.toLowerCase().includes('expired')
    router.replace({
      name: EmbedEnum.CHART_EMBED_ERROR_NAME,
      query: {
        code: isExpired ? '401' : '403',
        message: isExpired ? 'token_expired' : 'not_published',
      },
    })
    return null
  }
}
