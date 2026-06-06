<template>
  <div class="go-chart-data-library">
    <n-space vertical>
      <setting-item-box name="Chọn từ Thư viện" :alone="true">
        <n-select
          v-model:value="selectedDatasetId"
          :options="datasetOptions"
          placeholder="Chọn một tập dữ liệu..."
          :loading="loading"
          @update:value="handleDatasetSelect"
        />
      </setting-item-box>

      <n-button type="primary" ghost @click="fetchDatasets" size="small" :loading="loading">
        <template #icon>
          <n-icon :component="RefreshIcon" />
        </template>
        Làm mới danh sách
      </n-button>

      <n-divider />

      <template v-if="selectedDatasetId">
        <n-space align="center" :size="8">
          <n-text depth="3">Đang sử dụng:</n-text>
          <n-tag type="success" size="small">{{ currentDatasetName }}</n-tag>
          <n-tag v-if="currentSourceLabel" size="small" :type="currentSourceTagType">
            {{ currentSourceLabel }}
          </n-tag>
        </n-space>
      </template>

      <chart-data-matching-and-show :show="!!selectedDatasetId" :ajax="false" />
    </n-space>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { icon } from '@/plugins'
import { getDatasetsApi, getDatasetApi, type DatasetRecord } from '@/api/storage.api'
import { SettingItemBox } from '@/components/Pages/ChartItemSetting'
import { useTargetData } from '../../../hooks/useTargetData.hook'
import { ChartDataMatchingAndShow } from '../ChartDataMatchingAndShow'
import { newFunctionHandle } from '@/utils'
import { NTag, NSpace, NText } from 'naive-ui'

const { RefreshIcon } = icon.ionicons5
const { targetData } = useTargetData()

const loading = ref(false)
const datasets = ref<DatasetRecord[]>([])
const selectedDatasetId = ref<string | null>(null)

const datasetOptions = computed(() =>
  datasets.value.map(d => ({
    label: d.source_type && d.source_type !== 'upload'
      ? `${d.name} (${d.source_type === 'sql' ? 'SQL' : 'DB'})`
      : d.name,
    value: d.id,
  }))
)

const currentDataset = computed(() =>
  datasets.value.find(d => d.id === selectedDatasetId.value)
)

const currentDatasetName = computed(() => currentDataset.value?.name || '')

const currentSourceLabel = computed(() => {
  const s = currentDataset.value?.source_type
  if (s === 'sql') return 'SQL'
  if (s === 'table') return 'Bảng DB'
  return ''
})

const currentSourceTagType = computed(() => {
  const s = currentDataset.value?.source_type
  if (s === 'sql') return 'warning'
  if (s === 'table') return 'info'
  return 'default'
})

const fetchDatasets = async () => {
  loading.value = true
  const data = await getDatasetsApi(false)
  if (data) datasets.value = data
  loading.value = false
}

async function loadDatasetContent(dataset: DatasetRecord) {
  if (dataset.source_type === 'sql' || dataset.source_type === 'table') {
    const data = await getDatasetApi(dataset.id, false)
    return Array.isArray(data) ? data : []
  }
  if (Array.isArray(dataset.content)) return dataset.content
  const meta = await getDatasetApi(dataset.id, true)
  return Array.isArray(meta?.content) ? meta.content : []
}

const handleDatasetSelect = async (id: string) => {
  const dataset = datasets.value.find(d => d.id === id)
  if (!dataset) return

  if (!targetData.value.request) {
    targetData.value.request = {} as any
  }
  targetData.value.request.requestDataPondId = id

  loading.value = true
  try {
    const content = await loadDatasetContent(dataset)
    targetData.value.option.dataset = newFunctionHandle(content, { ...dataset, content }, targetData.value.filter)
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await fetchDatasets()
  if (targetData.value.request?.requestDataPondId) {
    selectedDatasetId.value = targetData.value.request.requestDataPondId
    await handleDatasetSelect(targetData.value.request.requestDataPondId)
  }
})
</script>

<style scoped lang="scss">
.go-chart-data-library {
  padding: 5px;
}
</style>
