# Native image build handoff

The native image workflow is manual-only. It has three ordered stages on each
AMD64 and ARM64 runner:

1. `scripts/build-native-images.sh` builds all 19 inventory recipes, checks the
   native architecture, runs the image-content scanner and writes a local build
   receipt. It does not log in or push.
2. `scripts/test-native-images.sh` checks the receipt images and runs the existing
   Files, Obsidian, FreshRSS and n8n native gates. It writes a qualification receipt
   only after all four named scopes pass.
3. `scripts/publish-native-images.sh` requires both matching receipts and
   publishes only the exact local image objects recorded by the successful build
   stage.

The GitHub workflow remains available only through **Run workflow**. Do not
schedule or automatically trigger it: the repository uses a $0 hosted Actions
budget. Do not use emulation, QEMU or Rosetta.

## Source and receipt requirements

Set `REVISION` to the full lowercase 40-character SHA of the checked-out commit.
Both build and publication refuse an abbreviated SHA, a different `HEAD`, tracked
changes, staged changes, or nonignored untracked files. They never create a
commit. Publication repeats the Git check and the selected recipe fingerprint
immediately before each push, so a changed source input invalidates the receipt.

The build writes its receipt to the ignored path
`.dev/native-images/<revision>-<architecture>.json`. Each of the 19 records contains:

- the inventory recipe name;
- the exact architecture-specific registry tag;
- the local `sha256:` Docker image ID used to select the object for tests and
  publication;
- the portable image-config digest, architecture and RootFS diff IDs read from a
  one-image `docker image save` archive; and
- the source fingerprint calculated from that recipe's fixed source inputs.

The build receipt is written only after every requested build and image-content
scan has passed and the source remains unchanged. A failed run removes the prior
default receipt before building, so it cannot leave an earlier receipt looking
like the result of that run.

The native test stage writes
`.dev/native-images/<revision>-<architecture>.qualified.json`. It records the
digest of the complete build receipt and explicitly names only the existing Files,
Obsidian, FreshRSS and n8n scopes. It is removed before those gates start. A missing,
stale or differently scoped qualification blocks publication before any registry
operation.

## Local handoff commands

Run these commands only on the native architecture named by `ARCH`. They build
real images and the last command writes to the configured registry.

```sh
export REVISION="$(git rev-parse --verify HEAD^{commit})"
export ARCH=amd64
export REGISTRY=ghcr.io/jacob-stokes

./scripts/build-native-images.sh
./scripts/test-native-images.sh
./scripts/publish-native-images.sh
```

Obsidian's five `scholarserver-packaging-review` aliases are still created by the
build stage because its native harness consumes them. These aliases are local
review inputs; they are not published tags.

Before each native push, the publish script verifies that the target tag still
points to the receipt image locally and recreates it from the recorded image ID.
If the immutable architecture tag already exists remotely, publication succeeds
only when its image config digest and layer count match the portable identity in
the receipt; otherwise it stops without replacing the tag. The local Docker image
ID and portable config digest are deliberately separate because containerd-backed
Docker can report an OCI-index ID locally. A matching config digest commits the
image architecture and uncompressed RootFS diff IDs recorded in the receipt. The
workflow compares the exact platform descriptor digests before reusing an existing
commit-addressed multi-architecture manifest. The `edge` manifests remain the
explicit mutable aliases on `main`.

Docker's tag push does not provide an atomic create-only operation. The script
checks an absent tag before pushing and verifies its config digest afterward, but
a concurrent registry writer can still race between those checks. Registry-side
tag immutability remains the enforcement boundary for that race.

## Evidence limits

The main workflow logs establish source/receipt checks, 19 native builds, image
content scans, Files container checks, and the existing Obsidian, FreshRSS and n8n
gates on each completed architecture. They are not full all-application native
acceptance, package publication, installation, cross-host restore, signed catalog
assembly or live deployment evidence.

`.github/workflows/n8n-candidate.yml` is a separate manual, test-only native n8n
proof. It checks committed source, labels and scans its two local images, then runs
the n8n container test without logging in or publishing. Release publication for
those recipes remains owned by the guarded all-recipe workflow.
