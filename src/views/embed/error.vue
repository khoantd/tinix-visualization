<template>
  <div class="embed-error">
    <n-result
      :status="statusMap[errorCode] || 'error'"
      :title="title"
      :description="description"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { notifyEmbedError } from './utils/messaging'

const route = useRoute()

const errorCode = computed(() => String(route.query.code || '403'))
const messageKey = computed(() => String(route.query.message || ''))

const statusMap: Record<string, '403' | '404' | '500' | 'error' | 'warning'> = {
  '401': 'warning',
  '403': '403',
  '404': '404',
  '500': '500',
}

const title = computed(() => {
  if (messageKey.value === 'missing_token') return 'Embed authentication required'
  if (messageKey.value === 'token_expired') return 'Embed session expired'
  if (messageKey.value === 'not_published') return 'Dashboard not published'
  return 'Unable to load embedded dashboard'
})

const description = computed(() => {
  if (messageKey.value === 'missing_token') {
    return 'A valid embed token must be provided via the SDK or ?token= query parameter.'
  }
  if (messageKey.value === 'token_expired') {
    return 'Ask your application backend to mint a new embed token and reload.'
  }
  if (messageKey.value === 'not_published') {
    return 'This dashboard has not been published for embedding yet.'
  }
  return 'Please verify the dashboard ID, publish status, and embed token.'
})

onMounted(() => {
  notifyEmbedError(errorCode.value, messageKey.value || title.value)
})
</script>

<style lang="scss" scoped>
.embed-error {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: #f8fafc;
}
</style>
