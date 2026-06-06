const crypto = require('crypto');

const CANVAS_WIDTH = 1920;
const GRID_UNIT = CANVAS_WIDTH / 12;

const chartKeyMap = {
  Bar: { key: 'BarCommon', chartKey: 'VBarCommon', conKey: 'VCBarCommon', package: 'Charts', category: 'Bars', categoryName: 'Biểu đồ thanh', chartFrame: 'echarts' },
  Line: { key: 'LineCommon', chartKey: 'VLineCommon', conKey: 'VCLineCommon', package: 'Charts', category: 'Lines', categoryName: 'Biểu đồ đường', chartFrame: 'echarts' },
  Pie: { key: 'PieCommon', chartKey: 'VPieCommon', conKey: 'VCPieCommon', package: 'Charts', category: 'Pies', categoryName: 'Biểu đồ hình tròn', chartFrame: 'echarts' },
  Map: { key: 'MapBase', chartKey: 'VMapBase', conKey: 'VCMapBase', package: 'Charts', category: 'Maps', categoryName: 'Bản đồ', chartFrame: 'echarts' },
  Radar: { key: 'Radar', chartKey: 'VRadar', conKey: 'VCRadar', package: 'Charts', category: 'Mores', categoryName: 'Khác', chartFrame: 'echarts' },
  Funnel: { key: 'Funnel', chartKey: 'VFunnel', conKey: 'VCFunnel', package: 'Charts', category: 'Mores', categoryName: 'Khác', chartFrame: 'echarts' },
  Heatmap: { key: 'Heatmap', chartKey: 'VHeatmap', conKey: 'VCHeatmap', package: 'Charts', category: 'Mores', categoryName: 'Khác', chartFrame: 'echarts' },
  TreeMap: { key: 'TreeMap', chartKey: 'VTreeMap', conKey: 'VCTreeMap', package: 'Charts', category: 'Mores', categoryName: 'Khác', chartFrame: 'echarts' },
  Scatter: { key: 'ScatterCommon', chartKey: 'VScatterCommon', conKey: 'VCScatterCommon', package: 'Charts', category: 'Scatters', categoryName: 'Phân tán', chartFrame: 'echarts' },
  Table: { key: 'TableList', chartKey: 'VTableList', conKey: 'VCTableList', package: 'Tables', category: 'Tables', categoryName: 'Bảng', chartFrame: 'common' },
};

function generateId() {
  return crypto.randomUUID();
}

function detectMapRegion(source, xField) {
  if (!Array.isArray(source) || source.length === 0) return 'world';
  const sample = source.slice(0, 30).map((row) => String(row[xField] || '').toLowerCase());
  const vnKeywords = ['việt nam', 'vietnam', 'hà nội', 'hồ chí minh', 'đà nẵng', 'hải phòng', 'vũng tàu'];
  const cnKeywords = ['china', 'trung quốc', 'beijing', 'shanghai', 'guangzhou', 'shenzhen'];
  if (sample.some((v) => vnKeywords.some((kw) => v.includes(kw)))) return 'vietnam';
  if (sample.some((v) => cnKeywords.some((kw) => v.includes(kw)))) return 'china';
  if (sample.some((v) => /[\u4e00-\u9fa5]/.test(v))) return 'china';
  return 'world';
}

function normalizeMapName(name) {
  const n = String(name || '').toLowerCase().trim();
  const map = {
    'mỹ': 'United States', usa: 'United States', 'hoa kỳ': 'United States',
    anh: 'United Kingdom', uk: 'United Kingdom',
    'đức': 'Germany', 'pháp': 'France', 'ý': 'Italy', 'tây ban nha': 'Spain',
    'nhật bản': 'Japan', 'hàn quốc': 'Korea', 'trung quốc': 'China',
    nga: 'Russia', 'ấn độ': 'India', brazil: 'Brazil', 'úc': 'Australia',
    canada: 'Canada', 'việt nam': 'Vietnam', singapore: 'Singapore', 'thái lan': 'Thailand',
  };
  return map[n] || name;
}

function getThematicThumbnail(charts) {
  if (charts.some((c) => c.chartType === 'Map')) return 'project/autobi_map.png';
  if (charts.some((c) => c.chartType === 'Radar' || c.chartType === 'Funnel')) return 'project/autobi_marketing.png';
  const first = charts[0];
  if (first?.title?.toLowerCase().includes('doanh thu') || first?.title?.toLowerCase().includes('revenue')) {
    return 'project/autobi_finance.png';
  }
  return 'project/autobi_generic.png';
}

function aggregateData(source, xField, yField, limit = 15) {
  if (!Array.isArray(source) || source.length === 0) return [];
  const map = new Map();
  source.forEach((row) => {
    const key = String(row[xField] || 'N/A');
    const rawVal = row[yField] || 0;
    const val = Number(String(rawVal).replace(/[^0-9.-]+/g, '')) || 0;
    map.set(key, (map.get(key) || 0) + val);
  });
  return Array.from(map.entries())
    .map(([k, v]) => ({ [xField]: k, [yField]: Math.round(v * 100) / 100 }))
    .sort((a, b) => b[yField] - a[yField])
    .slice(0, limit);
}

function buildFilterString(suggest, xField, yField) {
  if (suggest.chartType === 'Scatter') {
    return `// @tinix-transform:${JSON.stringify({ x: xField, y: yField, type: 'raw', limit: 1000, sort: 'none' })}\nif (!data || !Array.isArray(data)) return [];\nreturn [{ dimensions: ["${xField}", "${yField}"], source: data.map(i => ({ ["${xField}"]: Number(i["${xField}"]) || 0, ["${yField}"]: Number(i["${yField}"]) || 0 })) }];`;
  }

  const isVirtual = suggest.virtual === true;
  const rawFormula = suggest.formula || '';
  const formula = isVirtual && !rawFormula ? `row["${yField}"]` : rawFormula;
  const transformMeta = { x: xField, y: yField, type: isVirtual ? 'virtual' : 'sum', formula, limit: 15, sort: 'desc' };

  if (isVirtual && formula) {
    return `// @tinix-transform:${JSON.stringify(transformMeta)}\nif (!data || !Array.isArray(data)) return [];\nconst x = "${xField}", y = "${yField}", map = new Map();\ndata.forEach(row => { \n  const k = String(row[x] || 'N/A'); \n  let v = 0;\n  try { v = Number(${formula}) || 0; } catch(e) { v = 0; }\n  map.set(k, (map.get(k) || 0) + v); \n});\nconst source = Array.from(map.entries()).map(([k, v]) => ({ [x]: k, [y]: Math.round(v * 100) / 100 })).sort((a, b) => b[y] - a[y]).slice(0, 15);\nreturn [{ dimensions: [x, y], source }];`;
  }

  return `// @tinix-transform:${JSON.stringify(transformMeta)}\nif (!data || !Array.isArray(data)) return [];\nconst x = "${xField}", y = "${yField}", map = new Map();\ndata.forEach(row => { const k = String(row[x] || 'N/A'), v = Number(String(row[y] || 0).replace(/[^0-9.-]+/g,"")) || 0; map.set(k, (map.get(k) || 0) + v); });\nconst source = Array.from(map.entries()).map(([k, v]) => ({ [x]: k, [y]: Math.round(v * 100) / 100 })).sort((a, b) => b[y] - a[y]).slice(0, 15);\nreturn [{ dimensions: [x, y], source }];`;
}

function buildChartOption(suggest, mapping, aggregatedSource, rawContent, xField, yField) {
  const isEcharts = mapping.chartFrame === 'echarts';
  if (!isEcharts) {
    return {
      dataset: mapping.key === 'TableList'
        ? aggregatedSource.map((row) => ({ name: String(row[xField] || ''), value: Number(row[yField]) || 0 }))
        : aggregatedSource,
    };
  }

  const option = { dataset: { dimensions: [xField, yField], source: aggregatedSource } };
  const seriesType = mapping.category === 'Lines' ? 'line' : mapping.category === 'Pies' ? 'pie' : mapping.category === 'Maps' ? 'map' : 'bar';

  if (seriesType === 'pie') {
    option.series = [{ type: 'pie', radius: ['30%', '50%'], center: ['50%', '57%'], label: { show: true, formatter: '{b}: {d}%', fontSize: 10 }, encode: { itemName: xField, value: yField } }];
  } else if (seriesType === 'map') {
    const adcode = detectMapRegion(rawContent, xField);
    option.mapRegion = { adcode };
    option.geo = { map: adcode, show: false };
    option.dataset = {
      map: aggregatedSource.map((i) => ({
        name: adcode === 'world' ? normalizeMapName(i[xField]) : i[xField],
        value: i[yField],
      })),
    };
    option.visualMap = {
      show: true,
      min: 0,
      max: Math.max(...aggregatedSource.map((i) => i[yField] || 0)) || 100,
      inRange: { color: ['#e0ffff', '#006edd'] },
    };
    option.series = [
      { type: 'effectScatter', coordinateSystem: 'geo', data: [] },
      { type: 'map', map: adcode, encode: { value: 'value' } },
    ];
  } else if (suggest.chartType === 'Radar') {
    const vals = aggregatedSource.map((i) => i[yField] || 0);
    const maxVal = Math.max(...vals) || 100;
    option.radar = {
      indicator: aggregatedSource.map((i) => ({ name: String(i[xField] || ''), max: maxVal * 1.2 })),
      shape: 'polygon',
    };
    option.series = [{ type: 'radar', label: { show: true, fontSize: 10 }, data: [{ value: vals, name: suggest.title }] }];
  } else if (suggest.chartType === 'Scatter') {
    option.tooltip = { trigger: 'item', formatter: 'X: {@[0]}<br/>Y: {@[1]}' };
    option.series = [{ type: 'scatter', encode: { x: xField, y: yField } }];
    option.xAxis = { type: 'value', scale: true };
    option.yAxis = { type: 'value', scale: true };
  } else {
    option.series = [{
      type: seriesType,
      label: { show: true, position: 'top', fontSize: 10, color: '#eee' },
      encode: { x: xField, y: yField },
    }];
    if (seriesType !== 'treemap') {
      option.xAxis = {
        type: 'category',
        axisLabel: { rotate: aggregatedSource.length > 5 ? 45 : 0, interval: 0, fontSize: 10 },
      };
      option.yAxis = { type: 'value' };
    }
  }

  return option;
}

/**
 * Build a full TiniX project config from chart suggestions.
 */
function buildDashboardFromSuggestions({
  datasetId,
  datasetName,
  datasetContent,
  charts,
  executiveSummary,
  theme = 'chalk',
  projectName,
  projectId,
}) {
  if (!datasetId) throw new Error('datasetId is required');
  if (!Array.isArray(charts) || charts.length === 0) throw new Error('At least one chart is required');

  const id = projectId || generateId();
  const pondId = `POND_${datasetId}`;
  const rawContent = Array.isArray(datasetContent) ? datasetContent : [];

  let currentX = 0;
  let currentY = 0;
  let lastRowMaxHeight = 0;
  const componentList = [];

  if (executiveSummary) {
    const summaryHeight = 180;
    componentList.push({
      id: generateId(),
      key: 'TextCommon',
      isGroup: false,
      attr: { x: 0, y: 0, w: CANVAS_WIDTH, h: summaryHeight, zIndex: 1, offsetX: 0, offsetY: 0 },
      styles: { filterShow: false, opacity: 1, rotateZ: 0, blendMode: 'normal', animations: [] },
      status: { lock: false, hide: false },
      chartConfig: {
        key: 'TextCommon', chartKey: 'VTextCommon', conKey: 'VCTextCommon',
        package: 'Informations', category: 'Texts', categoryName: 'Văn bản', title: 'Tóm tắt phân tích',
      },
      option: {
        dataset: executiveSummary,
        fontSize: 22,
        fontColor: '#fff',
        fontWeight: 'bold',
        textAlign: 'center',
        writingMode: 'horizontal-tb',
      },
    });
    currentY = summaryHeight + 20;
  }

  charts.forEach((suggest, index) => {
    const mapping = chartKeyMap[suggest.chartType] || chartKeyMap.Bar;
    const wUnits = Number(suggest.w || 4);
    const w = wUnits * GRID_UNIT;
    const h = Number(suggest.h || 400);

    if (currentX + w > CANVAS_WIDTH) {
      currentX = 0;
      currentY += lastRowMaxHeight + 20;
      lastRowMaxHeight = 0;
    }

    const x = currentX;
    const y = currentY;
    currentX += w;
    lastRowMaxHeight = Math.max(lastRowMaxHeight, h);

    const xField = suggest.mapping?.x || '';
    const yField = suggest.mapping?.y || '';
    const aggregatedSource = aggregateData(rawContent, xField, yField, 15);
    const filterStr = buildFilterString(suggest, xField, yField);
    const option = buildChartOption(suggest, mapping, aggregatedSource, rawContent, xField, yField);

    componentList.push({
      id: generateId(),
      key: mapping.key,
      isGroup: false,
      attr: { x, y, w, h, zIndex: index + 2, offsetX: 0, offsetY: 0 },
      filter: filterStr,
      styles: { filterShow: false, opacity: 1, rotateZ: 0, blendMode: 'normal', animations: [] },
      status: { lock: false, hide: false },
      events: { baseEvent: {}, advancedEvents: {}, interactEvents: [] },
      chartConfig: { ...mapping, title: suggest.title },
      option,
      request: {
        requestDataType: 2,
        requestHttpType: 'get',
        requestUrl: `/datasets/${datasetId}`,
        requestDataPondId: pondId,
        requestContentType: 0,
        requestParamsBodyType: 'none',
        requestInterval: 30,
        requestIntervalUnit: 'second',
        requestParams: { Params: {}, Body: {}, Header: {} },
      },
    });
  });

  const dynamicCanvasHeight = Math.max(1080, currentY + lastRowMaxHeight + 100);
  const title = projectName || `Auto-BI: ${datasetName || 'Dashboard'}`;

  const projectConfig = {
    id,
    title,
    image: getThematicThumbnail(charts),
    index: 0,
    editCanvasConfig: {
      projectName: title,
      width: CANVAS_WIDTH,
      height: dynamicCanvasHeight,
      chartThemeColor: theme,
      previewScaleType: 'fit',
      selectColor: true,
    },
    requestGlobalConfig: {
      requestInterval: 30,
      requestIntervalUnit: 'second',
      requestParams: { Params: {}, Body: {}, Header: {} },
      requestDataPond: [{
        dataPondId: pondId,
        dataPondName: datasetName || 'Dataset',
        dataPondRequestConfig: {
          requestDataType: 1,
          requestHttpType: 'get',
          requestUrl: `/datasets/${datasetId}`,
          requestContentType: 0,
          requestParamsBodyType: 'none',
          requestInterval: 30,
          requestIntervalUnit: 'second',
          requestParams: { Params: {}, Body: {}, Header: {} },
        },
      }],
    },
    componentList,
  };

  return { projectConfig, projectId: id };
}

function summarizeDashboard(config) {
  const components = config.componentList || [];
  return {
    id: config.id,
    title: config.title || config.editCanvasConfig?.projectName,
    isPublished: !!config.isPublished,
    publishedAt: config.publishedAt || null,
    componentCount: components.length,
    components: components.map((c) => ({
      id: c.id,
      key: c.key,
      title: c.chartConfig?.title,
      chartType: c.chartConfig?.category,
    })),
    theme: config.editCanvasConfig?.chartThemeColor,
    updatedAt: config.updatedAt || null,
  };
}

module.exports = {
  buildDashboardFromSuggestions,
  summarizeDashboard,
  aggregateData,
  buildFilterString,
  chartKeyMap,
  CANVAS_WIDTH,
};
