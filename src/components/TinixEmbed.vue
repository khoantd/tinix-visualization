<template>
  <div ref="containerRef" class="tinix-embed-host" :style="hostStyle"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'

declare global {
  interface Window {
    TinixEmbed?: {
      render: (options: Record<string, unknown>) => { destroy: () => void }
    }
  }
}

const props = withDefaults(
  defineProps<{
    dashboardId: string
    token: string
    baseUrl?: string
    height?: string | number
    autoHeight?: boolean
    title?: string
  }>(),
  {
    baseUrl: () => window.location.origin,
    height: '600px',
    autoHeight: true,
    title: 'TiniX Dashboard',
  }
)

const emit = defineEmits<{
  ready: []
  error: [payload: { code?: string; message?: string }]
  tokenExpired: []
}>()

const containerRef = ref<HTMLElement | null>(null)
let instance: { destroy: () => void } | null = null

const hostStyle = computed(() => ({
  width: '100%',
  minHeight: typeof props.height === 'number' ? `${props.height}px` : props.height,
}))

function loadSdk(): Promise<void> {
  if (window.TinixEmbed) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `${props.baseUrl.replace(/\/$/, '')}/tinix-embed.js`
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load TiniX embed SDK'))
    document.head.appendChild(script)
  })
}

async function mountEmbed() {
  if (!containerRef.value || !props.token || !props.dashboardId) return
  instance?.destroy()
  await loadSdk()
  if (!window.TinixEmbed) return

  instance = window.TinixEmbed.render({
    container: containerRef.value,
    dashboardId: props.dashboardId,
    token: props.token,
    baseUrl: props.baseUrl,
    height: props.height,
    autoHeight: props.autoHeight,
    title: props.title,
    onReady: () => emit('ready'),
    onError: (payload: { code?: string; message?: string }) => {
      emit('error', payload)
      if (payload.code === '401') emit('tokenExpired')
    },
    onTokenExpired: () => emit('tokenExpired'),
  })
}

onMounted(mountEmbed)
onUnmounted(() => instance?.destroy())

watch(
  () => [props.dashboardId, props.token, props.baseUrl],
  () => mountEmbed()
)
</script>

<style scoped>
.tinix-embed-host {
  width: 100%;
}
</style>
