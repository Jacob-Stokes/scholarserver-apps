# Research automation roadmap

Updated: 10 September 2026. Status: researched planning document, not an implementation or release commitment.

## Recommendation

Jacob's delivery order, agreed 10 September 2026, supersedes the earlier recommendation to work on automations next:

1. **Finish the base infrastructure.** Close a bounded acceptance checklist for installation, access, secrets, app lifecycle, backup/restore, recovery and affordable releases. Verify the architecture and code readability. Readiness means passing agreed release gates, not eliminating every conceivable edge case or building speculative infrastructure.
2. **Build a catalogue of 25–30 high-quality apps.** An app should have tested installation, guided setup, usable access, persistent data, update/removal behaviour, recovery coverage and clear documentation. A manifest or running container alone does not count. Keep app-specific code outside Manager and expose narrow operations where the app genuinely needs them; do not build automation-specific APIs speculatively.
3. **Then expand automations across those apps.** Revalidate this backlog against the delivered catalogue and user needs before implementing it. Existing n8n/templates remain preserved as reference work; automation expansion is parked, not deleted or silently disabled.

The rankings below apply **within phase 3**, not ahead of infrastructure or apps. At that point, finish the three existing non-AI workflows, then prioritise **annotations into notes without losing the researcher's writing**, followed by selective capture and quiet literature alerts. Fifty candidates are a discovery backlog, not fifty promised features.

The strongest signal in this review is demand for continuity between reading and writing: less copying, stable source links, incremental imports and preservation of personal notes. Users describe these problems directly in [Zotero][S01] and [Obsidian][S02] discussions. Requests for [filtered alerts][S03], [missing PDFs][S04] and [publication updates][S05] provide additional concrete targets. These are qualitative signals, not a representative survey or proof of willingness to pay.

Our opportunity is not another reference manager or an autonomous research agent. It is **a small number of understandable connections between tools researchers already use**, configured through Manager and executed in n8n.

## How this was researched

This pass used public researcher questions, maintainers' responses, official product documentation and university/open-science guidance. It also inspected the current YAML templates, integration code, acceptance records and the existing Obsidian application landscape. Sources were accessed on 10 September 2026; their publication dates vary. Older discussions establish that a problem was reported, not that upstream software still lacks a solution.

Evidence labels used below:

- **D — direct:** a user describes the need. Small, self-selected samples; no prevalence claim.
- **P — pattern:** an existing product or documented research process supports the direction. Not proof of demand for our particular implementation.
- **H — hypothesis:** a proposed extension needing interviews and a small experiment. No direct demand established in this pass.

This sample favours literature-heavy Zotero/Obsidian users and English-language public communities. It underrepresents laboratories, qualitative fieldwork, accessibility needs, institutional IT and researchers who do not use personal knowledge-management tools. No private libraries, messages or user research data were accessed. No respondents were contacted. Product template listings demonstrate feasibility patterns, not adoption or reliability.

### What the evidence changes

| Observation | Product consequence |
| --- | --- |
| Researchers want to import later annotations without destroying their own writing. [S01][S01], [S02][S02] | Preservation and stable identity are acceptance criteria, not polish. Start with separate source notes or append-only records rather than bidirectional sync. |
| Some want keyword filtering before being alerted about papers. [S03][S03] | Bounded digests, exclusions and empty-run silence should precede AI relevance ranking. |
| Obtaining PDFs and identifying missing attachments are separate problems. [S04][S04], [S06][S06] | Distinguish absent full text, inaccessible files, denied access and conversion failure. Never promise an institutional subscription works from the server. |
| Duplicate records and duplicate PDF files are not interchangeable; deleting the wrong PDF can discard annotations. [S07][S07] | Suggest duplicate candidates; do not auto-merge or delete research material. |
| Preprints and published versions can both matter to a researcher. [S05][S05] | Offer a version relationship and reviewable metadata update, not replacement of an annotated original. |
| Review processes need traceability, not just faster extraction. [S08][S08], [S09][S09] | Preserve search batches, source locations and human decisions. Screening and extraction suggestions are not final scientific judgements. |

### What other products get right—and what not to copy

- **Readwise:** automatic export and append-only additions demonstrate a useful preservation-first model. Its documentation also explains limitations around edits and moved files. Copy the explicit ownership, not a claim of effortless two-way sync. [Readwise export documentation][S10]
- **Zotero:** already handles feeds, PDF metadata retrieval and retraction notifications. Our value must be a cross-app output or a better server-side handoff, not a duplicate button with more infrastructure. [Feeds][S11], [metadata retrieval][S12], [retractions][S13]
- **n8n's community catalogue:** DOI capture from a messaging app into Zotero is a concrete pattern. We should provide an authenticated Manager capture route first, not require Telegram or import community workflows unreviewed. [Example template][S14]
- **Elicit:** a staged search/screen/extract experience is a useful model for specialist review workflows. Vendor-described capabilities are not an independent accuracy guarantee and do not justify automatic exclusion decisions. [Product workflow][S09]
- **Readwise review and Obsidian/Anki workflows:** resurfacing and deliberate card creation are established patterns. Preserve the user's selection of what deserves memorisation; do not turn every highlight into a card. [Daily review][S15], [community workflow][S16]
- **OSF/COS:** connected plans, data, code and outputs are useful long-term goals. Start with private inventories and draft deposit packages, not automatic public release. [Open research lifecycle][S17]

## Priorities, not false precision

Rank is a **delivery recommendation for ScholarServer**, not a measured popularity ranking. Consider demand evidence, recurring benefit, existing app fit, implementation effort and consequences of a mistake. Prefer an additive, inexpensive workflow over a destructive or provider-heavy one when benefits are otherwise similar. Existing source and real acceptance evidence put 01–03 ahead of larger unmet needs.

Effort estimates are relative and unvalidated: **S** uses largely existing operations; **M** needs a bounded new app operation or state handling; **L** needs several capabilities, a new integration or difficult reconciliation. They are not day estimates. Risk: **low** is read/add-only with bounded scope, **medium** can duplicate/misclassify/disclose data, **high** involves sensitive data, scientific conclusions or substantial writes.

Readiness:

- **Candidate:** source exists; see exact acceptance limits below. Not generally released.
- **Capability gap:** current apps exist, but the necessary authorised workflow operation is not proven or implemented.
- **Dependency gap:** needs a draft/future app or external service connection as well as implementation.
- **Explore:** demand or feasibility is too uncertain to schedule.

All entries assume n8n is installed. “Notes” means Obsidian for the first implementation; Logseq is a future alternative requiring its own tested write contract, not a drop-in substitution. “Files” means a selected server-accessible location, not arbitrary access to the user's laptop. “Metadata service” means a future reviewed connection such as Crossref/arXiv, not an existing Manager capability. Existing project notes identify Anki, Paperless, Stirling PDF and literature connectors as drafts; other landscape entries remain candidates, not app commitments.

Cost/data notation: **N** = no AI/provider required beyond selected apps and their normal hosting/sync; **E** = external service receives identifiers, queries or content, with access limits or possible account costs; **AI** = explicit model connection, metered fees or local compute, content disclosure choice and review required. N does not mean zero server cost. Every workflow is disabled until configured and enabled.

## Top 10: recommended delivery order

| Rank / outcome | Trigger and required apps | Reads → creates or changes | Evidence and reason to prioritise | Readiness / effort / risk / cost |
| --- | --- | --- | --- | --- |
| **01 · Turn new PDFs into attached Markdown** | Minute poll; Zotero + Docling + shared folder | Matched PDFs → Markdown attachment on original paper | Jacob's explicit request; useful foundation for later text workflows. Not a market-demand claim. | Candidate; S remaining product work; medium; N, CPU-heavy conversion |
| **02 · Start a reading note for each new paper** | Scheduled recent-item scan; Zotero + Obsidian | Bibliographic metadata → create-only note with source link and writing headings | D/P: cross-app reading/writing need [S01][S01]; already has real acceptance evidence. | Candidate; S; low; N |
| **03 · See new library papers in one daily note** | Daily; Zotero + Obsidian | Previous day's additions → one dated list, no empty note | P: quieter awareness of library changes [S18][S18]; low-complexity existing template. Not new-paper discovery. | Candidate; S–M for reliable catch-up; low; N |
| **04 · Bring new highlights into notes without losing writing** | Periodic annotation changes; Zotero + Obsidian | Annotation IDs, quotes, comments, page links → separate/append-only source notes | D: repeated explicit preservation problem [S01][S01], [S02][S02]. First new capability to investigate. | Capability gap: annotation reads and idempotent additions; L; medium; N |
| **05 · Save starred feed papers to a research inbox** | Newly starred entries; FreshRSS + Zotero | Selected feed metadata/DOI → deduplicated inbox items | P: upstream feed capture [S11][S11]; adds value for FreshRSS users, not everyone. | Capability gap: scoped feed reads + Zotero import; M; medium; E |
| **06 · Receive a quiet keyword research digest** | Daily/weekly; FreshRSS + Obsidian | Matching titles/abstracts → capped source-linked digest | D: explicit keyword-alert request [S03][S03]. Deterministic rules before AI ranking. | Capability gap: feed actions, seen-item state; M; low; N after feed ingestion |
| **07 · Find papers with missing or inaccessible PDFs** | Weekly; Zotero + selected file access | Attachment references/access checks → repair report, no deletion | D: missing-file discovery request [S06][S06]; makes failures understandable. | Capability gap: attachment audit action; M; low; N |
| **08 · Fetch legally accessible full text for selected papers** | Item in an opt-in retrieval queue; Zotero + metadata/OA service | Identifiers → accessible PDF attachment or explicit unresolved result | D: bulk full-text retrieval [S04][S04]. Reuse upstream behaviour where possible. | Dependency gap: acquisition + safe download; L; medium; E |
| **09 · Tell me when a saved preprint is published** | Weekly; Zotero + metadata service + Obsidian | Stable identifiers/version links → review note, original untouched | D: publication-update request [S05][S05]. Prefer alerts over silent metadata mutation. | Dependency gap: reliable version mapping; M; low; E |
| **10 · List possible duplicate records for review** | After import/weekly; Zotero + Obsidian | IDs/metadata → candidate pairs and reasons | D/P: duplicate pain [S07][S07], review traceability [S08][S08]. Report only; use Zotero to merge. | Capability gap: bounded candidate report; M; low; N |

**First three to finish:** 01–03. **First substantially new workflow:** 04. Do not delay delivery of the existing candidates until annotation synchronisation is solved.

## 11–20: collect, discover and organise

| Rank / outcome | Trigger and required apps | Reads → creates or changes | Demand signal | Readiness / effort / risk / cost |
| --- | --- | --- | --- | --- |
| 11 · Capture a DOI from mobile | Authenticated submission; Manager-facing app UI + Zotero + metadata service | Submitted DOI → inbox item and confirmation | P: messaging-to-Zotero example [S14][S14]; mobile surface is our hypothesis. | Capability gap: capture UI/import; M; medium; E |
| 12 · Watch a saved literature search | Daily/weekly; literature connector + Zotero + Obsidian | Saved query/results → unseen-hit shortlist, not auto-import | P: documented search/review process [S09][S09]; database-specific feasibility unverified. | Dependency gap; L; medium; E |
| 13 · Import a dropped PDF into Zotero | Folder poll; Files + Zotero | New PDF → identified parent/attachment, unresolved inbox otherwise | P: Zotero already recognises dropped PDFs [S12][S12]; server watch is the added handoff. | Capability gap: controlled import; M; medium; E for recognition |
| 14 · Turn saved web reading into source notes | Explicit bookmark/tag; bookmark service + Obsidian | Selected URL/metadata → linked note | P: multi-source note export [S10][S10]; not proof we need another reader. | Dependency gap; M; medium; E |
| 15 · Import a reference batch without hiding duplicates | User drops RIS/BibTeX; Files + Zotero | Batch → preview, approved import and receipt | D/P: bulk import/full-text workflow [S04][S04], duplicate traceability [S08][S08]. | Capability gap: preview/import; L; medium; N |
| 16 · Spot incomplete citation metadata | Weekly; Zotero + Obsidian | Required fields → missing-field report | P: metadata retrieval exists [S12][S12]; auditing existing records is proposed. | Capability gap; M; low; N |
| 17 · Suggest metadata corrections | Explicit selection; Zotero + metadata service | Current/source metadata → field-by-field proposal | D/P: update need [S05][S05]; protect manually curated fields. | Dependency gap; L; medium; E |
| 18 · Route approved papers to collections by rules | New inbox item; Zotero | User rules + metadata → additive collection membership | H: plausible organisation aid; validate before adding configuration. | Capability gap: collection actions; M; medium; N |
| 19 · Notify me about new citations to selected work | Weekly; citation-index connector + Obsidian | Opt-in identifiers → citing-paper list | H: potentially valuable; coverage and API feasibility not verified. | Dependency gap; L; medium; E |
| 20 · Follow selected authors' publications | Weekly; literature connector + Obsidian | Researcher IDs/results → new-work shortlist | H: validate need beyond existing journal/search alerts; avoid name-only matching. | Dependency gap; L; medium; E |

## 21–30: read, understand and remember

| Rank / outcome | Trigger and required apps | Reads → creates or changes | Demand signal | Readiness / effort / risk / cost |
| --- | --- | --- | --- | --- |
| 21 · Extract text from scanned research PDFs | Explicit queue; Zotero + Docling | Selected scans → OCR-derived attachment, original retained | P: scanned annotation workflow [S19][S19]; OCR quality needs separate acceptance. | Capability gap: reviewed OCR profile; M; medium; N, high CPU |
| 22 · Prepare a source-linked paper brief | Explicit tag; Zotero + Docling + Obsidian + model | Selected full text → labelled draft summary with source locations | P: summarised capture [S14][S14]; extend cautiously from abstract to full text. | Dependency gap: model + location fidelity; L; high; AI |
| 23 · Draft answers to my reading questions | Explicit paper/questions; Zotero + Docling + Obsidian + model | Text/questions → cited draft answers, including “not found” | P: structured extraction pattern [S09][S09], not verified answer accuracy. | Dependency gap; L; high; AI |
| 24 · Gather tagged quotations by theme | Periodic; Zotero + Obsidian | Selected annotations/tags → source-linked quote index | P: annotation export [S19][S19]; extends 04, not separate sync machinery. | Capability gap: depends on 04; M; medium; N |
| 25 · Resurface a few chosen highlights | Daily/weekly; Zotero or Obsidian | Opt-in highlights → small review note with original links | P: established review pattern [S15][S15]. Keep volume user-controlled. | Capability gap: selection/seen state; M; low; N |
| 26 · Send explicitly marked cards to Anki | Tagged structured notes; Obsidian + Anki | User-authored question/answer → identified cards | D/P: existing Obsidian–Anki workflow [S16][S16]. Do not duplicate an already configured plugin. | Dependency gap: draft Anki and card API; M; medium; N |
| 27 · Draft flashcards from selected passages | Explicit request; notes + Anki + model | Chosen passages → reviewable draft cards, not active deck additions | H: distinguish drafting from factual correctness and user selection. | Dependency gap; L; high; AI |
| 28 · Translate a selected abstract for reading | Explicit request; Zotero + Obsidian + model/translation provider | Abstract → labelled translation beside original | H: interview multilingual researchers; no silent replacement or claim of equivalent meaning. | Dependency gap; M; medium; AI/E |
| 29 · Prepare a private journal-club pack | Selected collection + date; Zotero + Obsidian | References/user notes → agenda and linked reading list | H: plausible team task; sharing permissions need deliberate design. | Capability gap; M; medium; N |
| 30 · Remind me about papers I chose to read | Weekly; Zotero + Obsidian | Explicit reading queue → limited reminder list | H: test whether it reduces friction or adds guilt/noise; no inferred “unread” status. | Capability gap: explicit state; M; low; N |

## 31–40: review literature and write

| Rank / outcome | Trigger and required apps | Reads → creates or changes | Demand signal | Readiness / effort / risk / cost |
| --- | --- | --- | --- | --- |
| 31 · Keep a project bibliography export current | Collection changes; Zotero + Files | Bibliographic records → managed export file, not manuscript edits | P: reference workflow [S04][S04]; first assess existing export tools rather than replace them. | Capability gap: stable citation keys/export; M; medium; N |
| 32 · Build a source-linked literature matrix | Explicit collection; Zotero + Docling + Files + model | Papers → draft structured table with per-cell provenance | P: extraction stage [S09][S09]. All substantive fields require review. | Dependency gap; L; high; AI |
| 33 · Collect new search results for review screening | New saved-search batch; literature connector + review tool | Search batch → deduplicated screening inbox plus counts | P: review guidance [S08][S08]. Preserve raw batch and reasons. | Dependency gap: review app not implemented; L; medium; E |
| 34 · Suggest screening order, never auto-exclude | Explicit protocol/batch; review tool + model | Titles/abstracts + criteria → prioritised queue with reasons | P: staged screening [S09][S09]. Human decisions remain authoritative. | Dependency gap; L; high; AI |
| 35 · Draft study-extraction fields | Explicit included studies; Docling + review tool + model | Text + schema → evidence-linked proposed fields | P: systematic-review extraction [S09][S09]. Distinct from exploratory matrix 32. | Dependency gap; L; high; AI |
| 36 · Export review progress and exclusion counts | Weekly/manual; review tool + Files | Recorded decisions → dated audit report | P: documented deduplication/count tracking [S08][S08]. Never invent missing decisions. | Dependency gap; M; medium; N |
| 37 · Check cited papers for retractions/corrections | Before draft export/weekly; Zotero + reviewed metadata source + Obsidian | Cited DOI set → source-linked warning report | P: Zotero already warns [S13][S13]; cross-project report is the added value [S20][S20]. | Dependency gap: cited-set/status mapping; M; medium; E or locally cached metadata |
| 38 · Flag citation identity mismatches in a draft | User submits bibliography; Files + metadata service | Claimed title/DOI → discrepancies to review | H: plausible verification aid; “no mismatch found” is not authenticity certification. | Dependency gap; L; medium; E |
| 39 · Refresh a generated project reading index | Scheduled; Zotero + Obsidian | Selected project metadata → generated index separate from prose | H: depends on actual use of starter notes; avoid another overlapping daily digest. | Capability gap; M; low; N |
| 40 · Prepare a manuscript source bundle | Explicit request; Zotero + Files + publishing tool | Chosen references/notes → private bundle and inventory | P: linked research outputs [S17][S17]; bundle scope and rights require review. | Dependency gap; L; medium; N |

## 41–50: preserve, collaborate and specialist research

| Rank / outcome | Trigger and required apps | Reads → creates or changes | Demand signal | Readiness / effort / risk / cost |
| --- | --- | --- | --- | --- |
| 41 · Summarise additions to a shared library | Weekly; Zotero group library + chosen private destination | Authorised group additions → digest for approved recipients | D: group new-item alert request [S18][S18]. Distinct from personal digest 03. | Capability gap: group scope/delivery; M; medium; E if sent externally |
| 42 · Create a data-file inventory | New files/manual; Files + notes | Names, sizes, hashes, selected headers → private manifest | P: documentation and linked outputs [S17][S17]; do not ingest arbitrary contents. | Capability gap: narrow manifest operation; M; low; N |
| 43 · Check research tables against a declared schema | File update; Files + validation app | Selected CSV + schema → validation report, original unchanged | H: useful for computational work, but no demand/engine validation here. | Dependency gap; L; medium; N |
| 44 · Run a named analysis when approved data arrives | Dataset ready marker; notebook/job app + Files | Approved input → bounded preconfigured analysis outputs | H: specialist workflow; never arbitrary workflow-supplied host shell. | Dependency gap; L; high; N, compute-heavy |
| 45 · Draft a repository deposit checklist | Explicit milestone; Files + notes | Output inventory → missing-metadata/checklist report | P: linked lifecycle outputs [S17][S17]; no public upload. | Capability gap; M; low; N |
| 46 · Upload an approved deposit as a private draft | Explicit approval; Files + repository connector | Selected files/metadata → remote draft deposit | P: research-output lifecycle [S17][S17]; visibility and rights need confirmation. | Dependency gap; L; high; E |
| 47 · Prepare interview transcripts for review | Explicit opt-in folder; transcription app + Files | Consented recording → draft transcript with timestamps | H: outside the validated literature persona; ethics, retention and consent gates first. | Dependency gap; L; high; AI or local transcription compute |
| 48 · Make an approved document available in the archive | Explicit tag; Zotero + Paperless | Selected document/metadata → archive record and receipt | H: assess whether this duplicates the user's storage before building it. | Dependency gap: draft Paperless + import contract; L; medium; N |
| 49 · Record a research handoff checklist | Explicit project milestone; Files + notes | Selected assets/owners → private handoff note with links | H: interview collaborating researchers; never grant access automatically. | Capability gap; M; medium; N |
| 50 · Warn when a research source URL stops resolving | Weekly; selected notes + bounded URL checker | Approved public URLs → persistent-failure report | H: validate value; avoid false alarms from rate limits or authentication. | Capability gap; M; medium; E; SSRF controls required |

The lower half intentionally contains hypotheses. Do not use the existence of this list as evidence that researchers requested all fifty. Keep optional output destinations, intervals and AI on/off choices as variants of one outcome rather than inflating the catalogue with duplicates.

## Detailed specifications: first three

These are release targets with an explicit current-state comparison, not claims that all behaviour exists today. No runtime was changed by this document.

### 01 · Automatically convert new Zotero PDFs

**Outcome:** a PDF added to the chosen shared folder, already attached to a Zotero paper, gains a Markdown attachment on that same paper. This does not import arbitrary PDFs into Zotero; that is candidate 13.

**Current source:** [template version 3](../apps/n8n/templates/zotero-pdf-markdown.yaml). [Real acceptance record](../apps/n8n/PDF_WATCH_ACCEPTANCE.md) covers a newly added PDF, real Docling conversion and attached output; later forced-overlap runs verified recovery without duplicate output. Version 3 only adds layout/labels. None of that alone publishes the candidate.

**Manager setup:** choose Zotero, Docling and a folder both can access; confirm that existing PDFs will also be checked; retain a one-minute default with the existing 1–60 minute choice. Explain the current fewer-than-100-PDF limit and OCR-off behaviour before enablement. Show read/write roles and no-AI status. No n8n editor or copied API key in normal setup.

**Native workflow:** schedule/manual trigger → list selected files → iterate one at a time → match one Zotero attachment → start/reuse conversion → inspect status → wait/check while pending → attach result → next file. Unmatched files are skipped; ambiguous matches must not attach to an arbitrary paper. Failed/over-one-hour conversions stop the run. HTTP nodes currently use three attempts with three-second spacing; app-side idempotence is required for repeated writes.

**Ownership and identity:** n8n owns schedule and flow; Docling owns conversion jobs and source-hash/profile reuse; Zotero owns attachment records and reuse receipts. A receipt is not universal exactly-once execution. The same file processed under another workflow must not create duplicate content. A selected folder is a scope boundary, not a discovery path to widen automatically.

**Release checks still required:** complete final-package Manager enablement and status; restart while waiting and reconcile the same job; distinguish discovery failure from zero PDFs; test unreadable/partially synced files, ambiguous matches, the folder limit, denied access and changed-file behaviour. Do not silently reset a permanently failed conversion on every scan. Document disable as stopping future triggers, separately from in-flight work and revocation.

**Useful outcome status:** last checked, files examined, unmatched, reused, converted, attached and failed—only where actual results support those counts. A successful run that reused existing output should not say “converted a paper”. Keep payload retention bounded; show a link or safe item label rather than logging full paper text.

**Acceptance demonstration:** enable from Manager; add one PDF; observe one attached result; leave the next scan running and show reuse; disable; prove no later scheduled start. Then test interruption/restart with the same output identity. Use a disposable library and remove test resources.

### 02 · Create reading-note starters

**Outcome:** each eligible Zotero paper gets a place for the researcher to write, with metadata and a source link. It is not an AI summary and does not import annotations yet.

**Current source:** [version 1 template](../apps/n8n/templates/zotero-reading-notes.yaml) checks papers added in the last seven days every six hours by default, creates `zotero-<item-key>.md`, and leaves existing files untouched. [Real reading-note acceptance](../apps/n8n/REAL_RESEARCH_ACCEPTANCE.md) documents actual create/repeat behaviour and evidence boundaries.

**Manager setup:** choose Zotero, Obsidian and destination folder; preview one sample scaffold; explain the seven-day eligibility window and create-only behaviour. Preserve the supported hourly setting. Do not present a collection filter or arbitrary template editor until implemented and tested.

**Target native workflow:** schedule → calculate explicit bounded date range → list authorised items → format each scaffold → create without replacing. Current `ResearchBridge.execute` chooses the seven-day window in code. Move that policy to native workflow nodes in a small follow-up: the bridge should validate bounded date arguments and scope, not decide the workflow's time window. Keep authentication and allowlists in the bridge.

**Identity and edits:** identify a source by library plus item key; do not infer identity from title. The current supported scope and deterministic filename need explicit review before adding group libraries or multiple source libraries to one folder. A renamed/moved/deleted note must not silently be recreated under a new name unless the user chooses that behaviour; current create-only path identity does not prove moved-note reconciliation.

**Missing-history policy:** seven days is not an incremental checkpoint. A server offline longer than that may miss papers. Before describing this as complete ongoing coverage, add a bounded catch-up design in n8n-owned state, with an explicit first-run range and item-level idempotence. Do not add a scheduler in the bridge to compensate.

**Acceptance checks:** first creation; repeat scan; personal text preserved; title change; filename collision; moved/deleted note; unavailable destination; restart after a successful write but lost response; duplicate execution; configured-copy isolation. Report created, already present and failed separately. No AI/provider account is required beyond selected apps and their normal sync prerequisites.

### 03 · Create a daily list of new papers

**Outcome:** a quiet dated note describing additions to the user's library. It does not claim to identify everything published in their field or papers they have read.

**Current source:** [version 1 template](../apps/n8n/templates/zotero-daily-digest.yaml) runs at a 24-hour interval, asks the bridge for the previous UTC day's additions, creates `digest-YYYY-MM-DD.md`, skips empty days and preserves existing files. This is an interval, not a chosen local morning delivery time. This pass did not independently verify real-app digest acceptance; do not borrow the reading-note evidence as proof.

**Manager setup:** Zotero, Obsidian and folder; state UTC and previous-day semantics accurately now. A future local-time choice must cover timezone/DST and be represented in the native workflow. Do not expose a field that the workflow ignores.

**Target native workflow:** schedule → determine date window → read items → format source-linked list → create once. The bridge currently chooses UTC midnight/one day; move that decision into n8n with bounded arguments, alongside the fix for 02. Item metadata formatting is already in native nodes.

**Catch-up and identity:** use source-library identity plus reporting date, and a bounded list of missed dates held by n8n. Advance a checkpoint only after each date's outcome is reconciled. Today's implementation does not catch up missed days or augment a digest after late syncing adds items to a past date. Decide between a separately identified supplement and explicit regenerate-with-review; never overwrite prose silently.

**Acceptance checks:** empty day; a known set of additions; repeated run; user-edited digest; late arriving items; midnight boundaries; two library scopes; unavailable destination; restart and multi-day downtime. If local time is added, test DST transitions too. First ship may remain explicitly UTC/limited, but must not promise catch-up that is absent.

**Noise and privacy:** one note, no email/push by default. External delivery is a later explicit option with recipient preview and acknowledgement that titles can disclose research interests. A digest does not need an AI summary to be useful.

## Architecture and catalogue rules

1. **Templates live here; execution lives in n8n.** Current YAML is under `apps/n8n/templates/`. Installed graph/configuration and workflow-owned checkpoints belong in n8n. Credentials stay in its credential store; package/setup secrets retain platform protections.
2. **Manager is the normal user interface, not an automation engine.** App-specific presentation and requests remain in the apps repository. Core provides authenticated platform access and an entry point, not branches for Zotero, Docling or a particular workflow.
3. **Thin operations, visible control flow.** App operations may list files, convert a document, read metadata or atomically create a note. Scheduling, window choice, iteration, conditions, waits and retry policy belong in the native graph. Conversion-job execution remains Docling's own responsibility.
4. **Persist business progress, not just execution logs.** Choose a supported native n8n state mechanism against the pinned version when needed; test concurrent runs, restart and backup. This research pass did not establish a particular native state API as suitable. Do not invent a second journalled workflow engine in the integration.
5. **Respect installed copies.** Store template identity/version as provenance, never silently replace a customised graph. An update preview must distinguish presentation, permissions and behaviour changes. Leave existing schedules unchanged unless approved.
6. **Bound both access and work.** Explicit app instances, folders, maximum batch size, timeouts and permitted operations. URL inputs need SSRF protection and redirect validation. No general host shell or Docker socket access for workflows.
7. **Make writes deliberate.** Additive outputs first. Reconcile uncertain writes; retry only with proven idempotence. Scientific decisions, merges, removals, external sends and publication require suitable review, not a reassuring label.
8. **AI is optional per outcome.** Display what content leaves the server, chosen provider/model, cost limits and source provenance. Treat documents as untrusted content, not instructions. Do not let generated text change permissions, recipients or tools. Default external communication to a draft/review step.
9. **Outcome-led catalogue, no maturity paywalls.** Show title, app names/icons and roles, trigger, writes, cost/data exposure and maturity. Use filters such as Collect, Read, Write and Preserve. “Preview” means evidence is incomplete, not a lower-priced tier. Do not duplicate every workflow per destination app before alternatives have tested contracts.
10. **Do not make platform recovery depend on n8n.** Install/update/access/backup/recovery remain Manager + executor operations. A future workflow can request a narrowly authorised configured operation, but primary backups must not stop because the optional workflow engine is down.

## Delivery gates and validation plan

### Phase 3 implementation pass — parked until infrastructure and apps are ready

These are not the current implementation priorities. First complete phases 1 and 2 above. Preserve existing automation behaviour; address a genuine platform security or release blocker in its owning component without using it to restart automation feature work.

- Finish release acceptance for 01–03 through Manager; expose truthful run outcomes, not just green execution badges.
- Correct time-window ownership in 02/03 without widening grants. Document or implement catch-up rather than promising it.
- Prove preservation of configured copies and native edits. Do not turn layout version 3 into an automatic migration.
- Publish a new immutable tested package only after the existing release gates pass. Source availability is not deployment.
- Investigate one narrow annotation-read contract for 04. Prefer source-linked incremental additions; no bidirectional sync engine.

### Before committing to 04–10

Run five short, consented walkthroughs spanning a PhD student, active researcher, librarian/review specialist, humanities researcher and mobile-first user. This is a proposed research activity, not completed interviews. Ask them to show the last real instance of copying notes, missing a PDF or losing track of literature; do not start by selling the proposed feature.

Record task frequency, manual steps, what must never change, preferred output, tolerance for delay, acceptable data disclosure, and whether an existing tool already solves it. Ask each to choose three candidates and one they would never enable. Re-rank after observing tasks rather than treating votes as market statistics.

Measure a small pilot by successful setup without native-editor access, time to useful output, duplicates/overwrites, missed inputs, recovery effort, unwanted notifications and whether people keep it enabled. Targets are to be set before the pilot; no measured savings or adoption figures exist yet.

### Deliberately not building now

No 50-workflow implementation sprint, generic YAML language, automatic two-way note sync, auto-merging libraries, universal AI agent, automatic research conclusions or public publishing. Do not package future apps solely because this list names them. Existing Zotero features/plugins may be the right recommendation for some users; integration is valuable only where it removes a real handoff.

## Source register

All links accessed 10 September 2026. Descriptions are brief paraphrases. Direct discussions establish reported needs; products and guidance establish patterns. No source establishes the ranking of all fifty.

| ID | Source and evidence type | How used / limit |
| --- | --- | --- |
| S01 | [Annotation workflow including Obsidian][S01] — user discussion, 2023 | Source links and note preservation; not current plugin compatibility proof. |
| S02 | [Keep writing when importing new annotations][S02] — user discussion, 2024 | Explicit incremental-import request and configuration friction. |
| S03 | [Keyword alerts in RSS][S03] — user discussion, 2023 | Selective alerts rather than all-feed notifications. |
| S04 | [Automated Find Available PDFs][S04] — user discussion, 2022 | Bulk retrieval need and access complications; unsafe third-party suggestions are not recommendations. |
| S05 | [Update arXiv publication information][S05] — user/maintainer discussion, 2020 onward | Version identity, original preservation and update requests. Later plugins mean this is not proof of an unsolved upstream gap. |
| S06 | [Saved search for missing attachments][S06] — user discussion, 2021 onward | Distinguish recorded attachment from accessible bytes. |
| S07 | [Duplicate PDF management][S07] — user/maintainer discussion, 2019 | Non-identical files and annotations make automatic deletion unsafe. |
| S08 | [UVU deduplication guidance][S08] — university library guidance | Auditability and human checking; search result content was available, direct page retrieval failed in this pass. |
| S09 | [Elicit Systematic Review][S09] — vendor product description, 2025 | Staged review UX only; not independent accuracy or demand evidence. |
| S10 | [Readwise Obsidian export][S10] — official documentation | Append-only export and documented limits on edits/moves. |
| S11 | [Zotero feeds][S11] — official documentation | Existing discovery/capture capability to avoid duplicating. |
| S12 | [Zotero PDF metadata retrieval][S12] — official documentation | Existing PDF-to-record behaviour; not a server watch API contract. |
| S13 | [Zotero retraction notifications][S13] — official product announcement, 2019 | Existing warning capability; avoid rebuilding it without added value. |
| S14 | [n8n DOI capture template][S14] — community template on vendor site | Feasible-looking capture pattern; not tested here or evidence of usage volume. |
| S15 | [Readwise reviewing highlights][S15] — official documentation | Resurfacing pattern, not demonstrated learning benefit. |
| S16 | [Obsidian flashcards and spaced repetition][S16] — community discussion, 2021 onward | Deliberately selected cards and note-review workflows. |
| S17 | [COS open research lifecycle][S17] — organisation guidance | Linked plans and outputs motivate preservation candidates; not demand validation for each. |
| S18 | [New group-library item alerts][S18] — user discussion, 2025 | Shared-library awareness; does not prove a personal digest is wanted by everyone. |
| S19 | [Annotations to Markdown workflow][S19] — user discussion, 2024 | Scanned materials, annotations and structured export. |
| S20 | [Crossref Retraction Watch metadata][S20] — official documentation | Potential metadata source; exact adapter/coverage needs acceptance. |
| S21 | [FreshRSS Google Reader API][S21] — official documentation | Potential feed access path; authenticated upstream API is not an implemented ScholarServer grant. |

FreshRSS candidates require a separately tested app-owned operation even though an [upstream API exists][S21]. Source capability does not by itself authorise n8n access to an installed app.

[S01]: https://forums.zotero.org/discussion/109148/annotation-workflow-including-obsidian
[S02]: https://forum.obsidian.md/t/zotero-integration-keep-the-writing-made-on-obsidian-after-importing-new-annotations-updating-the-note/74945
[S03]: https://forums.zotero.org/discussion/108687/alert-when-certain-keywords-in-rss-feed
[S04]: https://forums.zotero.org/discussion/94019/automated-way-to-run-find-available-pdfs
[S05]: https://forums.zotero.org/discussion/83310/updating-publication-information-for-arxiv-pre-prints
[S06]: https://forums.zotero.org/discussion/92750/saved-search-for-missing-attachments
[S07]: https://forums.zotero.org/discussion/76686/duplicate-pdf-management
[S08]: https://uvu.libguides.com/systematic-review/deduplication
[S09]: https://elicit.com/blog/systematic-review/
[S10]: https://docs.readwise.io/readwise/docs/exporting-highlights/obsidian
[S11]: https://www.zotero.org/support/feeds
[S12]: https://www.zotero.org/support/retrieve_pdf_metadata
[S13]: https://www.zotero.org/blog/retracted-item-notifications/
[S14]: https://n8n.io/workflows/7676-import-research-papers-from-telegram-to-zotero-with-ai-abstract-summaries/
[S15]: https://docs.readwise.io/readwise/docs/faqs/reviewing-highlights
[S16]: https://forum.obsidian.md/t/plugin-for-flashcards-note-level-spaced-repetition-all-inside-obsidian/16498
[S17]: https://www.cos.io/lifecycle-open-science
[S18]: https://forums.zotero.org/discussion/122000/new-item-alert
[S19]: https://forums.zotero.org/discussion/111313/zotero-6-help-with-setting-up-annotation-to-note-to-markdown-file-workflow
[S20]: https://www.crossref.org/documentation/retrieve-metadata/retraction-watch/
[S21]: https://freshrss.github.io/FreshRSS/en/developers/06_GoogleReader_API.html
