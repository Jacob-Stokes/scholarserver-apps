# Guided-install app candidates — 12 September 2026

`0.5.10-guided.20260912.1` is an AMD64-only package candidate for a private,
user-led fresh installation. It is not a stable catalog release or a Freelove
upgrade. ARM64 qualification of the new controller and relay remains pending;
the package does not promise that architecture. Recipe build capabilities remain
unchanged, and previous immutable images and package versions are retained.

Resolution built the controller and local API relay natively from apps commit
`fcdc970ee6bfb130cdb17ddcc9bc0fd11fbad581`, in its isolated rootless Docker daemon.
Both exact source commits passed Resolution source CI (apps run 32, core run 40).
The changed images passed layer-content checks and the five-service Zotero
packaging harness with a new, unconnected desktop profile. This checks non-root,
read-only startup, missing/wrong relay-token rejection, authorized connector
requests, service health and retained relay identity after restart. Disposable
containers, networks and volumes were removed. No actual browser was attached
to that native harness; its summary's UI wording is not browser acceptance.

The two new image references were published only after native checks. Registry
manifests, native architecture, filesystem layers, runtime configuration and
source labels were compared with the built image inspections. Exact digests and
source fingerprints are recorded in `catalog/image-source-lock.json`. Desktop,
MCP and automations retain their previously qualified image references.

The full-catalog gate also found n8n's later report templates and bundled app
icons missing from its selected integration image. That image was rebuilt from
the same `fcdc970` source on Resolution and published after native checks.
AMD64-only n8n package `0.1.0-guided.20260912.1` selects it; the n8n runtime image
is unchanged. Native checks cover password-only setup, protected Manager service
identity, restart, all six templates, independent copies, native edit detection,
repeated execution, empty inputs and revoked grants without report writes.
Research services and data were synthetic. Browser rendering and real-library
grants were not checked in this native run. All owned test resources were removed.

Source-lock validation now uses the package's declared support architectures as
its acceptance requirement, bounded by the recipe's supported architectures.
An AMD64-only package can select a genuinely AMD64-qualified image. A package
promising both architectures must still have both; reused multi-architecture
images remain valid for a narrower package. Missing/invalid declarations and
stale source or mismatched image references still fail.

The first full source run failed an old package-contract assertion requiring
every package to advertise both architectures. The contract now checks a
nonempty, unique set of known architectures, with source-lock tests separately
enforcing evidence for every declared architecture. This changes the package
support policy for scoped candidates; it does not supply missing ARM64 evidence.
The subsequent run also exposed a development test hard-coded to beta.6; it
now compares the current manifest's version and exact image references. The
final full `scripts/check-source.sh` passed on Resolution, including lint,
`npm test`, packaging checks and all production UI/MCP builds. Twenty-six
focused architecture/package tests and ten native-pipeline tests also pass.

All nineteen current recipe source records now match their package-selected
images and declared architectures. Evidence is under `.dev/guided-20260912.1` locally and
`/home/scholar-ci/guided-20260912-1` on Resolution. This is scoped Zotero/n8n native
check, not the separate all-recipe build/qualification receipt. Signing, clean
installation, website account linking, real embedded permission approval,
Gateway operations and desktop-to-server sync are separate later gates.

Mac Docker remained stopped. No personal native library or vault was accessed.
The project-vault documentation update remains pending for that reason.
