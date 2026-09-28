import { afterAll, beforeAll, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { tablasIndirectas, whereIndirecto, type Dependencia } from "@/lib/organizacion/borrado";
let db: PGlite;
const deps: Dependencia[] = [
 { hija: "items", madre: "orders", columna: "orderId", columnaReferenciada: "externalId" },
 { hija: "notes", madre: "items", columna: "itemId" },
 { hija: "notes", madre: "items", columna: "otherItemId" },
];
beforeAll(async () => {
 db = await PGlite.create();
 await db.exec(`CREATE TABLE orders (id text, "externalId" text, "organizationId" text);
 CREATE TABLE items (id text, "orderId" text); CREATE TABLE notes (id text, "itemId" text, "otherItemId" text);
 INSERT INTO orders VALUES ('a','external-a','a'),('b','external-b','b');
 INSERT INTO items VALUES ('item-a','external-a'),('item-b','external-b');
 INSERT INTO notes VALUES ('owned','item-a',null),('second-path',null,'item-a'),('foreign','item-b',null),('shared','item-a','item-b');`);
});
afterAll(async () => db.close());
it("discovers transitive ownership and every alternate path", async () => {
 const tables = tablasIndirectas(["orders"], deps);
 expect(tables.map(t => t.tabla)).toEqual(["items", "notes"]);
 const notes = tables.find(t => t.tabla === "notes")!;
 const rows = await db.query<{ id: string }>(`SELECT id FROM notes WHERE ${whereIndirecto(notes)} ORDER BY id`, ["a"]);
 expect(rows.rows.map(r => r.id)).toEqual(["owned", "second-path", "shared"]);
 const shared = await db.query<{ id: string }>(`SELECT id FROM notes WHERE (${whereIndirecto(notes)}) AND (${whereIndirecto(notes, true)})`, ["a"]);
 expect(shared.rows).toEqual([{ id: "shared" }]);
});
it("does not treat one component of a composite FK as ownership", () => {
 expect(tablasIndirectas(["orders"], [{ ...deps[0], columnas: 2 }])).toEqual([]);
});
it("terminates cyclic paths and still finds a path to a direct owner", () => {
 const cycle = [...deps, { hija: "items", madre: "notes", columna: "noteId" }];
 expect(tablasIndirectas(["orders"], cycle).map(t => t.tabla)).toEqual(["items", "notes"]);
});
it("quotes catalog identifiers instead of treating them as SQL", () => {
 expect(whereIndirecto({ tabla: "x", columna: 'odd"column', madre: 'odd"table' })).toContain('"odd""column" IN (SELECT "id" FROM "odd""table"');
});
