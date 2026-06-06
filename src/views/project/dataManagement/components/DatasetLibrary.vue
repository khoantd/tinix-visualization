<template>
  <div class="dataset-library">
    <div v-if="currentView === 'list'" class="view-list">
      <div class="content-header">
        <n-space justify="space-between" align="center">
          <div>
            <n-text strong style="font-size: 16px">Thư viện Dữ liệu</n-text>
            <n-text depth="3" style="display: block; margin-top: 4px; font-size: 13px">
              Tập tin tải lên và tập dữ liệu SQL từ kết nối DB
            </n-text>
          </div>
          <n-space>
            <n-tooltip v-if="!autoBiEnabled" trigger="hover">
              <template #trigger>
                <n-button secondary disabled>
                  <template #icon>
                    <n-icon :component="SettingsSharpIcon" />
                  </template>
                  Cấu hình AI
                </n-button>
              </template>
              {{ t('features.auto_bi_disabled_tooltip') }}
            </n-tooltip>
            <n-button v-else secondary @click="showAiSettings = true">
              <template #icon>
                <n-icon :component="SettingsSharpIcon" />
              </template>
              Cấu hình AI
            </n-button>
            <n-upload
              :show-file-list="false"
              :custom-request="customUploadRequest"
              accept=".json,.csv,.xlsx,.xls"
            >
              <n-button type="primary">
                <template #icon>
                  <n-icon :component="ShareIcon" />
                </template>
                Tải lên tập dữ liệu
              </n-button>
            </n-upload>
          </n-space>
        </n-space>
      </div>

      <n-divider style="margin: 12px 0" />

      <div class="table-wrap">
        <n-data-table
          :columns="columns"
          :data="datasetList"
          :loading="loading"
          :pagination="pagination"
          size="small"
        />
      </div>
    </div>

    <div v-else-if="currentView === 'auto-bi'" class="view-auto-bi">
      <AutoBIWizard
        :dataset="selectedDataset"
        @back="currentView = 'list'"
        @complete="fetchDatasets"
      />
    </div>

    <div v-else class="view-detail">
      <div class="content-header">
        <n-space justify="space-between" align="center">
          <n-space align="center">
            <n-button secondary @click="currentView = 'list'">
              <template #icon>
                <n-icon :component="ArrowBackIcon" />
              </template>
              Quay lại
            </n-button>
            <n-text strong>Chi tiết: {{ selectedDatasetName }}</n-text>
          </n-space>
          <n-tag type="info">{{ previewData.length }} bản ghi</n-tag>
        </n-space>
      </div>

      <n-divider />

      <div class="table-container">
        <n-data-table
          :columns="previewColumns"
          :data="previewData"
          flex-height
          class="excel-table"
          :pagination="{ pageSize: 20 }"
        />
      </div>
    </div>

    <n-modal v-model:show="showAiSettings" preset="card" title="Cấu hình AI (Auto-BI)" style="width: 480px">
      <AiProviderSettings />
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, h, reactive, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTinixFeatures } from '@/hooks/useTinixFeatures'
import { icon } from '@/plugins'
import {
  getDatasetsApi,
  saveDatasetApi,
  deleteDatasetApi,
  refreshDatasetApi,
  getDatasetApi,
  type DatasetRecord,
  type DatasetSourceType,
} from '@/api/storage.api'
import {
  NButton, NSpace, NTag, useDialog, useMessage, NDataTable, NDivider,
  NUpload, NIcon, NModal, NText, NTooltip,
} from 'naive-ui'
import { getUUID } from '@/utils'
import * as XLSX from 'xlsx'
import AutoBIWizard from './AutoBIWizard.vue'
import AiProviderSettings from './AiProviderSettings.vue'

const { ShareIcon, TrashIcon, ArrowBackIcon, FlashIcon, SettingsSharpIcon, RefreshIcon } = icon.ionicons5
const { t } = useI18n()
const { hasModule } = useTinixFeatures()
const autoBiEnabled = computed(() => hasModule('auto-bi'))
const message = useMessage()
const dialog = useDialog()

const loading = ref(false)
const datasetList = ref<DatasetRecord[]>([])
const currentView = ref<'list' | 'detail' | 'auto-bi'>('list')
const selectedDatasetName = ref('')
const selectedDataset = ref<DatasetRecord | null>(null)
const showAiSettings = ref(false)
const previewData = ref<any[]>([])
const previewColumns = ref<any[]>([])

const pagination = reactive({
  page: 1,
  pageSize: 10,
  showSizePicker: true,
  pageSizes: [10, 20, 50],
})

function sourceLabel(source: DatasetSourceType | undefined) {
  if (source === 'sql') return 'SQL'
  if (source === 'table') return 'Bảng DB'
  return 'Tải lên'
}

function sourceTagType(source: DatasetSourceType | undefined) {
  if (source === 'sql') return 'warning'
  if (source === 'table') return 'info'
  return 'success'
}

const columns = [
  { title: 'Tên tập dữ liệu', key: 'name', minWidth: 160 },
  {
    title: 'Nguồn',
    key: 'source_type',
    width: 110,
    render(row: DatasetRecord) {
      return h(NTag, { type: sourceTagType(row.source_type), size: 'small' }, {
        default: () => sourceLabel(row.source_type),
      })
    },
  },
  {
    title: 'Kết nối',
    key: 'connector_name',
    width: 140,
    render(row: DatasetRecord) {
      return row.connector_name || '—'
    },
  },
  {
    title: 'Định dạng',
    key: 'type',
    width: 90,
    render(row: DatasetRecord) {
      return h(NTag, { size: 'small' }, { default: () => (row.type || 'json').toUpperCase() })
    },
  },
  { title: 'Ngày cập nhật', key: 'updated_at', width: 160 },
  {
    title: 'Thao tác',
    key: 'actions',
    width: 300,
    render(row: DatasetRecord) {
      const autoBiBtn = autoBiEnabled.value
        ? h(NButton, {
          size: 'small',
          type: 'primary',
          ghost: true,
          onClick: () => {
            selectedDataset.value = row
            currentView.value = 'auto-bi'
          },
        }, {
          default: () => 'Auto-BI',
          icon: () => h(NIcon, null, { default: () => h(FlashIcon) }),
        })
        : h(NTooltip, { trigger: 'hover' }, {
          trigger: () => h(NButton, {
            size: 'small',
            type: 'primary',
            ghost: true,
            disabled: true,
          }, {
            default: () => 'Auto-BI',
            icon: () => h(NIcon, null, { default: () => h(FlashIcon) }),
          }),
          default: () => t('features.auto_bi_disabled_tooltip'),
        })

      const actions = [
        autoBiBtn,
        h(NButton, {
          size: 'small',
          onClick: () => handlePreview(row),
        }, { default: () => 'Xem thử' }),
      ]

      if (row.source_type === 'sql' || row.source_type === 'table') {
        actions.push(
          h(NButton, {
            size: 'small',
            secondary: true,
            onClick: () => handleRefresh(row),
          }, {
            icon: () => h(NIcon, null, { default: () => h(RefreshIcon) }),
          })
        )
      }

      actions.push(
        h(NButton, {
          size: 'small',
          type: 'error',
          ghost: true,
          onClick: () => handleDelete(row),
        }, { default: () => 'Xóa' })
      )

      return h(NSpace, { size: 4 }, { default: () => actions })
    },
  },
]

async function fetchDatasets() {
  loading.value = true
  const data = await getDatasetsApi(true)
  if (data) datasetList.value = data
  loading.value = false
}

async function handleRefresh(row: DatasetRecord) {
  const result = await refreshDatasetApi(row.id)
  if (result?.error) {
    message.error(result.error)
    return
  }
  message.success(`Đã làm mới "${row.name}" (${result?.rowCount || 0} bản ghi)`)
  fetchDatasets()
}

const customUploadRequest = async ({ file }: any) => {
  const reader = new FileReader()
  const fileName = file.name
  const extension = fileName.split('.').pop()?.toLowerCase() || 'json'

  reader.onload = async (e) => {
    try {
      let parsedContent: any = null

      if (extension === 'json') {
        parsedContent = JSON.parse(e.target?.result as string)
      } else if (extension === 'csv') {
        const content = e.target?.result as string
        const lines = content.split('\n').filter(l => l.trim())
        const headers = lines[0].split(',')
        parsedContent = lines.slice(1).map(line => {
          const values = line.split(',')
          const obj: any = {}
          headers.forEach((h, i) => { obj[h.trim()] = values[i]?.trim() })
          return obj
        })
      } else if (extension === 'xlsx' || extension === 'xls') {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const worksheet = workbook.Sheets[workbook.SheetNames[0]]
        parsedContent = XLSX.utils.sheet_to_json(worksheet)
      }

      if (!parsedContent) throw new Error('Không thể parse dữ liệu.')

      await saveDatasetApi({
        id: getUUID(),
        name: fileName,
        type: extension,
        content: parsedContent,
        source_type: 'upload',
      })

      message.success('Tải lên tập dữ liệu thành công!')
      fetchDatasets()
    } catch (err) {
      console.error(err)
      message.error('Lỗi khi đọc file hoặc parser dữ liệu.')
    }
  }

  if (extension === 'xlsx' || extension === 'xls') {
    reader.readAsArrayBuffer(file.file)
  } else {
    reader.readAsText(file.file)
  }
}

async function handlePreview(row: DatasetRecord) {
  let data = row.content
  if (!data || (row.source_type && row.source_type !== 'upload')) {
    const full = await getDatasetApi(row.id, true)
    data = Array.isArray(full?.content) ? full.content : full
  }
  if (!Array.isArray(data) || data.length === 0) {
    message.warning('Dữ liệu không phải dạng danh sách để hiển thị bảng.')
    return
  }

  const keys = Object.keys(data[0])
  previewColumns.value = keys.map(key => ({
    title: key,
    key,
    resizable: true,
    minWidth: 100,
    render(r: any) {
      const val = r[key]
      return typeof val === 'object' ? JSON.stringify(val) : String(val)
    },
  }))

  previewData.value = data
  selectedDatasetName.value = row.name
  currentView.value = 'detail'
}

function handleDelete(row: DatasetRecord) {
  dialog.warning({
    title: 'Xác nhận xóa',
    content: `Bạn có chắc chắn muốn xóa tập dữ liệu "${row.name}"?`,
    positiveText: 'Xác nhận',
    negativeText: 'Hủy',
    onPositiveClick: async () => {
      await deleteDatasetApi(row.id)
      message.success('Đã xóa tập dữ liệu.')
      fetchDatasets()
    },
  })
}

onMounted(fetchDatasets)

defineExpose({ fetchDatasets })
</script>

<style scoped lang="scss">
.dataset-library {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.view-list, .view-detail, .view-auto-bi {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.table-wrap {
  overflow-x: auto;
  flex: 1;
}

.table-container {
  flex: 1;
  overflow: hidden;
}

.excel-table {
  height: 100%;
}
</style>
