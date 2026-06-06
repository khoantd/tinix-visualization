<template>
  <div class="schema-browser">
    <div class="schema-header">
      <n-text strong>Cấu trúc</n-text>
      <n-button
        quaternary
        circle
        size="tiny"
        aria-label="Làm mới cấu trúc"
        :loading="loading"
        @click="loadSchemas"
      >
        <template #icon>
          <n-icon :component="RefreshIcon" />
        </template>
      </n-button>
    </div>

    <n-spin :show="loading">
      <n-tree
        v-if="treeData.length"
        block-line
        selectable
        expand-on-click
        :data="treeData"
        :render-label="renderLabel"
        @update:selected-keys="handleSelect"
        @update:expanded-keys="handleExpand"
      />
      <n-empty v-else description="Chọn kết nối hoặc làm mới để xem schema" size="small" />
    </n-spin>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, h } from 'vue'
import { NTree, NSpin, NText, NButton, NIcon, NEmpty, NTag } from 'naive-ui'
import type { TreeOption } from 'naive-ui'
import { icon } from '@/plugins'
import {
  getConnectorSchemasApi,
  getConnectorTablesApi,
  getConnectorColumnsApi,
  type ConnectorEngine,
} from '@/api/storage.api'

const props = defineProps<{
  connectorId: string | null
  engine?: ConnectorEngine | null
}>()

const emit = defineEmits<{
  insertSql: [sql: string]
  selectTable: [payload: { schema?: string; table: string }]
}>()

const { RefreshIcon } = icon.ionicons5
const loading = ref(false)
const treeData = ref<TreeOption[]>([])

function quoteIdent(name: string, engine?: ConnectorEngine | null) {
  if (engine === 'mysql') return `\`${name.replace(/`/g, '``')}\``
  return `"${name.replace(/"/g, '""')}"`
}

function buildSelectSql(schema: string | undefined, table: string) {
  const engine = props.engine
  if (engine === 'postgres') {
    const s = quoteIdent(schema || 'public', engine)
    const t = quoteIdent(table, engine)
    return `SELECT * FROM ${s}.${t} LIMIT 100`
  }
  if (engine === 'mysql') {
    const s = quoteIdent(schema || '', engine)
    const t = quoteIdent(table, engine)
    return `SELECT * FROM ${s}.${t} LIMIT 100`
  }
  const t = quoteIdent(table, engine)
  return `SELECT * FROM ${t} LIMIT 100`
}

function renderLabel({ option }: { option: TreeOption }) {
  const nodeType = option.nodeType as string
  if (nodeType === 'table') {
    return h('span', { class: 'tree-table-label', title: 'Nhấp đúp để chèn SQL' }, [
      option.label as string,
      h(NTag, { size: 'tiny', style: 'margin-left: 6px' }, { default: () => 'bảng' }),
    ])
  }
  return option.label as string
}

async function loadSchemas() {
  if (!props.connectorId) {
    treeData.value = []
    return
  }
  loading.value = true
  try {
    const schemas = (await getConnectorSchemasApi(props.connectorId)) || []
    treeData.value = await Promise.all(
      schemas.map(async (schema) => {
        const tables = (await getConnectorTablesApi(props.connectorId!, schema)) || []
        return {
          key: `schema:${schema}`,
          label: schema,
          nodeType: 'schema',
          isLeaf: false,
          children: tables.map((t) => ({
            key: `table:${schema}:${t.name}`,
            label: t.name,
            nodeType: 'table',
            schema,
            table: t.name,
            isLeaf: false,
            children: undefined,
          })),
        } as TreeOption & { nodeType?: string; schema?: string; table?: string }
      })
    )
  } finally {
    loading.value = false
  }
}

async function loadColumns(schema: string, table: string, node: TreeOption) {
  if (!props.connectorId || node.children?.length) return
  const columns = (await getConnectorColumnsApi(props.connectorId, schema, table)) || []
  node.children = columns.map((col) => ({
    key: `col:${schema}:${table}:${col.name}`,
    label: `${col.name} (${col.type})`,
    nodeType: 'column',
    isLeaf: true,
  }))
}

async function handleExpand(keys: Array<string | number>) {
  for (const key of keys) {
    const node = findNode(treeData.value, String(key))
    if (node?.nodeType === 'table' && node.schema && node.table) {
      await loadColumns(String(node.schema), String(node.table), node)
    }
  }
}

function findNode(nodes: TreeOption[], key: string): TreeOption | null {
  for (const n of nodes) {
    if (n.key === key) return n
    if (n.children?.length) {
      const found = findNode(n.children, key)
      if (found) return found
    }
  }
  return null
}

function handleSelect(keys: string[]) {
  const key = keys[0]
  if (!key) return
  const parts = key.split(':')
  const type = parts[0]
  if (type === 'table') {
    const schema = parts[1]
    const table = parts.slice(2).join(':')
    emit('selectTable', { schema, table })
    emit('insertSql', buildSelectSql(schema, table))
  }
}

watch(
  () => props.connectorId,
  () => loadSchemas(),
  { immediate: true }
)

defineExpose({ loadSchemas, buildSelectSql })
</script>

<style scoped lang="scss">
.schema-browser {
  height: 100%;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--n-border-color);
  padding: 8px;
  min-width: 220px;
  background-color: var(--n-color-embedded);
}

.schema-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.tree-table-label {
  cursor: pointer;
}
</style>
