import themeJson from './global.theme.json'
import themeJsonLight from './global.theme.light.json'
import axisThemeJson from './axis.theme.json'
import axisThemeJsonLight from './axis.theme.light.json'

type ThemeJsonType = typeof themeJson
export type FontType = {
  fontSize: number
  fontFamily: string
  fontWeight: string
  fill: string
  dy?: number
  dx?: number
  angle?: number
  [T: string]: any
}
export interface vChartGlobalThemeJsonType extends Partial<ThemeJsonType> {
  dataset?: any
  [T: string]: any
}

export type VChartCanvasThemeMode = 'light' | 'dark'

export const vChartGlobalThemeJsonDark = { ...themeJson, dataset: null }
export const vChartGlobalThemeJsonLight = { ...themeJsonLight, dataset: null }

/** @deprecated use getVChartGlobalThemeJson('dark') */
export const vChartGlobalThemeJson = vChartGlobalThemeJsonDark

export const getVChartGlobalThemeJson = (mode: VChartCanvasThemeMode = 'dark'): vChartGlobalThemeJsonType => {
  return mode === 'light' ? vChartGlobalThemeJsonLight : vChartGlobalThemeJsonDark
}

export const getVChartAxisThemeJson = (mode: VChartCanvasThemeMode = 'dark') => {
  return mode === 'light' ? axisThemeJsonLight : axisThemeJson
}
