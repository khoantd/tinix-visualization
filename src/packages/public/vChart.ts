import merge from 'lodash/merge'
import pick from 'lodash/pick'
import cloneDeep from 'lodash/cloneDeep'
import { type CanvasThemeMode } from '@/settings/chartThemes/index'
import { getVChartAxisThemeJson, getVChartGlobalThemeJson, vChartGlobalThemeJson } from '@/settings/vchartThemes/index'

/**
 * * hợp nhất color VàCấu hình chungmục
 * @param option Cấu hình
 * @param themeSetting cài đặt
 * @param excludes loại trừ các phần tử
 * @returns object
 */
export const mergeTheme = <T, U>(option: T, themeSetting: U, includes: string[]) => {
  return (option = merge({}, pick(themeSetting, includes), option))
}

/**
 * * vCharts option Tiền xử lý thống nhất
 * @param option
 * @return option
 */
export const vChartOptionPrefixHandle = (option: any, includes: string[] = [], mode: CanvasThemeMode = 'dark') => {
  option['background'] = 'rgba(0,0,0,0)'
  return mergeTheme(option, getVChartGlobalThemeJson(mode), includes)
}

const mergeAxisWithTheme = (axis: Record<string, any> | undefined, themeAxis: Record<string, any>) => {
  if (!axis) return axis
  const merged = cloneDeep(axis)
  merged.unit = merge({}, merged.unit, {
    style: { fill: themeAxis.unit.style.fill }
  })
  merged.label = merge({}, merged.label, {
    style: { fill: themeAxis.label.style.fill }
  })
  merged.title = merge({}, merged.title, {
    style: { fill: themeAxis.title.style.fill }
  })
  merged.domainLine = merge({}, merged.domainLine, themeAxis.domainLine)
  if (merged.grid?.visible !== false) {
    merged.grid = merge({}, merged.grid, { style: themeAxis.grid.style })
  }
  return merged
}

/** Apply light/dark axis label and grid tokens at render time. */
export const withVChartAxisTheme = <T extends Record<string, any>>(option: T, mode: CanvasThemeMode = 'dark'): T => {
  const themeAxis = getVChartAxisThemeJson(mode)
  const result = cloneDeep(option)
  if (result.xAxis) {
    result.xAxis = mergeAxisWithTheme(result.xAxis, themeAxis)
  }
  if (result.yAxis) {
    result.yAxis = mergeAxisWithTheme(result.yAxis, themeAxis)
  }
  return result
}
