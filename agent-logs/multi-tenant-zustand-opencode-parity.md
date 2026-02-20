## trace

- Started from vertical-slice completion review and compared behavior against OpenCode.
  - Investigated user-reported send failures and second-message stalls.
    - Checked backend logs vs frontend symptoms.
      - Answer: backend prompt loop completed; UI got stuck due missed/unstable stream-state updates.
  - Re-opened OpenCode references for multi-tenant and sync architecture.
    - Traced server directory context + global SSE + per-directory store flow.
      - Answer: tenant key must be `directory` end-to-end (request context, bus emission, client store routing).
  - Refactored Buddy backend to OpenCode-shaped multi-tenant context.
    - Added instance-scoped context/state and directory middleware.
      - Answer: session store and bus subscriptions were singleton; moved to directory-scoped state.
    - Updated tools to resolve paths from active tenant directory.
      - Answer: `read/list` now run against selected project root instead of repo singleton root.
  - Refactored web chat state to Zustand with directory isolation.
    - Added global + per-directory chat store modules and centralized SSE sync.
      - Answer: route-local `useState` was too brittle for multi-project switching and event recovery.
    - Introduced directory-scoped chat route and `/chat` fallback selector.
      - Answer: explicit directory context in URL avoids cross-project confusion and mirrors OpenCode.
  - Addressed ongoing stuck-send behavior with stronger diagnostics + fallback.
    - Added backend bus/SSE event forwarding logs and frontend sync logs.
      - Answer: easier to pinpoint whether failure is publish, stream delivery, or client reducer path.
    - Added post-send resync polling fallback.
      - Answer: UI can recover to idle even if `session.status` event is missed.

## tasks

- Added multi-tenant backend instance context and directory resolution middleware.
- Scoped bus subscriptions/events per directory and preserved global SSE transport.
- Scoped session store per directory to prevent cross-project data bleed.
- Scoped `read/list` tools to active tenant directory with existing safety guards.
- Extended SDK client factory to support `directory` via `x-buddy-directory`.
- Replaced chat route-local state with Zustand-based multi-directory store modules.
- Added centralized SSE sync manager with reconnect + event coalescing.
- Added directory token encode/decode utilities and directory-scoped chat route.
- Added backend multi-tenant tests and web reducer tests.
- Added SSE timeout/heartbeat adjustments and then deeper diagnostics when issue persisted.
- Added post-send resync fallback to prevent permanent gray “Send” state.
- Ran typecheck, test, and build checks successfully after changes.

## decisions

- Follow OpenCode parity as default for tenant scoping, event flow, and store architecture.
- Use `directory` as tenant identity; support query/header transport with compatibility header support.
- Keep single global SSE endpoint and route events by `directory` in client store.
- Keep prototype-level tests focused on routing/isolation/reducer correctness rather than full E2E.
- Add a client fallback resync path after prompt submission to harden against transient SSE drops.
