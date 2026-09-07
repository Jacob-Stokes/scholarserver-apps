# Package contract plan — not a schema-valid package

Package ID candidate: org.scholarserver.paperless. No version or support promise.
The compose topology is intentionally unusable and must not enter `package/`.

Endpoints planned: app-ui (platform-session); documents (native Paperless login
behind generic Access); mcp (service-identity, namespace paperless, credential
runtime/service-token). Native path-prefix/cookie handling is NOT verified; no
public route is ready. UI is independently buildable but not yet served by the
integration process. No custom core fields are proposed.

Persistent bindings: database (Postgres-owned), data/media (Paperless-owned),
consume (pending intake), export (portable export), broker (queued work), runtime
(restricted token and future job journal). Preserve on removal. Secrets require
private files, excluded from logs and API output, included in encrypted recovery.
Consistent backup must quiesce consumers and database writers or use supported
database backup, with matching media/intake and queue state. Raw live volume
copying is not a verified backup strategy. Storage UID/GID and filesystem rules
depend on selected images and remain unresolved. No generic remote-FUSE DB.

All long-running services require non-shell health checks and verified native
startup/hardening before a real manifest can be written. No setup action is
declared until secure first-account/token provisioning is implemented.
