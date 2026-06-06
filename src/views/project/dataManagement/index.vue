<template>
  <div class="go-project-data-management">
    <div class="hub-header">
      <n-h2 style="margin: 0">{{ t('features.hub_title') }}</n-h2>
      <n-text depth="3" style="font-size: 13px">
        {{ t('features.hub_subtitle') }}
      </n-text>
    </div>

    <n-alert
      v-if="!loading && isCoreMode"
      type="info"
      :show-icon="true"
      style="margin-bottom: 12px"
    >
      {{ t('features.feature_core_mode_hint') }}
    </n-alert>

    <n-spin :show="loading" :description="t('features.hub_loading')">
      <n-tabs
        v-model:value="activeTab"
        type="line"
        animated
        class="data-hub-tabs"
        @update:value="handleTabChange"
      >
        <n-tab-pane
          v-if="hasModule('connectors')"
          name="connectors"
          :tab="t('features.tab_connectors')"
        >
          <ConnectorList ref="connectorListRef" @open-sql-lab="openSqlLab" />
        </n-tab-pane>
        <n-tab-pane
          v-if="hasModule('connectors')"
          name="sql-lab"
          :tab="t('features.tab_sql_lab')"
        >
          <SqlLab
            ref="sqlLabRef"
            :initial-connector-id="sqlLabConnectorId"
            @dataset-saved="onDatasetSaved"
          />
        </n-tab-pane>
        <n-tab-pane name="datasets" :tab="t('features.tab_datasets')">
          <DatasetLibrary ref="datasetLibraryRef" />
        </n-tab-pane>
        <n-tab-pane
          v-if="hasModule('agent')"
          name="agents"
          :tab="t('features.module_agent')"
        >
          <AgentHub />
        </n-tab-pane>
      </n-tabs>
    </n-spin>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { NH2, NText, NTabs, NTabPane, NSpin, NAlert } from 'naive-ui'
import { useTinixFeatures } from '@/hooks/useTinixFeatures'
import ConnectorList from './components/ConnectorList.vue'
import SqlLab from './components/SqlLab.vue'
import DatasetLibrary from './components/DatasetLibrary.vue'
import AgentHub from './components/AgentHub.vue'

const { t } = useI18n()
const { loading, isCoreMode, hasModule } = useTinixFeatures()

type TabName = 'connectors' | 'sql-lab' | 'datasets' | 'agents'

const activeTab = ref<TabName>('datasets')
const sqlLabConnectorId = ref<string | null>(null)
const connectorListRef = ref<InstanceType<typeof ConnectorList> | null>(null)
const sqlLabRef = ref<InstanceType<typeof SqlLab> | null>(null)
const datasetLibraryRef = ref<InstanceType<typeof DatasetLibrary> | null>(null)

const visibleTabs = computed(() => {
  const tabs: TabName[] = ['datasets']
  if (hasModule('connectors')) {
    tabs.unshift('connectors', 'sql-lab')
  }
  if (hasModule('agent')) tabs.push('agents')
  return tabs
})

watch([loading, visibleTabs], () => {
  if (loading.value) return
  if (!visibleTabs.value.includes(activeTab.value)) {
    activeTab.value = 'datasets'
  }
}, { immediate: true })

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
