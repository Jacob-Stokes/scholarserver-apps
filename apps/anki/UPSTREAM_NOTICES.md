# Upstream assessment — 7 September 2026

No third-party application binaries or AnkiConnect source are redistributed by
this draft. Revisions and artifact hashes are recorded in `upstream-lock.json`.

- [Anki 26.08.1](https://github.com/ankitects/anki/releases/tag/26.08.1), commit
  `39e4b0b48c5bb22e9c22ad87c64ff14e6a24dc20`: AGPL-3.0-or-later with
  BSD-contributed portions and separately licensed dependencies. Read the exact
  [licence inventory](https://github.com/ankitects/anki/blob/26.08.1/LICENSE).
  A future redistributed image needs corresponding source and dependency notices;
  the repository's own licence is not the whole binary distribution's licence.
- [Official sync documentation](https://docs.ankiweb.net/sync-server.html) describes
  minimal Python/Rust server implementations and a user-contributed Dockerfile.
  It does not promise an official headless card-editing desktop. Prefer the official
  sync implementation; client/server protocol compatibility requires testing.
- [AnkiConnect](https://git.sr.ht/~foosoft/anki-connect), revision
  `de6e6e1b8aaf4ae195eb1d1ff6db5409b99b2a3e`: GPL-3.0-or-later, copyright
  Alex Yatskov. Current source and API documentation were read locally. The
  [GitHub repository](https://github.com/FooSoft/anki-connect) is archived and
  redirects to SourceHut; a mutable GitHub master ZIP is not an update strategy.
  The installed add-on needs a reviewed revision and SHA-256 verification before
  activation. The source revision here is not proof it works with Anki 26.08.1.
- [chrislongros desktop candidate](https://github.com/chrislongros/anki-desktop-docker)
  at `5b802912b5cdd6da13b09d43d0bc21ded168c99a`: MIT wrapper, with upstream
  Anki and KasmVNC obligations retained. Maintainer advertises AMD64/ARM64; not
  independently verified. Its startup launcher downloads application code and the
  documented deployment relaxes seccomp. Do not approve it merely by pinning its
  outer image: runtime integrity and hardening are unresolved. No image selected.
- [Anki community desktop](https://github.com/ankicommunity/docker-anki-desktop)
  is another KasmVNC assembly, with documented Anki 25.02.7 and build-it-yourself
  instructions. A maintained, fixed-runtime multi-architecture artifact was not
  established. Do not copy its wildcard CORS or periodic cleanup/sync suggestions.
- Existing Resolution MCP (`ghcr.io/jacob-stokes/mcps/anki-mcp`) is already an
  AnkiConnect client. Source checkout inspected at
  `f5bdd17c37ff63f008dffb1f5f2b94fc4f8a92cf`; source-to-running-image identity
  is unverified. No root LICENSE was present in that checkout. No source was copied.
  This draft uses the apps repository's existing shared MCP transport and a small,
  independently written API adapter. Before redistributing the existing MCP itself,
  establish its licence and source/image provenance. Its raw API errors, unrestricted
  sync, environment secrets and missing request bounds are reasons not to reuse
  its deployment unchanged, not reasons to replace AnkiConnect.

AnkiWeb is an external account service; it is not a self-hosted web frontend.
AnkiMobile and AnkiDroid are separate clients with their own distribution terms.
No app-store binaries, accounts or paid services were obtained for this draft.
No legal clearance or complete image-layer licence audit is claimed.
