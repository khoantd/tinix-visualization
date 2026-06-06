import { onMounted, onUnmounted } from 'vue'

type EmbedMessage =
  | { type: 'tinix:ready' }
  | { type: 'tinix:resize'; height: number }
  | { type: 'tinix:error'; code: string; message?: string }

export function useEmbedMessaging(getHeight: () => number) {
  const postToParent = (payload: EmbedMessage) => {
    if (window.parent === window) return
    window.parent.postMessage(payload, '*')
  }

  const notifyResize = () => {
    postToParent({ type: 'tinix:resize', height: getHeight() })
  }

  let resizeObserver: ResizeObserver | null = null

  onMounted(() => {
    postToParent({ type: 'tinix:ready' })
    notifyResize()

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => notifyResize())
      resizeObserver.observe(document.body)
    } else {
      window.addEventListener('resize', notifyResize)
    }
  })

  onUnmounted(() => {
    resizeObserver?.disconnect()
    window.removeEventListener('resize', notifyResize)
  })

  return { postToParent, notifyResize }
}
