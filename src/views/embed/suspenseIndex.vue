<template>
  <div :class="`go-preview go-embed ${chartEditStore.editCanvasConfig.previewScaleType}`">
    <template v-if="showEntity">
      <div ref="entityRef" class="go-preview-entity">
        <div ref="previewRef" class="go-preview-scale">
          <div v-if="show" :style="previewRefStyle">
            <preview-render-list></preview-render-list>
          </div>
        </div>
      </div>
    </template>
    <template v-else>
      <div ref="previewRef" class="go-preview-scale">
        <div v-if="show" :style="previewRefStyle">
          <preview-render-list></preview-render-list>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { PreviewRenderList } from '@/views/preview/components/PreviewRenderList'
import { getFilterStyle, setTitle } from '@/utils'
import { getEditCanvasConfigStyle } from '@/views/preview/utils'
import { useComInstall } from '@/views/preview/hooks/useComInstall.hook'
import { useScale } from '@/views/preview/hooks/useScale.hook'
import { useStore } from '@/views/preview/hooks/useStore.hook'
import { PreviewScaleEnum } from '@/enums/styleEnum'
import type { ChartEditStorageType } from '@/views/preview/index.d'
import { useChartEditStore } from '@/store/modules/chartEditStore/chartEditStore'
import { useInitVChartsTheme } from '@/hooks'
import { loadEmbedDashboard } from './utils/storage'
import { useEmbedMessaging } from './hooks/useEmbedMessaging.hook'

await loadEmbedDashboard()

const chartEditStore = useChartEditStore() as unknown as ChartEditStorageType

setTitle(chartEditStore.editCanvasConfig?.projectName || 'TiniX Dashboard')

const previewRefStyle = computed(() => ({
  overflow: 'hidden',
  ...getEditCanvasConfigStyle(chartEditStore.editCanvasConfig),
  ...getFilterStyle(chartEditStore.editCanvasConfig),
}))

const showEntity = computed(() => {
  const type = chartEditStore.editCanvasConfig.previewScaleType
  return type === PreviewScaleEnum.SCROLL_Y || type === PreviewScaleEnum.SCROLL_X
})

useStore(chartEditStore)
const { entityRef, previewRef } = useScale(chartEditStore)
const { show } = useComInstall(chartEditStore)
useInitVChartsTheme(chartEditStore)

useEmbedMessaging(
  () => document.documentElement.scrollHeight || window.innerHeight,
  show
)
</script>

<style lang="scss" scoped>
@include go('preview') {
  position: relative;
  min-height: 100vh;
  width: 100vw;
  @include background-image('background-image');

  &.go-embed {
    background-color: transparent;
  }

  &.fit,
  &.full {
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    .go-preview-scale {
      transform-origin: center center;
    }
  }
  &.scrollY {
    overflow-x: hidden;
    .go-preview-scale {
      transform-origin: left top;
    }
  }
  &.scrollX {
    overflow-y: hidden;
    .go-preview-scale {
      transform-origin: left top;
    }
  }
  .go-preview-entity {
    overflow: hidden;
  }
}
</style>
