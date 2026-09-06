import { keyword as k, map, uuid } from "./worker-http.mjs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// DB graphs store UUID references. Display text alone loses backlinks during ref rebuilding.
export async function prepareReferences(content, ensurePage, pull) {
  const refs = [];
  const replacements = new Map();
  for (const title of new Set([...content.matchAll(/\[\[([^\[\]\n]+)\]\]/g)].map((match) => match[1]))) {
    const page = uuidPattern.test(title) ? await pull([k("block/uuid"), uuid(title)]) : await ensurePage(title);
    if (!page?.["block/uuid"]) continue;
    refs.push(
      map({
        "db/id": page["db/id"],
        "block/uuid": uuid(page["block/uuid"]),
        ...(page["block/name"] ? { "block/name": page["block/name"] } : {}),
        "block/title": page["block/title"]
      })
    );
    replacements.set(title, page["block/uuid"]);
  }
  return {
    refs,
    content: content.replace(/\[\[([^\[\]\n]+)\]\]/g, (whole, title) =>
      replacements.has(title) ? `[[${replacements.get(title)}]]` : whole
    )
  };
}

export async function readableTitles(data, pull, cache = new Map()) {
  if (Array.isArray(data)) {
    const result = [];
    for (const item of data) result.push(await readableTitles(item, pull, cache));
    return result;
  }
  if (!data || typeof data !== "object") return data;
  const entries = [];
  for (const [key, value] of Object.entries(data)) {
    if (key !== "block/title" || typeof value !== "string") {
      entries.push([key, await readableTitles(value, pull, cache)]);
      continue;
    }
    let title = value;
    for (const match of value.matchAll(/\[\[([0-9a-f-]{36})\]\]/gi)) {
      if (!uuidPattern.test(match[1])) continue;
      if (!cache.has(match[1])) cache.set(match[1], await pull([k("block/uuid"), uuid(match[1])]));
      const referenced = cache.get(match[1]);
      if (referenced?.["block/title"]) title = title.replaceAll(match[0], `[[${referenced["block/title"]}]]`);
    }
    entries.push([key, title]);
  }
  return Object.fromEntries(entries);
}
