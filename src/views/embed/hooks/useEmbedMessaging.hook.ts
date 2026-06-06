import { onMounted, onUnmounted, watch, type Ref } from 'vue'
import { notifyEmbedParent, type EmbedMessage } from '../utils/messaging'

export function useEmbedMessaging(getHeight: () => number, readyWhen?: Ref<boolean>) {
  const postToParent = (payload: EmbedMessage) => {
    notifyEmbedParent(payload)
  }

  const notifyReady = () => {
    postToParent({ type: 'tinix:ready' })
  }

  const notifyResize = () => {
    postToParent({ type: 'tinix:resize', height: getHeight() })
  }

  let resizeObserver: ResizeObserver | null = null
  let readySent = false

  const sendReadyOnce = () => {
    if (readySent) return
    readySent = true
    notifyReady()
    notifyResize()
  }

  onMounted(() => {
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => notifyResize())
      resizeObserver.observe(document.body)
    } else {
      window.addEventListener('resize', notifyResize)
    }

    if (!readyWhen) {
      sendReadyOnce()
    }
  })

  if (readyWhen) {
    watch(
      readyWhen,
      (isReady) => {
        if (isReady) sendReadyOnce()
      },
      { immediate: true }
    )
  }

  onUnmounted(() => {
    resizeObserver?.disconnect()
    window.removeEventListener('resize', notifyResize)
  })

  return { postToParent, notifyReady, notifyResize }
}
