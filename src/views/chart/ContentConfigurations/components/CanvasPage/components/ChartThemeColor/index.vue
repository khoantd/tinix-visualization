<template>
  <div class="go-chart-theme-color">
    <n-card class="card-box" size="small" hoverable embedded @click="createColorHandle">
      <n-text class="go-flex-items-center">
        <span>Màu tùy chỉnh</span>
        <n-icon size="16">
          <add-icon></add-icon>
        </n-icon>
      </n-text>
    </n-card>

    <template v-for="custom in customThemes" :key="custom.key">
      <n-card
        class="card-box"
        :class="{ selected: custom.key === selectName }"
        size="small"
        hoverable
        embedded
        @click="selectTheme(custom.key)"
      >
        <div class="go-flex-items-center">
          <n-ellipsis style="text-align: left; width: 60px">{{ custom.value.name }}</n-ellipsis>
          <span
            class="theme-color-item"
            v-for="colorItem in fetchShowColors(custom.value.color)"
            :key="colorItem"
            :style="{ backgroundColor: colorItem }"
          ></span>
        </div>
        <div class="theme-bottom" :style="{ backgroundImage: colorBackgroundImage(custom.value) }"></div>
      </n-card>
    </template>

    <n-text depth="3" class="section-label">Nền sáng</n-text>
    <template v-for="item in lightThemes" :key="item.key">
      <n-card
        class="card-box"
        :class="{ selected: item.key === selectName }"
        size="small"
        hoverable
        embedded
        @click="selectTheme(item.key)"
      >
        <div class="go-flex-items-center">
          <n-ellipsis style="text-align: left; width: 110px">{{ item.label }}</n-ellipsis>
          <span
            class="theme-color-item"
            v-for="colorItem in fetchShowColors(item.value.color)"
            :key="colorItem"
            :style="{ backgroundColor: colorItem }"
          ></span>
        </div>
        <div class="theme-bottom" :style="{ backgroundImage: colorBackgroundImage(item.value) }"></div>
      </n-card>
    </template>

    <n-text depth="3" class="section-label">Nền tối</n-text>
    <template v-for="item in darkThemes" :key="item.key">
      <n-card
        class="card-box"
        :class="{ selected: item.key === selectName }"
        size="small"
        hoverable
        embedded
        @click="selectTheme(item.key)"
      >
        <div class="go-flex-items-center">
          <n-ellipsis style="text-align: left; width: 110px">{{ item.label }}</n-ellipsis>
          <span
            class="theme-color-item"
            v-for="colorItem in fetchShowColors(item.value.color)"
            :key="colorItem"
            :style="{ backgroundColor: colorItem }"
          ></span>
        </div>
        <div class="theme-bottom" :style="{ backgroundImage: colorBackgroundImage(item.value) }"></div>
      </n-card>
    </template>

    <create-color v-model:modelShow="createColorModelShow"></create-color>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import cloneDeep from 'lodash/cloneDeep'
import { useChartEditStore } from '@/store/modules/chartEditStore/chartEditStore'
import { EditCanvasConfigEnum } from '@/store/modules/chartEditStore/chartEditStore.d'
import { ChartColorsNameType } from '@/settings/chartThemes/index'
import {
  DARK_ECHARTS_THEMES,
  LIGHT_ECHARTS_THEMES,
  applyCanvasThemeMode,
  getChartThemeDisplayName,
  isDarkEchartsTheme
} from '@/settings/chartThemes/themeRegistry'
import { useDesignStore } from '@/store/modules/designStore/designStore'
import { loadAsyncComponent, colorCustomMerge } from '@/utils'
import { icon } from '@/plugins'

const CreateColor = loadAsyncComponent(() => import('../CreateColor/index.vue'))

const { AddIcon } = icon.ionicons5
const chartEditStore = useChartEditStore()
const designStore = useDesignStore()
const createColorModelShow = ref(false)

const comChartColors = computed(() => {
  return colorCustomMerge(chartEditStore.getEditCanvasConfig.chartCustomThemeColorInfo)
})

const themeColor = computed(() => designStore.getAppTheme)

const selectName = computed(() => chartEditStore.getEditCanvasConfig.chartThemeColor)

const isBuiltInTheme = (key: string) => {
  return DARK_ECHARTS_THEMES.includes(key as ChartColorsNameType) ||
    LIGHT_ECHARTS_THEMES.includes(key as ChartColorsNameType)
}

const customThemes = computed(() => {
  return Object.entries(comChartColors.value)
    .filter(([key]) => !isBuiltInTheme(key))
    .map(([key, value]) => ({ key: key as ChartColorsNameType, value }))
})

const lightThemes = computed(() => {
  return LIGHT_ECHARTS_THEMES.filter(key => comChartColors.value[key]).map(key => ({
    key,
    label: getChartThemeDisplayName(key, comChartColors.value[key]?.name),
    value: comChartColors.value[key]
  }))
})

const darkThemes = computed(() => {
  return DARK_ECHARTS_THEMES.filter(key => comChartColors.value[key]).map(key => ({
    key,
    label: getChartThemeDisplayName(key, comChartColors.value[key]?.name),
    value: comChartColors.value[key]
  }))
})

const createColorHandle = () => {
  createColorModelShow.value = true
}

const colorBackgroundImage = (item: { color: string[] }) => {
  return `linear-gradient(to right, ${item.color[0]} 0%, ${item.color[5]} 100%)`
}

const fetchShowColors = (colors: Array<string>) => {
  return cloneDeep(colors).splice(0, 6)
}

const selectTheme = (theme: ChartColorsNameType) => {
  chartEditStore.setEditCanvasConfig(EditCanvasConfigEnum.CHART_THEME_COLOR, theme)
  const mode = isDarkEchartsTheme(theme) ? 'dark' : 'light'
  applyCanvasThemeMode(chartEditStore, mode)
}
</script>

<style lang="scss" scoped>
$radius: 10px;
$itemRadius: 6px;

@include go('chart-theme-color') {
  .section-label {
    display: block;
    margin-top: 14px;
    margin-bottom: 4px;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .card-box {
    cursor: pointer;
    margin-top: 15px;
    padding: 0;
    @include fetch-bg-color('background-color4-shallow');
    border-radius: $radius;
    overflow: hidden;

    &.selected {
      border: 2px solid v-bind('themeColor');
      border-bottom: 1px solid rgba(0, 0, 0, 0);
    }
    &:first-child {
      margin-top: 5px;
    }
    .go-flex-items-center {
      justify-content: space-between;
      margin-top: -4px;
    }
    .theme-color-item {
      display: inline-block;
      width: 20px;
      height: 20px;
      border-radius: $itemRadius;
    }
    .theme-bottom {
      position: absolute;
      left: 0;
      bottom: 0px;
      width: 100%;
      height: 3px;
    }
  }
}
</style>
