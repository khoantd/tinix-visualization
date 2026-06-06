const assert = require('assert');
const {
  buildDashboardFromSuggestions,
  aggregateData,
  buildFilterString,
  CANVAS_WIDTH,
} = require('../dashboard.builder');

const sampleData = [
  { Region: 'North', Sales: 100 },
  { Region: 'South', Sales: 200 },
  { Region: 'North', Sales: 50 },
  { Region: 'East', Sales: 150 },
];

const sampleCharts = [
  {
    id: '1',
    title: 'Sales by Region',
    chartType: 'Bar',
    w: 6,
    h: 400,
    selected: true,
    mapping: { x: 'Region', y: 'Sales' },
  },
  {
    id: '2',
    title: 'Sales Share',
    chartType: 'Pie',
    w: 6,
    h: 400,
    selected: true,
    mapping: { x: 'Region', y: 'Sales' },
  },
  {
    id: '3',
    title: 'Detail Table',
    chartType: 'Table',
    w: 12,
    h: 400,
    selected: true,
    mapping: { x: 'Region', y: 'Sales' },
  },
];

function runTests() {
  // aggregateData
  const agg = aggregateData(sampleData, 'Region', 'Sales', 15);
  assert.strictEqual(agg.length, 3);
  assert.strictEqual(agg.find((r) => r.Region === 'North').Sales, 150);
  assert.strictEqual(agg.find((r) => r.Region === 'South').Sales, 200);

  // buildFilterString
  const filter = buildFilterString(
    { chartType: 'Bar', mapping: { x: 'Region', y: 'Sales' } },
    'Region',
    'Sales'
  );
  assert.ok(filter.includes('@tinix-transform'));
  assert.ok(filter.includes('Region'));

  const scatterFilter = buildFilterString(
    { chartType: 'Scatter', mapping: { x: 'A', y: 'B' } },
    'A',
    'B'
  );
  assert.ok(scatterFilter.includes('type: \'raw\'') || scatterFilter.includes('"type":"raw"'));

  // buildDashboardFromSuggestions
  const { projectConfig, projectId } = buildDashboardFromSuggestions({
    datasetId: 'ds-test-1',
    datasetName: 'Test Dataset',
    datasetContent: sampleData,
    charts: sampleCharts,
    executiveSummary: 'Sales overview for test.',
    theme: 'chalk',
    projectName: 'Test Dashboard',
  });

  assert.ok(projectId);
  assert.strictEqual(projectConfig.title, 'Test Dashboard');
  assert.strictEqual(projectConfig.editCanvasConfig.chartThemeColor, 'chalk');
  assert.strictEqual(projectConfig.editCanvasConfig.width, CANVAS_WIDTH);
  assert.ok(projectConfig.componentList.length >= 4); // summary + 3 charts

  const textComponent = projectConfig.componentList.find((c) => c.key === 'TextCommon');
  assert.ok(textComponent);
  assert.strictEqual(textComponent.option.dataset, 'Sales overview for test.');

  const barComponent = projectConfig.componentList.find((c) => c.key === 'BarCommon');
  assert.ok(barComponent);
  assert.ok(barComponent.filter.includes('@tinix-transform'));
  assert.strictEqual(barComponent.request.requestUrl, '/datasets/ds-test-1');

  const pond = projectConfig.requestGlobalConfig.requestDataPond[0];
  assert.strictEqual(pond.dataPondId, 'POND_ds-test-1');
  assert.strictEqual(pond.dataPondRequestConfig.requestUrl, '/datasets/ds-test-1');

  console.log('dashboard.builder.test.js: all tests passed');
}

runTests();
