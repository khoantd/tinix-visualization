import type { ConnectorEngineInfo } from '@/api/storage.api'

/** Static engine catalog — mirrors server/connector.config.js */
export const CONNECTOR_ENGINES: ConnectorEngineInfo[] = [
  {
    id: 'postgres',
    label: 'PostgreSQL',
    defaultPort: 5432,
    fields: ['host', 'port', 'database', 'username', 'password', 'ssl'],
  },
  {
    id: 'mysql',
    label: 'MySQL',
    defaultPort: 3306,
    fields: ['host', 'port', 'database', 'username', 'password', 'ssl'],
  },
  {
    id: 'sqlite',
    label: 'SQLite',
    defaultPort: null,
    fields: ['filePath'],
  },
  {
    id: 'graphql',
    label: 'GraphQL',
    defaultPort: null,
    fields: ['endpoint', 'authType', 'authHeaderName', 'customHeaders', 'allowIntrospection'],
  },
]
