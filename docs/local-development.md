# Local application development

## Desktop clients for sync testing

The Mac also has isolated real Obsidian and Zotero desktop clients. They do not
mount or modify the native macOS profiles. See [desktop testing](desktop-testing.md)
for local URLs, persistent volume ownership and start/stop commands. These clients
are separate from the synthetic Manager preview and n8n development backends below.

## n8n: source UI with pinned native backends

The n8n development command runs the current UI source with Vite HMR while the
native n8n and integration backends remain the immutable images selected by the
current n8n package. The page displays both the UI source revision and shortened
backend digests. The revision is labelled as the Vite startup baseline; later
working-tree edits use HMR without pretending a later commit was the baseline.
A UI source edit does not rebuild either image.

Prerequisites:

- Use Node.js 22 or later and install the repository's locked npm dependencies.
- Start Docker yourself before `start`. The command checks the daemon but never
  starts Docker Desktop.
- Use a local `unix:///` Docker socket. SSH and TCP Docker endpoints are refused,
  including a retained remote Docker context.
- Keep the package-selected native images on the machine. The command neither
  pulls nor builds a missing image and refuses an architecture mismatch.

Use the root npm command:

```sh
npm run dev:n8n -- start
npm run dev:n8n -- initialize
npm run dev:n8n -- status
npm run dev:n8n -- stop
```

`start` uses the fixed Compose project `scholarserver-n8n-dev` and starts the HMR
process in the background. Open these loopback-only addresses:

- `http://127.0.0.1:18320` — current source UI with HMR and the development
  identity label.
- `http://127.0.0.1:18321` — pinned integration backend and its packaged UI.
- `http://127.0.0.1:18322` — pinned native n8n editor with normal n8n sign-in.

Before adopting an existing exact-named container or volume, every command checks
its Compose project and service/volume labels. `status` reports each backend's
configured image reference and local image ID, and marks a mismatch if the source
package selection changed after the containers started.

The first start deliberately does not create an n8n owner. Run `initialize` once
for a fresh development volume. It generates a development-only password, stores
it in `.dev/n8n/owner-password` with mode 0600, and submits the existing beta.6
password-only setup action through the integration container's request/response
file queue. It never sends the password in a process argument or prints it. On
macOS, copy it without displaying it when native-editor sign-in is needed:

```sh
pbcopy < .dev/n8n/owner-password
```

The initializer reuses that password after an interrupted attempt and sends no
new request when the saved connection is already ready. Its response wait is
bounded by the package action timeout. A timeout is reported as unconfirmed;
check `status` before deciding whether to initialize again.

Beta.6 requires a Manager service identity in the same setup action. Local
development supplies a random, development-only value with the required shape,
but Compose provides no Manager service, route or network alias. It grants no
application actions. Research applications therefore remain unavailable; this
stack must not be described as real research-workflow or Manager acceptance.

The named volumes contain only this stack's n8n state, reproducible cache and
integration runtime. A networkless one-shot container sets their package-declared
UID/GID 1000 ownership and mode 0700 before the non-root backends start. No host
folder or personal library is mounted. `stop` stops the HMR process and containers
but preserves those volumes and the generated password. There is intentionally no
reset command. Inspect `.dev/n8n/vite.log` if the source UI does not start.

This workflow proves local UI/backend integration only. It does not qualify image
contents, native release architectures, package publication, a signed Manager
installation, private editor routing, backup/restore or live research grants.

### Explicit local integration candidates

Template and bridge changes require rebuilding the integration image; HMR alone
only updates the UI. To test unpublished backend source, build a native local
image from a committed revision with `org.opencontainers.image.revision` and
`com.scholarserver.source-digest` labels. Obtain the digest with
`node scripts/native-image-receipt.mjs fingerprint --inventory scripts/image-source-inventory.json --recipe n8n-app`.
Select its exact local `sha256:` image ID explicitly:

```sh
N8N_CANDIDATE_IMAGE=sha256:YOUR_LOCAL_IMAGE_ID npm run dev:n8n -- use-candidate
npm run dev:n8n -- status
```

Selection checks the native architecture, source fingerprint and existing Compose
ownership before starting. The UI identifies this backend as a local candidate,
not a published package. Start, initialize and status reject a candidate whose
runtime inputs have since changed. Rebuild and reselect after such changes.
The package's n8n runtime stays pinned, and state volumes are preserved.

`npm run dev:n8n -- use-package` explicitly restores the package-selected backend.
Neither command updates package manifests, accepted image-source locks or core
pins. Candidate selection is private local state in `.dev/n8n/candidate.json`.
