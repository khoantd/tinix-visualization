import axios from './axios'

export const getProjectsApi = async () => {
  try {
    const res = await axios.get('/projects')
    return res.data
  } catch (err) {
    console.error('Fetch projects failed:', err)
    return null
  }
}

export const getProjectApi = async (id: string) => {
  try {
    const res = await axios.get(`/projects/${id}`)
    return res.data
  } catch (err) {
    console.error('Fetch project failed:', err)
    return null
  }
}

export const saveProjectApi = async (projectData: any) => {
  try {
    const res = await axios.post('/projects', projectData)
    return res.data
  } catch (err) {
    console.error('Save project failed:', err)
    return null
  }
}

export const deleteProjectApi = async (id: string) => {
  try {
    const res = await axios.delete(`/projects/${id}`)
    return res.data
  } catch (err: any) {
    if (err.response && err.response.status === 404) {
      console.warn('Project already gone from server:', id)
      return { success: true, alreadyGone: true }
    }
    console.error('Delete project failed:', err)
    return null
  }
}

export const getUserTemplatesApi = async () => {
  try {
    const res = await axios.get('/user-templates')
    return res.data
  } catch (err) {
    console.error('Fetch user templates failed:', err)
    return null
  }
}

export const saveUserTemplateApi = async (templateData: any) => {
  try {
    const res = await axios.post('/user-templates', templateData)
    return res.data
  } catch (err) {
    console.error('Save user template failed:', err)
    return null
  }
}

export const deleteUserTemplateApi = async (id: string) => {
  try {
    const res = await axios.delete(`/user-templates/${id}`)
    return res.data
  } catch (err: any) {
    if (err.response && err.response.status === 404) {
      return { success: true }
    }
    console.error('Delete user template failed:', err)
    return null
  }
}

export const getTemplateOverridesApi = async () => {
  try {
    const res = await axios.get('/template-overrides')
    return res.data
  } catch (err) {
    console.error('Fetch template overrides failed:', err)
    return null
  }
}

export const saveTemplateOverridesApi = async (overrides: any[]) => {
  try {
    const res = await axios.post('/template-overrides', overrides)
    return res.data
  } catch (err) {
    console.error('Save template overrides failed:', err)
    return null
  }
}

export const getSystemTemplatesApi = async () => {
  try {
    const res = await axios.get('/system-templates')
    return res.data
  } catch (err) {
    console.error('Fetch system templates failed:', err)
    return null
  }
}

export const saveSystemTemplateApi = async (templateData: any) => {
  try {
    const res = await axios.post('/system-templates', templateData)
    return res.data
  } catch (err) {
    console.error('Save system template failed:', err)
    return null
  }
}

// APIs cho Datasets
export type DatasetSourceType = 'upload' | 'sql' | 'table'
export type DatasetRefreshPolicy = 'manual' | 'on_load'

export interface DatasetRecord {
  id: string
  name: string
  type: string
  source_type?: DatasetSourceType
  connector_id?: string | null
  connector_name?: string | null
  sql_query?: string | null
  table_ref?: { schema?: string; table: string } | null
  refresh_policy?: DatasetRefreshPolicy
  content?: any[]
  bi_config?: any
  updated_at?: string
}

export const getDatasetsApi = async (includeContent = false) => {
  try {
    const res = await axios.get('/datasets', {
      params: { includeContent: includeContent ? 'true' : undefined },
    })
    return res.data as DatasetRecord[]
  } catch (err) {
    console.error('Fetch datasets failed:', err)
    return null
  }
}

export const saveDatasetApi = async (dataset: any) => {
  try {
    const res = await axios.post('/datasets', dataset)
    return res.data
  } catch (err) {
    console.error('Save dataset failed:', err)
    return null
  }
}

export const getDatasetApi = async (id: string, includeMeta: boolean = true) => {
  try {
    const res = await axios.get(`/datasets/${id}`, {
      params: { includeMeta: includeMeta }
    })
    return res.data
  } catch (err) {
    console.error('Fetch dataset details failed:', err)
    return null
  }
}

export const deleteDatasetApi = async (id: string) => {
  try {
    const res = await axios.delete(`/datasets/${id}`)
    return res.data
  } catch (err: any) {
    if (err.response && err.response.status === 404) {
      return { success: true }
    }
    console.error('Delete dataset failed:', err)
    return null
  }
}

export const refreshDatasetApi = async (id: string) => {
  try {
    const res = await axios.post(`/datasets/${id}/refresh`)
    return res.data
  } catch (err) {
    console.error('Refresh dataset failed:', err)
    return null
  }
}

export const saveDatasetFromQueryApi = async (payload: {
  id: string
  name: string
  connectorId: string
  sql?: string
  query?: string
  variables?: Record<string, unknown>
  rootField?: string | null
  refreshPolicy?: DatasetRefreshPolicy
  previewLimit?: number
}) => {
  try {
    const res = await axios.post('/datasets/from-query', payload)
    return res.data
  } catch (err: any) {
    console.error('Save dataset from query failed:', err)
    return err.response?.data || null
  }
}

export const saveDatasetFromTableApi = async (payload: {
  id: string
  name: string
  connectorId: string
  schema?: string
  table: string
  refreshPolicy?: DatasetRefreshPolicy
}) => {
  try {
    const res = await axios.post('/datasets/from-table', payload)
    return res.data
  } catch (err: any) {
    console.error('Save dataset from table failed:', err)
    return err.response?.data || null
  }
}

// APIs cho DB Connectors
export type ConnectorEngine = 'postgres' | 'mysql' | 'sqlite' | 'graphql'
export type ConnectorAuthType = 'none' | 'bearer' | 'api_key' | 'basic'
export type ConnectorStatus = 'connected' | 'error' | 'unknown'

export interface ConnectorEngineInfo {
  id: ConnectorEngine
  label: string
  defaultPort: number | null
  fields: string[]
}

export interface ConnectorConfigPublic {
  host?: string
  port?: number
  database?: string
  username?: string
  ssl?: boolean
  filePath?: string
  passwordSet?: boolean
  endpoint?: string
  authType?: ConnectorAuthType
  authHeaderName?: string
  allowIntrospection?: boolean
  basicUsername?: string
  customHeaders?: Record<string, string>
  tokenSet?: boolean
  apiKeySet?: boolean
  basicPasswordSet?: boolean
}

export interface DbConnector {
  id: string
  name: string
  engine: ConnectorEngine
  config: ConnectorConfigPublic
  connectionSummary: string
  status: ConnectorStatus
  statusMessage?: string | null
  lastTestedAt?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface ConnectorQueryResult {
  rows: Record<string, unknown>[]
  rowCount: number
  durationMs: number
  sql?: string
  query?: string
  rootField?: string | null
  graphqlErrors?: Array<{ message: string; path?: Array<string | number> }> | null
}

export interface ConnectorSecretsPayload {
  password?: string
  token?: string
  apiKey?: string
  basicPassword?: string
}

export interface ConnectorQueryPayload {
  sql?: string
  query?: string
  variables?: Record<string, unknown>
  rootField?: string | null
  limit?: number
}

export const getConnectorEnginesApi = async (): Promise<ConnectorEngineInfo[] | null> => {
  try {
    const res = await axios.get('/connectors/engines')
    return res.data
  } catch (err) {
    console.error('Fetch connector engines failed:', err)
    return null
  }
}

export const getConnectorsApi = async (): Promise<DbConnector[] | null> => {
  try {
    const res = await axios.get('/connectors')
    return res.data
  } catch (err) {
    console.error('Fetch connectors failed:', err)
    return null
  }
}

export const getConnectorApi = async (id: string): Promise<DbConnector | null> => {
  try {
    const res = await axios.get(`/connectors/${id}`)
    return res.data
  } catch (err) {
    console.error('Fetch connector failed:', err)
    return null
  }
}

export const createConnectorApi = async (payload: {
  id: string
  name: string
  engine: ConnectorEngine
  config: Record<string, unknown>
} & ConnectorSecretsPayload) => {
  try {
    const res = await axios.post('/connectors', payload)
    return res.data
  } catch (err: any) {
    console.error('Create connector failed:', err)
    return err.response?.data || null
  }
}

export const updateConnectorApi = async (
  id: string,
  payload: {
    name?: string
    engine?: ConnectorEngine
    config?: Record<string, unknown>
  } & ConnectorSecretsPayload
) => {
  try {
    const res = await axios.put(`/connectors/${id}`, payload)
    return res.data
  } catch (err: any) {
    console.error('Update connector failed:', err)
    return err.response?.data || null
  }
}

export const deleteConnectorApi = async (id: string) => {
  try {
    const res = await axios.delete(`/connectors/${id}`)
    return res.data
  } catch (err: any) {
    console.error('Delete connector failed:', err)
    return err.response?.data || null
  }
}

export const testConnectorApi = async (id: string) => {
  try {
    const res = await axios.post(`/connectors/${id}/test`)
    return res.data
  } catch (err: any) {
    console.error('Test connector failed:', err)
    return err.response?.data || null
  }
}

export const getConnectorSchemasApi = async (id: string) => {
  try {
    const res = await axios.get(`/connectors/${id}/schemas`)
    return res.data as string[]
  } catch (err) {
    console.error('Fetch schemas failed:', err)
    return null
  }
}

export const getConnectorTablesApi = async (id: string, schema?: string) => {
  try {
    const res = await axios.get(`/connectors/${id}/tables`, { params: { schema } })
    return res.data as { name: string; type: string }[]
  } catch (err) {
    console.error('Fetch tables failed:', err)
    return null
  }
}

export const getConnectorColumnsApi = async (id: string, schema: string | undefined, table: string) => {
  try {
    const res = await axios.get(`/connectors/${id}/columns`, { params: { schema, table } })
    return res.data as { name: string; type: string; nullable: boolean }[]
  } catch (err) {
    console.error('Fetch columns failed:', err)
    return null
  }
}

export const runConnectorQueryApi = async (
  id: string,
  payload: ConnectorQueryPayload
): Promise<ConnectorQueryResult | null> => {
  try {
    const res = await axios.post(`/connectors/${id}/query`, payload)
    return res.data
  } catch (err: any) {
    console.error('Run connector query failed:', err)
    throw err.response?.data || err
  }
}

// APIs cho Auto-BI
export type AiProviderId = 'openrouter' | 'litellm'

export interface AiProviderInfo {
  id: AiProviderId
  label: string
  configured: boolean
  model: string | null
}

export interface AutoBiProvidersResponse {
  providers: AiProviderInfo[]
  activeProvider: AiProviderId | null
  defaultProvider: AiProviderId | null
}

export const getAutoBiProvidersApi = async (): Promise<AutoBiProvidersResponse | null> => {
  try {
    const res = await axios.get('/auto-bi/providers')
    return res.data
  } catch (err) {
    console.error('Fetch Auto-BI providers failed:', err)
    return null
  }
}

export const analyzeDatasetApi = async (sampleData: any, provider?: AiProviderId) => {
  try {
    const res = await axios.post('/auto-bi/analyze', { sampleData, provider })
    return res.data
  } catch (err) {
    console.error('Analyze dataset failed:', err)
    return null
  }
}

export const suggestChartsApi = async (confirmedSchema: any, provider?: AiProviderId) => {
  try {
    const res = await axios.post('/auto-bi/suggest', { confirmedSchema, provider })
    return res.data
  } catch (err) {
    console.error('Suggest charts failed:', err)
    return null
  }
}

// APIs cho System Settings
export const getGlobalSettingsApi = async (id: string = 'global') => {
  try {
    const res = await axios.get(`/system-settings/${id}`)
    return res.data
  } catch (err: any) {
    // Nếu không tìm thấy (404), trả về null một cách im lặng vì đây là trạng thái mặc định
    if (err.response && err.response.status === 404) {
      return null
    }
    console.error('Fetch global settings failed:', err)
    return null
  }
}

export const saveGlobalSettingsApi = async (config: any, id: string = 'global') => {
  try {
    const res = await axios.post('/system-settings', { id, config })
    return res.data
  } catch (err) {
    console.error('Save global settings failed:', err)
    return null
  }
}

// APIs cho Private Photos
export const getPrivatePhotosApi = async () => {
  try {
    const res = await axios.get('/private-photos')
    return res.data
  } catch (err) {
    console.error('Fetch private photos failed:', err)
    return null
  }
}

export const savePrivatePhotoApi = async (photo: { id: string, name: string, content: string }) => {
  try {
    const res = await axios.post('/private-photos', photo)
    return res.data
  } catch (err) {
    console.error('Save private photo failed:', err)
    return null
  }
}

export const deletePrivatePhotoApi = async (id: string) => {
  try {
    const res = await axios.delete(`/private-photos/${id}`)
    return res.data
  } catch (err: any) {
    if (err.response && err.response.status === 404) {
      return { success: true }
    }
    console.error('Delete private photo failed:', err)
    return null
  }
}

// --- Embed API ---

export const getEmbedConfigApi = async () => {
  try {
    const res = await axios.get('/embed/config')
    return res.data
  } catch (err) {
    console.error('Fetch embed config failed:', err)
    return null
  }
}

export const getEmbedAppsApi = async () => {
  try {
    const res = await axios.get('/embed/apps')
    return res.data
  } catch (err) {
    console.error('Fetch embed apps failed:', err)
    return []
  }
}

export const createEmbedAppApi = async (payload: { name: string; allowedOrigins?: string[] }) => {
  try {
    const res = await axios.post('/embed/apps', payload)
    return res.data
  } catch (err) {
    console.error('Create embed app failed:', err)
    return null
  }
}

export const rotateEmbedAppKeyApi = async (appId: string) => {
  try {
    const res = await axios.post(`/embed/apps/${appId}/rotate`)
    return res.data
  } catch (err) {
    console.error('Rotate embed app key failed:', err)
    return null
  }
}

export const updateEmbedAppOriginsApi = async (appId: string, allowedOrigins: string[]) => {
  try {
    const res = await axios.put(`/embed/apps/${appId}/origins`, { allowedOrigins })
    return res.data
  } catch (err) {
    console.error('Update embed app origins failed:', err)
    return null
  }
}

export const mintEmbedTokenApi = async (
  apiKey: string,
  payload: { dashboardId: string; user?: { id?: string; email?: string; roles?: string[] } }
) => {
  try {
    const res = await axios.post('/embed/token', payload, {
      headers: { 'X-Embed-Api-Key': apiKey },
    })
    return res.data
  } catch (err) {
    console.error('Mint embed token failed:', err)
    throw err
  }
}

export const getEmbedDashboardApi = async (dashboardId: string, token: string) => {
  try {
    const res = await axios.get(`/embed/dashboard/${dashboardId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    return res.data
  } catch (err) {
    console.error('Fetch embed dashboard failed:', err)
    throw err
  }
}

export const publishEmbedDashboardApi = async (
  dashboardId: string,
  embedSettings?: { allowedOrigins?: string[]; hideBranding?: boolean; defaultScaleType?: string }
) => {
  try {
    const res = await axios.post('/embed/publish', { dashboardId, embedSettings })
    return res.data
  } catch (err) {
    console.error('Publish embed dashboard failed:', err)
    return null
  }
}

export const revokeEmbedDashboardApi = async (dashboardId: string) => {
  try {
    const res = await axios.post('/embed/revoke', { dashboardId })
    return res.data
  } catch (err) {
    console.error('Revoke embed dashboard failed:', err)
    return null
  }
}

export const mintEmbedPreviewTokenApi = async (dashboardId: string) => {
  try {
    const res = await axios.post('/embed/preview-token', { dashboardId })
    return res.data
  } catch (err) {
    console.error('Mint embed preview token failed:', err)
    return null
  }
}
