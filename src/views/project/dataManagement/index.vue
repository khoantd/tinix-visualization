<template>
  <div class="go-project-data-management">
    <div class="hub-header">
      <n-h2 style="margin: 0">Trung tâm Dữ liệu</n-h2>
      <n-text depth="3" style="font-size: 13px">
        Quản lý kết nối, Query Lab và thư viện tập dữ liệu
      </n-text>
    </div>

    <n-tabs
      v-model:value="activeTab"
      type="line"
      animated
      class="data-hub-tabs"
      @update:value="handleTabChange"
    >
      <n-tab-pane name="connectors" tab="Kết nối">
        <ConnectorList ref="connectorListRef" @open-sql-lab="openSqlLab" />
      </n-tab-pane>
      <n-tab-pane name="sql-lab" tab="Query Lab">
        <SqlLab
          ref="sqlLabRef"
          :initial-connector-id="sqlLabConnectorId"
          @dataset-saved="onDatasetSaved"
        />
      </n-tab-pane>
      <n-tab-pane name="datasets" tab="Thư viện Dữ liệu">
        <DatasetLibrary ref="datasetLibraryRef" />
      </n-tab-pane>
    </n-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { NH2, NText, NTabs, NTabPane } from 'naive-ui'
import ConnectorList from './components/ConnectorList.vue'
import SqlLab from './components/SqlLab.vue'
import DatasetLibrary from './components/DatasetLibrary.vue'

const activeTab = ref<'connectors' | 'sql-lab' | 'datasets'>('connectors')
const sqlLabConnectorId = ref<string | null>(null)
const connectorListRef = ref<InstanceType<typeof ConnectorList> | null>(null)
const sqlLabRef = ref<InstanceType<typeof SqlLab> | null>(null)
const datasetLibraryRef = ref<InstanceType<typeof DatasetLibrary> | null>(null)

function openSqlLab(connectorId: string) {
  sqlLabConnectorId.value = connectorId
  activeTab.value = 'sql-lab'
  setTimeout(() => {
    sqlLabRef.value?.setConnector(connectorId)
  }, 0)
}

function handleTabChange(tab: string) {
  if (tab === 'connectors') connectorListRef.value?.fetchConnectors?.()
  if (tab === 'datasets') datasetLibraryRef.value?.fetchDatasets?.()
}

function onDatasetSaved() {
  activeTab.value = 'datasets'
  datasetLibraryRef.value?.fetchDatasets?.()
}
</script>

<style scoped lang="scss">
@include go(project-data-management) {
  padding: 24px;
  height: calc(100vh - #{$--header-height});
  display: flex;
  flex-direction: column;
  background-color: var(--n-color);

  .hub-header {
    margin-bottom: 12px;
  }

  .data-hub-tabs {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;

    :deep(.n-tabs-pane-wrapper) {
      flex: 1;
      min-height: 0;
    }

    :deep(.n-tab-pane) {
      height: 100%;
      padding-top: 12px;
    }
  }
}
</style>
