const fs = require('node:fs');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const root = require('node:path').resolve(__dirname, '..');
const ts = require(root + '/node_modules/typescript');
const path = 'src/app/api/metrics/pixel/route.ts';
const before = execFileSync('git', ['show', `cddfab2c:${path}`], {cwd: root, encoding: 'utf8'});
const after = fs.readFileSync(root + '/' + path, 'utf8');

function sql(text) {
  const ast = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const queries = [];
  function walk(node) {
    if (ts.isTaggedTemplateExpression(node)) {
      queries.push(node.getText(ast).replace(/^Prisma\.sql/, 'prisma.$queryRaw').replace(/\s+/g, ' ').trim());
    }
    ts.forEachChild(node, walk);
  }
  walk(ast);
  return queries.sort();
}

const deferredSql = [
  'WITH visitor_to_orders AS',
  'COALESCE(pv."deviceTypes"[1]',
  'SELECT pa.model,',
  'WHEN pa."conversionLag" IS NULL',
  'CASE WHEN pa."touchpointCount" = 1 THEN 1 WHEN pa."touchpointCount" = 2 THEN 2',
  'as first_channel',
  'FROM order_items oi',
  'FROM pixel_daily_product',
  'SELECT url, COALESCE(hll_cardinality(hll_union_agg(visitors_hll))',
  'COUNT(*)::int as "ordersAttributed",',
];

const expectedSql = sql(before)
  .filter(query => !deferredSql.some(fragment => query.includes(fragment)))
  .map(query => query
    .replace(
      'SELECT MIN(timestamp) as "installedAt" FROM pixel_events WHERE "organizationId" = ${ORG_ID}',
      'SELECT MIN(day)::timestamp as "installedAt" FROM pixel_daily_aggregates WHERE "organizationId" = ${ORG_ID}'
    )
    .replace(
      'LEFT JOIN ( SELECT DISTINCT "orderId" FROM pixel_attributions WHERE "organizationId" = ${ORG_ID} AND model::text = ${selectedModel} ) pa ON pa."orderId" = o.id',
      'LEFT JOIN pixel_attributions pa ON pa."orderId" = o.id AND pa."organizationId" = ${ORG_ID} AND pa.model = CAST(${selectedModel} AS "AttributionModel")'
    ))
  .map(query => query.replace('COUNT(*)::int as "totalOrders", COUNT(DISTINCT pa."orderId")', 'COUNT(DISTINCT o.id)::int as "totalOrders", COUNT(DISTINCT pa."orderId")'))
  .map(query => query.includes('SUM(pa."attributedValue")::float as revenue, COUNT(*)::int as orders FROM pixel_attributions pa JOIN orders o')
    ? 'prisma.$queryRaw` WITH selected_orders AS MATERIALIZED ( SELECT o.id, o."orderDate" FROM orders o WHERE o."organizationId" = ${ORG_ID} AND o."orderDate" >= ${dateFrom} AND o."orderDate" <= ${dateTo} AND ${ordersValidWhere("o")} AND o."totalValue" > 0 AND o."trafficSource" IS DISTINCT FROM \'Marketplace\' AND o.source IS DISTINCT FROM \'MELI\' AND o.channel IS DISTINCT FROM \'marketplace\' AND o."externalId" NOT LIKE \'FVG-%\' AND o."externalId" NOT LIKE \'BPR-%\' ) SELECT TO_CHAR(DATE(o."orderDate" AT TIME ZONE \'America/Argentina/Buenos_Aires\'), \'YYYY-MM-DD\') as day, SUM(pa."attributedValue")::float as revenue, COUNT(*)::int as orders FROM selected_orders o JOIN pixel_attributions pa ON pa."orderId" = o.id AND pa.model::text = ${selectedModel} GROUP BY 1 ORDER BY 1 `'
    : query)
  .sort();

assert.deepEqual(sql(after), expectedSql, 'core SQL must match the approved deferred-query baseline');
assert(!after.includes('getFunnelStages('), 'core must not compute the dedicated funnel');
assert(!after.includes('loadProductSkuMap('), 'core must not compute product conversion tables');
assert(after.includes('const [manualSpends, dailySpendResult] = await Promise.all(['), 'independent post-batch reads must stay concurrent');
assert(after.includes('$queryRawUnsafe:dailyRevenueGoldChannel'), 'channel Gold must serve daily attribution revenue');
assert(after.includes('$queryRawUnsafe:dailyRevenueGoldSource'), 'source Gold must serve daily attribution revenue');
assert(after.includes('const pixelRevenue = dailyRevenueRows.reduce'), 'selected-model KPIs must reuse normalized daily attribution totals');
assert(after.includes('const ordersAttributed = perDayCoverage.reduce'), 'KPI order totals must use distinct daily coverage counts');

console.log('PASS: core SQL parity; slow tail deferred; coverage join scoped; KPI totals reused.');
