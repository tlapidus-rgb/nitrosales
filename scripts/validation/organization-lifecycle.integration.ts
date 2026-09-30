import { beforeAll, afterAll, beforeEach, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
const h = vi.hoisted(() => ({ db:null as any, staff:true, afterTransaction:null as null|(()=>Promise<void>) }));
vi.mock("@/lib/db/client",()=>({prisma:{
 organization:{findUnique:async()=>({name:"Synthetic fixture"})},
 $queryRawUnsafe:(...args:any[])=>h.db.$queryRawUnsafe(...args),
 $executeRawUnsafe:(...args:any[])=>h.db.$executeRawUnsafe(...args),
 $transaction:async(fn:any,options:any)=>{const value=await h.db.$transaction(fn,options);if(h.afterTransaction)await h.afterTransaction();return value;},
}}));
vi.mock("@/lib/feature-flags",()=>({isInternalUser:async()=>h.staff}));
vi.mock("@/lib/admin-key",()=>({isValidAdminKey:()=>false}));
import { GET as exportOrg } from "@/app/api/admin/orgs/[orgId]/exportar/route";
import { POST as deleteOrg } from "@/app/api/admin/orgs/[orgId]/borrar-todo/route";
import { SE_EXPORTA } from "@/lib/organizacion/exportacion";
const root="postgresql://postgres:synthetic-local-only@127.0.0.1:15439/";
const name="expansion_lifecycle_"+randomUUID().replaceAll("-","");
const admin=new PrismaClient({datasources:{db:{url:root+"expansion_test"}}});
const db=new PrismaClient({datasources:{db:{url:root+name+"?connection_limit=6"}}});
let created=false;
beforeAll(async()=>{
 if(process.env.EXPANSION_LOCAL_POSTGRES!=="1")throw new Error("Explicit local database opt-in required");
 await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);created=true;h.db=db;
});
afterAll(async()=>{
 await db.$disconnect();
 if(created&&/^expansion_lifecycle_[a-f0-9]{32}$/.test(name))await admin.$executeRawUnsafe(`DROP DATABASE "${name}"`);
 await admin.$disconnect();
});
beforeEach(async()=>{
 h.staff=true;h.afterTransaction=null;
 // Only public inside the random disposable database created above.
 await db.$executeRawUnsafe("DROP SCHEMA public CASCADE");await db.$executeRawUnsafe("CREATE SCHEMA public");
});
const params={params:{orgId:"a"}};
const exportRequest=()=>exportOrg(new NextRequest("http://test.invalid/export"),params);
const deleteRequest=(execute=true,confirm="BORRAR-a")=>deleteOrg(new NextRequest("http://test.invalid/delete"+(execute?"?ejecutar=1":""),{method:"POST",body:JSON.stringify({confirm})}),params);
async function exportFixture(){
 for(const {tabla} of SE_EXPORTA)await db.$executeRawUnsafe(`CREATE TABLE "${tabla}" (id text PRIMARY KEY,"organizationId" text,"orderId" text,"dashboardPasswordPlain" text)`);
 await db.$executeRawUnsafe(`INSERT INTO orders(id,"organizationId") SELECT lpad(n::text,6,'0'),'a' FROM generate_series(1,10001) n`);
 await db.$executeRawUnsafe(`INSERT INTO orders(id,"organizationId") VALUES ('foreign','b')`);
 await db.$executeRawUnsafe(`INSERT INTO order_items(id,"orderId") VALUES ('owned-item','000001'),('foreign-item','foreign')`);
 await db.$executeRawUnsafe(`INSERT INTO influencers(id,"organizationId","dashboardPasswordPlain") VALUES ('creator','a','synthetic-do-not-export')`);
}
async function deleteFixture(){
 for(const sql of [
 `CREATE TABLE orders(id text PRIMARY KEY,"externalId" text UNIQUE,"organizationId" text)`,
 `CREATE TABLE items(id text PRIMARY KEY,"orderId" text REFERENCES orders("externalId") ON DELETE SET NULL)`,
 `CREATE TABLE notes(id text PRIMARY KEY,"itemId" text REFERENCES items(id),"otherItemId" text REFERENCES items(id))`,
 `CREATE TABLE email_log(id text PRIMARY KEY,"itemId" text REFERENCES items(id) ON DELETE CASCADE)`,
 `INSERT INTO orders VALUES ('a','ext-a','a'),('b','ext-b','b')`,
 `INSERT INTO items VALUES ('item-a','ext-a'),('item-b','ext-b')`,
 `INSERT INTO notes VALUES ('owned','item-a',null),('foreign','item-b',null)`,
 ])await db.$executeRawUnsafe(sql);
}
it("exports 10001 orders consistently while another connection inserts and deletes",async()=>{
 await exportFixture();const reader=(await exportRequest()).body!.getReader();
 const first=await reader.read();const decoder=new TextDecoder();let text=decoder.decode(first.value);
 expect(JSON.parse(text).manifiesto).toBeDefined();
 await db.$executeRawUnsafe(`INSERT INTO orders(id,"organizationId") VALUES ('after-snapshot','a')`);
 await db.$executeRawUnsafe(`DELETE FROM orders WHERE id='010001'`);
 for(;;){const chunk=await reader.read();if(chunk.done)break;text+=decoder.decode(chunk.value,{stream:true});}
 const lines=text.trim().split("\n").map(s=>JSON.parse(s));const orders=lines.filter(l=>l.tabla==="orders");
 expect(orders).toHaveLength(10001);expect(new Set(orders.map(l=>l.fila.id)).size).toBe(10001);
 expect(orders.some(l=>l.fila.id==="010001")).toBe(true);expect(text).not.toContain("after-snapshot");
 expect(text).not.toContain("synthetic-do-not-export");expect(text).not.toContain("foreign-item");
 expect(lines.at(-1).cierre).toMatchObject({completa:true,filasEscritas:10003,filasEsperadas:10003});
});
it("releases the export transaction after a download cancellation",async()=>{
 await exportFixture();const reader=(await exportRequest()).body!.getReader();await reader.read();await reader.cancel();
 let count=1;
 for(let attempt=0;attempt<30;attempt++){
  const rows=await db.$queryRawUnsafe<Array<{n:number}>>(`SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND state='idle in transaction' AND pid<>pg_backend_pid()`);
  count=rows[0].n;if(count===0)break;await new Promise(r=>setTimeout(r,20));
 }
 expect(count).toBe(0);
});
it("keeps the default deletion as a dry run",async()=>{
 await deleteFixture();expect(await (await deleteRequest(false)).json()).toMatchObject({simulacro:true});
 expect(await db.$queryRawUnsafe("SELECT id FROM orders")).toHaveLength(2);
});
it("deletes indirect children and preserves the other tenant",async()=>{
 await deleteFixture();const response=await deleteRequest();expect(response.status).toBe(200);
 expect(await response.json()).toMatchObject({ok:true,borradoTotalVerificado:false});
 expect(await db.$queryRawUnsafe("SELECT id FROM orders")).toEqual([{id:"b"}]);
 expect(await db.$queryRawUnsafe("SELECT id FROM items")).toEqual([{id:"item-b"}]);
 expect(await db.$queryRawUnsafe("SELECT id FROM notes")).toEqual([{id:"foreign"}]);
});
it.each(["shared","retained"])("rolls back when %s ownership prevents deletion",async kind=>{
 await deleteFixture();
 await db.$executeRawUnsafe(kind==="shared"?`INSERT INTO notes VALUES ('shared','item-a','item-b')`:`INSERT INTO email_log VALUES ('retained','item-a')`);
 expect((await deleteRequest()).status).toBe(500);
 expect(await db.$queryRawUnsafe("SELECT id FROM orders")).toHaveLength(2);expect(await db.$queryRawUnsafe("SELECT id FROM items")).toHaveLength(2);
});
it("rolls back earlier child deletes when a later table rejects deletion",async()=>{
 await deleteFixture();
 await db.$executeRawUnsafe(`CREATE FUNCTION reject_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic late failure'; END $$`);
 await db.$executeRawUnsafe(`CREATE TRIGGER reject_fixture BEFORE DELETE ON orders FOR EACH ROW EXECUTE FUNCTION reject_delete()`);
 expect((await deleteRequest()).status).toBe(500);
 expect(await db.$queryRawUnsafe("SELECT id FROM notes")).toHaveLength(2);expect(await db.$queryRawUnsafe("SELECT id FROM items")).toHaveLength(2);
});
it("reports remaining data inserted after commit instead of claiming total deletion",async()=>{
 await deleteFixture();h.afterTransaction=async()=>{await db.$executeRawUnsafe(`INSERT INTO orders VALUES ('new','ext-new','a')`);};
 const response=await deleteRequest();expect(await response.json()).toMatchObject({ok:false,completo:false,borradoTotalVerificado:false});
 expect(await db.$queryRawUnsafe(`SELECT id FROM orders WHERE "organizationId"='a'`)).toEqual([{id:"new"}]);
});
it("rejects non-staff export and destructive requests",async()=>{
 h.staff=false;expect((await exportRequest()).status).toBe(403);expect((await deleteRequest()).status).toBe(403);
});
