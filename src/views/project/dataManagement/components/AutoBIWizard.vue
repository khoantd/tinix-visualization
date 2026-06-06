<template>
  <div class="auto-bi-wizard-fullscreen">
    <div class="wizard-header">
      <n-space justify="space-between" align="center">
        <n-space align="center">
          <n-button secondary @click="$emit('back')">
            <template #icon>
              <n-icon :component="ArrowBackIcon" />
            </template>
            Quay lại
          </n-button>
          <n-h2 style="margin: 0">Auto-BI Workspace: {{ dataset?.name }}</n-h2>
          <n-tag v-if="activeProviderLabel" size="small" type="info" :bordered="false">
            {{ activeProviderLabel }}
          </n-tag>
        </n-space>
        <n-space>
          <n-button @click="handleRestart" ghost type="warning" size="small" v-if="currentStep > 1">Bắt đầu lại</n-button>
          <n-button @click="handleSaveDraft" :loading="saveLoading">Lưu nháp</n-button>
          <n-button type="primary" :loading="loading" @click="handleGenerate" v-if="currentStep === 3">
            Sinh dự án ngay
          </n-button>
        </n-space>
      </n-space>
      <n-divider style="margin: 15px 0" />
      <n-alert
        v-if="featureUnavailable"
        type="warning"
        :title="t('features.feature_unavailable_title')"
        style="margin-bottom: 12px"
      >
        {{ t('features.feature_unavailable_desc') }}
      </n-alert>
      <n-steps :current="currentStep" :status="currentStatus" size="small">
        <n-step title="Phân tích dữ liệu" description="AI nhận diện Schema" />
        <n-step title="Chọn biểu đồ" description="Gợi ý từ AI" />
        <n-step title="Hoàn tất" description="Sẵn sàng sinh Dashboard" />
      </n-steps>
    </div>

    <div class="wizard-content-scroll" v-loading="loading">
      <!-- Bước 1: Review Schema -->
      <div v-if="currentStep === 1" class="step-container">
        <n-space justify="space-between" align="center" class="mb-4">
          <n-h4 style="margin: 0">Xác nhận cấu trúc dữ liệu</n-h4>
          <n-button size="small" type="warning" ghost @click="startAnalysis(true)">
            <template #icon><n-icon :component="FlashIcon" /></template>
            Phân tích lại bằng AI
          </n-button>
        </n-space>
        
        <n-data-table
          :columns="schemaColumns"
          :data="analysisResult.columns"
          :max-height="400"
          bordered
          class="schema-table"
        />
        
        <div class="insights-box mt-6">
          <n-h5>AI Insights:</n-h5>
          <n-alert title="Nhận định từ AI" type="info" :show-icon="false">
            <ul>
              <li v-for="(insight, index) in analysisResult.insights" :key="index">
                {{ insight }}
              </li>
            </ul>
          </n-alert>
        </div>
      </div>

      <!-- Bước 2: Chọn biểu đồ -->
      <div v-if="currentStep === 2" class="step-container">
        <n-space justify="space-between" align="center" class="mb-4">
          <n-h4 style="margin: 0">Gợi ý trực quan hóa</n-h4>
          <n-button size="small" type="warning" ghost @click="fetchSuggestions(true)">
            <template #icon><n-icon :component="FlashIcon" /></template>
            Gợi ý lại
          </n-button>
        </n-space>

        <n-alert v-if="executiveSummary" title="Tóm tắt thông điệp từ AI" type="success" :show-icon="true" class="mb-4">
          {{ executiveSummary }}
        </n-alert>

        <n-grid :cols="3" :x-gap="16" :y-gap="16">
          <n-grid-item v-for="(chart, index) in suggestedCharts" :key="index">
            <n-card 
              size="small" 
              :title="chart.title" 
              hoverable 
              :class="{ 'is-selected': chart.selected }"
              @click="chart.selected = !chart.selected"
            >
              <template #header-extra>
                <n-checkbox v-model:checked="chart.selected" @click.stop />
              </template>
              <n-space vertical>
                <n-tag :type="getChartTagType(chart.chartType)" size="small">
                  {{ chart.chartType }}
                </n-tag>
                <n-text depth="3" class="reason-text">{{ chart.reason }}</n-text>
                <n-divider dashed style="margin: 8px 0" />
                <n-text size="small" depth="3">
                  Mapping: <b>{{ chart.mapping.x }}</b> vs <b>{{ chart.mapping.y }}</b>
                </n-text>
              </n-space>
            </n-card>
          </n-grid-item>
        </n-grid>
      </div>

      <!-- Bước 3: Cấu hình cuối -->
      <div v-if="currentStep === 3" class="step-container narrow-view">
        <n-h4>Cấu hình dự án</n-h4>
        <n-form-item label="Tên dự án Dashboard">
          <n-input v-model:value="projectName" placeholder="Nhập tên dự án..." size="large" />
        </n-form-item>
        <n-form-item label="Chủ đề (Theme)">
          <n-select v-model:value="projectTheme" :options="themeOptions" />
        </n-form-item>
        
        <n-card title="Tóm tắt Dashboard" size="small" class="mt-4">
          <n-statistic label="Số lượng biểu đồ sẽ tạo" :value="selectedChartsCount" />
          <div class="mt-2">
            <n-tag v-for="c in selectedCharts" :key="c.id" size="small" style="margin-right: 4px;">
              {{ c.title }}
            </n-tag>
          </div>
        </n-card>
      </div>
    </div>

    <div class="wizard-footer">
      <n-space justify="center" size="large">
        <n-button v-if="currentStep > 1" @click="currentStep--">Quay lại</n-button>
        <n-button v-if="currentStep < 3" type="primary" size="large" :loading="loading" @click="handleNext" style="width: 200px">
          Tiếp theo
        </n-button>
        <n-button v-else type="primary" size="large" :loading="loading" @click="handleGenerate" style="width: 200px">
          Sinh dự án Dashboard
        </n-button>
      </n-space>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, h, computed, toRaw } from 'vue'
import { useI18n } from 'vue-i18n'
import { 
  NButton, NSpace, NDataTable, NTag, NH2, NH4, NH5, NDivider, NSteps, NStep,
  NGrid, NGridItem, NCard, NCheckbox, NText, NInput, NFormItem, NAlert, NIcon,
  useMessage, NSelect, NStatistic
} from 'naive-ui'
import { icon } from '@/plugins'
import axios from 'axios'
import { fetchPathByName, routerTurnByPath } from '@/utils'
import { ChartEnum } from '@/enums/pageEnum'
import { saveDatasetApi, analyzeDatasetApi, suggestChartsApi, generateDashboardApi, getAutoBiProvidersApi, type AiProviderId } from '@/api/storage.api'

const props = defineProps({
  dataset: Object
})

const emit = defineEmits(['back', 'complete'])
const { t } = useI18n()
const { ArrowBackIcon, FlashIcon } = icon.ionicons5
const message = useMessage()
const featureUnavailable = ref(false)

const currentStep = ref(1)
const currentStatus = ref<'process' | 'error' | 'finish' | 'wait'>('process')
const loading = ref(false)
const saveLoading = ref(false)
const activeProvider = ref<AiProviderId | null>(null)
const activeProviderLabel = ref('')

const loadActiveProvider = async () => {
  const data = await getAutoBiProvidersApi()
  if (!data) {
    featureUnavailable.value = true
    return
  }
  const resolved = data.activeProvider || data.defaultProvider
  activeProvider.value = resolved
  const match = data.providers.find(p => p.id === resolved)
  if (match) {
    activeProviderLabel.value = match.model ? `${match.label} · ${match.model}` : match.label
  }
}

const analysisResult = reactive<{ columns: any[], insights: string[] }>({
  columns: [],
  insights: []
})

interface ChartSuggestion {
  id?: string
  title: string
  chartType: 'Bar' | 'Line' | 'Pie' | 'Map' | 'Gauge' | 'Table' | 'Radar' | 'Funnel' | 'Heatmap' | 'TreeMap' | 'Scatter'
  reason: string
  mapping: { x: string; y: string }
  selected: boolean
  w?: number
  h?: number
}

const suggestedCharts = ref<ChartSuggestion[]>([])
const executiveSummary = ref('')
const projectName = ref(`Auto-BI: ${props.dataset?.name || 'Dự án mới'}`)
const projectTheme = ref('chalk')

const themeOptions = [
  { label: 'Chalk (Tối)', value: 'chalk' },
  { label: 'Macarons (Sáng)', value: 'macarons' },
  { label: 'Dark (Huyền bí)', value: 'dark' }
]

const selectedCharts = computed<ChartSuggestion[]>(() => suggestedCharts.value.filter(c => c.selected))
const selectedChartsCount = computed(() => selectedCharts.value.length)

onMounted(async () => {
  await loadActiveProvider()
  if (props.dataset?.bi_config) {
    const config = props.dataset.bi_config
    analysisResult.columns = config.analysisResult?.columns || []
    analysisResult.insights = config.analysisResult?.insights || []
    suggestedCharts.value = config.suggestedCharts || []
    currentStep.value = config.currentStep || 1
    projectTheme.value = config.projectTheme || 'chalk'
    
    if (analysisResult.columns.length === 0) {
      startAnalysis()
    }
  } else {
    startAnalysis()
  }
})

const handleSaveDraft = async () => {
  saveLoading.value = true
  try {
    await saveDatasetApi({
      ...props.dataset,
      bi_config: {
        analysisResult: JSON.parse(JSON.stringify(analysisResult)),
        suggestedCharts: suggestedCharts.value,
        projectTheme: projectTheme.value,
        currentStep: currentStep.value
      }
    })
    message.success('Đã lưu vết phân tích!')
  } catch (err) {
    message.error('Lỗi khi lưu nháp.')
  } finally {
    saveLoading.value = false
  }
}

const startAnalysis = async (force = false) => {
  if (!force && analysisResult.columns.length > 0) return
  
  loading.value = true
  try {
    const sample = props.dataset?.content?.slice(0, 15) || []
    const res = await analyzeDatasetApi(sample, activeProvider.value ?? undefined)
    if (!res && featureUnavailable.value) {
      throw new Error('feature disabled')
    }

    // Ánh xạ phòng thủ cao: Kiểm tra nhiều loại key có thể có
    let rawColumns = res?.columns || res?.data?.columns || []
    
    // Nếu AI không trả được columns hoặc mảng rỗng -> Fallback
    if (rawColumns.length === 0 && sample.length > 0) {
      console.warn('[Auto-BI] AI returned no columns, using local extraction')
      const keys = Object.keys(sample[0] || {})
      rawColumns = keys.map(k => ({ name: k }))
    }

    if (rawColumns.length > 0) {
      analysisResult.columns = rawColumns.map((col: any) => ({
        name: col.name || col['tên cột'] || col['tên_cột'] || col['key'] || 'N/A',
        type: col.type || 'dimension',
        subType: col.subType || 'category',
        description: col.description || col['giải thích'] || ''
      }))
      analysisResult.insights = res?.insights || ['Đã trích xuất cấu trúc dữ liệu thành công.']
    } else {
      throw new Error('Không thể xác định cột dữ liệu')
    }
    handleSaveDraft()
  } catch (err) {
    // Fallback tuyệt đối: trích header từ dataset gốc
    const sample = props.dataset?.content?.slice(0, 5) || []
    const keys = Object.keys(sample[0] || {})
    analysisResult.columns = keys.map(k => ({
      name: k, type: 'dimension', subType: 'category', description: ''
    }))
    analysisResult.insights = ['Không thể kết nối AI. Cấu trúc được trích xuất tự động.']
    message.warning('AI không khả dụng, sử dụng phân tích cục bộ.')
  } finally {
    loading.value = false
  }
}

const fetchSuggestions = async (force = false) => {
  if (!force && suggestedCharts.value.length > 0) return
  
  loading.value = true
  try {
    const res = await suggestChartsApi(analysisResult, activeProvider.value ?? undefined)
    if (!res) throw new Error('API failed')
    // Cập nhật cấu trúc mới: { suggestedTheme, executiveSummary, charts }
    if (res && res.charts) {
      suggestedCharts.value = res.charts.map((c: any) => ({
        ...c,
        selected: c.selected !== false // Mặc định là true nếu không bị AI tắt
      }))
      executiveSummary.value = res.executiveSummary || ''
      projectTheme.value = res.suggestedTheme || 'chalk'
      
      message.success('Đã tìm thấy các gợi ý trực quan hóa mới!')
    }
    handleSaveDraft()
  } catch (err) {
    message.error('Lỗi khi lấy gợi ý.')
  } finally {
    loading.value = false
  }
}

const handleRestart = () => {
  suggestedCharts.value = []
  analysisResult.columns = []
  analysisResult.insights = []
  currentStep.value = 1
  handleSaveDraft() // Lên server xóa đi config cũ
  startAnalysis(true)
}

const handleNext = async () => {
  if (currentStep.value === 1) {
    await fetchSuggestions()
    currentStep.value = 2
  } else {
    currentStep.value = 3
  }
}

const handleGenerate = async () => {
  const datasetId = props.dataset?.id || ''
  if (!datasetId || datasetId === 'undefined') {
    message.error('ID nguồn dữ liệu không hợp lệ. Vui lòng chọn lại tập dữ liệu.')
    return
  }

  loading.value = true
  try {
    await saveDatasetApi(toRaw(props.dataset))

    const result = await generateDashboardApi({
      datasetId,
      datasetName: props.dataset?.name,
      datasetContent: Array.isArray(props.dataset?.content) ? props.dataset.content : [],
      projectName: projectName.value,
      theme: projectTheme.value,
      charts: selectedCharts.value,
      executiveSummary: executiveSummary.value,
    })

    if (!result?.dashboardId) {
      throw new Error('Generate failed')
    }

    message.success('Dashboard đã được khởi tạo thành công!')
    const path = fetchPathByName(ChartEnum.CHART_HOME_NAME, 'href')
    routerTurnByPath(path, [result.dashboardId], undefined, true)
  } catch (err) {
    message.error('Lỗi khi sinh dự án.')
  } finally {
    loading.value = false
  }
}

const getChartTagType = (type: string) => {
  switch (type) {
    case 'Map': return 'error'
    case 'Line': return 'warning'
    case 'Pie': return 'success'
    case 'Table': return 'info'
    default: return 'primary'
  }
}

// Columns for Step 1
const schemaColumns = [
  { title: 'Tên cột', key: 'name' },
  { 
    title: 'Vai trò', 
    key: 'type',
    render(row) {
      return h(NSelect, {
        value: row.type,
        options: [
          { label: 'Dimension', value: 'dimension' },
          { label: 'Metric', value: 'metric' }
        ],
        size: 'small',
        onUpdateValue: (v) => { row.type = v }
      })
    }
  },
  {
    title: 'Kiểu nội dung',
    key: 'subType',
    render(row) {
      return h(NSelect, {
        value: row.subType,
        options: [
          { label: 'Thời gian', value: 'time' },
          { label: 'Địa lý', value: 'geography' },
          { label: 'Phân loại', value: 'category' },
          { label: 'Số liệu', value: 'number' }
        ],
        size: 'small',
        onUpdateValue: (v) => { row.subType = v }
      })
    }
  },
  { title: 'Mô tả ý nghĩa', key: 'description' }
]

</script>

<style scoped lang="scss">
.auto-bi-wizard-fullscreen {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--n-color);
  z-index: 2000;
  display: flex;
  flex-direction: column;
  padding: 24px;
}

.wizard-header {
  flex-shrink: 0;
}

.wizard-content-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 20px 0;
}

.wizard-footer {
  flex-shrink: 0;
  padding-top: 20px;
  border-top: 1px solid var(--n-border-color);
}

.step-container {
  max-width: 1200px;
  margin: 0 auto;
}

.schema-table {
  background-color: var(--n-color-embedded);
}

.narrow-view {
  max-width: 600px;
}

.is-selected {
  border: 1px solid var(--n-primary-color);
  background: rgba(var(--n-primary-color-rgb), 0.05);
}

.reason-text {
  font-size: 13px;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.mt-6 { margin-top: 1.5rem; }
.mb-4 { margin-bottom: 1rem; }
</style>
