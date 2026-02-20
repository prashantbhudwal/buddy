## trace

- Continued from vertical-slice parity work after review feedback about OpenCode mismatch.
  - Fixed backend security/isolation regressions first.
    - Added directory root allowlist/containment checks.
      - Answer: 403 "Directory is outside allowed roots" is expected when requested project path is not in allowed roots.
    - Scoped SSE forwarding by directory/session context.
      - Answer: global SSE now avoids cross-tenant event leakage.
    - Removed stale `/items` nav path.
      - Answer: eliminated direct 404 regression from root navigation.
  - Investigated repeated 403 failures while running from sibling repo.
    - Compared requested `directory` with backend root restrictions.
      - Answer: frontend/backend were healthy; request path violated allowed-root policy.
    - Adjusted local-run flow to use allowed roots / proper directory selection behavior.
      - Answer: requests succeeded after aligning runtime project directory with configured roots.
  - Ported frontend patterns closer to OpenCode instead of custom UI inventions.
    - Reworked markdown presentation after OpenCode reference check.
      - Answer: parity improved via dedicated markdown styling/structure.
    - Reworked project/session/sidebar flow with OpenCode-inspired structure.
      - Answer: project list + workspace/session panel behavior became closer, including basename display.
    - Implemented native directory picker bridge behavior.
      - Answer: uses desktop bridge first (`__TAURI__` / `electronAPI`), prompt fallback only when bridge is unavailable.
    - Fixed stale busy indicator by deriving status from message updates/parts/deltas.
      - Answer: chat item status now transitions idle/busy more reliably.
  - Fixed frontend breakage from import resolution.
    - Investigated Vite failures for `@/lib/chat-input` and `@/lib/directory-picker`.
      - Answer: `@/lib/*` in web can resolve to UI via Vite alias rule order.
    - Switched web-only imports to relative paths.
      - Answer: typecheck/build passed and Vite resolution errors cleared.
  - Addressed parity feedback on prompt dock and sidebar toggles.
    - Replaced custom tall composer with OpenCode-like compact two-layer dock.
      - Answer: send/stop moved inside input; controls moved to bottom tray.
    - Removed extra custom arrow pattern; used layout-style sidebar toggle.
      - Answer: interaction model aligned better with OpenCode expectations.

## tasks

- Fixed directory root validation and containment enforcement path for session/event APIs.
- Scoped SSE event delivery to subscriber directory/session context.
- Removed stale `/items` navigation route usage.
- Implemented/adjusted desktop-native directory picker integration with browser fallback.
- Brought markdown rendering visuals closer to OpenCode.
- Refined sidebar/workspace/session UI patterns and project label display.
- Reworked prompt composer into OpenCode-like dock structure.
- Fixed session busy/idle indicator drift in store reducers.
- Resolved Vite alias import failures by switching web-local imports to relative paths.
- Ran web `typecheck`, `test`, and `build` after parity/import/store changes.

## decisions

- Treat OpenCode files as the source of truth for UI interaction patterns; avoid bespoke alternatives during parity phase.
- Keep strict backend directory-root protections even when testing from sibling repos; fix local-run configuration/workflow instead of weakening checks.
- For `packages/web`, prefer relative imports for app-local `lib/*` modules when alias collisions with UI workspace are possible.
