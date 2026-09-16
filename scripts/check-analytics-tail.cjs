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
];

const expectedSql = sql(before)
  .filter(query => !deferredSql.some(fragment => query.includes(fragment)))
  .map(query => query
    .replace(
      'SELECT MIN(timestamp) as "installedAt" FROM pixel_events WHERE "organizationId" = ${ORG_ID}',
      'SELECT timestamp as "installedAt" FROM pixel_events WHERE "organizationId" = ${ORG_ID} AND timestamp IS NOT NULL ORDER BY timestamp ASC LIMIT 1'
    )
    .replace(
      'LEFT JOIN ( SELECT DISTINCT "orderId" FROM pixel_attributions WHERE "organizationId" = ${ORG_ID} AND model::text = ${selectedModel} ) pa ON pa."orderId" = o.id',
      'LEFT JOIN pixel_attributions pa ON pa."orderId" = o.id AND pa."organizationId" = ${ORG_ID} AND pa.model::text = ${selectedModel}'
    ))
  .map(query => query.replace('COUNT(*)::int as "totalOrders", COUNT(DISTINCT pa."orderId")', 'COUNT(DISTINCT o.id)::int as "totalOrders", COUNT(DISTINCT pa."orderId")'))
  .sort();

assert.deepEqual(sql(after), expectedSql, 'core SQL must match the approved deferred-query baseline');
assert(!after.includes('getFunnelStages('), 'core must not compute the dedicated funnel');
assert(!after.includes('loadProductSkuMap('), 'core must not compute product conversion tables');
assert(after.includes('const [manualSpends, dailySpendResult] = await Promise.all(['), 'independent post-batch reads must stay concurrent');
assert(after.includes('const pixelRevenue = dailyRevenueResult.reduce'), 'selected-model KPIs must reuse daily attribution totals');

console.log('PASS: core SQL parity; slow tail deferred; coverage join scoped; KPI totals reused.');
