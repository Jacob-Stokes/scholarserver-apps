import { z } from "zod";
import { MetadataError } from "./http.mjs";
import { arxivIdSchema, doiSchema, searchSchema } from "./metadata.mjs";

export function literatureTools(client) {
  const definitions = [
    [
      "crossref_lookup",
      "Look up Crossref metadata by DOI, without fetching linked content.",
      z.object({ doi: doiSchema }).strict()
    ],
    ["crossref_search", "Find bibliographic candidates in Crossref. No automatic match selection.", searchSchema],
    ["arxiv_search", "Search arXiv metadata using its query syntax. No papers are downloaded.", searchSchema],
    [
      "arxiv_lookup",
      "Read reported arXiv version metadata and source links, not full version history.",
      z.object({ id: arxivIdSchema }).strict()
    ]
  ];
  return definitions.map(([operation, description, inputSchema]) => ({
    def: {
      name: `literature_${operation}`,
      description,
      inputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    handler: async (input) => {
      try {
        return await client.execute(operation, input);
      } catch (error) {
        if (error instanceof MetadataError)
          return {
            status: "error",
            code: error.code,
            retryAfterMs: error.retryAfterMs,
            records: [],
            partial: true,
            message: "No complete result is available. No automatic retry was performed."
          };
        throw error;
      }
    }
  }));
}
