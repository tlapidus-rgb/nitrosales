const assert=require('node:assert/strict');
const root=require('node:path').resolve(__dirname,'..');
const {PGlite}=require(root+'/node_modules/@electric-sql/pglite');
(async()=>{const db=new PGlite();try{
 await db.exec(`CREATE TYPE "AttributionModel" AS ENUM ('LAST_CLICK','FIRST_CLICK','LINEAR','TIME_DECAY','NITRO');
 CREATE TABLE pixel_attributions (id integer,"organizationId" text,model "AttributionModel","orderId" text,"visitorId" text,"attributedValue" numeric);
 INSERT INTO pixel_attributions SELECT n, CASE WHEN n%3=0 THEN 'other' ELSE 'target' END, (ARRAY['LAST_CLICK','FIRST_CLICK','LINEAR','TIME_DECAY','NITRO'])[n%5+1]::"AttributionModel",'o'||(n%13),'v'||(n%7),n*1.23 FROM generate_series(1,500) n;
 INSERT INTO pixel_attributions VALUES (501,'target',NULL,'o1','v1',100);`);
 for(const org of ['target','other','empty'])for(const model of ['LAST_CLICK','FIRST_CLICK','LINEAR','TIME_DECAY','NITRO']){
  const base=`SELECT "visitorId",COUNT(DISTINCT "orderId") AS orders,SUM("attributedValue") AS revenue FROM pixel_attributions pa WHERE "organizationId"=$1 AND `;
  const tail=' GROUP BY "visitorId" ORDER BY "visitorId"';
  const old=await db.query(base+'pa.model::text=$2'+tail,[org,model]);
  const next=await db.query(base+'pa.model=CAST($2 AS "AttributionModel")'+tail,[org,model]);
  assert.deepEqual(next.rows,old.rows);
 }
 console.log('PASS: typed enum predicate parity for all five models, tenant scopes, NULL models, duplicate orders and revenue totals.');
}finally{await db.close()}})().catch(e=>{console.error(e);process.exitCode=1});
