const db = require('./db/index');
const {
  runReadOnlyQuery,
  buildTableSelect,
  MAX_LIMIT,
} = require('./connector.service');

async function getConnectorRow(id) {
  return db.queryOne('SELECT * FROM db_connectors WHERE id = ?', [id]);
}

async function refreshDatasetContent(dataset) {
  const sourceType = dataset.source_type || 'upload';
  if (sourceType === 'upload') {
    return JSON.parse(dataset.content);
  }

  const connector = await getConnectorRow(dataset.connector_id);
  if (!connector) {
    throw new Error('Connector not found for dataset');
  }

  const config = typeof connector.config === 'string' ? JSON.parse(connector.config) : connector.config;
  let result;

  if (sourceType === 'sql') {
    if (!dataset.sql_query) throw new Error('SQL query missing for dataset');
    result = await runReadOnlyQuery(config, connector.engine, dataset.sql_query, MAX_LIMIT);
  } else if (sourceType === 'graphql') {
    if (!dataset.sql_query) throw new Error('GraphQL query missing for dataset');
    const variables = dataset.graphql_variables ? JSON.parse(dataset.graphql_variables) : {};
    result = await runReadOnlyQuery(config, connector.engine, dataset.sql_query, MAX_LIMIT, {
      query: dataset.sql_query,
      variables,
      rootField: dataset.graphql_root_field || null,
    });
  } else if (sourceType === 'table') {
    const tableRef = dataset.table_ref ? JSON.parse(dataset.table_ref) : null;
    if (!tableRef?.table) throw new Error('Table reference missing for dataset');
    const sql = buildTableSelect(connector.engine, tableRef.schema, tableRef.table, MAX_LIMIT);
    result = await runReadOnlyQuery(config, connector.engine, sql, MAX_LIMIT);
  } else {
    throw new Error(`Unknown source_type: ${sourceType}`);
  }

  const contentStr = JSON.stringify(result.rows);
  await db.execute(
    'UPDATE datasets SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [contentStr, dataset.id]
  );

  return result.rows;
}

module.exports = { refreshDatasetContent, getConnectorRow };
