const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const root = require('node:path').resolve(__dirname, '..');
const ts = require(root+'/node_modules/typescript');
const path = 'src/app/api/metrics/pixel/route.ts';
const before = execFileSync('git',['show',`cddfab2c:${path}`],{cwd:root,encoding:'utf8'});
const after = fs.readFileSync(root+'/'+path,'utf8');
function sql(text) {
  const ast=ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true);
  const queries=[];
  function walk(n) {
    if(ts.isTaggedTemplateExpression(n)) queries.push(n.getText(ast).replace(/\s+/g,' ').trim());
    ts.forEachChild(n,walk);
  }
  walk(ast); return queries.sort();
}
assert.deepEqual(sql(after),sql(before),'All tagged SQL queries must stay identical');
const start=after.indexOf('    const [productData, manualSpends, fRow, dailySpendResult]');
const end=after.indexOf('    // ═',start);
const code=ts.transpileModule(`async function run(){${after.slice(start,end)}return {skuMap,productPurchasesResult,categoryLabels,manualSpends,fRow,dailySpendResult};} run();`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const tick=()=>new Promise(r=>setImmediate(r));
async function test(empty=false,fail=false){
  const pending={}; const calls=[];
  const hold=name=>{calls.push(name);return new Promise((resolve,reject)=>pending[name]={resolve,reject});};
  const context={ORG_ID:'fixture',dateFrom:new Date('2026-09-01'),dateTo:new Date('2026-09-12'),crDateFrom:new Date('2026-09-01'),productViewersResult:[],
    loadProductSkuMap:()=>hold('sku'),loadCategoryLabels:()=>hold('labels'),getFunnelStages:()=>hold('funnel'),ordersValidWhere:()=>'',
    prisma:{manualChannelSpend:{findMany:()=>hold('manual')},$queryRaw:strings=>hold(strings.join('').includes('order_items')?'purchases':'daily')}};
  let settled=false;
  const promise=vm.runInNewContext(code,context);
  promise.then(()=>settled=true,()=>settled=true);
  assert.deepEqual(calls,['sku','manual','funnel','daily']);
  if(fail){pending.funnel.reject(new Error('database failed')); await assert.rejects(promise,/database failed/);return;}
  const skuMap={productIdBySkuId:new Map(empty?[]:[['sku','product']])};
  pending.sku.resolve(skuMap); await tick();
  if(!empty) {assert(pending.purchases);pending.purchases.resolve([{category:'category'}]);await tick();}
  const labels=new Map([['category','Label']]);pending.labels.resolve(labels);
  pending.manual.resolve([{amount:100}]);pending.daily.resolve([{day:'2026-09-01',spend:100}]);
  await tick();assert.equal(settled,false,'response must await funnel');
  pending.funnel.resolve({pageView:42});const result=await promise;
  assert.equal(result.skuMap,skuMap);assert.equal(result.categoryLabels,labels);assert.equal(result.fRow.pageView,42);
  assert.equal(result.productPurchasesResult.length,empty?0:1);
  if(empty)assert(!calls.includes('purchases'));
}
(async()=>{await test();await test(true);await test(false,true);console.log('PASS: SQL parity; four concurrent reads; SKU dependency; empty catalog; failure propagation.');})().catch(e=>{console.error(e);process.exitCode=1;});
