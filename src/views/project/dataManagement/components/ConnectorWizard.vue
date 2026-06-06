<template>
  <n-modal
    v-model:show="visible"
    preset="card"
    :title="isEdit ? 'Chỉnh sửa kết nối' : 'Thêm kết nối dữ liệu'"
    style="width: 560px"
    :mask-closable="false"
    @after-leave="resetWizard"
  >
    <n-steps :current="step" size="small" class="connector-wizard-steps" style="margin-bottom: 20px">
      <n-step title="Chọn engine" />
      <n-step title="Cấu hình" />
      <n-step title="Kiểm tra" />
    </n-steps>

    <div v-if="step === 1">
      <n-spin :show="enginesLoading">
        <n-alert
          v-if="enginesError"
          type="warning"
          role="alert"
          style="margin-bottom: 12px"
        >
          {{ enginesError }}
          <div v-if="usingFallback" style="margin-top: 8px">
            <n-button size="small" :loading="enginesLoading" @click="loadEngines">
              Thử lại
            </n-button>
          </div>
        </n-alert>
        <div class="engine-grid" role="radiogroup" aria-label="Chọn loại kết nối dữ liệu">
          <button
            v-for="eng in engines"
            :key="eng.id"
            type="button"
            class="engine-card"
            :class="{ active: selectedEngine === eng.id }"
            role="radio"
            :aria-checked="selectedEngine === eng.id"
            @click="selectedEngine = eng.id"
          >
            <span v-if="selectedEngine === eng.id" class="engine-check" aria-hidden="true">✓</span>
            <span class="engine-label">{{ eng.label }}</span>
            <span class="engine-port">
              {{ engineSubtitle(eng) }}
            </span>
          </button>
        </div>
      </n-spin>
    </div>

    <div v-else-if="step === 2">
      <n-form-item label="Tên kết nối" required>
        <n-input v-model:value="name" placeholder="Production PostgreSQL" />
      </n-form-item>
      <ConnectorFormFields
        v-if="selectedEngine"
        :engine="selectedEngine"
        :config="editConfig"
        :default-port="currentEngine?.defaultPort"
        :is-edit="isEdit"
        @update:config="formConfig = $event"
        @update:password="password = $event"
        @update:token="token = $event"
        @update:api-key="apiKey = $event"
        @update:basic-password="basicPassword = $event"
      />
    </div>

    <div v-else>
      <n-spin :show="testing">
        <n-alert v-if="testError" type="error" role="alert" style="margin-bottom: 12px">
          {{ testError }}
        </n-alert>
        <n-alert v-else-if="testSuccess" type="success" role="status" style="margin-bottom: 12px">
          Kết nối thành công. Bạn có thể lưu cấu hình này.
        </n-alert>
        <n-descriptions v-if="selectedEngine" bordered size="small" :column="1">
          <n-descriptions-item label="Engine">{{ currentEngine?.label }}</n-descriptions-item>
          <n-descriptions-item label="Tên">{{ name }}</n-descriptions-item>
          <n-descriptions-item label="Endpoint">
            {{ summaryPreview }}
          </n-descriptions-item>
        </n-descriptions>
      </n-spin>
    </div>

    <template #footer>
      <n-space justify="space-between">
        <n-button v-if="step > 1" secondary @click="step -= 1">Quay lại</n-button>
        <span v-else />
        <n-space>
          <n-button @click="visible = false">Hủy</n-button>
          <n-button v-if="step < 3" type="primary" :disabled="!canNext" @click="goNext">
            Tiếp theo
          </n-button>
          <n-button
            v-else-if="!testSuccess"
            type="warning"
            :loading="testing"
            @click="handleTest"
          >
            Kiểm tra kết nối
          </n-button>
          <n-button v-else type="primary" :loading="saving" @click="handleSave">
            Lưu kết nối
          </n-button>
        </n-space>
      </n-space>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  NModal, NSteps, NStep, NFormItem, NInput, NButton, NSpace,
  NAlert, NSpin, NDescriptions, NDescriptionsItem, useMessage,
} from 'naive-ui'
import { getUUID } from '@/utils'
import { CONNECTOR_ENGINES } from '@/constants/connectorEngines'
import {
  getConnectorEnginesApi,
  createConnectorApi,
  updateConnectorApi,
  testConnectorApi,
  type DbConnector,
  type ConnectorEngine,
  type ConnectorEngineInfo,
  type ConnectorConfigPublic,
} from '@/api/storage.api'
import ConnectorFormFields from './ConnectorFormFields.vue'

const props = defineProps<{
  show: boolean
  editConnector?: DbConnector | null
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
  saved: []
}>()

const message = useMessage()
const visible = computed({
  get: () => props.show,
  set: (v) => emit('update:show', v),
})

const step = ref(1)
const engines = ref<ConnectorEngineInfo[]>([])
const enginesLoading = ref(false)
const enginesError = ref('')
const usingFallback = ref(false)
const selectedEngine = ref<ConnectorEngine>('postgres')
const name = ref('')
const formConfig = ref<Record<string, unknown>>({})
const password = ref('')
const token = ref('')
const apiKey = ref('')
const basicPassword = ref('')
const editConfig = ref<ConnectorConfigPublic | undefined>()
const testing = ref(false)
const saving = ref(false)
const testSuccess = ref(false)
const testError = ref('')
const pendingConnectorId = ref<string | null>(null)

const isEdit = computed(() => Boolean(props.editConnector?.id))
const currentEngine = computed(() => engines.value.find(e => e.id === selectedEngine.value))

function engineSubtitle(eng: ConnectorEngineInfo) {
  if (eng.id === 'graphql') return 'HTTP endpoint'
  if (eng.id === 'sqlite') return 'File local'
  return eng.defaultPort ? `Port ${eng.defaultPort}` : ''
}

function isValidUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function buildSecretsPayload() {
  return {
    password: password.value || undefined,
    token: token.value || undefined,
    apiKey: apiKey.value || undefined,
    basicPassword: basicPassword.value || undefined,
  }
}

const summaryPreview = computed(() => {
  if (selectedEngine.value === 'sqlite') return String(formConfig.value.filePath || '—')
  if (selectedEngine.value === 'graphql') {
    try {
      const url = new URL(String(formConfig.value.endpoint || ''))
      return `${url.hostname}${url.pathname !== '/' ? url.pathname : ''}`
    } catch {
      return String(formConfig.value.endpoint || '—')
    }
  }
  const host = formConfig.value.host || '—'
  const port = formConfig.value.port ? `:${formConfig.value.port}` : ''
  const db = formConfig.value.database ? `/${formConfig.value.database}` : ''
  return `${host}${port}${db}`
})

const canNext = computed(() => {
  if (step.value === 1) {
    return !enginesLoading.value && engines.value.length > 0 && Boolean(selectedEngine.value)
  }
  if (step.value === 2) {
    if (!name.value.trim()) return false
    if (selectedEngine.value === 'sqlite') return Boolean(formConfig.value.filePath)
    if (selectedEngine.value === 'graphql') {
      if (!isValidUrl(String(formConfig.value.endpoint || ''))) return false
      if (formConfig.value.authType === 'basic' && !formConfig.value.basicUsername) return false
      return true
    }
    return Boolean(formConfig.value.host && formConfig.value.database && formConfig.value.username)
  }
  return true
})

async function loadEngines() {
  enginesLoading.value = true
  enginesError.value = ''
  usingFallback.value = false
  try {
    const fromApi = await getConnectorEnginesApi()
    if (fromApi && fromApi.length > 0) {
      engines.value = fromApi
      return
    }
    engines.value = [...CONNECTOR_ENGINES]
    usingFallback.value = true
    enginesError.value =
      'Không tải được danh sách engine từ server. Đang dùng danh sách cục bộ. Kiểm tra backend (port 4000) và thử lại.'
  } finally {
    enginesLoading.value = false
  }
}

watch(
  () => props.show,
  async (open) => {
    if (!open) return
    if (props.editConnector) {
      selectedEngine.value = props.editConnector.engine
      name.value = props.editConnector.name
      editConfig.value = props.editConnector.config
      formConfig.value = { ...props.editConnector.config }
      step.value = 2
    } else {
      resetWizard()
    }
    await loadEngines()
  }
)

function resetWizard() {
  step.value = 1
  selectedEngine.value = 'postgres'
  name.value = ''
  formConfig.value = {}
  password.value = ''
  token.value = ''
  apiKey.value = ''
  basicPassword.value = ''
  editConfig.value = undefined
  testSuccess.value = false
  testError.value = ''
  pendingConnectorId.value = null
  enginesError.value = ''
  usingFallback.value = false
}

function goNext() {
  if (step.value === 2) {
    testSuccess.value = false
    testError.value = ''
  }
  step.value += 1
}

async function handleTest() {
  testing.value = true
  testError.value = ''
  testSuccess.value = false
  try {
    let connectorId = props.editConnector?.id || pendingConnectorId.value
    if (!connectorId) {
      connectorId = getUUID()
      const created = await createConnectorApi({
        id: connectorId,
        name: name.value.trim(),
        engine: selectedEngine.value,
        config: formConfig.value,
        ...buildSecretsPayload(),
      })
      if (created?.error) {
        testError.value = created.error
        return
      }
      pendingConnectorId.value = connectorId
    } else {
      const updated = await updateConnectorApi(connectorId, {
        name: name.value.trim(),
        engine: selectedEngine.value,
        config: formConfig.value,
        ...buildSecretsPayload(),
      })
      if (updated?.error) {
        testError.value = updated.error
        return
      }
    }
    const result = await testConnectorApi(connectorId)
    if (result?.ok || result?.message) {
      testSuccess.value = true
      message.success('Kết nối thành công')
    } else {
      testError.value = result?.error || 'Kiểm tra kết nối thất bại'
    }
  } catch (err: any) {
    testError.value = err?.error || err?.message || 'Kiểm tra kết nối thất bại'
  } finally {
    testing.value = false
  }
}

async function handleSave() {
  if (pendingConnectorId.value || props.editConnector) {
    message.success('Đã lưu kết nối')
    visible.value = false
    emit('saved')
    return
  }
  saving.value = true
  try {
    await createConnectorApi({
      id: getUUID(),
      name: name.value.trim(),
      engine: selectedEngine.value,
      config: formConfig.value,
      ...buildSecretsPayload(),
    })
    message.success('Đã lưu kết nối')
    visible.value = false
    emit('saved')
  } finally {
    saving.value = false
  }
}

defineExpose({ resetWizard, loadEngines })
</script>

<style scoped lang="scss">
.connector-wizard-steps {
  :deep(.n-step-content-header) {
    color: var(--n-text-color-1);
  }

  :deep(.n-step-content-header__title) {
    font-weight: 500;
  }

  :deep(.n-step-indicator .n-step-indicator-slot__index) {
    color: var(--n-text-color-1);
  }

  :deep(.n-step-splitor) {
    background-color: var(--n-border-color);
  }
}

.engine-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

@media (min-width: 641px) {
  .engine-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.engine-card {
  position: relative;
  appearance: none;
  font: inherit;
  width: 100%;
  border: 1.5px solid var(--n-border-color);
  border-radius: 8px;
  padding: 14px 12px;
  background-color: var(--n-color);
  cursor: pointer;
  text-align: left;
  color: var(--n-text-color-1);
  transition: border-color 0.2s, background-color 0.2s, box-shadow 0.2s;

  &:hover {
    border-color: var(--n-primary-color-hover);
    background-color: var(--n-color-hover, var(--n-color));
  }

  &:focus-visible {
    outline: 2px solid var(--n-primary-color);
    outline-offset: 2px;
  }

  &.active {
    border: 2px solid var(--n-primary-color);
    padding: 13px 11px;
    background-color: color-mix(in srgb, var(--n-primary-color) 14%, var(--n-color));
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--n-primary-color) 22%, transparent);
  }
}

.engine-check {
  position: absolute;
  top: 8px;
  right: 8px;
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
  color: var(--n-primary-color);
}

.engine-label {
  display: block;
  font-weight: 600;
  font-size: 14px;
  line-height: 1.35;
  color: var(--n-text-color-1);
}

.engine-port {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.35;
  color: var(--n-text-color-2);
}

@media (max-width: 640px) {
  .engine-grid {
    grid-template-columns: 1fr;
  }
}
</style>
