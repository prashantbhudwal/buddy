# OpenCore Pairity Context

This file captures the intent behind this folder so future agents understand why it exists.

## Original Intent

The goal was not to fully fork OpenCode.

The goal was to:

1. Keep absorbing OpenCode improvements in core agent/tool/runtime behavior.
2. Avoid full-fork maintenance burden and constant broad merge conflicts.
3. Preserve Buddy's product direction (learning-first behavior and React web app) without forcing 1:1 product parity.
4. Use a small, explicit parity surface with repeatable scripts and logs.

## Product Context

Buddy is "OpenCode-inspired" but not "OpenCode-clone":

- Buddy keeps OpenCode-aligned core infra where it matters.
- Buddy intentionally diverges in learning-specific product behavior.
- This folder exists to prevent accidental drift in core infra while preserving intentional divergence.

## Risks Future Agents Must Watch

1. Drift risk:
   - OpenCode core evolves quickly; Buddy parity files become stale.
   - Mitigation: run parity scripts on cadence and before major core changes.

2. Scope creep risk:
   - Accidentally pulling product-specific OpenCode behavior into Buddy parity core.
   - Mitigation: classify every change as parity-core vs buddy-product.

3. Mapping rot risk:
   - New parity-relevant files added in Buddy but not added to `pairs.tsv`.
   - Mitigation: treat `pairs.tsv` updates as mandatory when adding parity-core features.

4. False parity confidence risk:
   - File-level similarity does not guarantee behavior parity due stack/product differences.
   - Mitigation: validate behavior with tests and runtime checks, not only diffs.

5. Process bypass risk:
   - Engineers skip scripts/logging and parity contract becomes unenforced.
   - Mitigation: no parity task is done without `sync-log.md` entry.

6. Path/environment risk:
   - Local OpenCode path assumptions fail (`~/code/opencode` vs `~/Code/opencode`).
   - Mitigation: use `--opencode-dir` or set `OPENCODE_DIR` explicitly in CI/local runs.

## Decision Rule

When in doubt:

- If change affects tool execution semantics, agent loop semantics, permission semantics, or context/runtime plumbing, treat as parity-core.
- If change affects learning UX, notebook workflow, curriculum/memory domain behavior, or React presentation, treat as buddy-product.
