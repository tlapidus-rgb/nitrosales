import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";

// At most one planner-only sample per operation per preview instance.
const sampled = new Set<string>();
export function summarizePlan(value: unknown): Record<string, unknown>[] {
  const nodes: Record<string, unknown>[] = [];
  const visit = (node: any, depth: number) => {
    if (!node || typeof node !== "object" || nodes.length >= 80) return;
    const safe: Record<string, unknown> = { depth };
    for (const key of ["Node Type", "Relation Name", "Index Name", "Join Type", "Parent Relationship", "Plan Rows", "Total Cost"]) {
      if (typeof node[key] === "string" || typeof node[key] === "number") safe[key] = node[key];
    }
    nodes.push(safe);
    if (Array.isArray(node.Plans)) node.Plans.forEach((child: unknown) => visit(child, depth + 1));
  };
  visit(Array.isArray(value) ? value[0]?.Plan : undefined, 0);
  return nodes;
}

export async function queryWithPreviewPlan<T = unknown>(stage: string, query: Prisma.Sql, wideRange: boolean): Promise<T> {
  if (process.env.VERCEL_ENV === "preview" && wideRange && !sampled.has(stage)) {
    sampled.add(stage);
    try {
      // No ANALYZE: ask the planner, without executing the SELECT a second time.
      const rows = await prisma.$queryRaw<Array<{ "QUERY PLAN": unknown }>>(Prisma.sql`EXPLAIN (FORMAT JSON) ${query}`);
      console.info("[pixel-plan]", JSON.stringify({ stage, nodes: summarizePlan(rows[0]?.["QUERY PLAN"]) }));
    } catch {
      console.info("[pixel-plan]", JSON.stringify({ stage, unavailable: true }));
    }
  }
  return prisma.$queryRaw<T>(query);
}
