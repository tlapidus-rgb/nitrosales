const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { existsSync } = require('node:fs');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { encode } = require('next-auth/jwt');
const base = 'http://127.0.0.1:3319';
const database = 'postgresql://postgres:synthetic-local-only@127.0.0.1:15439/expansion_test?schema=expansion_preview_smoke';
const secret = 'synthetic-local-session-smoke-only';
const db = new PrismaClient({ datasources: { db: { url: database } } });
let server;
async function main() {
 if (process.env.EXPANSION_LOCAL_POSTGRES !== '1') throw new Error('Explicit local validation opt-in required');
 if (['.env','.env.local','.env.production','.env.production.local'].some(existsSync)) throw new Error('Remove environment files from the isolated checkout before running this smoke');
 await db.organization.upsert({ where:{id:'smoke-org'},create:{id:'smoke-org',name:'Synthetic smoke',slug:'synthetic-smoke'},update:{settings:{}} });
 for(const [id,email,isStaff] of [['smoke-user','client@local.example.invalid',false],['smoke-staff','staff@local.example.invalid',true]]) {
  await db.user.upsert({where:{id},create:{id,email,isStaff,hashedPassword:'not-a-real-password-hash',organizationId:'smoke-org',role:'OWNER'},update:{}});
 }
 const env = {};
 for(const name of ['PATH','SystemRoot','WINDIR','TEMP','TMP','USERPROFILE','LOCALAPPDATA']) if(process.env[name])env[name]=process.env[name];
 Object.assign(env,{NODE_ENV:'production',NEXTAUTH_URL:base,NEXTAUTH_SECRET:secret,DATABASE_URL:database,DATABASE_URL_UNPOOLED:database,NEXT_TELEMETRY_DISABLED:'1'});
 // No inherited provider/mail/API credentials, no env file in this checkout.
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','3319'],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
 let logs='';server.stdout.on('data',x=>{logs=(logs+x).slice(-6000)});server.stderr.on('data',x=>{logs=(logs+x).slice(-6000)});
 let ready=false;
 for(let i=0;i<100;i++){
  if(server.exitCode!==null)throw new Error('Local server exited before validation');
  try{const r=await fetch(base+'/api/auth/csrf');if(r.ok){ready=true;break;}}catch{}
  await new Promise(r=>setTimeout(r,200));
 }
 if(!ready)throw new Error('Local server did not start');
 const cookie=async(extra={})=>'next-auth.session-token='+await encode({secret,token:{id:'smoke-user',email:'client@local.example.invalid',role:'OWNER',organizationId:'smoke-org',isStaff:false,...extra},maxAge:3600});
 const clientCookie=await cookie(); const staffCookie=await cookie({id:'smoke-staff',email:'staff@local.example.invalid',isStaff:true});
 const request=(path,c=clientCookie,method='GET',body)=>fetch(base+path,{method,headers:{cookie:c,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const session=async(c=clientCookie)=>(await request('/api/auth/session',c)).json();
 assert.equal((await session()).user.organizationId,'smoke-org');
 assert.equal((await request('/api/settings/security/login-history')).status,200);
 const suspend=await request('/api/admin/orgs/smoke-org/suspension',staffCookie,'POST',{motivo:'Synthetic private reason'});
 assert.equal(suspend.status,200);assert.equal((await suspend.json()).seAplica,true);
 const blocked=await session();assert.equal(blocked.organizationAccess,'suspended');assert.equal(blocked.user,undefined);
 assert.ok(!JSON.stringify(blocked).includes('Synthetic private reason'));
 assert.equal((await request('/api/settings/security/login-history')).status,401);
 assert.equal((await session(staffCookie)).user.id,'smoke-staff');
 const impersonated=await session(await cookie({impersonatedBy:'smoke-staff'}));assert.equal(impersonated.organizationAccess,'suspended');
 assert.equal((await request('/api/admin/orgs/smoke-org/suspension',staffCookie,'DELETE')).status,200);
 assert.equal((await session()).user.id,'smoke-user');
 assert.equal((await request('/api/settings/security/login-history')).status,200);
 await db.organization.update({where:{id:'smoke-org'},data:{settings:'invalid-fixture'}});
 assert.equal((await session()).organizationAccess,'unavailable');
 await db.organization.update({where:{id:'smoke-org'},data:{settings:{}}});
 console.log('PASS: real Next HTTP sessions, API access, staff suspension/reactivation, same JWT, impersonation and malformed settings; synthetic local DB only.');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(async()=>{
 if(server&&server.exitCode===null){const closed=once(server,'exit');server.kill();await closed;}
 await db.$disconnect();
});
