<template>
  <div class="agent-hub">
    <n-tabs v-model:value="activeTab" type="line" animated class="agent-tabs">
      <n-tab-pane name="overview" :tab="t('agent.agent_tab_overview')">
        <n-space vertical :size="16">
          <n-alert type="info" :show-icon="true">
            {{ t('agent.agent_overview_desc') }}
          </n-alert>
          <n-descriptions :column="1" bordered size="small">
            <n-descriptions-item :label="t('agent.agent_openapi_link')">
              <n-a :href="openapiUrl" target="_blank" rel="noopener">{{ openapiUrl }}</n-a>
            </n-descriptions-item>
            <n-descriptions-item :label="t('agent.agent_mcp_link')">
              <n-text code>packages/tinix-mcp</n-text>
            </n-descriptions-item>
            <n-descriptions-item :label="t('agent.agent_token_ttl')">
              {{ tokenTtl }}s
            </n-descriptions-item>
            <n-descriptions-item :label="t('agent.agent_row_cap')">
              {{ t('agent.agent_row_cap_desc') }}
            </n-descriptions-item>
          </n-descriptions>
        </n-space>
      </n-tab-pane>

      <n-tab-pane name="apps" :tab="t('agent.agent_tab_apps')">
        <n-space vertical :size="16">
          <n-alert v-if="newApiKey" type="warning" :title="t('agent.agent_api_key_once')">
            <n-code :code="newApiKey" language="text" />
            <n-text depth="3" class="agent-hint">{{ t('agent.agent_api_key_warning') }}</n-text>
            <n-button size="small" class="agent-copy-btn" @click="copyText(newApiKey)">
              {{ t('global.r_copy') }}
            </n-button>
          </n-alert>

          <n-card v-if="!newApiKey" size="small" embedded>
            <n-form label-placement="top">
              <n-form-item :label="t('agent.agent_app_name')">
                <n-input
                  v-model:value="newAppName"
                  :placeholder="t('agent.agent_app_name_placeholder')"
                  style="max-width: 320px"
                />
              </n-form-item>
              <n-form-item :label="t('agent.agent_scopes_label')">
                <n-checkbox-group v-model:value="selectedScopes">
                  <n-space vertical>
                    <n-checkbox value="catalog:read" :label="t('agent.agent_scope_catalog')" />
                    <n-checkbox value="data:read" :label="t('agent.agent_scope_data')" />
                    <n-checkbox value="auto_bi" :label="t('agent.agent_scope_auto_bi')" />
                    <n-checkbox value="dashboard:write" :label="t('agent.agent_scope_write')" />
                    <n-checkbox value="dashboard:publish" :label="t('agent.agent_scope_publish')" />
                    <n-checkbox value="embed:mint" :label="t('agent.agent_scope_embed')" />
                  </n-space>
                </n-checkbox-group>
              </n-form-item>
              <n-button type="primary" :loading="appLoading" :disabled="!newAppName.trim()" @click="createApp">
                {{ t('agent.agent_create_app') }}
              </n-button>
            </n-form>
          </n-card>

          <n-spin :show="appsLoading">
            <n-empty v-if="!appsLoading && !agentApps.length" :description="t('agent.agent_no_apps')" />
            <n-list v-else bordered>
              <n-list-item v-for="app in agentApps" :key="app.id">
                <n-space align="center" justify="space-between" style="width: 100%">
                  <n-space vertical :size="4">
                    <n-text strong>{{ app.name }}</n-text>
                    <n-space :size="4">
                      <n-tag v-for="scope in app.scopes" :key="scope" size="small">{{ scope }}</n-tag>
                    </n-space>
                  </n-space>
                  <n-space>
                    <n-button size="small" quaternary :loading="rotateLoading === app.id" @click="rotateKey(app.id)">
                      {{ t('agent.agent_rotate_key') }}
                    </n-button>
                    <n-popconfirm :on-positive-click="() => deleteApp(app.id)">
                      <template #trigger>
                        <n-button size="small" quaternary type="error">{{ t('agent.agent_delete_app') }}</n-button>
                      </template>
                      {{ t('agent.agent_delete_confirm') }}
                    </n-popconfirm>
                  </n-space>
                </n-space>
              </n-list-item>
            </n-list>
          </n-spin>
        </n-space>
      </n-tab-pane>

      <n-tab-pane name="connect" :tab="t('agent.agent_tab_connect')">
        <n-space vertical :size="16">
          <n-input
            v-model:value="testApiKey"
            type="password"
            show-password-on="click"
            placeholder="tag_… (paste API key to test)"
            style="max-width: 400px"
          />
          <n-button type="primary" :loading="testLoading" :disabled="!testApiKey" @click="runConnectionTest">
            {{ t('agent.agent_test_connection') }}
          </n-button>
          <n-alert v-if="testResult" :type="testResult.ok ? 'success' : 'error'" :title="testResult.ok ? t('agent.agent_test_ok') : t('agent.agent_test_failed')">
            <template v-if="testResult.ok">
              {{ t('agent.agent_test_datasets', { count: testResult.datasetCount }) }}
            </template>
            <template v-else>{{ testResult.error }}</template>
          </n-alert>

          <n-divider>{{ t('agent.agent_mcp_snippet') }}</n-divider>
          <n-code :code="mcpSnippet" language="json" word-wrap />
          <n-button size="small" class="agent-copy-btn" @click="copyText(mcpSnippet)">{{ t('global.r_copy') }}</n-button>

          <n-divider>{{ t('agent.agent_curl_snippet') }}</n-divider>
          <n-code :code="curlSnippet" language="shell" word-wrap />
          <n-button size="small" class="agent-copy-btn" @click="copyText(curlSnippet)">{{ t('global.r_copy') }}</n-button>
        </n-space>
      </n-tab-pane>

      <n-tab-pane name="audit" :tab="t('agent.agent_tab_audit')">
        <n-spin :show="auditLoading">
          <n-empty v-if="!auditLoading && !auditLogs.length" :description="t('agent.agent_audit_empty')" />
          <n-data-table
            v-else
            :columns="auditColumns"
            :data="auditLogs"
            :bordered="true"
            size="small"
            :max-height="400"
          />
        </n-spin>
      </n-tab-pane>

      <n-tab-pane name="security" :tab="t('agent.agent_tab_security')">
        <n-descriptions :column="1" bordered size="small">
          <n-descriptions-item :label="t('agent.agent_rate_limit')">
            {{ t('agent.agent_rate_limit_desc') }}
          </n-descriptions-item>
          <n-descriptions-item :label="t('agent.agent_token_ttl')">
            {{ tokenTtl }}s
          </n-descriptions-item>
        </n-descriptions>
      </n-tab-pane>
    </n-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, h } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NTabs, NTabPane, NSpace, NAlert, NDescriptions, NDescriptionsItem, NText, NA,
  NCard, NForm, NFormItem, NInput, NCheckboxGroup, NCheckbox, NButton, NCode,
  NSpin, NEmpty, NList, NListItem, NTag, NPopconfirm, NDivider, NDataTable, useMessage,
  type DataTableColumns,
} from 'naive-ui'
import {
  getAgentConfigApi,
  getAgentAppsApi,
  createAgentAppApi,
  rotateAgentAppKeyApi,
  deleteAgentAppApi,
  testAgentConnectionApi,
  getAgentAuditLogsApi,
  type AgentApp,
  type AgentScope,
} from '@/api/storage.api'

const { t } = useI18n()
const message = useMessage()

const activeTab = ref('overview')
const tokenTtl = ref(300)
const agentApps = ref<AgentApp[]>([])
const appsLoading = ref(false)
const appLoading = ref(false)
const newAppName = ref('')
const newApiKey = ref('')
const selectedScopes = ref<AgentScope[]>(['catalog:read', 'data:read'])
const rotateLoading = ref<string | null>(null)
const testApiKey = ref('')
const testLoading = ref(false)
const testResult = ref<{ ok: boolean; datasetCount?: number; error?: string } | null>(null)
const auditLogs = ref<Record<string, unknown>[]>([])
const auditLoading = ref(false)

const baseUrl = computed(() => window.location.origin.replace(/\/$/, ''))
const openapiUrl = computed(() => `${baseUrl.value}/docs/openapi/agent-v1.yaml`)

const mcpSnippet = computed(() => JSON.stringify({
  mcpServers: {
    tinix: {
      command: 'node',
      args: ['packages/tinix-mcp/dist/index.js'],
      env: {
        TINIX_BASE_URL: baseUrl.value,
        TINIX_AGENT_API_KEY: 'tag_your_key_here',
      },
    },
  },
}, null, 2))

const curlSnippet = computed(() => `curl -X POST '${baseUrl.value}/api/agent/v1/token' \\
  -H 'Content-Type: application/json' \\
  -H 'X-Agent-Api-Key: tag_your_key_here' \\
  -d '{"user":{"id":"agent-user"}}'`)

const auditColumns = computed<DataTableColumns>(() => [
  { title: t('agent.agent_audit_tool'), key: 'toolOrRoute', ellipsis: { tooltip: true } },
  { title: t('agent.agent_audit_status'), key: 'status', width: 80 },
  {
    title: t('agent.agent_audit_time'),
    key: 'createdAt',
    width: 180,
    render: (row) => h(NText, { depth: 3 }, () => String(row.createdAt || '')),
  },
])

async function fetchConfig() {
  const config = await getAgentConfigApi()
  if (config?.tokenTtlSeconds) tokenTtl.value = config.tokenTtlSeconds
}

async function fetchApps() {
  appsLoading.value = true
  try {
    agentApps.value = await getAgentAppsApi()
  } finally {
    appsLoading.value = false
  }
}

async function fetchAudit() {
  auditLoading.value = true
  try {
    auditLogs.value = await getAgentAuditLogsApi({ limit: 50 })
  } finally {
    auditLoading.value = false
  }
}

async function createApp() {
  if (!newAppName.value.trim()) return
  appLoading.value = true
  try {
    const result = await createAgentAppApi({
      name: newAppName.value.trim(),
      scopes: selectedScopes.value,
    })
    if (result?.apiKey) {
      newApiKey.value = result.apiKey
      newAppName.value = ''
      message.success(t('agent.agent_create_app'))
      await fetchApps()
    }
  } finally {
    appLoading.value = false
  }
}

async function rotateKey(appId: string) {
  rotateLoading.value = appId
  try {
    const result = await rotateAgentAppKeyApi(appId)
    if (result?.apiKey) {
      newApiKey.value = result.apiKey
      message.success(t('agent.agent_rotate_key'))
    }
  } finally {
    rotateLoading.value = null
  }
}

async function deleteApp(appId: string) {
  await deleteAgentAppApi(appId)
  await fetchApps()
}

async function runConnectionTest() {
  testLoading.value = true
  testResult.value = null
  try {
    testResult.value = await testAgentConnectionApi(testApiKey.value)
  } finally {
    testLoading.value = false
  }
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    message.success(t('agent.agent_copy_success'))
  } catch {
    message.error(t('agent.agent_copy_failed'))
  }
}

onMounted(async () => {
  await Promise.all([fetchConfig(), fetchApps(), fetchAudit()])
})
</script>

<style scoped lang="scss">
.agent-hub {
  padding: 8px 0;
  min-height: 400px;
}

.agent-hint {
  display: block;
  margin-top: 8px;
  font-size: 13px;
}

.agent-copy-btn {
  margin-top: 8px;
  min-height: 44px;
}

.agent-tabs :deep(.n-tabs-tab) {
  min-height: 44px;
}

@media (prefers-reduced-motion: reduce) {
  .agent-tabs :deep(.n-tabs-pane-wrapper) {
    transition: none !important;
  }
}
</style>
