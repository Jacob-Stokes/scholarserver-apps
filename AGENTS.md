# Contributor guide

## Scope

This repository contains first-party ScholarServer application packages. Keep each
application independently buildable and avoid application-specific behavior in the
ScholarServer core.

## Required checks

- Run `npm test` before committing.
- Build only for the native host architecture locally.
- Never add QEMU, Rosetta, or another emulation path to release workflows.
- Never commit credentials, enrollment requests, generated service tokens, or vault data.
- Images referenced by released package manifests must use immutable SHA-256 digests.

## Package contract

- Compose templates may use only placeholders declared by the ScholarServer schema.
- Persistent paths must be declared in the package manifest.
- One-time credentials must use declared onboarding actions and must never appear in
  Compose environment variables or command-line output.
- Every long-running service must provide a non-shell health check.
