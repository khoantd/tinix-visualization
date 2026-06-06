<template>
  <div class="connector-form-fields">
    <template v-if="engine === 'sqlite'">
      <n-form-item label="Đường dẫn file SQLite" required>
        <n-input
          v-model:value="localConfig.filePath"
          placeholder="/path/to/database.sqlite"
          @update:value="emitChange"
        />
      </n-form-item>
    </template>

    <template v-else-if="engine === 'graphql'">
      <n-form-item label="Endpoint URL" required>
        <n-input
          v-model:value="localConfig.endpoint"
          placeholder="https://api.example.com/graphql"
          @update:value="emitChange"
        />
      </n-form-item>
      <n-alert
        v-if="showHttpWarning"
        type="warning"
        :bordered="false"
        style="margin-bottom: 12px"
        role="alert"
      >
        Endpoint không dùng HTTPS. Chỉ nên dùng HTTP cho môi trường phát triển cục bộ.
      </n-alert>
      <n-form-item label="Xác thực">
        <n-select
          v-model:value="localConfig.authType"
          :options="authTypeOptions"
          @update:value="emitChange"
        />
      </n-form-item>
      <n-form-item v-if="localConfig.authType === 'bearer'" :label="tokenLabel">
        <n-input
          v-model:value="localToken"
          type="password"
          show-password-on="click"
          :placeholder="tokenPlaceholder"
          @update:value="emitToken"
        />
      </n-form-item>
      <template v-if="localConfig.authType === 'api_key'">
        <n-form-item label="Tên header API Key">
          <n-input
            v-model:value="localConfig.authHeaderName"
            placeholder="X-API-Key"
            @update:value="emitChange"
          />
        </n-form-item>
        <n-form-item :label="apiKeyLabel">
          <n-input
            v-model:value="localApiKey"
            type="password"
            show-password-on="click"
            :placeholder="apiKeyPlaceholder"
            @update:value="emitApiKey"
          />
        </n-form-item>
      </template>
      <template v-if="localConfig.authType === 'basic'">
        <n-form-item label="Tên người dùng" required>
          <n-input
            v-model:value="localConfig.basicUsername"
            placeholder="readonly_user"
            @update:value="emitChange"
          />
        </n-form-item>
        <n-form-item :label="basicPasswordLabel">
          <n-input
            v-model:value="localBasicPassword"
            type="password"
            show-password-on="click"
            :placeholder="basicPasswordPlaceholder"
            @update:value="emitBasicPassword"
          />
        </n-form-item>
      </template>
      <n-form-item label="Cho phép introspection">
        <n-switch v-model:value="localConfig.allowIntrospection" @update:value="emitChange" />
      </n-form-item>
      <n-text v-if="localConfig.allowIntrospection === false" depth="3" style="font-size: 12px; display: block; margin: -8px 0 12px">
        Tắt introspection khi API không hỗ trợ. Bạn vẫn có thể viết truy vấn thủ công trong Query Lab.
      </n-text>
      <n-collapse>
        <n-collapse-item title="Header tùy chỉnh (không bí mật)" name="headers">
          <MonacoEditor
            v-model:modelValue="customHeadersJson"
            language="json"
            height="120px"
            :editor-options="{ minimap: { enabled: false }, fontSize: 12 }"
            @update:modelValue="handleCustomHeadersChange"
          />
        </n-collapse-item>
      </n-collapse>
    </template>

    <template v-else>
      <n-grid :cols="2" :x-gap="12">
        <n-gi>
          <n-form-item label="Máy chủ" required>
            <n-input v-model:value="localConfig.host" placeholder="127.0.0.1" @update:value="emitChange" />
          </n-form-item>
        </n-gi>
        <n-gi>
          <n-form-item label="Cổng" required>
            <n-input-number
              v-model:value="localConfig.port"
              :min="1"
              :max="65535"
              style="width: 100%"
              @update:value="emitChange"
            />
          </n-form-item>
        </n-gi>
      </n-grid>
      <n-form-item label="Cơ sở dữ liệu" required>
        <n-input v-model:value="localConfig.database" placeholder="analytics" @update:value="emitChange" />
      </n-form-item>
      <n-form-item label="Tên người dùng" required>
        <n-input v-model:value="localConfig.username" placeholder="readonly_user" @update:value="emitChange" />
      </n-form-item>
      <n-form-item :label="passwordLabel">
        <n-input
          v-model:value="localPassword"
          type="password"
          show-password-on="click"
          :placeholder="passwordPlaceholder"
          @update:value="emitPassword"
        />
      </n-form-item>
      <n-form-item label="SSL">
        <n-switch v-model:value="localConfig.ssl" @update:value="emitChange" />
      </n-form-item>
    </template>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, watch, computed } from 'vue'
import {
  NFormItem, NInput, NInputNumber, NGrid, NGi, NSwitch, NSelect, NAlert, NText, NCollapse, NCollapseItem,
} from 'naive-ui'
import MonacoEditor from '@/components/Pages/MonacoEditor/index.vue'
import type { ConnectorEngine, ConnectorConfigPublic, ConnectorAuthType } from '@/api/storage.api'

const props = defineProps<{
  engine: ConnectorEngine
  config?: ConnectorConfigPublic
  defaultPort?: number | null
  isEdit?: boolean
}>()

const emit = defineEmits<{
  'update:config': [value: Record<string, unknown>]
  'update:password': [value: string]
  'update:token': [value: string]
  'update:apiKey': [value: string]
  'update:basicPassword': [value: string]
}>()

const authTypeOptions = [
  { label: 'Không', value: 'none' },
  { label: 'Bearer token', value: 'bearer' },
  { label: 'API Key (header)', value: 'api_key' },
  { label: 'Basic auth', value: 'basic' },
]

const localConfig = reactive({
  host: props.config?.host || '127.0.0.1',
  port: props.config?.port || props.defaultPort || 5432,
  database: props.config?.database || '',
  username: props.config?.username || '',
  ssl: props.config?.ssl || false,
  filePath: props.config?.filePath || '',
  endpoint: props.config?.endpoint || '',
  authType: (props.config?.authType || 'none') as ConnectorAuthType,
  authHeaderName: props.config?.authHeaderName || 'X-API-Key',
  allowIntrospection: props.config?.allowIntrospection !== false,
  basicUsername: props.config?.basicUsername || '',
  customHeaders: props.config?.customHeaders || {},
})

const localPassword = ref('')
const localToken = ref('')
const localApiKey = ref('')
const localBasicPassword = ref('')
const customHeadersJson = ref(JSON.stringify(localConfig.customHeaders || {}, null, 2))

const passwordLabel = computed(() =>
  props.isEdit && props.config?.passwordSet ? 'Mật khẩu (để trống nếu không đổi)' : 'Mật khẩu'
)
const passwordPlaceholder = computed(() =>
  props.isEdit && props.config?.passwordSet ? '••••••••' : 'Nhập mật khẩu'
)
const tokenLabel = computed(() =>
  props.isEdit && props.config?.tokenSet ? 'Bearer token (để trống nếu không đổi)' : 'Bearer token'
)
const tokenPlaceholder = computed(() =>
  props.isEdit && props.config?.tokenSet ? '••••••••' : 'Nhập token'
)
const apiKeyLabel = computed(() =>
  props.isEdit && props.config?.apiKeySet ? 'API Key (để trống nếu không đổi)' : 'API Key'
)
const apiKeyPlaceholder = computed(() =>
  props.isEdit && props.config?.apiKeySet ? '••••••••' : 'Nhập API key'
)
const basicPasswordLabel = computed(() =>
  props.isEdit && props.config?.basicPasswordSet ? 'Mật khẩu (để trống nếu không đổi)' : 'Mật khẩu'
)
const basicPasswordPlaceholder = computed(() =>
  props.isEdit && props.config?.basicPasswordSet ? '••••••••' : 'Nhập mật khẩu'
)

const showHttpWarning = computed(() => {
  if (props.engine !== 'graphql') return false
  try {
    const url = new URL(localConfig.endpoint)
    return url.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(url.hostname)
  } catch {
    return false
  }
})

watch(
  () => props.engine,
  (engine) => {
    if (engine === 'postgres') localConfig.port = 5432
    else if (engine === 'mysql') localConfig.port = 3306
    else if (engine === 'graphql') {
      localConfig.authType = localConfig.authType || 'none'
      localConfig.allowIntrospection = localConfig.allowIntrospection !== false
    }
  }
)

function emitChange() {
  emit('update:config', { ...localConfig })
}

function emitPassword(val: string) {
  emit('update:password', val)
}

function emitToken(val: string) {
  emit('update:token', val)
}

function emitApiKey(val: string) {
  emit('update:apiKey', val)
}

function emitBasicPassword(val: string) {
  emit('update:basicPassword', val)
}

function handleCustomHeadersChange(val: string) {
  customHeadersJson.value = val
  try {
    const parsed = val.trim() ? JSON.parse(val) : {}
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      localConfig.customHeaders = parsed as Record<string, string>
      emitChange()
    }
  } catch {
    // ignore invalid JSON while typing
  }
}

emitChange()
</script>
