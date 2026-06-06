<template>
  <div class="connector-list">
    <div class="content-header">
      <n-space justify="space-between" align="center">
        <div>
          <n-text strong style="font-size: 16px">Kết nối dữ liệu</n-text>
          <n-text depth="3" style="display: block; margin-top: 4px; font-size: 13px">
            Quản lý PostgreSQL, MySQL, SQLite và GraphQL
          </n-text>
        </div>
        <n-button type="primary" @click="openCreate">
          <template #icon>
            <n-icon :component="AddIcon" />
          </template>
          Thêm kết nối
        </n-button>
      </n-space>
    </div>

    <n-divider style="margin: 12px 0" />

    <n-spin :show="loading">
      <div v-if="connectors.length === 0 && !loading" class="empty-state">
        <n-result status="info" title="Chưa có kết nối" description="Thêm kết nối để truy vấn dữ liệu từ cơ sở dữ liệu bên ngoài.">
          <template #footer>
            <n-button type="primary" @click="openCreate">Thêm kết nối đầu tiên</n-button>
          </template>
        </n-result>
      </div>

      <div v-else class="table-wrap">
        <n-data-table
          :columns="columns"
          :data="connectors"
          :pagination="pagination"
          :row-props="rowProps"
          size="small"
        />
      </div>
    </n-spin>

    <ConnectorWizard
      ref="wizardRef"
      v-model:show="showWizard"
      :edit-connector="editConnector"
      @saved="fetchConnectors"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, h, reactive } from 'vue'
import { icon } from '@/plugins'
import {
  NButton, NSpace, NTag, NIcon, NDataTable, NDivider, NText,
  NSpin, NResult, useDialog, useMessage,
} from 'naive-ui'
import {
  getConnectorsApi,
  deleteConnectorApi,
  testConnectorApi,
  type DbConnector,
  type ConnectorStatus,
} from '@/api/storage.api'
import ConnectorWizard from './ConnectorWizard.vue'

const emit = defineEmits<{
  openSqlLab: [connectorId: string]
}>()

const { AddIcon, TrashIcon, CreateIcon, CodeSlashIcon } = icon.ionicons5
const message = useMessage()
const dialog = useDialog()

const loading = ref(false)
const connectors = ref<DbConnector[]>([])
const showWizard = ref(false)
const editConnector = ref<DbConnector | null>(null)
const wizardRef = ref<InstanceType<typeof ConnectorWizard> | null>(null)

const pagination = reactive({
  page: 1,
  pageSize: 10,
  showSizePicker: true,
  pageSizes: [10, 20, 50],
})

function statusTagType(status: ConnectorStatus) {
  if (status === 'connected') return 'success'
  if (status === 'error') return 'error'
  return 'default'
}

function statusLabel(status: ConnectorStatus) {
  if (status === 'connected') return 'Đã kết nối'
  if (status === 'error') return 'Lỗi'
  return 'Chưa kiểm tra'
}

function engineLabel(engine: string) {
  if (engine === 'postgres') return 'PostgreSQL'
  if (engine === 'mysql') return 'MySQL'
  if (engine === 'sqlite') return 'SQLite'
  if (engine === 'graphql') return 'GraphQL'
  return engine
}

function engineTagType(engine: string) {
  if (engine === 'graphql') return 'warning'
  return 'info'
}

const columns = [
  { title: 'Tên', key: 'name', minWidth: 140 },
  {
    title: 'Engine',
    key: 'engine',
    width: 120,
    render(row: DbConnector) {
      return h(NTag, { size: 'small', type: engineTagType(row.engine) }, { default: () => engineLabel(row.engine) })
    },
  },
  { title: 'Endpoint', key: 'connectionSummary', ellipsis: { tooltip: true } },
  {
    title: 'Trạng thái',
    key: 'status',
    width: 130,
    render(row: DbConnector) {
      return h(NTag, { size: 'small', type: statusTagType(row.status) }, {
        default: () => statusLabel(row.status),
      })
    },
  },
  {
    title: 'Kiểm tra lần cuối',
    key: 'lastTestedAt',
    width: 160,
    render(row: DbConnector) {
      return row.lastTestedAt || '—'
    },
  },
  {
    title: 'Thao tác',
    key: 'actions',
    width: 280,
    render(row: DbConnector) {
      return h(NSpace, { size: 4 }, {
        default: () => [
          h(NButton, {
            size: 'small',
            type: 'warning',
            secondary: true,
            onClick: () => handleTest(row),
          }, { default: () => 'Test' }),
          h(NButton, {
            size: 'small',
            onClick: () => emit('openSqlLab', row.id),
          }, {
            default: () => 'Query Lab',
            icon: () => h(NIcon, null, { default: () => h(CodeSlashIcon) }),
          }),
          h(NButton, {
            size: 'small',
            onClick: () => openEdit(row),
          }, {
            icon: () => h(NIcon, null, { default: () => h(CreateIcon) }),
          }),
          h(NButton, {
            size: 'small',
            type: 'error',
            ghost: true,
            onClick: () => handleDelete(row),
          }, {
            icon: () => h(NIcon, null, { default: () => h(TrashIcon) }),
          }),
        ],
      })
    },
  },
]

function rowProps() {
  return {
    style: 'cursor: default; transition: background-color 0.15s;',
  }
}

async function fetchConnectors() {
  loading.value = true
  connectors.value = (await getConnectorsApi()) || []
  loading.value = false
}

function openCreate() {
  editConnector.value = null
  wizardRef.value?.resetWizard?.()
  showWizard.value = true
}

function openEdit(row: DbConnector) {
  editConnector.value = row
  showWizard.value = true
}

async function handleTest(row: DbConnector) {
  const result = await testConnectorApi(row.id)
  if (result?.ok || result?.message) {
    message.success(`"${row.name}": kết nối thành công`)
  } else {
    message.error(result?.error || 'Kiểm tra kết nối thất bại')
  }
  fetchConnectors()
}

function handleDelete(row: DbConnector) {
  dialog.warning({
    title: 'Xác nhận xóa',
    content: `Xóa kết nối "${row.name}"? Không thể xóa nếu còn tập dữ liệu đang sử dụng.`,
    positiveText: 'Xóa',
    negativeText: 'Hủy',
    onPositiveClick: async () => {
      const result = await deleteConnectorApi(row.id)
      if (result?.error) {
        message.error(result.error)
        return
      }
      message.success('Đã xóa kết nối')
      fetchConnectors()
    },
  })
}

onMounted(fetchConnectors)

defineExpose({ fetchConnectors })
</script>

<style scoped lang="scss">
.connector-list {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.content-header {
  padding-bottom: 4px;
}

.table-wrap {
  overflow-x: auto;
}

.empty-state {
  padding: 48px 0;
}
</style>
