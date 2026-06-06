<template>
  <n-drawer
    v-model:show="visible"
    :width="720"
    placement="right"
    class="embed-panel-drawer"
    @after-leave="handleClose"
  >
    <n-drawer-content :title="t('embed.embed_title')" closable>
      <n-result
        v-if="!embedEnabled"
        status="info"
        :title="t('features.feature_unavailable_title')"
        :description="t('features.feature_unavailable_desc')"
      />
      <n-tabs v-else v-model:value="activeTab" type="line" animated class="embed-tabs">
        <!-- Status -->
        <n-tab-pane name="status" :tab="t('embed.embed_tab_status')">
          <n-space vertical :size="16">
            <n-card size="small" embedded class="embed-status-card">
              <n-space align="center" justify="space-between">
                <n-space align="center" :size="8">
                  <n-tag :type="isPublished ? 'success' : 'warning'" size="small">
                    {{ isPublished ? t('embed.embed_published') : t('embed.embed_unpublished') }}
                  </n-tag>
                  <n-text v-if="publishedAt" depth="3">{{ publishedAt }}</n-text>
                </n-space>
                <n-switch
                  :value="isPublished"
                  :loading="publishLoading"
                  @update:value="handlePublishToggle"
                />
              </n-space>
              <n-text depth="3" class="embed-hint">{{ t('embed.embed_publish_hint') }}</n-text>
            </n-card>
          </n-space>
        </n-tab-pane>

        <!-- Preview -->
        <n-tab-pane name="preview" :tab="t('embed.embed_tab_preview')">
          <n-space vertical :size="12">
            <n-radio-group v-model:value="previewWidth" size="small">
              <n-radio-button :value="375">375</n-radio-button>
              <n-radio-button :value="768">768</n-radio-button>
              <n-radio-button :value="1024">1024</n-radio-button>
            </n-radio-group>
            <div
              class="embed-preview-frame"
              :style="{ maxWidth: previewWidth + 'px' }"
            >
              <n-spin v-if="previewLoading" :description="t('embed.embed_preview_loading')" />
              <n-result
                v-else-if="previewError"
                status="warning"
                :title="t('embed.embed_preview_error')"
                :description="previewError"
              >
                <template #footer>
                  <n-button type="primary" @click="retryPreview">
                    {{ t('embed.embed_preview_retry') }}
                  </n-button>
                </template>
              </n-result>
              <TinixEmbed
                v-else-if="isPublished && previewToken"
                :key="embedInstanceKey"
                :dashboard-id="dashboardId"
                :token="previewToken"
                :base-url="baseUrl"
                :eager="true"
                height="480"
                @ready="handlePreviewReady"
                @error="handlePreviewError"
                @token-expired="handlePreviewTokenExpired"
              />
              <n-empty v-else :description="t('embed.embed_unpublished')" />
            </div>
          </n-space>
        </n-tab-pane>

        <!-- Integrate -->
        <n-tab-pane name="integrate" :tab="t('embed.embed_tab_integrate')">
          <n-space vertical :size="16">
            <n-alert v-if="newApiKey" type="warning" :title="t('embed.embed_api_key_once')">
              <n-code :code="newApiKey" language="text" />
              <n-text depth="3" class="embed-hint">{{ t('embed.embed_api_key_warning') }}</n-text>
              <n-button size="small" class="embed-copy-btn" @click="copyText(newApiKey)">
                {{ t('global.r_copy') }}
              </n-button>
            </n-alert>

            <n-form v-if="!newApiKey" inline>
              <n-form-item :label="t('embed.embed_app_name')">
                <n-input
                  v-model:value="newAppName"
                  :placeholder="t('embed.embed_app_name_placeholder')"
                  style="min-width: 220px"
                />
              </n-form-item>
              <n-button type="primary" :loading="appLoading" @click="createApp">
                {{ t('embed.embed_create_app') }}
              </n-button>
            </n-form>

            <n-divider>{{ t('embed.embed_step_server') }}</n-divider>
            <n-code :code="serverSnippet" language="javascript" word-wrap />
            <n-button size="small" class="embed-copy-btn" @click="copyText(serverSnippet)">
              {{ t('global.r_copy') }}
            </n-button>

            <n-divider>{{ t('embed.embed_step_client') }}</n-divider>
            <n-code :code="clientSnippet" language="html" word-wrap />
            <n-button size="small" class="embed-copy-btn" @click="copyText(clientSnippet)">
              {{ t('global.r_copy') }}
            </n-button>
          </n-space>
        </n-tab-pane>

        <!-- Advanced -->
        <n-tab-pane name="advanced" :tab="t('embed.embed_tab_advanced')">
          <n-space vertical :size="12">
            <n-form-item :label="t('embed.embed_allowed_origins')">
              <n-input
                v-model:value="originsText"
                type="textarea"
                :placeholder="t('embed.embed_origins_placeholder')"
                :rows="3"
              />
            </n-form-item>
            <n-code :code="iframeSnippet" language="html" word-wrap />
            <n-button size="small" class="embed-copy-btn" @click="copyText(iframeSnippet)">
              {{ t('global.r_copy') }}
            </n-button>
          </n-space>
        </n-tab-pane>

        <!-- Security -->
        <n-tab-pane name="security" :tab="t('embed.embed_tab_security')">
          <n-space vertical :size="16">
            <n-descriptions :column="1" bordered size="small">
              <n-descriptions-item :label="t('embed.embed_token_ttl')">
                {{ tokenTtl }}s
              </n-descriptions-item>
            </n-descriptions>

            <n-empty v-if="!embedApps.length" :description="t('embed.embed_no_apps')" />
            <n-list v-else bordered>
              <n-list-item v-for="app in embedApps" :key="app.id">
                <n-space align="center" justify="space-between" style="width: 100%">
                  <n-text>{{ app.name }}</n-text>
                  <n-button
                    size="small"
                    quaternary
                    :loading="rotateLoading === app.id"
                    @click="rotateKey(app.id)"
                  >
                    {{ t('embed.embed_rotate_key') }}
                  </n-button>
                </n-space>
              </n-list-item>
            </n-list>
          </n-space>
        </n-tab-pane>
      </n-tabs>
    </n-drawer-content>
  </n-drawer>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTinixFeatures } from '@/hooks/useTinixFeatures'
import TinixEmbed from '@/components/TinixEmbed.vue'
import {
  getEmbedAppsApi,
  createEmbedAppApi,
  rotateEmbedAppKeyApi,
  publishEmbedDashboardApi,
  revokeEmbedDashboardApi,
  mintEmbedPreviewTokenApi,
  getEmbedConfigApi,
  saveProjectApi,
} from '@/api/storage.api'

const props = defineProps<{
  show: boolean
  dashboardId: string
  projectData: Record<string, unknown> | null
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
  saved: []
}>()

const { t } = useI18n()
const { hasModule } = useTinixFeatures()
const embedEnabled = computed(() => hasModule('embed'))

const visible = computed({
  get: () => props.show,
  set: (v: boolean) => emit('update:show', v),
})

const activeTab = ref('status')
const isPublished = ref(false)
const publishedAt = ref('')
const publishLoading = ref(false)
const previewWidth = ref(768)
const previewToken = ref('')
const previewLoading = ref(false)
const embedApps = ref<Array<{ id: string; name: string }>>([])
const newAppName = ref('')
const newApiKey = ref('')
const appLoading = ref(false)
const rotateLoading = ref<string | null>(null)
const tokenTtl = ref(300)
const originsText = ref('')
const previewError = ref('')
const embedInstanceKey = ref(0)

const baseUrl = computed(() => window.location.origin.replace(/\/$/, ''))

const serverSnippet = computed(() => `// Parent backend (Node.js) — keep API key server-side
const res = await fetch('${baseUrl.value}/api/embed/token', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Embed-Api-Key': process.env.TINIX_EMBED_API_KEY,
  },
  body: JSON.stringify({
    dashboardId: '${props.dashboardId}',
    user: { id: 'USER_ID', email: 'user@example.com', roles: ['viewer'] },
  }),
})
const { token } = await res.json()`)

const clientSnippet = computed(() => `<div id="tinix-dashboard"></div>
<script src="${baseUrl.value}/tinix-embed.js"><\/script>
<script>
  // token from your backend session/API
  TinixEmbed.render({
    container: '#tinix-dashboard',
    dashboardId: '${props.dashboardId}',
    token: embedToken,
    baseUrl: '${baseUrl.value}',
    autoHeight: true,
  })
<\/script>`)

const iframeSnippet = computed(() => {
  const url = `${baseUrl.value}/#/embed/${props.dashboardId}?token=EMBED_TOKEN`
  return `<iframe
  src="${url}"
  width="100%"
  height="600"
  style="border:0"
  title="TiniX Dashboard"
  loading="lazy"
></iframe>`
})

function syncFromProject() {
  const data = props.projectData || {}
  isPublished.value = Boolean(data.isPublished)
  publishedAt.value = typeof data.publishedAt === 'string' ? data.publishedAt : ''
  const settings = data.embedSettings as { allowedOrigins?: string[] } | undefined
  originsText.value = (settings?.allowedOrigins || []).join('\n')
}

async function loadMeta() {
  const [apps, config] = await Promise.all([getEmbedAppsApi(), getEmbedConfigApi()])
  embedApps.value = apps || []
  if (config?.tokenTtlSeconds) tokenTtl.value = config.tokenTtlSeconds
}

async function refreshPreviewToken() {
  if (!isPublished.value) {
    previewToken.value = ''
    previewError.value = ''
    return
  }
  previewLoading.value = true
  previewError.value = ''
  try {
    const res = await mintEmbedPreviewTokenApi(props.dashboardId)
    if (!res?.token) {
      previewToken.value = ''
      previewError.value = t('embed.embed_token_mint_failed')
      window['$message']?.error(t('embed.embed_token_mint_failed'))
      return
    }
    previewToken.value = res.token
    embedInstanceKey.value += 1
  } finally {
    previewLoading.value = false
  }
}

function handlePreviewReady() {
  previewError.value = ''
}

function handlePreviewError(payload: { code?: string; message?: string }) {
  if (payload.code === 'timeout') {
    previewError.value = t('embed.embed_preview_timeout')
  } else {
    previewError.value = payload.message || t('embed.embed_preview_error')
  }
}

async function handlePreviewTokenExpired() {
  window['$message']?.warning(t('embed.embed_preview_token_expired'))
  await refreshPreviewToken()
}

async function retryPreview() {
  await refreshPreviewToken()
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    window['$message']?.success(t('embed.embed_copy_success'))
  } catch {
    window['$message']?.error(t('embed.embed_copy_failed'))
  }
}

async function handlePublishToggle(publish: boolean) {
  publishLoading.value = true
  try {
    if (publish) {
      if (!props.projectData) {
        window['$message']?.warning(t('embed.embed_save_first'))
        return
      }
      await saveProjectApi({ id: props.dashboardId, ...props.projectData })
      const origins = originsText.value
        .split('\n')
        .map((o) => o.trim())
        .filter(Boolean)
      const res = await publishEmbedDashboardApi(props.dashboardId, { allowedOrigins: origins })
      if (res?.success) {
        isPublished.value = true
        publishedAt.value = res.publishedAt || new Date().toISOString()
        window['$message']?.success(t('embed.embed_published'))
        emit('saved')
        await refreshPreviewToken()
      }
    } else {
      const confirmed = window.confirm(t('embed.embed_unpublish_confirm'))
      if (!confirmed) return
      const res = await revokeEmbedDashboardApi(props.dashboardId)
      if (res?.success) {
        isPublished.value = false
        publishedAt.value = ''
        previewToken.value = ''
        emit('saved')
      }
    }
  } finally {
    publishLoading.value = false
  }
}

async function createApp() {
  if (!newAppName.value.trim()) return
  appLoading.value = true
  try {
    const origins = originsText.value
      .split('\n')
      .map((o) => o.trim())
      .filter(Boolean)
    const res = await createEmbedAppApi({ name: newAppName.value.trim(), allowedOrigins: origins })
    if (res?.apiKey) {
      newApiKey.value = res.apiKey
      await loadMeta()
      newAppName.value = ''
    }
  } finally {
    appLoading.value = false
  }
}

async function rotateKey(appId: string) {
  rotateLoading.value = appId
  try {
    const res = await rotateEmbedAppKeyApi(appId)
    if (res?.apiKey) {
      newApiKey.value = res.apiKey
      activeTab.value = 'integrate'
      window['$message']?.success(t('embed.embed_copy_success'))
    }
  } finally {
    rotateLoading.value = null
  }
}

function handleClose() {
  newApiKey.value = ''
}

watch(
  () => props.show,
  async (open) => {
    if (open) {
      syncFromProject()
      await loadMeta()
      await refreshPreviewToken()
    }
  }
)

watch(
  () => props.projectData,
  () => syncFromProject(),
  { deep: true }
)

watch(activeTab, async (tab) => {
  if (tab === 'preview' && isPublished.value) {
    await refreshPreviewToken()
  }
})
</script>

<style lang="scss" scoped>
.embed-panel-drawer {
  :deep(.n-drawer-body-content-wrapper) {
    background: #f8fafc;
  }
}

.embed-tabs {
  transition: opacity 0.2s ease;
}

.embed-status-card {
  background: #fff;
  border: 1px solid #e2e8f0;
}

.embed-hint {
  display: block;
  margin-top: 8px;
  font-size: 13px;
}

.embed-preview-frame {
  margin: 0 auto;
  width: 100%;
  min-height: 480px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
  transition: max-width 0.25s ease;
}

.embed-copy-btn {
  cursor: pointer;
  margin-top: 8px;
}
</style>
