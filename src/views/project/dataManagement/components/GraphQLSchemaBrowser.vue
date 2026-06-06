<template>
  <div class="schema-browser">
    <div class="schema-header">
      <n-text strong>Schema GraphQL</n-text>
      <n-button
        quaternary
        circle
        size="tiny"
        aria-label="Làm mới schema"
        :loading="loading"
        @click="loadSchema"
      >
        <template #icon>
          <n-icon :component="RefreshIcon" />
        </template>
      </n-button>
    </div>

    <n-spin :show="loading">
      <n-alert v-if="loadError" type="warning" role="alert" style="margin-bottom: 8px" :bordered="false">
        {{ loadError }}
      </n-alert>
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
      <n-empty v-else-if="!loading" description="Chọn kết nối GraphQL hoặc làm mới schema" size="small" />
    </n-spin>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, h } from 'vue'
import { NTree, NSpin, NText, NButton, NIcon, NEmpty, NTag, NAlert } from 'naive-ui'
import type { TreeOption } from 'naive-ui'
import { icon } from '@/plugins'
import {
  getConnectorSchemasApi,
  getConnectorTablesApi,
  getConnectorColumnsApi,
} from '@/api/storage.api'

const props = defineProps<{
  connectorId: string | null
}>()

const emit = defineEmits<{
  insertQuery: [query: string]
  selectField: [payload: { schema?: string; field: string; rootField?: string }]
}>()

const { RefreshIcon } = icon.ionicons5
const loading = ref(false)
const loadError = ref('')
const treeData = ref<TreeOption[]>([])

function buildFieldQuery(fieldName: string, columns: Array<{ name: string }>) {
  const colNames = columns?.length
    ? columns.slice(0, 8).map(c => c.name).join('\n    ')
    : 'id'
  const opName = `Get${fieldName.charAt(0).toUpperCase()}${fieldName.slice(1)}`
  return `query ${opName} {\n  ${fieldName} {\n    ${colNames}\n  }\n}`
}

function renderLabel({ option }: { option: TreeOption }) {
  const nodeType = option.nodeType as string
  if (nodeType === 'field') {
    return h('span', { class: 'tree-table-label', title: 'Nhấp để chèn truy vấn mẫu' }, [
      option.label as string,
      h(NTag, { size: 'tiny', style: 'margin-left: 6px' }, { default: () => 'truy vấn' }),
    ])
  }
  if (nodeType === 'column') {
    return h('span', [
      option.label as string,
      h(NTag, { size: 'tiny', type: 'info', style: 'margin-left: 6px' }, { default: () => 'trường' }),
    ])
  }
  return option.label as string
}

async function loadSchema() {
  if (!props.connectorId) {
    treeData.value = []
    return
  }
  loading.value = true
  loadError.value = ''
  try {
    const schemas = (await getConnectorSchemasApi(props.connectorId)) || []
    treeData.value = await Promise.all(
      schemas.map(async (schema) => {
        const fields = (await getConnectorTablesApi(props.connectorId!, schema)) || []
        return {
          key: `schema:${schema}`,
          label: schema,
          nodeType: 'schema',
          isLeaf: false,
          children: fields.map((f) => ({
            key: `field:${schema}:${f.name}`,
            label: `${f.name} (${f.type})`,
            nodeType: 'field',
            schema,
            field: f.name,
            isLeaf: false,
            children: undefined,
          })),
        } as TreeOption & { nodeType?: string; schema?: string; field?: string }
      })
    )
  } catch (err: any) {
    loadError.value = err?.error || err?.message || 'Không thể tải schema GraphQL'
    treeData.value = []
  } finally {
    loading.value = false
  }
}

async function loadColumns(schema: string, field: string, node: TreeOption) {
  if (!props.connectorId || node.children?.length) return
  try {
    const columns = (await getConnectorColumnsApi(props.connectorId, schema, field)) || []
    node.children = columns.map((col) => ({
      key: `col:${schema}:${field}:${col.name}`,
      label: `${col.name} (${col.type})`,
      nodeType: 'column',
      isLeaf: true,
    }))
  } catch {
    node.children = []
  }
}

async function handleExpand(keys: Array<string | number>) {
  for (const key of keys) {
    const node = findNode(treeData.value, String(key))
    if (node?.nodeType === 'field' && node.schema && node.field) {
      await loadColumns(String(node.schema), String(node.field), node)
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

async function handleSelect(keys: string[]) {
  const key = keys[0]
  if (!key) return
  const parts = key.split(':')
  const type = parts[0]
  if (type === 'field') {
    const schema = parts[1]
    const field = parts.slice(2).join(':')
    const node = findNode(treeData.value, key)
    let columns: Array<{ name: string }> = []
    if (node && !node.children?.length) {
      await loadColumns(schema, field, node)
    }
    if (node?.children?.length) {
      columns = node.children.map(c => ({ name: String(c.label).split(' ')[0] }))
    }
    const query = buildFieldQuery(field, columns)
    emit('selectField', { schema, field, rootField: field })
    emit('insertQuery', query)
  }
}

watch(
  () => props.connectorId,
  () => loadSchema(),
  { immediate: true }
)

defineExpose({ loadSchema, buildFieldQuery })
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
