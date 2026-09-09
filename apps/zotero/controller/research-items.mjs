// Read-only, bounded export of bibliographic fields. No account keys, notes,
// attachment contents or local paths cross this action boundary.
export async function researchItems({ since, until }, { userId, request }) {
  const startTime = Date.parse(since);
  const endTime = Date.parse(until);
  if (
    !Number.isFinite(startTime) ||
    !Number.isFinite(endTime) ||
    startTime >= endTime ||
    endTime - startTime > 8 * 86400000
  )
    throw new Error("Choose a research window of at most eight days");
  const items = [];
  for (let start = 0; start < 1000; start += 100) {
    const query = new URLSearchParams({
      format: "json",
      sort: "dateAdded",
      direction: "desc",
      limit: "100",
      start: String(start)
    });
    const page = await request(`/users/${encodeURIComponent(String(userId))}/items/top?${query}`);
    if (!Array.isArray(page)) throw new Error("Could not read the Zotero item list");
    let reachedStart = false;
    for (const item of page) {
      const data = item.data;
      if (!data || !/^[A-Z0-9]{8}$/.test(item.key)) throw new Error("Invalid Zotero item metadata");
      const added = Date.parse(data.dateAdded);
      if (!Number.isFinite(added)) throw new Error("Zotero item has no valid date added");
      if (added < startTime) reachedStart = true;
      if (added < startTime || added >= endTime || ["attachment", "note", "annotation"].includes(data.itemType))
        continue;
      items.push({
        key: item.key,
        title: String(data.title ?? "Untitled").slice(0, 2000),
        authors: (data.creators ?? [])
          .slice(0, 30)
          .map((creator) =>
            String(creator.name ?? [creator.firstName, creator.lastName].filter(Boolean).join(" ")).slice(0, 200)
          ),
        date: String(data.date ?? "").slice(0, 100),
        dateAdded: data.dateAdded,
        doi: String(data.DOI ?? "").slice(0, 300),
        zoteroUrl: `zotero://select/library/items/${item.key}`
      });
    }
    if (page.length < 100 || reachedStart) return { items };
  }
  throw new Error("More than 1,000 recent items; use a smaller research window before continuing");
}
