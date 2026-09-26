const fs=require('fs');
const vm=require('vm');
const assert=require('node:assert/strict');
const root=require('path').resolve(__dirname,'..');
const ts=require(root+'/node_modules/typescript');
const source=fs.readFileSync(root+'/src/app/(app)/pixel/analytics/page.tsx','utf8');
const start=source.indexOf('async (silent = false, force = false) => {');
const end=source.indexOf('}, [dateFrom, dateTo]);',start)+1;
const js=ts.transpile('const run = '+source.slice(start,end)+';', {target:ts.ScriptTarget.ES2020});
function harness(responses, cache=new Map()) {
 const state={calls:0,pixel:null,disc:null,error:null};
 const pixelCache=new Map();
 const ctx={Date,Map,Promise,AbortController,Error,console,dateFrom:'2026-09-01',dateTo:'2026-09-07',
 reqIdRef:{current:0},pixelAbortRef:{current:null},discrepancyAbortRef:{current:null},
 rangeCache:{current:cache},pixelRangeCache:{current:pixelCache},
 setLoading:v=>state.loading=v,setIsRefetching:v=>state.busy=v,setError:v=>state.error=v,
 setPixelData:v=>state.pixel=v,setDiscrepancy:v=>state.disc=v,setDisplayedRange:v=>state.range=v,
 isAbortError:e=>e.name==='AbortError',fetch:async url=>{state.calls++;return {ok:true,json:async()=>responses[url.includes('discrepancy')?'disc':'pixel']}}};
 vm.createContext(ctx);vm.runInContext(js+';this.run=run',ctx);
 return {ctx,state,cache,pixelCache};
}
(async()=>{
 const real={businessKpis:{ordersAttributed:3159}},disc={summary:{}};
 const h=harness({pixel:real,disc}); await h.ctx.run();
 assert.equal(h.state.pixel,real);assert.equal(h.cache.size,1);
 await h.ctx.run(true);assert.equal(h.state.calls,2,'fresh repeat performs no requests');
 await h.ctx.run(true,true);assert.equal(h.state.calls,4,'explicit retry bypasses cache');
 h.cache.get('2026-09-01:2026-09-07').at=Date.now()-60001;
 await h.ctx.run(true);assert.equal(h.state.calls,5,'fresh KPI cache avoids refetching the primary response');
 h.cache.get('2026-09-01:2026-09-07').at=Date.now()-60001;
 h.pixelCache.get('2026-09-01:2026-09-07').at=Date.now()-60001;
 await h.ctx.run(true);assert.equal(h.state.calls,7,'expired panel and KPI entries refetch both resources');
 for(const marker of [{_demoMode:true},{_timeoutMs:85000},{_error:'failed'}]) {
  const f=harness({pixel:marker,disc}); await f.ctx.run();
  assert.equal(f.state.pixel,null);assert.equal(f.state.disc,null);assert.equal(f.cache.size,0);assert.ok(f.state.error);
 }
 const a=harness({pixel:real,disc});const b=harness({pixel:real,disc});await a.ctx.run();assert.equal(b.cache.size,0,'page caches isolated');
 const stale=harness({pixel:real,disc});
 stale.ctx.fetch=async()=>{stale.ctx.reqIdRef.current++;return {ok:true,json:async()=>real}};
 await stale.ctx.run();assert.equal(stale.state.pixel,null);assert.equal(stale.cache.size,0);
 console.log('PASS: range reuse, expiry, force refresh, provisional rejection, panel consistency, instance isolation and stale response guards');
})().catch(e=>{console.error(e);process.exitCode=1});
