export type EmbedMessage =
  | { type: 'tinix:ready' }
  | { type: 'tinix:resize'; height: number }
  | { type: 'tinix:error'; code: string; message?: string }

export function notifyEmbedParent(payload: EmbedMessage) {
  if (window.parent === window) return
  window.parent.postMessage(payload, '*')
}

export function notifyEmbedError(code: string, message?: string) {
  notifyEmbedParent({ type: 'tinix:error', code, message })
}
