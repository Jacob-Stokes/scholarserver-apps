# n8n local development stack

This stack combines the n8n beta package's exact native backend images with the
current n8n UI source through Vite HMR. Use the repository-level
[local development guide](../../docs/local-development.md) for commands,
boundaries and recovery notes.

`compose.yaml` contains no image digest of its own. The command reads the current
package manifest, checks that its two image references match the package Compose
file and passes those immutable references to Docker Compose. The backend is not
rebuilt when UI source changes.

Only a local `unix:///` Docker endpoint is accepted. Before Compose starts or
stops anything, the command refuses any exact development volume or container
whose Compose project/owner labels do not match this stack.

The Compose project is always `scholarserver-n8n-dev`. Its three named volumes
belong only to this development stack, and every published port binds to loopback.
Before the backends start, a networkless one-shot container gives those volumes
the package-declared UID/GID 1000 ownership and mode 0700; long-running services
remain non-root.
The integration container has no Manager service, Manager route or research-app
grant. The explicit initializer uses the production password-only file queue but
does not make research workflows functional.
