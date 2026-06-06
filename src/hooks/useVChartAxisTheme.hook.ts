import { computed } from 'vue'
import { useChartEditStore } from '@/store/modules/chartEditStore/chartEditStore'
import { resolveCanvasThemeMode } from '@/settings/chartThemes/themeRegistry'
import { getVChartAxisThemeJson } from '@/settings/vchartThemes/index'

export const useVChartAxisTheme = () => {
  const chartEditStore = useChartEditStore()

  const canvasThemeMode = computed(() => {
    const config = chartEditStore.getEditCanvasConfig
    return resolveCanvasThemeMode({
      chartThemeColor: config.chartThemeColor,
      vChartThemeName: config.vChartThemeName,
      background: config.background,
      canvasThemeMode: config.canvasThemeMode
    })
  })

  const axisTheme = computed(() => getVChartAxisThemeJson(canvasThemeMode.value))

  return {
    canvasThemeMode,
    axisTheme
  }
}
