const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = require('node:path').resolve(__dirname, '..');
const ts = require('typescript');
const source = fs.readFileSync(root + '/src/lib/api-cache-shared.ts', 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
let finish, fail, memoryWrites = 0;
const pending = () => new Promise((resolve, reject) => { finish = resolve; fail = reject; });
let dbWrite = pending();
const context = { exports: {}, Date, JSON, require: name => name.endsWith('/db/client')
  ? { prisma: { $executeRaw: () => dbWrite } }
  : { setCache: () => memoryWrites++, getCachedSWR: () => null } };
vm.runInNewContext(js, context);
(async () => {
  let complete = false;
  const writing = context.exports.setSharedCache('pixel', { orders: 3159 }, 'org', 'range');
  assert.equal(memoryWrites, 1);
  assert.equal(typeof writing?.then, 'function');
  writing.then(() => { complete = true; });
  await Promise.resolve();
  assert.equal(complete, false, 'seed remains pending while DB write is pending');
  finish(1);
  await writing;
  assert.equal(complete, true);
  dbWrite = pending();
  const failedWrite = context.exports.setSharedCache('pixel', {}, 'org', 'range');
  fail(new Error('database unavailable'));
  await failedWrite;
  assert.equal(memoryWrites, 2);
  console.log('PASS: synchronous memory; awaitable shared persistence; DB failure fallback');
})().catch(e => { console.error(e); process.exitCode = 1; });
