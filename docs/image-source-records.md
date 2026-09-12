# Image source records

`scripts/image-source-inventory.json` explicitly lists every first-party Dockerfile,
its native architectures, package service and source inputs. Changes to runtime
files, UI source, shared dependencies, lockfiles, file execute bits or Dockerfiles
change its SHA-256 fingerprint. Generated bundles and local caches are excluded.
When adding a Dockerfile or imported source, review its input list too. The fixed
inventory is deliberately not a general Dockerfile dependency resolver.

Run `npm ci`, then `node scripts/check-image-source.mjs` to check the inventory.
The build script includes n8n and Logseq, labels new images with their source
revision/fingerprint, and checks image contents before pushing. It builds only
the host's native architecture. Hosted builds remain manual; this does not enable
paid GitHub Actions or publish a package automatically.

After both native images and the exact package configuration have been qualified,
record each immutable reference in `catalog/image-source-lock.json`:

```json
{
  "format": 1,
  "records": [{
    "recipe": "files",
    "reference": "ghcr.io/jacob-stokes/scholarserver-files@sha256:<digest>",
    "sourceDigest": "sha256:<source fingerprint>",
    "nativeArchitectures": ["amd64", "arm64"]
  }]
}
```

Validate using `node scripts/check-image-source.mjs --lock catalog/image-source-lock.json`.
Every selected Compose reference must agree with the package manifest and record;
missing, stale or incomplete records fail. Core release assembly invokes this
check before copying any packages. An exported apps tree can use the invoking
core checkout's locked YAML dependency; run assembly from that tooling checkout.

Keep native image IDs, source revisions and acceptance evidence in the release
report. Do not manufacture records from existing digest pins or git's first
appearance of a digest. The lock is an audited source record, not a cryptographic
build attestation. It does not prove live deployment, account integration, restore
or upstream redistribution clearance. Published package versions remain immutable.
