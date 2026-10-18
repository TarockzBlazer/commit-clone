# Plan: Disable the `lsp` MCP server reversibly

- intent: clear
- review_required: false
- status: approved (user chose the reversible-disable option; "nenhuma opção altera arquivos até você confirmar" → confirmed)
- created_by: Prometheus (planner)
- execution: separate worker session (`/ulw-execute`) — planner never implements

## Context

OpenCode's MCP panel shows the `lsp` server as **failed**. Root cause (confirmed by
reading the live plugin + daemon sources):

- The plugin `oh-my-openagent` builds a builtin `lsp` MCP from `createLspMcpConfig`,
  gated only by `if (!disabledMcps.includes("lsp")) mcps.lsp = createLspMcpConfig(...)`.
- The `lsp` daemon boots, then self-exits at a **10 000 ms startup watchdog**
  (`DEFAULT_STARTUP_TIMEOUT_MS = 1e4` in `packages/lsp-daemon/dist/cli.js`) because it
  never receives `initialize` in time. OpenCode then marks the server `failed` and does
  **not** retry (`lsp-core/src/mcp.ts` comment ~74–77: "marks it failed without retry").
- Observed in `~/.local/share/opencode/log/opencode.log`: `booting location services`
  23:58:24.429 → `server unavailable key=lsp` 23:58:36.660 (~12.2 s).

A full fix (making the daemon win the race) is out of scope. The user approved the
**reversible mitigation**: disable the `lsp` MCP through global config — the same
mechanism the plugin itself honors (`captureUserDisabledMcps` / `isDisabledMcpEntry`
treat a user entry with `enabled === false` as a disable; `applyMcpConfig` then forces
`{ ...merged["lsp"], enabled: false }`).

## Affected user & ideal state

- **Affected user:** the OpenCode operator (this user) consuming the running app.
- **Today:** the MCP panel shows `lsp` as `failed`; the status is noise and the server
  is unusable anyway.
- **Ideal state (after change):**
  - The `lsp` server no longer appears as `failed` after restart.
  - The change is trivially reversible: deleting one JSON subtree restores prior behavior.
  - No other MCP server, provider, or plugin behavior changes.
- **One-line note:** the deeper "make the daemon actually work" outcome is larger than
  the literal request; it is intentionally deferred (see Must-NOT-Have).

## Gap list (today → ideal)

1. `~/.config/opencode/opencode.json` has no `mcp` key → add a minimal `mcp.lsp.enabled=false`.
2. Running OpenCode has not reloaded config → user must restart after the edit.
3. No record of how to re-enable → the plan documents rollback (remove the key).

## Todos

- [ ] 1. Add `"mcp": { "lsp": { "enabled": false } }` to `~/.config/opencode/opencode.json`
  - **File:** `/home/tarockz/.config/opencode/opencode.json` (347 lines; currently has NO `mcp` key).
  - **Exact edit:** insert a top-level `mcp` object between the `plugins` array's closing
    `],` (line 19) and the `provider` key (line 20). The insertion text is exactly:

    ```json
      ],
      "mcp": {
        "lsp": {
          "enabled": false
        }
      },
      "provider": {
    ```

    (i.e. change the existing `  ],\n  "provider": {` into the block above.)
  - **Why this shape:** OpenCode documents `{ "<name>": { "enabled": false } }` as the
    disable form for an inherited server; the plugin's own `captureUserDisabledMcps`
    requires exactly `typeof value === "object" && value.enabled === false`.
  - **Do NOT** add a `type`/`command` — do not try to reconstruct the runtime-resolved
    daemon command; the boolean-disable is the intended, safe form.
  - **Must NOT have (guardrail):**
    - Do NOT touch any other key (`$schema`, `model`, `plugins`, `provider`, or the model
      catalog under `provider.freellmapi.models`).
    - Do NOT disable OpenCode's native LSP subsystem via the top-level `"lsp": false`
      (that is a different feature — the language-server tooling — not this MCP server).
    - Do NOT edit any plugin distribution file inside `~/.cache/opencode/` or `~/.opencode/`.
    - Do NOT attempt to fix the daemon startup race in this plan.
  - **Acceptance:** after the edit, `opencode.json` is valid JSON and contains exactly one
    top-level `mcp` key whose `lsp.enabled === false`.
  - **Agent-executed QA (happy + failure):**
    - Happy: re-read the file; parse/validate JSON; assert `mcp.lsp.enabled === false`.
    - Failure: assert no duplicate `mcp` key exists and no other key changed versus the
      pre-edit content (diff limited to the inserted block).
  - **Evidence path:** save the re-read config and the verification result under
    `.omo/evidence/disable-lsp-mcp/`.
  - **Rollback:** delete the inserted `mcp` object (restore `  ],\n  "provider": {`).
  - **Recommended task executor category:** quick

- [ ] 2. Instruct the operator to restart OpenCode and confirm the `failed` state is gone
  - **Action:** after Todo 1 lands, tell the user to quit and fully restart OpenCode.
    Config is loaded once at startup and is not hot-reloaded.
  - **Acceptance:** on the next start, the `lsp` MCP is not listed as `failed`
    (it should be absent/disabled). Re-enable path = remove the `mcp.lsp` key and restart.
  - **Agent-executed QA:** N/A — this step is a user-visible confirmation; record the
    instruction and the expected observation in the evidence folder.
  - **Recommended task executor category:** quick

## Final verification wave

- [ ] F1. Confirm the change is complete, valid, and reversible
  - Re-read `~/.config/opencode/opencode.json`; assert: parseable JSON, `$schema`
    intact, exactly one `mcp` key, `mcp.lsp.enabled === false`, and every pre-existing
    key unchanged. Confirm the rollback instruction (remove the `mcp` object) is recorded.
  - Evidence: `.omo/evidence/disable-lsp-mcp/final-verification.md`.

## Commit

- Single config change; if versioned, commit message:
  `chore(opencode): disable lsp MCP via global config (reversible)`.
  `~/.config/opencode/` may be outside any repo — if so, no commit; change is local config.
