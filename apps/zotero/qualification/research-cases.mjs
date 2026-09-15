import assert from "node:assert/strict";

export const researchWindow = { since: "2026-09-08T00:00:00Z", until: "2026-09-09T00:00:00Z" };

function item(key, itemType = "journalArticle", dateAdded = "2026-09-08T12:00:00Z") {
  return {
    key,
    data: {
      itemType,
      dateAdded,
      title: "Synthetic paper",
      date: "2026",
      DOI: "10.0000/synthetic",
      creators: [{ firstName: "Test", lastName: "Author" }],
      note: "PRIVATE_SYNTHETIC_NOTE",
      path: "/private/synthetic.pdf",
      apiKey: "SYNTHETIC_NOT_A_CREDENTIAL"
    }
  };
}

// Shared between source checks and the pinned-image mailbox fixture. execute
// returns only the action outcome and metadata request routes, never headers.
export async function runResearchCases(execute) {
  const samples = [
    item("ABCD1234"),
    item("NOTE1234", "note"),
    item("FILE1234", "attachment"),
    item("ANNO1234", "annotation"),
    item("OLD01234", "book", "2026-09-07T23:59:59Z"),
    item("NEXT1234", "book", "2026-09-09T00:00:00Z")
  ];
  const selected = await execute(researchWindow, [samples]);
  assert.equal(selected.ok, true);
  assert.deepEqual(selected.result, {
    items: [
      {
        key: "ABCD1234",
        title: "Synthetic paper",
        authors: ["Test Author"],
        date: "2026",
        dateAdded: "2026-09-08T12:00:00Z",
        doi: "10.0000/synthetic",
        zoteroUrl: "zotero://select/library/items/ABCD1234"
      }
    ]
  });
  assert.equal(selected.queries.length, 1);
  const query = new URL(selected.queries[0], "http://synthetic.invalid");
  assert.equal(query.pathname, "/users/123/items/top");
  assert.deepEqual(Object.fromEntries(query.searchParams), {
    format: "json",
    sort: "dateAdded",
    direction: "desc",
    limit: "100",
    start: "0"
  });

  const empty = await execute(researchWindow, [[]]);
  assert.deepEqual(empty.result, { items: [] });
  assert.equal(empty.ok, true);
  for (const input of [
    { since: "invalid", until: researchWindow.until },
    { since: researchWindow.until, until: researchWindow.since },
    { since: "2026-08-01T00:00:00Z", until: researchWindow.until }
  ]) {
    const invalid = await execute(input, [[]]);
    assert.equal(invalid.ok, false);
    assert.match(invalid.error, /eight days/);
    assert.deepEqual(invalid.queries, []);
  }
  const malformed = await execute(researchWindow, [[{ key: "bad", data: {} }]]);
  assert.equal(malformed.ok, false);
  assert.match(malformed.error, /Invalid Zotero item metadata/);

  const fullPage = Array.from({ length: 100 }, () => item("ABCD1234"));
  const overflow = await execute(
    researchWindow,
    Array.from({ length: 10 }, () => fullPage)
  );
  assert.equal(overflow.ok, false);
  assert.match(overflow.error, /1,000/);
  assert.equal(overflow.queries.length, 10);
  assert.deepEqual(
    overflow.queries.map((route) => Number(new URL(route, "http://synthetic.invalid").searchParams.get("start"))),
    [0, 100, 200, 300, 400, 500, 600, 700, 800, 900]
  );
  return { scenarios: 7, metadataOnly: true, boundedPagination: true };
}
