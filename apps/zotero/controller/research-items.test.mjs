import test from "node:test";
import { runResearchCases } from "../qualification/research-cases.mjs";
import { researchItems } from "./research-items.mjs";

test("research metadata source passes the same synthetic cases required of the pinned controller", async () => {
  await runResearchCases(async (input, pages) => {
    const queries = [];
    const request = async (route) => {
      queries.push(route);
      const start = Number(new URL(route, "http://synthetic.invalid").searchParams.get("start"));
      return pages[start / 100] ?? [];
    };
    try {
      return { ok: true, result: await researchItems(input, { userId: "123", request }), queries };
    } catch (error) {
      return { ok: false, error: error.message, queries };
    }
  });
});
