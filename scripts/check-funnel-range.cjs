const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const root=require('node:path').resolve(__dirname,'..');
const ts=require(root+'/node_modules/typescript');
const {PGlite}=require(root+'/node_modules/@electric-sql/pglite');
const path='src/lib/metrics/pixel-funnel.ts';
const before=execFileSync('git',['show','43203403:'+path],{cwd:root,encoding:'utf8'});
const after=fs.readFileSync(root+'/'+path,'utf8');
const regex='/checkout/|orderPlaced|gatewayCallback';
async function capture(source,from,to,watermark){
 const exported={};let captured;
 const prisma={$queryRawUnsafe:async(sql,...args)=>{
  if(sql.includes('SELECT MAX(day)'))return [{d:watermark}];
  captured={sql,args};return [];
 }};
 const trace={run:(_stage,work)=>work()};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
  exports:exported,require:name=>name.includes('performance-trace')?{createPixelTrace:()=>trace}:name.includes('first-source-sql')?{CHECKOUT_URL_REGEX:regex}:{prisma}
 });
 await exported.getFunnelStages('a',new Date(from),new Date(to),trace);
 return captured;
}
function contributingVisitors(sql){
 const start=sql.indexOf('FROM pixel_events');
 const end=sql.indexOf('\n    )',start);
 assert(start>0&&end>start);
 return `SELECT
 array_agg(DISTINCT "visitorId" ORDER BY "visitorId") FILTER (WHERE type='PAGE_VIEW' AND ("pageUrl" IS NULL OR "pageUrl" !~* '${regex}')) AS pv,
 array_agg(DISTINCT "visitorId" ORDER BY "visitorId") FILTER (WHERE type='VIEW_PRODUCT') AS prod,
 array_agg(DISTINCT "visitorId" ORDER BY "visitorId") FILTER (WHERE type='ADD_TO_CART') AS cart,
 array_agg(DISTINCT "visitorId" ORDER BY "visitorId") FILTER (WHERE type IN ('INITIATE_CHECKOUT','CHECKOUT_SHIPPING')) AS chk
 `+sql.slice(start,end)+' AND $2::date IS NOT NULL';
}
(async()=>{
 const db=new PGlite();let count=0;
 try{
  await db.exec(`CREATE TABLE pixel_events ("organizationId" text,timestamp timestamptz,type text,"visitorId" text,"pageUrl" text,"sessionId" text);
   INSERT INTO pixel_events SELECT org, ts, type, 'v'||(n%5), url, session
   FROM generate_series('2026-08-30T00:00:00Z'::timestamptz,'2026-09-04T00:00:00Z',interval '30 minutes') WITH ORDINALITY AS t(ts,n)
   CROSS JOIN unnest(ARRAY['PAGE_VIEW','VIEW_PRODUCT','ADD_TO_CART','INITIATE_CHECKOUT','CHECKOUT_SHIPPING','PURCHASE','IDENTIFY']) AS type
   CROSS JOIN unnest(ARRAY['a','b']) AS org
   CROSS JOIN unnest(ARRAY[NULL,'/product','/checkout/','/ORDERPLACED']) AS url
   CROSS JOIN unnest(ARRAY[NULL,'normal','webhook-order']) AS session;
   INSERT INTO pixel_events VALUES ('a','2026-09-01T02:59:59.999999Z','PAGE_VIEW','before',NULL,NULL),('a','2026-09-01T03:00:00Z','PAGE_VIEW','start',NULL,NULL),('a','2026-09-02T02:59:59.999Z','PAGE_VIEW','end',NULL,NULL),('a','2026-09-02T02:59:59.999999Z','PAGE_VIEW','after-ms',NULL,NULL),('a','2026-09-02T03:00:00Z','PAGE_VIEW','next',NULL,NULL);`);
  for(const [from,to] of [['2026-09-01T03:00:00Z','2026-09-02T02:59:59.999Z'],['2026-08-31T03:00:00Z','2026-09-03T02:59:59.999Z'],['2026-09-01T15:00:00Z','2026-09-01T18:00:00Z'],['2026-10-01T03:00:00Z','2026-10-02T02:59:59.999Z']]){
   for(const watermark of [null,'2026-08-29','2026-09-01','2026-09-02','2026-09-05']){
    const old=await capture(before,from,to,watermark),next=await capture(after,from,to,watermark);
    const a=await db.query(contributingVisitors(old.sql),old.args),b=await db.query(contributingVisitors(next.sql),next.args);
    assert.deepEqual(b.rows,a.rows,JSON.stringify({from,to,watermark}));count++;
   }
  }
  console.log(`PASS: ${count} PostgreSQL parity cases, AR midnight/microseconds, missing/stale/future rollups, multiple orgs, webhook exclusion and checkout URLs.`);
 }finally{await db.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
