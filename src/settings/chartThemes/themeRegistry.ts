import Color from 'color'
import cloneDeep from 'lodash/cloneDeep'
import {
  type CanvasThemeMode,
  type ChartColorsNameType,
  getGlobalThemeJson
} from '@/settings/chartThemes/index'
import { getVChartGlobalThemeJson } from '@/settings/vchartThemes/index'
import { EditCanvasConfigEnum } from '@/store/modules/chartEditStore/chartEditStore.d'

/** ECharts palettes intended for dark canvas backgrounds */
export const DARK_ECHARTS_THEMES: ChartColorsNameType[] = ['dark', 'chalk', 'purplePassion']

/** ECharts palettes intended for light canvas backgrounds */
export const LIGHT_ECHARTS_THEMES: ChartColorsNameType[] = [
  'customed',
  'macarons',
  'walden',
  'vintage',
  'roma',
  'essos',
  'shine',
  'westeros',
  'wonderland'
]

/** VChart themes intended for light canvas backgrounds */
export const LIGHT_VCHART_THEMES = new Set([
  'light',
  'veODesignLightFinance',
  'veODesignLightGovernment',
  'veODesignLightConsumer',
  'veODesignLightAutomobile',
  'veODesignLightCulturalTourism',
  'veODesignLightMedical',
  'veODesignLightNewEnergy'
])

/** Corrected display labels for ECharts theme picker */
export const chartThemeDisplayNames: Partial<Record<ChartColorsNameType, string>> = {
  dark: 'Neon — nền tối',
  chalk: 'Phấn thanh — nền tối',
  purplePassion: 'Tím sẫm — nền tối',
  customed: 'Cổ điển — nền sáng',
  macarons: 'Macaron — nền sáng',
  walden: 'Lục lam — nền sáng',
  vintage: 'Cổ điển — nền sáng',
  roma: 'Đỏ La Mã — nền sáng',
  essos: 'Hồng cam — nền sáng',
  shine: 'Màu tối — nền sáng',
  westeros: 'Xám phai — nền sáng',
  wonderland: 'Cỏ xanh — nền sáng'
}

export const getChartThemeDisplayName = (key: ChartColorsNameType, fallback?: string): string => {
  return chartThemeDisplayNames[key] ?? fallback ?? key
}

export const isDarkEchartsTheme = (theme: string): boolean => {
  return DARK_ECHARTS_THEMES.includes(theme as ChartColorsNameType)
}

export const isLightVChartTheme = (theme: string): boolean => {
  return LIGHT_VCHART_THEMES.has(theme)
}

/** Returns true when background is light enough for dark text (luminance > 0.55). */
export const isLightBackground = (background?: string | null): boolean => {
  if (!background) return false
  try {
    return Color(background).luminosity() > 0.55
  } catch {
    return false
  }
}

export type CanvasThemeContext = {
  chartThemeColor?: string
  vChartThemeName?: string
  background?: string | null
  canvasThemeMode?: CanvasThemeMode
}

export const resolveCanvasThemeMode = (ctx: CanvasThemeContext): CanvasThemeMode => {
  if (ctx.canvasThemeMode) return ctx.canvasThemeMode
  if (ctx.chartThemeColor && isDarkEchartsTheme(ctx.chartThemeColor)) return 'dark'
  if (ctx.chartThemeColor && LIGHT_ECHARTS_THEMES.includes(ctx.chartThemeColor as ChartColorsNameType)) {
    return 'light'
  }
  if (ctx.vChartThemeName) {
    if (isLightVChartTheme(ctx.vChartThemeName)) return 'light'
    if (ctx.vChartThemeName === 'dark') return 'dark'
  }
  if (isLightBackground(ctx.background)) return 'light'
  return 'dark'
}

type ChartEditStoreLike = {
  getEditCanvasConfig: CanvasThemeContext & {
    chartThemeSetting?: ReturnType<typeof getGlobalThemeJson>
  }
  setEditCanvasConfig: (key: EditCanvasConfigEnum, value: unknown) => void
}

export const applyCanvasThemeMode = (
  store: ChartEditStoreLike,
  mode: CanvasThemeMode,
  options?: { syncTokensOnly?: boolean }
) => {
  const config = store.getEditCanvasConfig
  const globalTheme = cloneDeep(getGlobalThemeJson(mode))
  const existingRenderer = config.chartThemeSetting?.renderer
  if (existingRenderer) {
    globalTheme.renderer = existingRenderer
  }

  store.setEditCanvasConfig(EditCanvasConfigEnum.CHART_THEME_SETTING, globalTheme)

  if (!options?.syncTokensOnly) {
    store.setEditCanvasConfig(EditCanvasConfigEnum.CANVAS_THEME_MODE, mode)
  }
}

export const syncCanvasThemeFromConfig = (
  store: ChartEditStoreLike,
  options?: { syncTokensOnly?: boolean }
) => {
  const config = store.getEditCanvasConfig
  const mode = resolveCanvasThemeMode({
    chartThemeColor: config.chartThemeColor,
    vChartThemeName: config.vChartThemeName,
    background: config.background,
    canvasThemeMode: config.canvasThemeMode
  })
  applyCanvasThemeMode(store, mode, options)
}

export { getVChartGlobalThemeJson }
