## trace

- Build a basic Buddy agent vertical slice with Kimi provider (`k2p5`), OpenCode-shaped architecture, and simple chat UI.
  - Establish implementation strategy from OpenCode references instead of greenfield implementation.
    - Answer: mirror OpenCode route names, bus/event payload shape, session/message model, and loop control style.
  - Implement backend foundations.
    - Added `/api` route structure, SSE stream endpoint, session endpoints, in-memory session/message store, MessageV2 parts/events, ULID IDs.
  - Implement initial agent loop + tools.
    - Added Kimi provider wiring and `read`/`list` tools with repo scoping and `.env*` blocking.
    - First version worked for single pass but did not reliably continue multi-step tool loops.
  - Implement frontend chat vertical slice.
    - Added `/chat` route, SSE consumption, local session persistence, abort support, reasoning/tool rendering.
  - Debug runtime failures.
    - Found SDK base URL mismatch causing 404s; fixed client construction to use `/api`.
    - Added better UI error formatting and SSE reconnect/resync handling.
  - Add observability for diagnosis.
    - Added structured logs across session routes, prompt lifecycle, processor step events, SSE connect/abort.
  - Close UX quirks for slice completion.
    - Added Enter-to-send (with Shift+Enter multiline support).
    - Replaced markdown pipeline with OpenCode-style parser setup (marked + katex + shiki + sanitization/link policy).
  - Add minimal test wiring.
    - Added Bun tests for web composer behavior + markdown parser and backend session store behavior.
  - Correct the core loop behavior to true OpenCode-style control.
    - Answer: implemented manual multi-step processor loop (not AI SDK `maxSteps`), continuing after tool activity until terminal response or max-step guard.

## tasks

- Implemented backend `/api` routes for health, SSE events, session create/get/messages/prompt/abort.
- Implemented bus event system and OpenCode-ish SSE payload envelope.
- Implemented in-memory session/message/part store and MessageV2 schemas/events.
- Implemented Kimi provider integration and system prompt loading from prompt files.
- Implemented `read` and `list` tools with path validation, scope limits, and secret-file denial.
- Implemented async prompt flow with assistant scaffold + background processing + abort support.
- Implemented `/chat` UI with streaming updates, reasoning/tool collapse, stop button, and session persistence.
- Fixed SDK generation/client path issues and `/api` alignment.
- Added runtime logging and defensive error handling for session loop and SSE.
- Added Enter-to-send behavior while preserving multiline input UX.
- Reworked markdown renderer to follow OpenCode parser approach.
- Added Bun test scripts at package/root level and added initial backend/web tests.
- Reworked processor into a real multi-step loop with configurable max step guard (`SESSION_MAX_STEPS`) and final-step tool-disable prompt.

## decisions

- Use OpenCode patterns as the default reference architecture for Buddy implementation choices.
- Keep storage in-memory for this slice; persistency deferred.
- Control loop progression manually in processor logic instead of relying on AI SDK `maxSteps`.
- Set default step guard to 8, configurable via `SESSION_MAX_STEPS`, with a hard cap for runaway prevention.
- Use OpenCode-style markdown parsing stack (marked + marked-katex-extension + marked-shiki + DOMPurify policy).
