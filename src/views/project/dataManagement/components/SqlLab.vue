<template>
  <div class="sql-lab">
    <div class="sql-lab-toolbar">
      <n-space align="center" :size="12">
        <n-select
          v-model:value="selectedConnectorId"
          :options="connectorOptions"
          placeholder="Chọn kết nối..."
          style="width: 280px"
          @update:value="handleConnectorChange"
        />
        <n-button type="warning" :disabled="!selectedConnectorId" :loading="running" @click="runQuery">
          <template #icon>
            <n-icon :component="ChevronForwardIcon" />
          </template>
          {{ runButtonLabel }}
        </n-button>
        <n-button
          type="primary"
          :disabled="!canSave"
          @click="showSaveModal = true"
        >
          Lưu thành tập dữ liệu
        </n-button>
      </n-space>
      <n-text v-if="lastMeta" depth="3" style="font-size: 12px">
        {{ lastMeta.rowCount }} bản ghi · {{ lastMeta.durationMs }}ms
        <span v-if="lastMeta.rootField"> · root: {{ lastMeta.rootField }}</span>
      </n-text>
    </div>

    <div class="sql-lab-body">
      <aside v-if="!isMobile" class="schema-pane">
        <GraphQLSchemaBrowser
          v-if="isGraphQL"
          ref="graphqlSchemaRef"
          :connector-id="selectedConnectorId"
          @insert-query="insertQuery"
          @select-field="handleGraphQLFieldSelect"
        />
        <SchemaBrowser
          v-else
          ref="schemaRef"
          :connector-id="selectedConnectorId"
          :engine="selectedEngine"
          @insert-sql="insertQuery"
          @select-table="selectedTable = $event"
        />
      </aside>

      <div class="editor-pane">
        <n-button
          v-if="isMobile"
          quaternary
          size="small"
          style="margin-bottom: 8px"
          @click="showSchemaDrawer = true"
        >
          Xem schema
        </n-button>

        <MonacoEditor
          v-model:modelValue="queryText"
          :language="editorLanguage"
          height="220px"
          :editor-options="{ minimap: { enabled: false }, fontSize: 13 }"
        />

        <n-collapse v-if="isGraphQL" style="margin-top: 12px">
          <n-collapse-item title="Biến (variables JSON)" name="variables">
            <MonacoEditor
              v-model:modelValue="variablesJson"
              language="json"
              height="100px"
              :editor-options="{ minimap: { enabled: false }, fontSize: 12 }"
            />
          </n-collapse-item>
        </n-collapse>

        <n-alert v-if="queryError" type="error" role="alert" style="margin-top: 12px">
          {{ queryError }}
        </n-alert>

        <div class="results-wrap">
          <n-spin :show="running">
            <n-data-table
              v-if="resultColumns.length"
              :columns="resultColumns"
              :data="resultRows"
              size="small"
              :max-height="360"
              :scroll-x="resultScrollX"
              virtual-scroll
            />
            <n-empty v-else-if="!running" :description="emptyResultsHint" />
          </n-spin>
        </div>
      </div>
    </div>

    <n-drawer v-model:show="showSchemaDrawer" placement="left" :width="280">
      <n-drawer-content :title="isGraphQL ? 'Schema GraphQL' : 'Schema'">
        <GraphQLSchemaBrowser
          v-if="isGraphQL"
          :connector-id="selectedConnectorId"
          @insert-query="(q) => { insertQuery(q); showSchemaDrawer = false }"
          @select-field="handleGraphQLFieldSelect"
        />
        <SchemaBrowser
          v-else
          :connector-id="selectedConnectorId"
          :engine="selectedEngine"
          @insert-sql="(s) => { insertQuery(s); showSchemaDrawer = false }"
          @select-table="selectedTable = $event"
        />
      </n-drawer-content>
    </n-drawer>

    <SaveDatasetModal
      v-model:show="showSaveModal"
      :connector-id="selectedConnectorId"
      :engine="selectedEngine"
      :sql="isGraphQL ? undefined : queryText"
      :graphql-query="isGraphQL ? queryText : undefined"
      :graphql-variables="parsedVariables"
      :graphql-root-field="selectedRootField"
      :table-ref="selectedTable"
      :preview-row-count="resultRows.length"
      :default-name="defaultDatasetName"
      @saved="$emit('datasetSaved')"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, h } from 'vue'
import {
  NSelect, NButton, NSpace, NIcon, NText, NAlert, NDataTable, NSpin, NEmpty,
  NDrawer, NDrawerContent, NCollapse, NCollapseItem, useMessage,
} from 'naive-ui'
import { icon } from '@/plugins'
import MonacoEditor from '@/components/Pages/MonacoEditor/index.vue'
import {
  getConnectorsApi,
  runConnectorQueryApi,
  type DbConnector,
  type ConnectorEngine,
} from '@/api/storage.api'
import SchemaBrowser from './SchemaBrowser.vue'
import GraphQLSchemaBrowser from './GraphQLSchemaBrowser.vue'
import SaveDatasetModal from './SaveDatasetModal.vue'

defineProps<{
  initialConnectorId?: string | null
}>()

defineEmits<{
  datasetSaved: []
}>()

const { ChevronForwardIcon } = icon.ionicons5
const message = useMessage()

const connectors = ref<DbConnector[]>([])
const selectedConnectorId = ref<string | null>(null)
const selectedEngine = ref<ConnectorEngine | null>(null)
const queryText = ref('SELECT 1')
const variablesJson = ref('{}')
const running = ref(false)
const queryError = ref('')
const resultRows = ref<Record<string, unknown>[]>([])
const resultColumns = ref<any[]>([])
const lastMeta = ref<{ rowCount: number; durationMs: number; rootField?: string | null } | null>(null)
const showSaveModal = ref(false)
const showSchemaDrawer = ref(false)
const selectedTable = ref<{ schema?: string; table: string } | null>(null)
const selectedRootField = ref<string | null>(null)
const schemaRef = ref<InstanceType<typeof SchemaBrowser> | null>(null)
const graphqlSchemaRef = ref<InstanceType<typeof GraphQLSchemaBrowser> | null>(null)
const isMobile = ref(false)

const isGraphQL = computed(() => selectedEngine.value === 'graphql')
const editorLanguage = computed(() => (isGraphQL.value ? 'graphql' : 'sql'))
const runButtonLabel = computed(() =>
  isGraphQL.value ? 'Chạy truy vấn GraphQL' : 'Chạy truy vấn'
)
const emptyResultsHint = computed(() =>
  isGraphQL.value ? 'Chạy truy vấn GraphQL để xem kết quả' : 'Chạy SELECT để xem kết quả'
)

const connectorOptions = computed(() =>
  connectors.value.map(c => ({ label: `${c.name} (${c.engine})`, value: c.id }))
)

const parsedVariables = computed(() => {
  try {
    return variablesJson.value.trim() ? JSON.parse(variablesJson.value) : {}
  } catch {
    return null
  }
})

const resultScrollX = computed(() => Math.max(resultColumns.value.length * 140, 600))

const canSave = computed(
  () => Boolean(selectedConnectorId.value && resultRows.value.length > 0 && queryText.value.trim())
)

const defaultDatasetName = computed(() => {
  if (selectedRootField.value) return selectedRootField.value
  if (selectedTable.value?.table) return selectedTable.value.table
  return isGraphQL.value ? 'GraphQL Dataset' : 'SQL Dataset'
})

function checkMobile() {
  isMobile.value = window.innerWidth < 1024
}

function insertQuery(nextQuery: string) {
  queryText.value = nextQuery
}

function handleGraphQLFieldSelect(payload: { field: string; rootField?: string }) {
  selectedRootField.value = payload.rootField || payload.field
  selectedTable.value = null
}

function defaultQueryForEngine(engine: ConnectorEngine | null) {
  return engine === 'graphql' ? 'query {\n  __typename\n}' : 'SELECT 1'
}

function handleConnectorChange(id: string) {
  const conn = connectors.value.find(c => c.id === id)
  const nextEngine = conn?.engine || null
  if (nextEngine !== selectedEngine.value) {
    queryText.value = defaultQueryForEngine(nextEngine)
    variablesJson.value = '{}'
  }
  selectedEngine.value = nextEngine
  queryError.value = ''
  resultRows.value = []
  resultColumns.value = []
  lastMeta.value = null
  selectedTable.value = null
  selectedRootField.value = null
}

function formatGraphQLError(err: any) {
  if (err?.graphqlErrors?.length) {
    return err.graphqlErrors
      .map((e: { message: string; path?: Array<string | number> }) => {
        const path = e.path?.length ? ` (path: ${e.path.join('.')})` : ''
        return `${e.message}${path}`
      })
      .join('; ')
  }
  return err?.error || err?.message || 'Truy vấn thất bại'
}

async function runQuery() {
  if (!selectedConnectorId.value) return
  running.value = true
  queryError.value = ''
  try {
    if (isGraphQL.value && variablesJson.value.trim()) {
      try {
        JSON.parse(variablesJson.value)
      } catch {
        queryError.value = 'Biến GraphQL phải là JSON hợp lệ'
        return
      }
    }

    const payload = isGraphQL.value
      ? {
          query: queryText.value,
          variables: parsedVariables.value || {},
          rootField: selectedRootField.value,
        }
      : { sql: queryText.value }

    const result = await runConnectorQueryApi(selectedConnectorId.value, payload)
    resultRows.value = result?.rows || []
    if (result?.rootField) selectedRootField.value = result.rootField
    lastMeta.value = {
      rowCount: result?.rowCount || 0,
      durationMs: result?.durationMs || 0,
      rootField: result?.rootField || selectedRootField.value,
    }
    if (resultRows.value.length > 0) {
      const keys = Object.keys(resultRows.value[0])
      resultColumns.value = keys.map(key => ({
        title: key,
        key,
        minWidth: 120,
        ellipsis: { tooltip: true },
        render(row: Record<string, unknown>) {
          const val = row[key]
          return val === null || val === undefined
            ? h('span', { style: 'color:#94a3b8' }, 'NULL')
            : typeof val === 'object'
              ? JSON.stringify(val)
              : String(val)
        },
      }))
    } else {
      resultColumns.value = []
    }
  } catch (err: any) {
    queryError.value = isGraphQL.value ? formatGraphQLError(err) : (err?.error || err?.message || 'Truy vấn thất bại')
    resultRows.value = []
    resultColumns.value = []
    lastMeta.value = null
  } finally {
    running.value = false
  }
}

async function loadConnectors() {
  connectors.value = (await getConnectorsApi()) || []
  if (!selectedConnectorId.value && connectors.value.length) {
    selectedConnectorId.value = connectors.value[0].id
    handleConnectorChange(connectors.value[0].id)
  }
}

function setConnector(id: string) {
  selectedConnectorId.value = id
  handleConnectorChange(id)
}

onMounted(() => {
  checkMobile()
  window.addEventListener('resize', checkMobile)
  loadConnectors()
})

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
})

defineExpose({ setConnector })
</script>

<style scoped lang="scss">
.sql-lab {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.sql-lab-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.sql-lab-body {
  display: flex;
  flex: 1;
  min-height: 0;
  border: 1px solid var(--n-border-color);
  border-radius: 8px;
  overflow: hidden;
}

.schema-pane {
  width: 260px;
  flex-shrink: 0;
  overflow: auto;
}

.editor-pane {
  flex: 1;
  padding: 12px;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.results-wrap {
  flex: 1;
  margin-top: 12px;
  overflow: auto;
}
</style>
