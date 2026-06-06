<template>
  <div class="ai-provider-settings">
    <n-spin :show="loading">
      <n-alert v-if="configuredProviders.length === 0" type="warning" title="Chưa cấu hình AI provider">
        Sao chép <code>.env.example</code> thành <code>.env</code> và điền
        <strong>OPENROUTER_API_KEY</strong> hoặc <strong>LITELLM_BASE_URL</strong> trên server.
      </n-alert>

      <template v-else>
        <n-form-item label="Nhà cung cấp AI cho Auto-BI">
          <n-radio-group v-model:value="activeProvider" @update:value="handleProviderChange">
            <n-space vertical>
              <n-radio
                v-for="item in configuredProviders"
                :key="item.id"
                :value="item.id"
              >
                {{ item.label }}
                <n-text v-if="item.model" depth="3" style="margin-left: 8px">
                  ({{ item.model }})
                </n-text>
              </n-radio>
            </n-space>
          </n-radio-group>
        </n-form-item>

        <n-text depth="3" style="font-size: 13px">
          Lựa chọn được lưu trên server và áp dụng cho mọi phiên Auto-BI.
          Thông tin xác thực (API key, URL) chỉ cấu hình qua file <code>.env</code>.
        </n-text>
      </template>
    </n-spin>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  NAlert,
  NFormItem,
  NRadioGroup,
  NRadio,
  NSpace,
  NSpin,
  NText,
  useMessage,
} from 'naive-ui'
import {
  getAutoBiProvidersApi,
  saveGlobalSettingsApi,
  type AiProviderId,
  type AiProviderInfo,
} from '@/api/storage.api'

const message = useMessage()

const loading = ref(false)
const providers = ref<AiProviderInfo[]>([])
const activeProvider = ref<AiProviderId | null>(null)

const configuredProviders = computed(() => providers.value.filter(p => p.configured))

const loadProviders = async () => {
  loading.value = true
  try {
    const data = await getAutoBiProvidersApi()
    if (!data) return

    providers.value = data.providers
    const fallback = data.activeProvider || data.defaultProvider
    if (fallback && data.providers.some(p => p.id === fallback && p.configured)) {
      activeProvider.value = fallback
    } else {
      activeProvider.value = configuredProviders.value[0]?.id ?? null
    }
  } finally {
    loading.value = false
  }
}

const handleProviderChange = async (value: AiProviderId) => {
  const saved = await saveGlobalSettingsApi({ activeProvider: value }, 'ai_setting')
  if (saved) {
    message.success('Đã cập nhật nhà cung cấp AI.')
  } else {
    message.error('Không thể lưu cấu hình AI.')
  }
}

onMounted(() => {
  loadProviders()
})

defineExpose({ reload: loadProviders, activeProvider })
</script>

<style scoped lang="scss">
.ai-provider-settings {
  min-width: 320px;

  code {
    font-size: 12px;
    background: rgba(128, 128, 128, 0.15);
    padding: 1px 4px;
    border-radius: 3px;
  }
}
</style>
