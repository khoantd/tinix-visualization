<template>
  <n-modal
    v-model:show="visible"
    preset="card"
    title="Lưu thành tập dữ liệu"
    style="width: 480px"
    :mask-closable="false"
  >
    <n-form-item label="Tên tập dữ liệu" required>
      <n-input v-model:value="name" placeholder="Doanh thu theo vùng" />
    </n-form-item>

    <n-form-item label="Chính sách làm mới">
      <n-radio-group v-model:value="refreshPolicy">
        <n-space vertical>
          <n-radio value="manual">Thủ công (Refresh trong thư viện)</n-radio>
          <n-radio value="on_load">Tự động khi biểu đồ tải dữ liệu</n-radio>
        </n-space>
      </n-radio-group>
    </n-form-item>

    <n-alert type="info" :bordered="false" style="margin-bottom: 12px">
      Xem trước: {{ previewRowCount }} bản ghi sẽ được lưu.
    </n-alert>

    <template #footer>
      <n-space justify="end">
        <n-button @click="visible = false">Hủy</n-button>
        <n-button type="primary" :loading="saving" :disabled="!name.trim()" @click="handleSave">
          Lưu tập dữ liệu
        </n-button>
      </n-space>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  NModal, NFormItem, NInput, NRadioGroup, NRadio, NSpace, NButton, NAlert, useMessage,
} from 'naive-ui'
import { getUUID } from '@/utils'
import {
  saveDatasetFromQueryApi,
  saveDatasetFromTableApi,
  type DatasetRefreshPolicy,
  type ConnectorEngine,
} from '@/api/storage.api'

const props = defineProps<{
  show: boolean
  connectorId: string | null
  engine?: ConnectorEngine | null
  sql?: string
  graphqlQuery?: string
  graphqlVariables?: Record<string, unknown> | null
  graphqlRootField?: string | null
  tableRef?: { schema?: string; table: string } | null
  previewRowCount?: number
  defaultName?: string
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

const name = ref('')
const refreshPolicy = ref<DatasetRefreshPolicy>('manual')
const saving = ref(false)

const isGraphQL = computed(() => props.engine === 'graphql')

watch(
  () => props.show,
  (open) => {
    if (open) {
      name.value = props.defaultName || ''
      refreshPolicy.value = 'manual'
    }
  }
)

async function handleSave() {
  if (!props.connectorId) return
  saving.value = true
  try {
    const id = getUUID()
    let result

    if (props.tableRef?.table && !isGraphQL.value) {
      result = await saveDatasetFromTableApi({
        id,
        name: name.value.trim(),
        connectorId: props.connectorId,
        schema: props.tableRef.schema,
        table: props.tableRef.table,
        refreshPolicy: refreshPolicy.value,
      })
    } else if (isGraphQL.value && props.graphqlQuery) {
      if (props.graphqlVariables === null) {
        message.error('Biến GraphQL phải là JSON hợp lệ')
        return
      }
      result = await saveDatasetFromQueryApi({
        id,
        name: name.value.trim(),
        connectorId: props.connectorId,
        query: props.graphqlQuery,
        variables: props.graphqlVariables || {},
        rootField: props.graphqlRootField || undefined,
        refreshPolicy: refreshPolicy.value,
      })
    } else if (props.sql) {
      result = await saveDatasetFromQueryApi({
        id,
        name: name.value.trim(),
        connectorId: props.connectorId,
        sql: props.sql,
        refreshPolicy: refreshPolicy.value,
      })
    } else {
      message.error('Thiếu truy vấn hoặc bảng nguồn')
      return
    }

    if (result?.error) {
      message.error(result.error)
      return
    }

    message.success('Đã lưu tập dữ liệu')
    visible.value = false
    emit('saved')
  } finally {
    saving.value = false
  }
}
</script>
