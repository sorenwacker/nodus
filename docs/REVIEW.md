# Codebase review 260911

Full-codebase review of nodus v1.6.0-rc.6 (commit 3f579e1). One reviewer agent per module group read every source file under `src/`, `src-tauri/src/` and `packages/nodus-mcp-server/src/`; every high and medium finding was then handed to an independent verifier instructed to refute it from the code. Only findings the verifier confirmed appear in the main sections. Low-severity findings were not verified and are listed in the appendix. Test files were out of scope except to check coverage of reviewed behaviour.

Files reviewed: 369. This report supersedes the review of 260718 (last updated 260828, available as `git show 464cd5b:docs/REVIEW.md`); findings from that review that were still open and still present were re-raised here, and its per-finding status lines were not carried over.

## Baseline gates

These are the checks CI and the pre-commit hook run. All passed on the reviewed commit.

| Gate | Command | Result |
|---|---|---|
| Frontend lint | `npm run lint` (eslint) | pass |
| Frontend types | `npm run typecheck` (vue-tsc) | pass |
| Frontend tests | `vitest run` | pass, 162 files, 1297 tests |
| Rust format | `cargo fmt --check` | pass |
| Rust lint | `cargo clippy --all-targets -- -D warnings` | pass |
| Rust tests | `cargo test` | pass |
| MCP server build | `tsc` in `packages/nodus-mcp-server` | pass |
| MCP server tests | `vitest run` in `packages/nodus-mcp-server` | no test files exist |
| File size ratchet | `src/__tests__/file-size-limit.test.ts` | pass; scans `src/` and `src-tauri/src/` only |
| Unused exports | `src/__tests__/unused-exports.test.ts` | pass; matches top-level `export function/const/class` in `src/` only |
| Tool surface parity | `src/__tests__/tool-surface-parity.test.ts` | pass; compares MCP tools with in-app agent tools |
| Duplicate implementations | `src/__tests__/duplicate-implementations.test.ts` | pass; identical bodies or one exported name with two bodies, TypeScript only |

Four files over the 1000-line limit are recorded in the ratchet and may only shrink: `src/canvas/GraphCanvas.vue` (2481), `src/App.vue` (1273), `src/lib/templates.ts` (1246), `src/components/StorylineReader.vue` (1214). `packages/nodus-mcp-server/src/tools.ts` (1046) is over the limit and ungated, because the ratchet does not scan `packages/`. The MCP server package has no tests of its own. The root suite type-checks `tools.ts`, which the tool-surface parity test imports, but CI never builds the package, so `index.ts` and `websocket-client.ts` are type-checked nowhere.

The gates pass, and the review still confirmed 42 dead-code findings and 8 forked rules. Those findings sit in the gates' blind spots: members returned from Pinia stores and composables, unreachable switch cases, unused parameters, Rust items marked `allow(dead_code)`, Tauri commands registered but never invoked, and copies that differ in name or language.

## Summary

| Status | Count |
|---|---|
| Raw findings | 457 |
| Confirmed by verifier | 160 |
| Confirmed, after merging duplicate reports of one location | 157 |
| Refuted by verifier | 7 |
| Low severity, not verified | 290 |
| Verifier did not complete | 0 |

Confirmed findings by severity (severity as corrected by the verifier):

| Severity | Count |
|---|---|
| high | 9 |
| medium | 67 |
| low | 81 |

Confirmed findings by category:

| Category | Count |
|---|---|
| correctness | 79 |
| dead-code | 41 |
| consistency | 23 |
| design | 11 |
| naming | 3 |

Files with the most confirmed findings:

| File | Confirmed findings |
|---|---|
| `src-tauri/src/commands/vault_watcher.rs` | 6 |
| `src/canvas/composables/edges/useEdgeRouting.ts` | 4 |
| `src/App.vue` | 4 |
| `src/composables/useImport.ts` | 3 |
| `src-tauri/src/commands/nodes.rs` | 3 |
| `src/canvas/GraphCanvas.vue` | 3 |
| `src/canvas/composables/agent/useAgentRunner.ts` | 3 |
| `src/canvas/composables/rendering/useContentRenderer.ts` | 3 |
| `src/components/PlanApprovalModal.vue` | 3 |
| `src/composables/useZotero.ts` | 3 |
| `src/stores/nodes/crud.ts` | 3 |
| `src-tauri/src/database/models.rs` | 2 |

## Remediation plan

Every confirmed finding below carries a phase label. Phases are ordered by harm: first the writes that lose, misplace or fake user data, then correctness of features, then dead code and structure. A later phase never blocks an earlier one.

| Phase | Scope | High | Medium | Low | Total |
|---|---|---|---|---|---|
| P0 | Review housekeeping and gate scope | 0 | 0 | 0 | 0 |
| P1 | Writes that lose, misplace or fake user data; security | 3 | 11 | 7 | 21 |
| P2 | Vault sync and file locking | 1 | 10 | 8 | 19 |
| P3 | Agent run isolation and LLM tools | 2 | 13 | 11 | 26 |
| P4 | MCP workspace scoping | 0 | 6 | 1 | 7 |
| P5 | Import, export and rendering | 2 | 10 | 5 | 17 |
| P6 | Canvas layout, edges and routing | 1 | 8 | 6 | 15 |
| P7 | Storyline reader | 0 | 4 | 3 | 7 |
| P8 | UI, i18n and lifecycle | 0 | 5 | 9 | 14 |
| P9 | Dead code and forks, with gate extensions | 0 | 0 | 28 | 28 |
| P10 | Split the files over the size limit | 0 | 0 | 3 | 3 |

The 290 unverified low-severity notes in Appendix A are not scheduled. When a phase touches a file, read that file's notes and confirm each one on the current code before acting on it.

### How each fix is made

1. Confirm the finding still holds on the current main with `git log -S` and a re-read; close it with evidence if it is already fixed.
2. Write the intended behaviour into the matching section of `PRODUCT_DESIGN.md`. Doc changes are batched per phase and confirmed by the owner before any test is written.
3. Write a test that fails on the unfixed code, and record that it failed.
4. Fix, then run the full suite: vitest, typecheck, lint, `cargo test`, and `cargo clippy --all-targets -- -D warnings`.
5. Commit fix and test together, and the docs separately, then push to main. Large refactors go on a branch with a draft pull request.
6. Add a `**Status:**` line under the finding in this file, naming the commit and the gate.

Work one finding, or one tightly coupled cluster, at a time. A rule that a fix establishes gets a gate in the same change.

### P0: review housekeeping and gate scope

This phase changes no behaviour.

- Commit this report. Remove the stale review of 260613 at `docs/content/REVIEW.md` and its built page under `docs/public/REVIEW/`. The docs site still publishes it, and it contradicts this one.
- Extend the file-size ratchet to `packages/nodus-mcp-server/src`, recording `tools.ts` at 1046 lines.
- Lower the ratchet's recorded sizes for `App.vue` and `templates.ts` to their current lengths. As recorded, both can grow back by 19 and 8 lines without failing.
- Add a CI job that installs the MCP server package's dependencies and builds it with `tsc`. The root suite already type-checks `tools.ts` through the parity test, but `index.ts` and `websocket-client.ts` are type-checked nowhere. The package gets a test runner in P4, with its first test of the websocket client.

### P1: writes that lose, misplace or fake user data, and security

Work in this order.

1. **Canvas save path** (`useCanvasEventHandlers.ts`). Every canvas save writes the body without its frontmatter and leaves the editing guard set, so the watcher ignores external changes to that node for the rest of the session. That matches the symptom of the 260908 data-loss report. Before fixing, rerun the vault and database divergence comparison from 260908 to measure what this path has already caused.
2. **Refresh re-layout** (`useImport.ts`). Every refresh overwrites the manual position of every node inside a folder frame.
3. **Preview panel state** (`CanvasPreviewPanel.vue`). An open date or tag editor survives a node switch and can write node A's values into node B.
4. **Store writes that pretend to succeed.** Failed create calls fabricate a local node or edge, a failed delete removes the node from view anyway, wikilink removal on edge delete bypasses undo and the checksum, and storyline removal changes chain edges before the backend confirms. One policy covers all of them: the backend confirms before local state changes, and a failure notifies the user. Gate it with a test that rejects each store write's IPC call and asserts unchanged state plus a notification.
5. **Writes to the wrong target.** Tag nodes are reused across workspaces, single-node reader mode writes to a fake storyline, panel comments drop their type header, and re-imported PDF highlights duplicate.
6. **Workspace metadata.** The backend never receives `vault_path` because the frontend sends camelCase, recovery drops `vault_path` and `sync_enabled`, and the description field is never saved.
7. **Storyline removal after reorder** (`models.rs`). Wrap it in a transaction and close the gap through negative values. The live database has no gaps in any of its 33 storylines, so no repair migration is needed.
8. **Security.** Outbound URL validation misses IPv4-mapped IPv6 literals and never resolves hostnames, and `update_node_file_path` stores a path from the webview without validation.

### P2: vault sync and file locking

Rerun the 260908 divergence comparison before starting.

- **One exclusion rule.** `should_exclude_file` exists twice with different rules. The watcher tests the hidden-entry rule against the absolute path, so a vault under a dot-directory receives no events. The sync passes prune a dotted vault root and ignore symlinks. The rule must be evaluated relative to the vault root. No current workspace has a dot-directory in its vault path, which was checked against the live database on 260911. Following symlinks does change what existing vaults see, so measure which files each vault would newly include before shipping.
- **Sync correctness.** Nodes are marked synced after a failed sync, and linking stores a checksum without loading content, so the following refresh skips the node. One unreadable file aborts the whole import, the move branch of the file watcher has an unguarded IPC call, and a sibling folder sharing the vault path prefix is treated as inside the vault.
- **One wikilink resolver.** Import, canvas navigation and the shared helper resolve wikilinks three different ways.
- **File locking.** The edit-lock composable is unreachable, so canvas edits take no exclusive lock, contrary to the architecture rule. The recommended fix is to wire it into the canvas editor and have the storyline reader use the same composable.

### P3: agent run isolation and LLM tools

- **Run isolation.** The selection tools never read the run-start selection snapshot, a superseded node-agent loop keeps writing, the workspace id is captured once, and the text-embedded tool-call path skips checks the native path enforces. The design doc section on what the agent acts on already states the rule.
- **Tool schemas and handlers.** Two batch tool schemas disagree with their handlers, task context renders as `[object Object]`, the knowledge-base "total" is only the last phase, and the execute whitelist names unregistered tools. Gate this with a test that every whitelisted tool is registered and every schema accepts a sample its handler can process.
- **Agent rule.** `promptEnhancer.ts` and `colorHandlers.ts` detect intent with regular expressions on natural language, which the project rules forbid. Replace them with LLM classification.
- **Providers.** The Anthropic provider discards API error text, Ollama reports parse failures as connection failures, the SSE parser only splits on LF and never flushes its tail, and model computeds have no reactive dependency.
- **Dead code in this area.** Unreachable duplicate tool implementations, unused registry and plan-state members, and a third hand-rolled Wikipedia client are removed in this phase because they sit in the files being fixed.

### P4: MCP workspace scoping

- The scoped store leaves frame creation and every storyline operation bound to the workspace open in the app.
- Overlap resolution moves frames without their nodes, and the graph structure result is keyed by title, so duplicate titles overwrite each other.
- The server client neither discards an old socket nor records that a user rejected the connection. These are the package's first tests, so this phase adds its test runner and runs it in the CI job from P0.
- Three routes are handled but exposed by no tool. The existing parity test compares the MCP tools with the in-app agent's tools, not with the routes the app handles. Extend it with a route ledger, so every handled route is either exposed as a tool or recorded as internal with a reason.
- Open issue #56, about setup instructions that reference an unpublished npm package, is in the same area and can be handled alongside this phase.

### P5: import, export and rendering

- PDF graph import hangs when a deeper heading follows the References section.
- Typst export leaves `#`, URLs and `@` unescaped, so compilation fails or drops text.
- The OKF description still carries frontmatter, streaming requests time out at the connect timeout, the markdown cache ignores wikilink existence, the mermaid queue replays into the wrong container, and a failed citation lookup blocks its queue.
- The tag and date editor exists in both the node card and the preview panel and has diverged. Do this after the P1 preview fix and extract one shared composable.

### P6: canvas layout, edges and routing

- The single-ring radial layout drops nodes.
- Huge graphs run full obstacle routing and discard it.
- The highlight colour parses hex while node colours are rgba, and one edge list ignores the hide-edges settings.
- Obstacle lookup uses a module-level mutable singleton instead of an injected index.
- Child frames are laid out independently of their parent, and nodes with a dangling frame id are excluded from layout.

### P7: storyline reader

- Scroll tracking indexes DOM sections but writes node-array indexes.
- Reference keys drift from DOM wikilink indexes when anchors expand.
- An anchored comment leaves stale HTML, and the storyline node list carries a fork of the node colour map.

### P8: UI, i18n and lifecycle

- Plan approval shortcuts need focus that nothing arranges, and Escape while editing a step closes the whole modal.
- The AI settings tab validates and shows a toast on every open.
- Four components hardcode English next to `t()` calls.
- Several timers, listeners and animation frames are never released on unmount, and two Zotero computeds never update.

### P9: dead code and forks, with gate extensions

Each gate is proven red on the current tree, and the dead code it finds is deleted in the same change.

- **Tauri command parity.** Every command registered in the invoke handler must be invoked from `src/`. This catches the unused create-file, locked-nodes and deleted-nodes commands.
- **No `allow(dead_code)` outside test modules** in `src-tauri/src`.
- **Unused store and composable members.** Extend the unused-exports gate to members returned from `defineStore` and composables. This catches the unused members of the edges, frames, Zotero, entity and undo stores.
- **Unimported barrel files.**
- The remaining forks are the two SVG sanitisers, `truncateText`, the Zotero connection test, and the delete handler in `App.vue`. Each collapses to one library implementation.

### P10: split the files over the size limit

`GraphCanvas.vue` (2481), `App.vue` (1273), `templates.ts` (1246), `StorylineReader.vue` (1214) and the MCP server's `tools.ts` (1046). This phase comes last because P1 to P4 already remove code from most of them. Each split goes on its own branch with a draft pull request. It must preserve behaviour, and the suite must pass with no test changes beyond imports.

### Decisions for the owner

1. **Releases.** The last full release is v1.5.0 of 260905, so a full release before 261005 needs an exception. P1 items 1 and 2 are candidates for the critical-bugfix exception, and P1 item 8 for the security exception. Everything else ships as a release candidate.
2. **Publishing this report.** It can move into `docs/content/` to be published, or stay unpublished at `docs/REVIEW.md`.
3. **File locking in P2.** Wiring the edit-lock composable into the canvas is recommended. The alternative is deleting it and amending the architecture rule.
4. **GitHub issues.** Phases can be mirrored as issues on the backlog. The repository is public, so the issues would be too.

## High severity

### H1. storylines::remove_node gap-closing UPDATE violates UNIQUE(storyline_id, sequence_order) after a reorder

Location: `src-tauri/src/database/models.rs:361`. Category: correctness. Verifier confidence: high. Phase: P1.

`UPDATE storyline_nodes SET sequence_order = sequence_order - 1 WHERE storyline_id = ? AND sequence_order > ?` is applied row-by-row by SQLite, which checks the unique index per row. It only succeeds while rowid order happens to match sequence order. After `reorder_nodes` or a positional `add_node` has inverted that order, the decrement collides with a row not yet processed. Reproduced with sqlite3 using the exact 002 schema and this SQL: create n1,n2,n3 at 0,1,2; reorder to n3=0,n2=1,n1=2; remove n3; the UPDATE fails with `UNIQUE constraint failed: storyline_nodes.storyline_id, storyline_nodes.sequence_order`. `add_node` already documents this exact hazard for `+= 1` and works around it (lines 294-312); `remove_node` does not. Because the DELETE (line 353) and the UPDATE run on the pool without a transaction, the membership row is already gone when the error is returned: the caller sees a failure, the node is nevertheless removed, and the remaining sequence keeps a gap. No test covers remove-after-reorder.

Fix: Wrap remove_node in a transaction like add_node/reorder_nodes, and close the gap through disjoint negative values (e.g. `SET sequence_order = -sequence_order WHERE sequence_order > ?` then `SET sequence_order = -sequence_order - 1 WHERE sequence_order < 0`). Add a test: add three nodes, reorder_nodes to reverse them, remove the first, assert the remaining orders are 0 and 1.

### H2. Live change events are dropped for any vault under a dot-directory

Location: `src-tauri/src/watcher.rs:103`. Category: correctness. Verifier confidence: high. Phase: P2.

The notify callback tests the hidden rule against every component of the absolute event path:

```rust
let is_hidden = path
    .components()
    .any(|c| c.as_os_str().to_string_lossy().starts_with('.'));
if is_hidden { continue; }
```

notify delivers absolute paths, so a vault at `~/.notes` or `~/.obsidian-vaults/work` has a dot component above the vault root and every event inside it is discarded. The initial scan in `scan_existing_files` (line 169) uses `import_helpers::is_visible_vault_entry`, which deliberately exempts the root, and PRODUCT_DESIGN.md line 1385 states that the import walk and the file watcher share one rule. Result: such a vault imports and scans correctly but never receives Created/Modified/Deleted events while open, so external edits are silently missed. No test covers a watcher rooted in a dot-directory.

Fix: Strip `watched_path` from the event path before checking components (pass the root into the callback closure and use `path.strip_prefix(&root)`), or check only components below the root. Add a watcher test whose tempdir is named `.notes` and assert an event arrives for a file written inside it.

### H3. Run-start selection snapshot is never read by the selection tools it claims to protect

Location: `src/canvas/composables/agent/agentToolStoreAdapter.ts:34`. Category: correctness. Verifier confidence: high. Phase: P3.

The adapter exposes `get selectedNodeIds() { return runSelection?.() ?? store.selectedNodeIds }` and the header comment (and useAgentPrompt) say this fixes what a run acts on. But the adapter is only handed to useLLMTools, whose store reaches the color/theme/memory handlers and the smart_*/for_each switch, none of which read `selectedNodeIds` (grep of src/llm finds no `store.selectedNodeIds` reader). The selection tools (update_selected_content, delete_selected, ...) in src/llm/tools/selectionTools.ts read `ctx.selectedNodeIds` from the registry ToolContext, which GraphCanvas.executeAgentTool builds from the live `store.selectedNodeIds` (GraphCanvas.vue:1276). So a click during a run still redirects update_selected_content/delete_selected to the newly clicked node - the exact bug PRODUCT_DESIGN.md > What the agent acts on says is fixed. The test agent-target-selection.test.ts only asserts on the adapter getter, so it passes while the protection is unwired.

Fix: Feed the run snapshot into the path the selection tools actually read: build the registry ToolContext's `selectedNodeIds` from `runSelection.value ?? store.selectedNodeIds` (or pass the same adapter/getter into that context), and add a test that drives a selection tool through executeAgentTool while the live selection changes mid-run. Remove the unread getter from the adapter if the registry context becomes the single source.

### H4. Superseded node-agent loop keeps running and keeps writing the note

Location: `src/canvas/composables/agent/useNodeAgent.ts:301`. Category: correctness. Verifier confidence: high. Phase: P3.

`run()` guards log/isRunning/currentContent writes with `isCurrent()`, but the `for` loop never exits when superseded: unlike useAgentRunner (which returns at the top of each iteration when `generation !== runGeneration`), there is no such check here. `llmQueue.cancelCurrent()` only rejects the request in flight; a stale loop that is inside a tool call (`executeFetchUrl`, `formatMathToTypst`, `ctx.updateContent`) survives the cancel, pushes its tool result and issues a fresh `llmQueue.chat`, running to completion alongside the new run. Every mutating branch still calls `ctx.updateContent(...)` / `ctx.updateTitle(...)` unguarded, and `append_content` mutates shared state unguarded: `currentContent.value += '\n' + rawText` followed by `await ctx.updateContent(currentContent.value)` - a dead loop appends to the NEW run's content and saves it. node-agent-generation.test.ts only counts `if (isCurrent()) currentContent.value =` occurrences and does not see the `+=` form.

Fix: Return early at the top of each iteration and before any `ctx.updateContent`/`ctx.updateTitle` call when `!isCurrent()`; guard the `append_content` mutation; add a test that supersedes a run while a tool call is pending and asserts no further `updateContent` calls arrive from the old run.

### H5. Single-ring branch indexes the unfiltered level with the filtered count, dropping nodes

Location: `src/canvas/composables/layout/useRadialLayout.ts:290`. Category: correctness. Verifier confidence: high. Phase: P6.

`placeable` is computed as `nodesAtDepth.filter(id => nodeIdsToLayout.has(id))` and `nodeCount = placeable.length` (lines 236-237). The split-ring branch correctly reads `placeable[nodeIndex]`, but the normal branch does `for (let i = 0; i < nodeCount; i++) { const nodeId = nodesAtDepth[i]` (lines 289-290). When a BFS level contains nodes outside the layout context (nodes in another frame when the centre is unframed, or vice versa), the loop walks only the first `placeable.length` entries of the unfiltered list, skips the foreign ones via `continue`, and never reaches the placeable nodes further along. It also spreads `angleStep = 2π / nodeCount` over indices of the wrong list, so the placed nodes are not evenly distributed. Reproduced: centre `c` (unframed) with neighbours `f1, f2` (frame F) and `u1, u2` (unframed) -> `u1` is absent from `targets`; `u2` is placed at the angle slot of index 1. None of the existing radial tests (radial-ring-capacity, neighborhood-radial-layout, layoutFrameIntegration) mix frame contexts on one ring, so this is uncovered.

Fix: Iterate `placeable` in the single-ring branch exactly as the split branch does: `const nodeId = placeable[i]`. Add a test with mixed-context neighbours on one level asserting every same-context neighbour receives a target and that angles are evenly spaced over the placed set.

### H6. Wired saveEditing bypasses frontmatter re-join and never clears the editing guard

Location: `src/canvas/composables/util/useCanvasEventHandlers.ts:166`. Category: correctness. Verifier confidence: high. Phase: P1.

GraphCanvas.vue (line 1892) binds the `saveEditing` returned by `useCanvasEventHandlers`, not the one in `useNodeEditor`. `useNodeEditor.startEditing` splits the node's frontmatter into a private `editingFrontmatter` and puts only the body into `editContent`. The wired handler then writes `updateNodeContent(nodeId, editContent.value)` (line 191) - the body alone - so the in-memory node and the SQLite copy lose their frontmatter on every blur/Escape/Cmd+Enter save (the Rust side only re-attaches frontmatter for file-backed nodes with sync on, via `preserve_frontmatter`). It also sets `editingNodeId.value = null` directly (line 202) without calling `store.setEditingNode(null)`, which only `useNodeEditor.saveEditing` does via `publishEditingNode()`. As a result `store.editingNodeId` stays pointed at the last edited node after the editor closes, and `useFileSync` (line 248, `getEditingNodeId() === node.id`) keeps refusing external changes to that node for the rest of the session. The test in `src/__tests__/frontmatter-display.test.ts` ("restores the header on save") calls `useNodeEditor.saveEditing`, i.e. the path the app does not use, so it stays green while the shipped behaviour is broken. The two implementations also diverge in their blur-guard selectors: `useNodeEditor` checks `.node-color-bar`, a class that exists nowhere in the codebase (the real class is `.collapsed-color-bar`).

Fix: Keep a single `saveEditing` in `useNodeEditor` (it owns `editingFrontmatter` and the editing-node publication) and have `useCanvasEventHandlers` call it, adding the mermaid render / auto-fit via the already-existing `onAfterSave` hook. Add a test that drives the handler GraphCanvas actually binds and asserts (a) the frontmatter survives and (b) `setEditingNode(null)` is called on save. Delete the `.node-color-bar` selector.

### H7. Every workspace refresh re-lays out all nodes inside existing folder frames

Location: `src/composables/useImport.ts:231`. Category: correctness. Verifier confidence: high. Phase: P1.

createFramesFromFolders is called from refreshWorkspace (line 592) and syncFramesFromFolders (line 567) with ALL current nodes. For a folder whose frame already exists it runs `layoutNodesInFrame(folderNodes, existingFrame, ...)` (lines 231-241), which calls `deps.updateNodePosition` for every node in that folder and puts them into a fixed 3-column grid. The store supplies that dependency (src/stores/nodes.ts:483 persists via `invoke('update_node_position')`), so each Ctrl+Shift+R / 'Refresh from files' (App.vue:572, GraphCanvas.vue:1065) silently discards and overwrites the user's manual arrangement of every node that lives in a folder frame. The existing frame is not resized either, so a grown folder overflows its frame. No test covers refreshWorkspace or createFramesFromFolders (grep of src/__tests__ finds none).

Fix: On the existing-frame branch only assign nodes that are not yet in the frame (`node.frame_id !== existingFrame.id`) and lay out only those newcomers; leave already-placed nodes untouched. Add a test that a refresh keeps the positions of nodes already inside a frame.

### H8. planGraphImport hangs when a deeper heading follows the References section

Location: `src/lib/pdfGraph.ts:223`. Category: correctness. Verifier confidence: high. Phase: P5.

`planGraphImport` removes the references section with `sections.filter(s => s !== referencesSection)` and passes the shorter array to `foldDeepSections`, but every `DocumentSection.parentIndex` still indexes the original, unfiltered array. Inside `foldDeepSections` the loop `while (ancestor !== null && !keptIndexByOriginal.has(ancestor)) { ancestor = sections[ancestor].parentIndex }` then walks the wrong element; when the shifted index lands on the section itself (its own parentIndex points at its own new slot) the loop never terminates. Reproduced with `# Title / ## Intro / ## References / ## Appendix / ### A1` and with `# Title / ## Intro / ## References / ### Web`: both hang indefinitely (a control document with the subsection before References completes). Papers with appendices after the bibliography, or a bibliography split into `###` subsections, are ordinary inputs, so the graph import dialog freezes the renderer on them. Level-2 sections after References whose parent is also after References additionally get remapped to the wrong parent, producing edges to the wrong node.

Fix: Recompute `parentIndex` when removing the references section (build an old-index to new-index map and remap, dropping descendants of the removed section), or have `foldDeepSections` accept the original array and a set of excluded indices. Add a regression test with a `### ` heading after `## References` that asserts termination and correct edges.

### H9. markdownToTypst emits hashtags, URLs and @ unescaped, so PDF compilation fails or drops text

Location: `src/lib/typst-export.ts:97`. Category: correctness. Verifier confidence: high. Phase: P5.

Node bodies are passed through `markdownToTypst` and inserted verbatim into Typst markup, but nothing escapes Typst syntax in prose. `#demo` (a Nodus hashtag, present in every starter workspace) is a function call in Typst and aborts compilation with an unknown-variable error in `pdf-export.ts` (`$typst.pdf({ mainContent })`); `@name` is a label reference and fails the same way; a bare `https://x.org/y` turns the rest of the line into a `//` comment so the text silently disappears (verified: `nodeToTypst` returns `Text #demo tag and https://x.org/y then more` unchanged). `escapeTypst` is only applied to titles and also misses `<`, `>`, `[`, `]`, `` ` `` and `//`.

Fix: Escape Typst-significant characters in prose segments (at minimum `#`, `@`, `//`, `[`, `]`, `<`, `>`) before applying the markdown-to-Typst substitutions, or protect recognised constructs (links, code, math) with placeholders and escape everything else. Add a test that exports a node containing `#tag` and a bare URL and asserts the output contains `\#tag` and no line comment.

## Medium severity

### M1. connect() neither discards the previous socket nor guards against concurrent attempts

Location: `packages/nodus-mcp-server/src/websocket-client.ts:103`. Category: correctness. Verifier confidence: high. Phase: P4.

`connect()` unconditionally does `this.ws = new WebSocket(url)` and attaches handlers, without closing or detaching the previous socket. `ensureConnected()` (line 170) is called on every tool call while disconnected and resets `reconnectAttempts` each time, while the `close` handler of each failed socket schedules `attemptReconnect()` independently. With Nodus down, N tool calls produce N parallel reconnect chains, each replacing `this.ws`. Handlers on superseded sockets keep firing: an old socket's `open` calls `this.authenticate()` which sends on whichever socket is current, its `message` handler can flip `isApproved` for a socket that is no longer `this.ws`, and its `close` triggers yet another reconnect. `disconnect()` has the same shape: it calls `ws.close()` which fires the `close` handler and schedules a reconnect, so a deliberate disconnect reconnects.

Fix: Keep a single in-flight connect promise (`this.connecting ??= new Promise(...)`), close and `removeAllListeners()` on the previous socket before creating a new one, and ignore events from sockets that are no longer `this.ws`. Set an `intentionallyClosed` flag in `disconnect()` that `attemptReconnect` respects.

### M2. Rejection by the user is never recorded; client reports 'waiting for approval' forever

Location: `packages/nodus-mcp-server/src/websocket-client.ts:269`. Category: correctness. Verifier confidence: high. Phase: P4.

The -32001 branch classifies the message by regex on its text and then tries to reject a pending request by id:

```ts
if (message.error?.code === -32001) {
  const wasRejected = /reject|denied|declined/i.test(text)
  if (!wasRejected) { ...; return }
  if (message.id !== undefined && message.id !== null) {
    const pending = this.pendingRequests.get(message.id) ...
```

The Rust server sends the rejection with `id: None` (src-tauri/src/mcp_websocket.rs:298: `JsonRpcResponse::error(None, NOT_APPROVED, "Connection rejected by user")`) and deliberately keeps the socket open, so the `pending` lookup can never match and nothing else changes: `isApproved` stays false, the socket stays OPEN, `isAwaitingApproval()` stays true, and every subsequent tool call in index.ts returns 'Waiting for this connection to be approved in Nodus'. No pending request can exist at that moment anyway, because index.ts never calls `request()` until `isConnected()` (which requires approval). The non-rejected -32001 case ('Connection pending approval', sent with the request id) returns without settling the promise, so if a request ever did go out pre-approval it would hang until the 30 s timeout. The accompanying test (src/__tests__/mcp-error-reporting.test.ts) only greps the source for the regex and for `pending.reject`, so none of this behaviour is exercised. Classifying protocol outcomes by matching words in a human-readable message is also fragile; a distinct error code or `error.data.status` field is the proper carrier.

Fix: Have the server send a distinct code (or `data: {status:'rejected'}`) for rejection, track a `rejected` state in the client so `isAwaitingApproval()` becomes false and the tool-call error says the connection was rejected, and settle any pending request that receives a -32001 with an id. Replace the source-grep test with a behavioural test using a fake ws.

### M3. validate_outbound_url misses IPv4-mapped IPv6 literals and resolves nothing for hostnames

Location: `src-tauri/src/commands/http.rs:44`. Category: correctness. Verifier confidence: high. Phase: P1.

The V6 branch blocks only `is_unspecified()` and `fe80::/10`. `http://[::ffff:169.254.169.254]/` parses as an IPv6 address whose first segment is 0, so it passes and reqwest connects to the IPv4 link-local metadata address the function exists to block. Hostnames are only compared against `metadata.google.internal`; any other name that resolves to a link-local or metadata address passes. These URLs reach this command from LLM tool calls (`fetch_url` delegates here), so the input is attacker-influenceable via prompt injection.

Fix: Map IPv4-mapped/compatible addresses with `Ipv6Addr::to_ipv4_mapped()`/`to_canonical()` before the V4 checks, and either resolve hostnames and apply the same checks to every resolved address or restrict hostname requests to a documented allowlist.

### M4. Streaming request timeout cuts off generations longer than the connect timeout

Location: `src-tauri/src/commands/http.rs:153`. Category: correctness. Verifier confidence: high. Phase: P5.

`http_stream_request` applies `request.timeout(timeout)` where `timeout` is `input.timeout_ms`. In reqwest, `RequestBuilder::timeout` runs from connection start until the response body has finished, so it bounds the whole stream, not the connection. The frontend fills `timeout_ms` from `options.connectTimeout || 60000` (src/llm/providers/http.ts:112; Anthropic/OpenAI providers pass `this.timeout` = 60000 by default), so any streamed generation that takes longer than 60 s is aborted mid-stream with a `timed out` error even though chunks are arriving. This defeats the stated purpose of the command (doc comment: keep the connection demonstrably alive) and contradicts PRODUCT_DESIGN.md > Streaming responses. The test suite only covers the connect-timeout case.

Fix: Use `reqwest::Client::builder().connect_timeout(timeout)` (or a `read_timeout`/per-chunk inactivity timeout via `tokio::time::timeout` around `stream.next()`) instead of a whole-request timeout for the streaming path, and rename the input field or document that `timeout_ms` is a connect/idle timeout. Add a test with a slow-but-alive stream that exceeds `timeout_ms`.

### M5. update_node_file_path stores an unvalidated webview path that later file operations trust

Location: `src-tauri/src/commands/nodes.rs:524`. Category: correctness. Verifier confidence: high. Phase: P1.

`update_node_file_path(id, file_path)` persists whatever path the webview sends without `validate_path_in_workspace`. Other commands then act on `node.file_path` as trusted: `move_node_file` (line 600-692) takes an exclusive lock on and `rename`s the source without validating it (only the target folder is validated), and `delete_workspace(delete_files=true)` in workspaces.rs line 101 calls `std::fs::remove_file` on it. Every other caller-supplied path in this module group is validated (`create_node_from_file`, `check_file_collision`, `move_node_file` target, `read_file_content`), so this is the one unguarded entry that lets an arbitrary path reach a rename or delete.

Fix: Validate the incoming path with `validate_path_in_workspace` (or the workspace's own vault, as `create_node_from_file` does) before storing it, and/or validate `node.file_path` in `move_node_file` and `delete_workspace` before renaming or removing.

### M6. OKF description is derived from content that still carries frontmatter

Location: `src-tauri/src/commands/okf.rs:75`. Category: correctness. Verifier confidence: high. Phase: P5.

`build_frontmatter` computes `description: node.markdown_content.as_deref().and_then(derive_description)` and `export_okf_bundle_impl` (line 348-351) does the same for the index entry, both on the raw `markdown_content`. For a file-backed node the stored content begins with the file's own frontmatter block (`create_node_from_file` stores the file verbatim). `derive_description` only skips bare `---` lines, so the first line inside the block (e.g. `type: Note`) becomes the concept description in both the document frontmatter and `index.md`. The export body was fixed to go through `body_without_frontmatter` (line 334) but the description path was not. The test `an_exported_document_carries_one_frontmatter_block` uses a block whose first line is `type: Note` and only asserts `!doc.contains("stale-id")`, so it passes while `description: 'type: Note'` is emitted.

Fix: Derive the description from `body_without_frontmatter(content)` in both `build_frontmatter` and the index entry (or compute it once and pass it in), and extend the existing test to assert the description equals the first body line.

### M7. sync_missing_files and link_nodes_to_files prune a dotted vault root and ignore symlinks

Location: `src-tauri/src/commands/vault_watcher.rs:115`. Category: correctness. Verifier confidence: high. Phase: P2.

Both walks use a local closure `!e.file_name().to_string_lossy().starts_with('.')` as `filter_entry` (lines 115-118 and 266). `import_helpers::is_visible_vault_entry` exists precisely because this rule prunes the root entry at depth 0 when the vault folder itself starts with a dot ("a vault folder whose own name starts with a dot ... is still a vault, and pruning at depth 0 made it scan as empty"), and `collect_markdown_files` and the watcher were switched to it. These two commands still carry the old rule, so for a `.notes`-style vault `sync_missing_files` creates nothing and `link_nodes_to_files` finds 0 files. They also omit `.follow_links(true)`, which the import and watcher walks set, so a symlinked subfolder is imported and watched but never picked up by sync/link.

Fix: Replace both closures with `.follow_links(true).filter_entry(crate::import_helpers::is_visible_vault_entry)` so the three walks share one rule as the import_helpers comment claims.

### M8. sync_missing_files marks a node as wikilink-synced even when the sync failed

Location: `src-tauri/src/commands/vault_watcher.rs:194`. Category: correctness. Verifier confidence: high. Phase: P2.

`let _ = sync_wikilinks_for_node(pool, &node_id, &links).await;` discards the error, then `set_synced_hash(...)` is called unconditionally. `sync_workspace_wikilinks_impl` skips any node whose stored checksum equals `wikilink_synced_hash`, so a node whose edge sync failed is invisible to the safety-net pass until its content changes. `refresh_workspace` (lines 690-695) sets the hash only on `Ok`. The hash is also recomputed from `content` although `checksum` from line 155 holds the same value.

Fix: Match on the result and set the synced hash only on success (reuse `checksum`); log the error otherwise, as `refresh_workspace` does.

### M9. link_nodes_to_files stores the file checksum without loading the file content

Location: `src-tauri/src/commands/vault_watcher.rs:309`. Category: correctness. Verifier confidence: high. Phase: P2.

`database::nodes::update_file_path(pool, &node.id, file_path, &checksum)` records the checksum of the file on disk while `markdown_content` keeps whatever the node had before it was linked. `refresh_workspace` (line 675) skips a node when `node.checksum == compute_string(file content)`, so the newly linked node is treated as up to date and its stale content is never replaced from the file. The UI calls `linkNodesToFiles` and then `refreshWorkspace` back to back (src/App.vue:564-572), so this is the observed sequence.

Fix: Either read the file and call `update_content_and_checksum` when linking, or link with `update_file_path_only` (which sets `checksum = NULL`) so the following refresh detects the change.

### M10. import_vault aborts halfway on a single unreadable file or failed insert

Location: `src-tauri/src/commands/vault_watcher.rs:456`. Category: correctness. Verifier confidence: high. Phase: P2.

`std::fs::read_to_string(&file_path).map_err(|e| e.to_string())?` (line 456) and `database::nodes::create(pool, &node).await.map_err(...)?` (line 532) return from the command mid-loop. Frames created in the first pass and every node created so far stay in the database, no wikilink edges are created for them, and the caller sees only an error string. A single non-UTF-8 or permission-denied `.md` file therefore leaves a partial import. `sync_missing_files` (line 139) handles the same failure by logging and continuing.

Fix: Log and `continue` on per-file read/insert failures as `sync_missing_files` does, count them, and report the skipped files in the result; or wrap the import in a transaction if all-or-nothing is intended.

### M11. import_vault forks the wikilink resolution logic instead of using the shared sync helper

Location: `src-tauri/src/commands/vault_watcher.rs:552`. Category: consistency. Verifier confidence: high. Phase: P2.

Lines 552-607 re-implement anchor stripping, `rsplit('/')` fallback, self-link exclusion and edge dedup that `wikilinks::sync_wikilinks_for_node_with_map` already provides. The fork diverges in behaviour: `title_to_id` contains only the nodes imported in this call, so links from imported notes to nodes that already existed in the workspace (including files counted as `skipped`) produce no edge; unresolved links are not recorded in `pending_wikilinks`, so they never resolve when the target is created later; and `set_synced_hash` is never called, so the next `sync_all_wikilinks` pass re-reads every imported file. `sync_missing_files` and `refresh_workspace` in the same file use the shared helper.

Fix: After the node loop, build the map once with `build_title_to_id_map(&all_nodes)` (all workspace nodes, not only the new ones) and call `sync_wikilinks_for_node_with_map` plus `set_synced_hash` per imported node; drop the local edge loop and `seen_edges`.

### M12. should_exclude_file is forked between import_helpers.rs and commands/mod.rs

Location: `src-tauri/src/import_helpers.rs:16`. Category: consistency. Verifier confidence: high. Phase: P2.

`import_helpers::should_exclude_file` (line 16) and `commands::should_exclude_file` (commands/mod.rs line 53) both exclude `CLAUDE.md` and `README.md`, with the commands copy adding a hidden-file check. The two lists must stay in sync by hand; a file added to one exclusion list would be imported by one path and ignored by the other. `is_visible_vault_entry` in this file was introduced to be the single hidden-entry rule (PRODUCT_DESIGN.md line 367), yet `commands/vault_watcher.rs` lines 117 and 266 still carry their own `filter_entry(|e| !e.file_name()...starts_with('.'))` copies that do not exempt the vault root.

Fix: Keep one `pub(crate) fn should_exclude_file` (in import_helpers, next to `is_visible_vault_entry`) and import it from commands. Replace the two inline hidden filters in commands/vault_watcher.rs with `is_visible_vault_entry`.

### M13. Entity-linking composable receives a frozen snapshot of filteredNodes

Location: `src/canvas/GraphCanvas.vue:893`. Category: correctness. Verifier confidence: high. Phase: P6.

`useCanvasEntityLinking({ store: { filteredNodes: store.filteredNodes, selectedNodeIds: store.selectedNodeIds, ... } })` passes the *value* of the Pinia computed `filteredNodes` (src/stores/nodes/state.ts:79 returns a fresh `nodes.value.filter(...)` array on every recompute). Inside the composable `linkedEntitiesMap = computed(() => { for (const node of store.filteredNodes) ... })` iterates that captured array forever; nothing ever hands it the recomputed one. GraphCanvas is mounted once and unkeyed (App.vue:939), so the list is whatever `filteredNodes` was at setup - typically empty before the first workspace load - and never includes nodes created later or nodes of another workspace after a switch. `getLinkedEntities(node.id)` (template line 2202) therefore reports no or stale entity badges. `selectedNodeIds` is passed the same way and is never read by the composable at all.

Fix: Pass getters/refs as every sibling composable in this file does (`getFilteredNodes: () => store.filteredNodes` or `filteredNodes: computed(() => store.filteredNodes)`), read them inside the computed, and drop the unused `selectedNodeIds` field from `UseEntityOperationsOptions`. Add a test that creates a node after setup and asserts its linked entities appear.

### M14. In-use swatch sends a node's stored rgba tint to a frame, breaking the frame background

Location: `src/canvas/components/CanvasColorBar.vue:54`. Category: correctness. Verifier confidence: high. Phase: P6.

For preset swatches the bar deliberately distinguishes node and frame values (`onColorClick` emits `color.display` for frames and `color.value` for nodes), but the in-use swatch path does not:

```ts
function onInUseColorClick(color: ColorInUse) {
  if (props.selectedFrameId) {
    emit('update-frame-color', color.value)
  } else {
    emit('update-node-color', color.value)
  }
}
```

`colorsInUse` (GraphCanvas.vue:620-645) is built from `node.color_theme`, whose preset values are tints like `rgba(239, 68, 68, 0.18)` (useEdgeStyling.ts:88-94) with `display` mapped to `#fecaca`. Selecting a frame and clicking such an in-use swatch stores the rgba string on the frame; `useColorOperations.updateSelectedFrameColor` and `framesStore.updateFrameColor` pass it through unchanged. CanvasFrames.vue:39 then builds `backgroundColor: frame.color + '40'`, producing `rgba(239, 68, 68, 0.18)40`, an invalid value the browser drops, so the frame loses its fill while its border and title use the tint colour. `isInUseColorActive` also compares the frame colour against `color.value`, so the active ring is inconsistent with the preset path.

Fix: Emit `color.display` for frames in `onInUseColorClick` (mirroring `onColorClick`) and compare against `color.display` in `isInUseColorActive` when a frame is selected. Cover with a unit test of the emitted payload when `selectedFrameId` is set.

### M15. Tag and date editor logic is duplicated between CanvasNodeCard and CanvasPreviewPanel and has already diverged

Location: `src/canvas/components/CanvasNodeCard.vue:142`. Category: design. Verifier confidence: high. Phase: P5.

Both files contain near-identical copies of: `nodeTags` (JSON.parse with try/catch, lines 142-150 here vs PreviewPanel 102-111), `addTag` (222-228 vs 113-119), `removeTag` (230-235 vs 121-126), `openDateEditor` (200-205 vs 82-86), `saveDate` (207-216 vs 88-96) and the `date – date_end` label (153-159 vs 75-80). The write paths already differ: the card calls `nodesStore.updateNodeContent` directly (with a comment about recording an undo baseline), while the panel emits `save` and relies on the parent. A fix to one (e.g. the undo baseline, or trimming the `#` prefix) has to land twice.

Fix: Extract a `useNodeMetadataEditor(nodeId, content)` composable under `canvas/composables/nodes/` that owns the tag/date state and returns the handlers, and use it from both components with an injected save callback.

### M16. Date/tag/link-picker editor state survives a node switch and can write the previous node's dates into the new node

Location: `src/canvas/components/CanvasPreviewPanel.vue:63`. Category: correctness. Verifier confidence: high. Phase: P1.

Only `isEditing` is reset when the panel's node changes:

```ts
watch(() => props.nodeId, () => {
  isEditing.value = false
})
```

`showDateEditor`, `dateInput`, `dateEndInput`, `showTagInput`, `tagInput`, `showLinkPicker` and `wikilinkStart` are left as they were. If the user opens the date editor on node A and then clicks node B, the editor stays open prefilled with A's dates; pressing Save runs `saveDate()`, which calls `upsertFrontmatterField(props.rawContent, ...)` on B's content with A's values and emits `save` for B. The same applies to a half-typed tag (`addTag` fires on blur and writes to `props.nodeId`). CanvasNodeCard does not have this problem because each card owns its own state.

Fix: In the `props.nodeId` watcher (and the `visible` watcher) also reset `showDateEditor`, `showTagInput`, `showLinkPicker`, `tagInput`, `dateInput`, `dateEndInput` and `wikilinkStart`. Add a test that opens the date editor, switches `nodeId`, and asserts the editor is closed and no `save` is emitted.

### M17. `currentWorkspaceId` is captured once, contradicting the 'reads stay live' contract

Location: `src/canvas/composables/agent/agentToolStoreAdapter.ts:56`. Category: correctness. Verifier confidence: high. Phase: P3.

The header says "Reads are getters, so they stay live rather than freezing at construction", but `currentWorkspaceId: store.currentWorkspaceId` copies the unwrapped computed value when GraphCanvas builds the adapter at setup. The memory handlers (src/llm/tools/handlers/memoryHandlers.ts:22,42,...) read `ctx.store.currentWorkspaceId || 'default'`, so after the user switches workspace, `remember`, `set_goal`, `push_task` etc. keep writing to the workspace that was open when the canvas mounted.

Fix: Expose it as `get currentWorkspaceId() { return store.currentWorkspaceId }` and add a test that switches workspace after constructing the adapter.

### M18. Text-embedded tool-call path skips the checks the native path enforces

Location: `src/canvas/composables/agent/useAgentRunner.ts:519`. Category: consistency. Verifier confidence: high. Phase: P3.

When a tool call is recovered from message text (```json / python_tag / channel / raw JSON), the code calls `ctx.executeAgentTool(toolName, toolArgs)` directly. Unlike the native `tool_calls` branch it does not: check `allowedToolNames` for the current mode (so a plan-mode model can run mutating tools by emitting JSON in prose), log `describeToolCall`, call `recordAction` on the transcript, log the `failed:` outcome, or handle `__REQUEST_APPROVAL__:` / `AGENT_PAUSED:` (an approval request via this path is pushed back as a plain tool result and the loop continues without pausing). On `AGENT_DONE:` it also omits `appendAssistantText`, so the transcript never shows the final message. Additionally `appendAssistantText(ctx.transcript.value, msg.content)` at line 484 runs before tool JSON is detected, so raw tool JSON is shown to the user as an assistant reply.

Fix: Extract one `handleToolCall(name, args, replyAs)` used by both branches (mode allow-list, logging, transcript, marker handling), and defer the transcript append until the message is known not to be a tool call.

### M19. Huge graphs run full obstacle routing and then discard it; labels land on the discarded path

Location: `src/canvas/composables/edges/useEdgeRouting.ts:502`. Category: correctness. Verifier confidence: high. Phase: P6.

`routeAllEdges` is executed unconditionally (line 389) before the `isHugeGraph` check. For huge graphs the branch at line 502 replaces the routed path with `M start L end`, so the most expensive routing pass (spatial index, port assignment, grid tracker, obstacle detours for every edge) is computed and thrown away exactly for the graphs where it costs the most. Because `routed` is still defined, the label branch at line 549 places the label on the discarded routed polyline, not on the straight line that is actually drawn; the `isHugeGraph` label case at line 609 is unreachable (see the dead-code finding).

Fix: Short-circuit before routing when `isHugeGraph.value` (emit straight port-to-port lines with a matching label midpoint), or route with `'direct'` style, and remove the post-hoc override.

### M20. Fallback path and label branches for 'drag without cache' are unreachable

Location: `src/canvas/composables/edges/useEdgeRouting.ts:507`. Category: dead-code. Verifier confidence: high. Phase: P6.

`routedEdges` is always populated: when `mustRerouteLive()` is true the routing runs on every recompute (line 383), and otherwise the cache from the previous run is used. Every edge in `edges` survives `analyzeEdges` (source/target already filtered at line 273, ids already deduplicated at line 158), so `routedEdges.get(edge.id)` is always defined. Consequently `else if (mustRerouteLive())` (lines 507-525), the trailing `else` (526-528), the label branch `else if (mustRerouteLive() || !routed)` (607-630) and its `else` (631-634) can never execute. The comment at line 505 ("handles both normal rendering and zoom/drag with cache") describes behaviour that no longer exists. Further dead guards in the same computed: `if (labelX === undefined)` at line 602 (labelX is a number initialised at 532); the `sourceRect ? ... : 'right'` / `targetRect ? ... : 'left'` / `{x: sourceCx...}` fallbacks at lines 439-449 re-fetch entries already proven present at lines 420-422; `strokeWidth?: number` in the cache type (lines 114, 365) is never set by `routeAllEdges`, so `routed?.strokeWidth || 1.5` (line 530) is constant.

Fix: Delete the unreachable branches and the `STANDOFF_DIST`/`ANGLE_OFFSET`/`getAngledStandoff` work that only feeds them, keep the `isHugeGraph` and `routed.svgPath` cases, and drop the `strokeWidth` cache field.

### M21. getEdgeHighlightColor parses node colours as hex but current node colours are rgba strings

Location: `src/canvas/composables/edges/useEdgeStyling.ts:354`. Category: correctness. Verifier confidence: high. Phase: P6.

Node `color_theme` values are rgba tints (`defaultNodeColors` in this file, `src/canvas/utils/nodeColors.ts`, and templates.ts write e.g. `'rgba(59, 130, 246, 0.18)'`). `getEdgeHighlightColor` does `nodeColor.replace('#','')` then `parseInt(hex.substr(0,2),16)` which yields NaN for `'rg'`, so `brightness > 200` is false and the raw 18-28%-alpha tint is returned as the hovered-edge highlight colour in light themes - the very 'too light to see' case the function claims to avoid. `cyberHighlightColors` (line 109) is keyed by legacy solid pastels (`#fee2e2` ...) that no longer match any palette value, so the cyber branch never fires either; and line 361 omits `'cyber'` from the dark-theme check while the five other theme checks in this file (lines 232, 243, 251, 259, 320) include it.

Fix: Resolve the node colour through the existing `nodeColors` util (display colour / dark mapping) before deriving a highlight, or compute luminance from the parsed rgba channels; introduce one `isDarkTheme` computed and use it in all six places.

### M22. canvasEdges ignores the user's hide-edges settings that visibleEdgeLines honours

Location: `src/canvas/composables/edges/useEdgeVisibility.ts:263`. Category: correctness. Verifier confidence: high. Phase: P6.

`visibleEdgeLines` applies `edgeHideThreshold`, `hideWikilinkEdges` and `hideStorylineEdges` (lines 105-125). `canvasEdges`, documented as 'the same edges for the canvas renderer', maps `edgeLines.value` directly, so in LOD/bubble mode (CanvasLODCanvas) wikilink and storyline edges are drawn even when the user turned them off, and the 'hide all edges above N' threshold has no effect exactly on the large graphs it targets.

Fix: Factor the three setting-based filters into a shared computed (`settingFilteredEdgeLines`) and derive both `visibleEdgeLines` and `canvasEdges` from it.

### M23. navigateToNode reimplements wikilink resolution differently from lib/wikilink.resolveWikilink

Location: `src/canvas/composables/nodes/useNodeNavigation.ts:34`. Category: consistency. Verifier confidence: high. Phase: P2.

Wikilink clicks in rendered node content (via `useCanvasEventHandlers.handleContentClick` -> `navigateToNode`) resolve by title, then by last path segment, then by hyphen-normalised title. `useFullscreenModal.handleNavigateToNode` and `CanvasPreviewPanel.vue` use `resolveWikilink` from `src/lib/wikilink.ts`, which additionally decodes HTML entities, matches `file_path`, and resolves `frame/title`. The same `[[link]]` therefore opens different targets depending on where it is clicked. Inside this function the third fallback (lines 50-62) also repeats the exact filename match already tried at lines 42-48.

Fix: Resolve through `resolveWikilink` (inject `getFilteredFrames` alongside `getFilteredNodes`) and keep only the centring/selection logic here.

### M24. Markdown cache is keyed by content only, so wikilink existence goes stale; clearCaches is never called

Location: `src/canvas/composables/rendering/useContentRenderer.ts:58`. Category: correctness. Verifier confidence: high. Phase: P5.

`renderMarkdown` caches by raw content (`markdownCache.get(content)`) but its output depends on `wikilinkExists`, which reads the current node and frame set. Once a card containing `[[X]]` is rendered while `X` does not exist, creating node `X` later never refreshes that card: its `contentKey` is unchanged so `updateRenderedContent` skips it, and the cache would return the stale HTML anyway. The only escape hatch, `clearCaches` (line 194), has no caller anywhere in `src` outside this file (the `clearCaches` in MarkdownRenderService.ts is a different function), so it is also a dead export.

Fix: Include a node/frame-title version in the cache key (or clear `markdownCache` and the per-node hashes when the title set changes), and either wire `clearCaches` to that event or delete it.

### M25. Re-render watch source ignores card size and same-length edits, contradicting the contentKey comment

Location: `src/canvas/composables/rendering/useContentRenderer.ts:222`. Category: correctness. Verifier confidence: high. Phase: P5.

The watcher that drives `updateRenderedContent` uses the source `renderableNodes().length + sum(markdown_content.length)` (lines 221-227). Vue only fires the callback when that number changes, so (a) a resize of a card fires nothing even though line 173-175 says the size is part of the key precisely so 'a resized card must render again to fill the space it just gained', and (b) any content change that keeps the byte length (an external edit via file sync replacing one word with another of equal length) does not re-render. Nothing else calls `updateRenderedContent` (grep: only this file), so there is no second path that compensates.

Fix: Derive the watch source from the same inputs as `contentKey`: e.g. return a string built from `id:width x height:content.length:hash` per node, or key off the store's `nodeLayoutVersion`/content version counters, so resize and equal-length edits both trigger a pass.

### M26. A lookup error leaves the failing paper at the head of the queue forever

Location: `src/canvas/composables/util/useCitationFetch.ts:143`. Category: correctness. Verifier confidence: high. Phase: P5.

On `result.error` the loop `break`s without `paperQueue.value.shift()`, then `finally` resets `queueTotalPapers`/`queueProcessedPapers` to 0 while `paperQueue` still holds the failed entry and everything queued behind it. `queueSize` keeps reporting pending papers with nothing processing, later `addToFetchQueue` calls for the same node answer "Papers already in queue", and the next run starts by retrying the same failing paper. Cancellation cannot drain it either, because the cancel check only runs inside the loop.

Fix: On error either shift the failed entry and continue, or clear the queue before breaking; keep `queueSize` consistent with what will actually be processed.

### M27. confirmBibImport accepts importAttachments and layout but ignores both

Location: `src/canvas/composables/util/usePdfDrop.ts:522`. Category: naming. Verifier confidence: high. Phase: P5.

`confirmBibImport(options: { createFrame; importAttachments; layout: 'grid' | 'force' })` forwards only `createFrame` to `processBibDrop`. `ImportOptionsModal.vue` renders a checkbox for `importAttachments` and a layout selector and emits both, so the user is offered two options that change nothing. `processBibDrop` always lays out a fixed 4-column grid.

Fix: Either implement attachment import and force layout in `processBibDrop`, or remove the two options from `confirmBibImport`'s signature and from the modal so the UI does not promise behaviour that does not exist.

### M28. Routing barrel re-exports many functions with no production caller

Location: `src/canvas/routing/index.ts:10`. Category: dead-code. Verifier confidence: high. Phase: P6.

Grep over src (excluding tests) finds no consumer of: `pathToSvg` (svgPath.ts - entire file unused; the three routers each have their own `buildSvgPath`/`pathToSvgString`), `detectCrossings`/`CrossingReport` and private `segmentsIntersect` (portAssignment.ts 207-357, test-only), `createOrthogonalPath`, its private `routeAroundObstacles`, the shadowing `OBSTACLE_MARGIN = 20`, and `findOrthogonalPath` (pathBuilder.ts 7-150, 237-278; the docstring says 'Legacy function for useEdges composable compatibility' and no such composable exists), `pathIntersectsObstacles`, `findDetourRoutes`, `findBestDetour`, `routeAroundObstacles`, `DetourRoute` (obstacleAvoider.ts 164-307), `getSpatialIndex`/`invalidateSpatialIndex` (spatialIndex.ts 143-170; the cache is keyed on node count only, so it would return stale geometry after a move if anyone did use it), `SpatialIndex.isEmpty`/`size`, `GridTracker.findAndMarkChannel`/`reset`/`getUsedCount` and the `Segment` interface (gridTracker.ts 13-19, 209-225, 250-270), `EdgeRouteParams`/`EdgeRouteResult` and the `'sinusoidal'` member of `EdgeStyle` (types.ts 48-65; no router branch handles sinusoidal, it silently falls to orthogonal), `validateDiagonalPath`/`validateOrthogonalPath` (test-only), and the `usedDetour` result field, which no production code reads.

Fix: Delete the unused functions, types and files; move test-only validators (`validateDiagonalPath`, `validateOrthogonalPath`, `detectCrossings`) into the test tree; drop `'sinusoidal'`.

### M29. Obstacle lookup depends on a module-level mutable singleton instead of an injected index

Location: `src/canvas/routing/obstacleAvoider.ts:15`. Category: design. Verifier confidence: high. Phase: P6.

`currentSpatialIndex` is a module global set by `setRoutingSpatialIndex` from useEdgeRouting (lines 386/395). When it is set, `findObstacles` and `findObstaclesInRegion` ignore their `nodes` argument entirely, so a caller that passes a different node list (routing tests, `routeAllEdges` with `nodeRects`) silently gets results from whichever index was last installed; when it is not set they fall back to a linear scan of `nodes`. This is the 'discovered implementation' pattern the project rules forbid, it is not re-entrant, and it makes the `nodes` parameter's meaning depend on hidden state.

Fix: Build the `SpatialIndex` inside `routeAllEdges` from the node map it receives and pass it explicitly through `OrthogonalRouteParams`/`DiagonalRouteParams` to `findObstacles`; delete `setRoutingSpatialIndex` and the global.

### M30. Completion and error labels are hardcoded English next to t() calls

Location: `src/components/AgentTaskPanel.vue:87`. Category: consistency. Verifier confidence: high. Phase: P8.

`Error` (line 87), `Completed with errors` (94) and `All tasks completed` (97) are literal strings, while the header in the same template uses `t('agent.tasks')` and `t('common.close')`. `en.json` has no keys for these.

Fix: Add `agent.taskError`, `agent.completedWithErrors`, `agent.allTasksCompleted` to the locale files and render them with `t()`.

### M31. Keyboard shortcuts only work once the overlay has focus, which nothing arranges

Location: `src/components/PlanApprovalModal.vue:152`. Category: correctness. Verifier confidence: high. Phase: P8.

`onKeydown` is bound to the overlay div (`tabindex="0"`, line 152) rather than to `window`, so Escape and Cmd/Ctrl+Enter do nothing until the user clicks inside the modal or an input receives focus. The component never calls `.focus()` on the overlay when `visible` turns true, and the `autofocus` attribute on the v-if'd inputs (lines 194, 242) is only honoured reliably on initial document load. The sibling KeyboardShortcutsModal instead installs a window listener and focuses its input in `nextTick`.

Fix: In the `watch(() => props.visible)` handler, on open call `nextTick(() => overlayRef.value?.focus())`, or register a window keydown listener while visible (with cleanup on close and in `onUnmounted`).

### M32. Escape while editing a step closes the whole plan modal

Location: `src/components/PlanApprovalModal.vue:196`. Category: correctness. Verifier confidence: high. Phase: P8.

The step-edit input has `@keydown.escape="cancelEdit"` (line 196) and the add-step input has `@keydown.escape="toggleAddStep"` (line 244), neither with `.stop`. The keydown then bubbles to the overlay's `@keydown="onKeydown"` (line 154). By the time `onKeydown` runs, `editingStepId.value` has already been nulled by `cancelEdit`, so the `if (editingStepId.value) cancelEdit() else emit('close')` branch at lines 33-40 takes the else path and emits `close`. The guard that was written to make Escape only cancel the edit is therefore unreachable in practice: pressing Escape in either input dismisses the entire approval dialog and abandons the user's review.

Fix: Add `.stop` to the two input escape handlers (`@keydown.escape.stop`), or remove the per-input handlers and let the overlay `onKeydown` be the single Escape handler. Add a component test that mounts the modal, starts an edit, dispatches Escape on the input, and asserts `close` was not emitted.

### M33. legacyColorMap/getNodeBackground forked from canvas/utils/nodeColors.ts

Location: `src/components/StorylineNodeList.vue:22`. Category: consistency. Verifier confidence: high. Phase: P7.

Lines 22-50 re-declare `legacyColorMap` and `getNodeBackground`, which already exist in `src/canvas/utils/nodeColors.ts` (lines 63 and 156). The library version is theme-aware (`convertColorForTheme(colorTheme, currentTheme)`), the fork is not, so the same node renders a different tint in the storyline list than on the canvas in dark themes, and every future palette change must land twice. This violates the project rule that shared functionality lives in library code and is not forked into consumers.

Fix: Import `getNodeBackground` from `../canvas/utils/nodeColors` (passing the current theme, e.g. via the display/theme store) and delete the local map and function.

### M34. Single-node mode routes storyline operations to a fake storyline and the previously read storyline

Location: `src/components/StorylineReader.vue:273`. Category: correctness. Verifier confidence: high. Phase: P1.

In single-node mode `storyline.value` is built as `{ id: node.id, title: node.title } as typeof storyline.value` and App.vue passes `:storyline-id="readerStorylineId || lastReadStorylineId || ''"`. The TOC `StorylineNodeList` remains mounted (`showToc` is persisted), so `handleNodeAdd/Create/Remove/Reorder` call `storylineService.addNode(node.id, ...)` with a node id as the storyline id, then `nodes.value = await store.getStorylineNodes(props.storylineId)` replaces the single node with the last-read storyline's nodes. `useScrollPositionMemory` also saves the single-node scroll under `lastReadStorylineId`. The `as` cast hides that `Storyline` fields are missing.

Fix: Model single-node mode explicitly (e.g. a `readingSingleNode` computed) and disable the node-list mutation handlers, the storyline refetch and the scroll memory in that mode; avoid the cast.

### M35. Anchor node's rendered HTML is stale after a comment is anchored into it

Location: `src/components/StorylineReader.vue:337`. Category: correctness. Verifier confidence: high. Phase: P7.

handleCommentCreate rewrites the anchor node's content (`store.updateNodeContent(anchorNode.id, anchorCommentInText(...))`), refetches `nodes`, and calls `renderNodeContent(node)` only for the new comment node. The `watch(nodes)` renderer then calls `renderAllNodes`, which skips every id already in the cache (`pending = nodes.filter(n => !renderedContent.value.has(n.id))`). The anchor node's cached HTML therefore still lacks the inserted `[[anchor]]` wikilink; the section shows old content until `fullWidth` toggles (the only other caller of `clearCache`). Verified: `clearCache` is called nowhere else in src.

Fix: After `updateNodeContent` on the anchor node, re-render it explicitly (`renderNodeContent(updatedAnchorNode)` using the refetched node object), or invalidate its cache entry before the refetch triggers the watcher.

### M36. Reference keys diverge from DOM wikilink indexes when anchors expand

Location: `src/components/StorylineReferencesSidebar.vue:140`. Category: correctness. Verifier confidence: high. Phase: P7.

References are keyed `${nodeIdx}-${i}-${target}` where `i` is the ordinal from `matchWikilinks(node.markdown_content)`; positions are keyed by the ordinal of `a.wikilink` in the rendered section. In full-width mode `MarkdownRenderService` renders an anchored wikilink as `<span class="anchored-node">` (no `a.wikilink`) whose body contains the anchored node's own `a.wikilink`s, so ordinals shift and cards get another link's position or fall back to `0`. The renderer also strips frontmatter before matching while `matchWikilinks` runs on raw content.

Fix: Key positions by the link's `data-target` plus an occurrence counter per target within the section, or emit a stable `data-link-index` from the renderer and match on it.

### M37. Mount-time config load triggers the apiKey watcher, validating and toasting on every open of the AI tab

Location: `src/components/settings/LLMSettingsPanel.vue:313`. Category: correctness. Verifier confidence: high. Phase: P8.

`providerConfigs` starts as `{}` so the `apiKey` computed is `''` at setup. `onMounted` then calls `loadStoredConfigs()`, which replaces `providerConfigs.value` and changes `apiKey` from `''` to the stored key. That fires `watch(apiKey, ...)` (line 308), which after 800 ms runs `validateApiKey()`, which calls `provider.isAvailable()`/`listModels()` and emits `notifications$.success(t('llm.connected', ...))` (line 256) or `notifications$.error(...)`. The same mount also fires `watch(baseUrl, ...)` (line 302) when a stored base URL differs from the built-in default, so `fetchModels()` runs twice (once from `onMounted`, once debounced), and `watch([maxTokens, contextWindow, timeout, selectedModel], saveProviderConfig)` (line 295) rewrites storage although nothing changed. The panel is `v-if`-mounted in SettingsModal (line 186), so this repeats each time the tab is shown. The component's own comments describe the watchers as reacting to user edits; none of these effects are intended on open. Not covered by any test (no test mounts LLMSettingsPanel).

Fix: Populate `providerConfigs` synchronously at setup (`ref(llmStorage.getProviderConfigs())`) instead of in `onMounted`, or register the `apiKey`/`baseUrl`/save watchers after the stored config is loaded (e.g. call `loadStoredConfigs()` before declaring the watchers, or guard them with a `hydrated` flag). Add a test that mounts the panel with a stored key and asserts no notification is emitted and `fetchModels` runs once.

### M38. importZoteroItems forks useZotero.importItemsToCanvas line for line

Location: `src/components/settings/ZoteroSettingsPanel.vue:131`. Category: design. Verifier confidence: high. Phase: P5.

`importZoteroItems` (lines 131-185) repeats the grid layout (`startX = 100`, `startY = 100`, `nodeWidth = 300`, `nodeHeight = 200`, `cols = Math.ceil(Math.sqrt(items.length))`, `padding = 40`), the per-item progress object, the `node_type: 'citation'` createNode call, and the swallow-and-continue error handling of `importItemsToCanvas` in `src/composables/useZotero.ts` lines 228-285. The only differences are the item type (`ZoteroApiItem` vs `ZoteroItem`) and which formatter is called; `formatCloudItemAsMarkdown` (line 108) is likewise a field-mapping twin of `useZotero.formatItemAsMarkdown` (line 204). Two copies of the layout constants and progress semantics will drift (they already differ: the composable logs a `console.error` per failed node, the panel's `catch {}` at line 175 is fully silent).

Fix: Move the layout/progress loop into the composable (or `src/lib`) parameterised by an item-to-`CitationData` mapper, and have both the local and the cloud import call it. Route cloud items through the same `importProgress` ref so the two progress bars share one source.

### M39. Stub nodes created by fetchPapersForNode are not typed citation-stub, unlike buildCitationGraph

Location: `src/composables/useCitationGraph.ts:247`. Category: consistency. Verifier confidence: high. Phase: P5.

`buildCitationGraph` creates stubs with `node_type: 'citation-stub'` (line 476) and later excludes such nodes from processing (`n.node_type !== 'citation-stub'`, line 385) so a stub is never itself expanded. `fetchPapersForNode` creates stubs from the same reference data but omits `node_type` (lines 247-255 and 300-308), and also uses different dimensions (320x220 vs 250x150). Stubs produced through the context-menu fetch path therefore look like real papers to `buildCitationGraph`: the next 'Build citation graph' run in settings fetches Semantic Scholar data for each of them and creates further stubs around them, which the exclusion filter was written to prevent.

Fix: Create stubs with `node_type: 'citation-stub'` in both paths and share one `createStubNode` helper (title, content, size, type) so the two paths cannot diverge again.

### M40. handleFileChange runs unawaited and its Created/move branch has an unguarded invoke

Location: `src/composables/useFileSync.ts:149`. Category: correctness. Verifier confidence: high. Phase: P2.

The listener at line 147-150 calls `handleFileChange(event)` and drops the promise. Inside, the external-move branch does `await invoke('update_node_file_path', ...)` (line 209) outside any try/catch, so an IPC failure becomes an unhandled promise rejection and the frame reassignment at line 213 is skipped, leaving the in-memory path updated but the database and frame stale. Other branches wrap their invokes.

Fix: Wrap the move-branch write in try/catch with storeLogger.error, and attach `.catch` (or `void` with an inner catch) to the listener call.

### M41. Edit-lock composable is unreachable from the UI; canvas edits never take a file lock

Location: `src/composables/useNodeEditLocking.ts`. Category: dead-code. Verifier confidence: high. Phase: P2.

The store binds `isNodeEditable`, `startEditing`, `stopEditing`, `hasEditLock` (src/stores/nodes.ts:601-603) but no component calls any of them: grep for `store.startEditing`, `isNodeEditable`, `hasEditLock` across src/*.vue and src/*.ts finds only the composable and the store. The one place that does lock, StorylineReader.vue:104/127, bypasses the composable and calls `acquireEditLock`/`releaseEditLock` from lib/tauri directly. The main edit path (canvas card editing) therefore acquires no exclusive lock and the 'locked by another application' notification this composable implements can never appear, which leaves the file-locking rule (exclusive on write, graceful failure with notification) without a UI path. There is no test for the composable.

Fix: Either wire `startEditing`/`stopEditing` into the canvas editor start/stop (and have StorylineReader use the same composable), or delete the composable and the store exports. Add a test for whichever is chosen.

### M42. handleScroll indexes `.node-section` elements but writes into the node-array index

Location: `src/composables/useStorylineNavigation.ts:74`. Category: correctness. Verifier confidence: high. Phase: P7.

`handleScroll` computes `closestIndex` over `contentRef.querySelectorAll('.node-section')`, which matches only `<article class="node-section">`; comment nodes render as `<aside class="comment-callout">` and are excluded. The result is assigned to `activeNodeIndex`, which indexes `nodes` including comments. StorylineReader wires this on every scroll (`handleScroll` → `baseHandleScroll()`), while `useScrollObserver` (selector `[data-node-index]`) writes a different, correct value into the same ref on intersection changes. With comments present the page indicator, progress bar, entity sidebar and TOC highlight jump between two values while scrolling.

Fix: Drop the getBoundingClientRect-based tracker in favour of the IntersectionObserver (the observer composable's header says it replaces it), or query `[data-node-index]` and read the attribute instead of the loop index.

### M43. Panel-side comment creation drops the comment type and the meta header the reader writes

Location: `src/composables/useStorylineOperations.ts:60`. Category: consistency. Verifier confidence: high. Phase: P1.

`StorylineNodeList` emits `create-comment(index, text, commentType)`. The composable's `handleCommentCreate(index: number, text: string)` ignores the third argument and stores raw `text`, so a comment created from the storyline panel has no `<!--comment-meta-->` header and renders as a plain `note` in the reader, and is not anchored. StorylineReader.vue reimplements the same five handlers (lines 299-377) with `createCommentContent`, `commentAnchorTitle`, `anchorCommentInText` and a `commentType` parameter, so the two code paths behave differently for the same gesture.

Fix: Move the comment-meta wrapping and anchoring into `useStorylineOperations` (accepting `commentType`), and have StorylineReader consume the composable with an `onChanged` callback for its local refetch/render instead of duplicating the handlers.

### M44. getOrCreateTagNode reuses a tag node from another workspace

Location: `src/composables/useTagNodes.ts:37`. Category: correctness. Verifier confidence: high. Phase: P1.

`deps.getNodes()` returns every node in the store, and the lookup filters only by `node_type === 'tag'` and title. A note in workspace B that uses #foo therefore gets an edge to workspace A's '#foo' node. filteredEdges/graphEdges (state.ts:101-103, 126-128) drop edges whose endpoints are not both in the current workspace, so the tag is invisible in B and no tag node is ever created there. tagNodeRepair.ts:45-46 states that 'the same tag in two workspaces is two different nodes by design', which this lookup violates.

Fix: Restrict the search to nodes whose workspace_id matches deps.getCurrentWorkspaceId() (treating 'default' and null as equal), and add a two-workspace test.

### M45. item_count is hard-coded to 0 but rendered as the collection's item count

Location: `src/composables/useZotero.ts:122`. Category: correctness. Verifier confidence: high. Phase: P8.

`loadCollections` maps every collection with `item_count: 0, // Web API doesn't return item count directly`, and ZoteroSettingsPanel.vue:312 renders `{{ collection.item_count }} {{ t('settings.zotero.items') }}`. Every collection therefore reads '0 items' in the UI regardless of its real size, which misrepresents the data to the user.

Fix: Either request the count (Zotero's collections endpoint returns `meta.numItems`; map it) or drop the field and the UI label rather than displaying a fabricated value.

### M46. Multi-line highlight keys are written into frontmatter but never read back, so re-imports duplicate them

Location: `src/lib/pdfHighlights.ts:32`. Category: correctness. Verifier confidence: high. Phase: P1.

`highlightKey` embeds up to 120 chars of `annotation.content` verbatim, newlines included, and `highlightNodeContent` writes that key through `upsertFrontmatterField` as a single scalar line. `highlightNodeContent` itself splits the passage on `\n`, so multi-line passages are expected. For `content: 'first line\nsecond line'` the frontmatter becomes `source_highlight: paper.pdf#p3:first line\nsecond line`, which is no longer valid YAML, and `importedHighlightKeys` (`^source_highlight: (.+)$` with the `m` flag) reads back only the first line. Reproduced with a temporary vitest: `importedHighlightKeys([{ markdown_content: highlightNodeContent(...) }]).has(highlightKey(...))` is false, so `alreadyImported` is always false for such highlights. The existing pdf-highlights.test.ts only uses single-line text.

Fix: Normalise whitespace in the key (`.replace(/\s+/g, ' ')`) before slicing, or hash the text, so the key is always a single YAML scalar line. Add a round-trip test with a multi-line passage.

### M47. relativeFolder matches a sibling directory that shares the vault path as a prefix

Location: `src/lib/vaultPaths.ts:23`. Category: correctness. Verifier confidence: high. Phase: P2.

`if (!normalizedFile.startsWith(normalizedVault)) return ''` tests a bare string prefix, not a path prefix. A file in `/home/u/vault2/sub/x.md` with vault `/home/u/vault` passes the check; `slice(normalizedVault.length + 1)` then yields `/sub/x.md` and the function returns `"/sub"` (verified with node). A sibling folder outside the vault is reported as a folder inside it, with a leading slash the callers (useFileSync.ts:88, useImport.ts:191) do not expect. There is no test file for vaultPaths.

Fix: Compare against `normalizedVault + '/'` (and treat `normalizedFile === normalizedVault` as root), then slice the prefix length. Add a unit test for the sibling-prefix case and a leading-slash assertion.

### M48. Library module imports its interface from a consumer composable

Location: `src/llm/batchClassifier.ts:8`. Category: design. Verifier confidence: high. Phase: P3.

```ts
import type { LLMQueueInterface } from '../canvas/composables/agent/useLLMTools'
```
src/llm is the shared layer; src/canvas/composables/agent is a consumer of it. The one-method interface (`generate(prompt, system?, priority?)`) is defined in the consumer and imported back into the library, inverting the dependency and coupling batchClassifier to a canvas file. Also `batchClassifyForConnect` (line 240) splits group names on whitespace (`groups.split(/[,\s]+/)`), so 'machine learning, statistics' becomes three categories, and `batchClassifyForMove` (line 222-224) silently substitutes `['left', 'right']` when extraction yields fewer than two categories, classifying nodes against invented labels without telling the caller.

Fix: Define `LLMQueueInterface` in src/llm (e.g. queue.ts or types.ts) and import it from there in both places; split groups on commas only; surface the fallback (return empty map or throw) instead of inventing categories.

### M49. Regex-based natural-language intent detection violates the agent rule

Location: `src/llm/promptEnhancer.ts:44`. Category: design. Verifier confidence: high. Phase: P3.

`GRAPH_TYPE_PATTERNS`, `DOMAIN_PATTERNS`, the `centralTopic` regexes (lines 190-194) and `shouldEnhancePrompt` (lines 229-248) classify the user's free-text prompt with regular expressions, and useAgentRunner.ts:218-221 runs them on every request. The project rule in .claude/CLAUDE.md is 'No regex for natural language. Use LLM to extract semantic meaning from user instructions.' The patterns are also unanchored substrings (`/cell/i` matches 'excellent', `/body/i` matches 'everybody', `/class/i` matches 'classic', `/role/i` matches 'controller'), so the domain label is frequently wrong. In addition, `detectIntent` computes `centralTopic` and `keywords` that `enhancePrompt` never uses (it only appends `graphType` and `domain`).

Fix: Either drop the enhancer (the appended two lines add little beyond the system prompt) or replace detection with a short LLM classification call through llmQueue; remove the unused `centralTopic`/`keywords` computation.

### M50. Anthropic generate() always discards the API error message

Location: `src/llm/providers/anthropic.ts:151`. Category: correctness. Verifier confidence: high. Phase: P3.

The `throw new Error(error.error?.message || ...)` sits inside the `try` whose sibling `catch` swallows every exception, so the parsed API message is thrown and immediately replaced by the generic text:
```ts
try {
  const error = JSON.parse(errorText)
  throw new Error(error.error?.message || `Anthropic error: ${response.status}`)
} catch {
  throw new Error(`Anthropic error: ${response.status}`)
}
```
Every failure (invalid key, unknown model, overloaded) surfaces only as `Anthropic error: 4xx`. `chat()` at line 241 handles the same case correctly with `response.json().catch(() => ({}))`, and the two Anthropic tests cover only chat(). Note also that the retry allow-list in retry.ts matches on message text (`rate_limit`, `overloaded`), so dropping the message also suppresses retries for generate().

Fix: Mirror chat(): `const error = await response.json().catch(() => ({})); throw new Error(error.error?.message || `Anthropic error: ${response.status}`)`, and add a test asserting the API message propagates.

### M51. isAvailable re-implements probeProvider inline

Location: `src/llm/providers/openai-compatible.ts:89`. Category: consistency. Verifier confidence: high. Phase: P3.

availability.ts states 'One rule for every provider' and anthropic.ts, openai.ts and ollama.ts all delegate to `probeProvider`. This provider duplicates the same try/ok/text-slice/catch logic by hand (lines 90-111), including the `detail.slice(0, 200)` formatting, so a change to the shared rule (for example the 200-char cap or the reason wording) will silently diverge here.

Fix: Replace the body with `const { available, reason } = await probeProvider(() => httpFetch(...)); this.lastAvailabilityError = reason; return available`, as the sibling providers do.

### M52. create_nodes_batch schema declares array items as strings but the handler expects objects

Location: `src/llm/tools/batchTools.ts:87`. Category: correctness. Verifier confidence: high. Phase: P3.

The schema is `nodes: { type: 'array', items: { type: 'string' }, description: 'Array of {title, content, mode?} objects...' }` while the handler reads `n.title`, `n.content`, `n.mode`. A model that follows the declared element type sends strings; `n.title` is then undefined, every node becomes `Node N` with empty content, and the tool still reports success. The `tool-schema-completeness` gate only checks that an `items` key exists, so a wrong element type passes it.

Fix: Declare `items: { type: 'object', properties: { title: {type:'string'}, content: {type:'string'}, mode: {type:'string', enum:['replace','append']} }, required: ['title'] }` as create_edges_batch already does, and extend the schema test to reject `items: { type: 'string' }` where the handler indexes object fields.

### M53. Second, unreachable implementations of for_each_node / create_plan / request_approval / research live in useLLMTools

Location: `src/llm/tools/batchTools.ts:174`. Category: consistency. Verifier confidence: high. Phase: P3.

GraphCanvas.executeAgentTool (src/canvas/GraphCanvas.vue:1278-1298) runs the registry first and only falls through to `llmTools.executeLLMTool` when the registry returns `__UNHANDLED__:<name>`. `for_each_node` (this file), `create_plan`, `request_approval` and `research` (agentTools.ts) return real results or markers, never `__UNHANDLED__`, so the `case 'for_each_node'` (useLLMTools.ts:209), `case 'create_plan'` (:438), `case 'request_approval'` (:460) and `case 'research'` (:474) branches can never execute from the canvas. The two `for_each_node` implementations also diverge: the registry one filters by title only and supports a fixed set of `{n^2}`/`{n+1}` substitutions, the dead one also searches content and evaluates arbitrary `{expr}` via `evalMathExpr`. The `agent-tool-dispatch` test only asserts the UNHANDLED contract for smart_move/smart_connect/web_search, so this drift is not gated.

Fix: Delete the unreachable cases from useLLMTools (or, if the useLLMTools behaviour is the intended one, make the registry handler return `__UNHANDLED__` like smartTools does). Extend agent-tool-dispatch.test.ts to assert that no tool has both a real registry result and a useLLMTools case.

### M54. color_matching decides literal vs semantic with regex heuristics on natural language

Location: `src/llm/tools/handlers/colorHandlers.ts:111`. Category: design. Verifier confidence: high. Phase: P3.

```
const isLiteralPattern =
  criterion.includes('...') || criterion.includes('"') || criterion.includes("'") ||
  /^[A-Z][a-z]/.test(criterion) || / of\b/.test(criterion) || / and\b/.test(criterion)
```
The project rule is no regex for natural-language instructions. This classifier turns `Person` (capitalised) into a substring search and `people and organizations` into a literal match for that exact phrase, while `person` goes to the LLM. src/__tests__/llm-color-tools.test.ts locks this heuristic in rather than guarding a documented contract.

Fix: Either split the surface (color_regex already covers literal matching; make color_matching purely semantic) or have the model state the intent through an explicit `match: 'literal' | 'semantic'` parameter, then update the tests accordingly.

### M55. pop_task / peek_stack render task.context as "[object Object]"

Location: `src/llm/tools/handlers/memoryHandlers.ts:160`. Category: correctness. Verifier confidence: high. Phase: P3.

`StackTask.context` is typed `Record<string, unknown>` (src/llm/types.ts:120) and `pushTaskHandler` goes out of its way (lines 110-134) to store it as an object. `popTaskHandler` and `peekStackHandler` then interpolate it directly: `${task.context ? `\nContext: ${task.context}` : ''}` (lines 160 and 175). A plain object in a template literal stringifies to `[object Object]`, so the context the model attached is never returned to it. No test exercises pop/peek (grep for popTaskHandler/peekStackHandler in src/__tests__ finds nothing).

Fix: Serialize with `JSON.stringify(task.context)` in both handlers and add a test that pushes a task with context and asserts the popped/peeked text contains the context fields.

### M56. build_knowledge_base reports only the last phase's findings; `totalResearchResult` is not a total

Location: `src/llm/tools/knowledgeBaseTools.ts:195`. Category: correctness. Verifier confidence: high. Phase: P3.

`totalResearchResult = result` is reassigned on every phase, so when all phases complete the `__KB_BUILD_COMPLETE__` payload (lines 243-245) carries only the concepts, findings and follow-ups of the final phase (typically `connections`, the smallest one). Findings from timeline/events/people/concepts are discarded before the agent ever creates nodes from them. The variable name promises an aggregate the code does not build.

Fix: Accumulate `findings`, `concepts` and `suggestedFollowUps` across phases (dedupe by claim/concept) and rename the accumulator, or emit a per-phase marker so each phase's findings reach the agent.

### M57. batch_update schema puts `items` as a sibling parameter instead of inside `updates`

Location: `src/llm/tools/updateTools.ts:104`. Category: correctness. Verifier confidence: high. Phase: P3.

```
properties: {
  updates: { type: 'array', description: '[{title: ..., set_title?: ..., ...}]' },
  items: { type: 'string' },
},
```
The `items` key sits next to `updates`, so the model is shown a bogus top-level parameter named `items` of type string and `updates` has no element schema at all. It passes the schema-completeness test only because the word `items` appears within six lines of `type: 'array'`.

Fix: Move `items` inside `updates` and describe the element as an object with `title` (required), `set_title`, `set_content`, `x`, `y`.

### M58. model/contextLength computeds have no reactive dependency and never update

Location: `src/llm/useLLM.ts:46`. Category: correctness. Verifier confidence: high. Phase: P3.

```ts
// Read the provider config live: a one-shot snapshot would go stale when
// the user changes model or provider in settings mid-session
const model = computed(() => (getProviderConfig().model as string) || 'llama3.2')
const contextLength = computed(() => (getProviderConfig().contextLength as number) || 4096)
```
`providerRegistry` and the provider instances are plain objects, so the computed getter tracks nothing, evaluates once on first `.value` access and is cached for the lifetime of the composable. It is exactly the one-shot snapshot the comment says it avoids. GraphCanvas.vue destructures these as `ollamaModel`/`ollamaContextLength` and passes them to useAgentRunner, which uses `ctx.contextLength.value` for the token pre-flight (useAgentRunner.ts:177) and `ctx.model.value` for the run log; the `nodus-llm-config-change` listener in GraphCanvas only calls `refreshLLMConfigured()` and does not touch these. Changing model or context window in settings mid-session leaves the pre-flight check computing against the old limit.

Fix: Hold a reactive `configVersion` ref bumped by the `nodus-llm-config-change` handler (or make the registry expose reactive active config) and read it inside the computed, or replace the computeds with plain functions and call them at use sites.

### M59. Overlap resolution pushes frames without moving their nodes

Location: `src/mcp/handlers/frameHandlers.ts:88`. Category: correctness. Verifier confidence: high. Phase: P4.

Both `fitFrameToNodesAndResolveOverlaps` (line 87-88) and `handleResolveFrameOverlaps` (line 499-500) relocate a frame with:

```ts
const newX = updatedFrame.canvas_x + updatedFrame.width + 20
await store.updateFramePosition(otherFrame.id, newX, otherFrame.canvas_y)
```

`updateFramePosition` (src/stores/frames.ts:146) changes only the frame's own coordinates. The nodes assigned to the pushed frame keep their absolute positions and end up outside it. The sibling `handleBatchMoveFrames` (lines 364-371) explicitly moves every assigned node by the same delta, so the module already treats moving nodes with their frame as the handler's responsibility. Every tool that reaches these helpers (`assign_node_to_frame`, `batch_assign_nodes_to_frame`, `fit_frame_to_contents`, `fit_all_frames`, `resolve_frame_overlaps`) can therefore leave a neighbouring frame's nodes stranded, and `fit_all_frames` may then 'fit' that frame around nodes it no longer contains.

Fix: Extract a shared `moveFrameWithNodes(store, frameId, x, y)` helper (the body of the per-frame loop in `handleBatchMoveFrames`) and use it in both overlap-resolution paths.

### M60. get_graph_structure keys its result by title, so duplicate titles overwrite each other

Location: `src/mcp/handlers/nodeHandlers.ts:301`. Category: correctness. Verifier confidence: high. Phase: P4.

```ts
result[node.title] = { title: node.title, connections: connectionTitles }
```

Nodes are keyed by `title` in a plain object; two nodes with the same title collapse into one entry and the first is silently lost. The tool description in tools.ts:93 promises `{nodeId: {title, connections}}`, and `create_node` explicitly allows and warns about duplicate titles (line 525-528), so the collision is a supported state. Storing `title` inside the value is also redundant when the key is already the title, which suggests the key was meant to be the id.

Fix: Key by `node.id` as the description states (`result[node.id] = { title, connections }`), and update the docs test if one asserts the current shape.

### M61. Scoped store leaves frame creation and all storyline operations bound to the open workspace

Location: `src/mcp/messageHandler.ts:216`. Category: correctness. Verifier confidence: high. Phase: P4.

`scopedStoreFor` overrides node/edge/frame getters and node/edge writers, but spreads the rest of the app store unchanged:

```ts
return {
  ...store,
  getFilteredNodes: nodesInScope,
  getFilteredEdges: () => edges,
  getFilteredFrames: framesInScope,
  getNode: ..., getFrame: ...,
  createNode: data => store.createNode({ ...data, workspace_id: ... }),
  createEdge: data => store.createEdgeRaw(data),
  deleteEdge: id => store.deleteEdgeRaw(id),
}
```

`createFrame` is not overridden. App.vue wires it to `store.createFrame`, which (src/stores/nodes/frames.ts:12-24) takes the workspace from `workspaceStore.currentWorkspaceId` - so after `set_workspace`, `create_frame` lands in whichever workspace the user has open, not the scoped one. `getFilteredStorylines`, `getStoryline`, `getStorylineNodes`, `createStoryline`, `updateStoryline`, `deleteStoryline`, `addNodeToStoryline`, `removeNodeFromStoryline`, `reorderStorylineNodes` are likewise all bound to `storylinesStore.filteredStorylines` (the open workspace), so `list_storylines`/`get_storyline` in a scoped connection return the wrong workspace's storylines and `create_storyline` writes to the wrong one. This contradicts the `set_workspace` tool description ('All further reads and writes target that workspace') and the comment in this very function about lookups deriving from scoped collections. `src/__tests__/mcp-workspace-scope.test.ts` has no frame-creation or storyline case, so the gap is untested.

Fix: Extend `McpStoreInterface` with workspace-aware raw variants (e.g. `createFrameRaw(data & {workspace_id})`, `getAllStorylines()`, storyline write functions that take a workspace id) and override them in `scopedStoreFor`, mirroring what was done for edges. Add scope tests for `create_frame`, `list_storylines`, `create_storyline` that fail on the current code.

### M62. batch_update_nodes, get_duplicate_edges and cleanup_duplicate_edges are routed but exposed by no interface

Location: `src/mcp/messageHandler.ts:395`. Category: dead-code. Verifier confidence: high. Phase: P4.

`dispatchRequest` routes `batch_update_nodes` (line 395), `get_duplicate_edges` (line 463) and `cleanup_duplicate_edges` (line 466) to `handleBatchUpdateNodes` (nodeHandlers.ts:592), `handleGetDuplicateEdges` (edgeHandlers.ts:176) and `handleCleanupDuplicateEdges` (edgeHandlers.ts:222). None of the three names appears in `NODUS_TOOLS` (packages/nodus-mcp-server/src/tools.ts), in `src/llm/tools`, or anywhere else in the tree except docs/REVIEW.md; a grep over src, packages and src-tauri confirms this. They are reachable only by hand-crafted JSON-RPC. The tool-surface-parity gate compares MCP tool names to agent tool names and never checks the router, so it cannot catch this. The two duplicate-edge handlers also duplicate their grouping loop verbatim, and the comment at edgeHandlers.ts:190 ('sorted to treat A->B and B->A as same') describes a normalisation the key does not perform.

Fix: Either add the three tools to `NODUS_TOOLS` (and fix the key comment / share the grouping helper), or delete the handlers and router cases. Add a gate test that diffs the router's `case` labels against `NODUS_TOOLS` names so the two cannot drift again.

### M63. Queued mermaid render replays the wrong container on the no-elements path

Location: `src/services/MarkdownRenderService.ts:260`. Category: correctness. Verifier confidence: high. Phase: P5.

The fix described at lines 243-247 remembers `mermaidQueuedContainer` so a queued request renders the caller's view. But the early-return branch at lines 260-267 ignores it:
```
if (elements.length === 0) {
  mermaidRenderPending = false
  if (mermaidRenderQueued) {
    mermaidRenderQueued = false
    setTimeout(() => renderPendingMermaid(container), 50)
  }
```
It replays with the in-flight `container` (which has no diagrams, by construction) and never clears `mermaidQueuedContainer`, so the queued view's diagrams stay pending. The mermaid load-failure branch (lines 278-282) likewise resets `mermaidRenderPending` without draining the queue. mermaid-render.test.ts covers the cache-hit case only.

Fix: Factor a single `drainQueue()` that reads and clears `mermaidQueuedContainer` and call it from all three exit paths; add a test that queues a call with a different container while the first call finds no elements.

### M64. Failed create_node / create_edge fabricate a local entity that will vanish on reload / createNode fabricates an unpersisted node on backend failure with no user notification

Location: `src/stores/nodes/crud.ts:543`. Category: correctness. Verifier confidence: high. Phase: P1.

crud.ts createNode (lines 543-570) and edges.ts createEdge (lines 115-132) catch any backend error and push a locally generated Node/Edge marked 'Fallback for development'. In the Tauri build a genuine failure (unique-constraint violation, locked DB, invalid workspace FK) therefore shows a node or edge that was never stored; it disappears on the next load and every edge or storyline link made to it is orphaned. `isTauri()` is available (wikilinkSync.ts uses it for exactly this distinction) but is not consulted.

Second report of the same location: On any `create_node` failure the catch block logs to console and returns a locally generated Node (`id: generateShortId()`, comment 'Fallback for development'). This runs in production too: the user sees a node that vanishes on restart, and callers such as useTagNodes.getOrCreateTagNode and importCitations proceed to create edges to an id the backend does not know, which then fail. deleteNodes (line 606-612) already follows the opposite, documented policy of not pretending.

Fix: Only fall back when `!isTauri()`; in Tauri mode rethrow so callers (agent tools, MCP, UI) report the error, and notify the user. Rethrow (or return a rejected promise) and notify via notifications$.error; if a browser-only dev mode is needed, gate the fallback on `!isTauri()` explicitly.

### M65. deleteNode swallows a backend failure and removes the node from the view anyway

Location: `src/stores/nodes/crud.ts:576`. Category: correctness. Verifier confidence: high. Phase: P1.

```
try { await invoke('delete_node', { id }) } catch (e) { console.error(...) }
state.nodes.value = state.nodes.value.filter(n => n.id !== id)
```
`deleteNodes` directly below (lines 603-612) was explicitly changed to remove only what the backend deleted and to throw otherwise, because 'clearing the view on a failure hid nodes that are still in the database, and they returned on the next load'. The single-node path still has that bug, and it is the path used by the Delete key (App.vue handleDelete), the file-sync `removeNode` callback and tag-node cleanup.

Fix: Mirror deleteNodes: rethrow on failure (or return a boolean) and only prune local state after the backend confirms; surface the failure via notifications$ like the vault-write path does.

### M66. deleteNode removes the node from the view even when the backend delete failed

Location: `src/stores/nodes/crud.ts:581`. Category: consistency. Verifier confidence: high. Phase: P1.

`try { await invoke('delete_node', { id }) } catch (e) { console.error(...) }` then unconditionally filters the node out of `state.nodes`. deleteNodes in the same file (lines 603-615) documents and implements the opposite: 'Remove from the view only what the backend deleted ... they returned on the next load (PRODUCT_DESIGN.md > Deleting nodes with files)'. Single deletes (including tag-node cleanup via removeTagEdges in nodes.ts:275) still exhibit the bug the batch path was fixed for.

Fix: Rethrow on failure (as deleteNodes does) or route deleteNode through deleteNodes([id]).

### M67. Wikilink removal on edge delete writes content around the store's content path

Location: `src/stores/nodes/edges.ts:46`. Category: correctness. Verifier confidence: high. Phase: P1.

deleteEdge rewrites the source node's markdown via a raw `invoke('update_node_content')`. This bypasses `recordContentBefore` (so the text change is not undoable, contrary to undoRecorder.ts 'every write passes through the store'), discards the returned checksum (`node.checksum` goes stale, so the file write the backend performs triggers a watcher reload of the same file), and skips tag re-planning. The comment 'without triggering edge sync (would cause infinite loop)' does not justify skipping undo and checksum handling.

Fix: Call the store's updateNodeContent with a flag that suppresses only the wikilink sync, or at minimum record the undo entry and store the returned checksum.

## Low severity (confirmed after downgrade)

### L1. File exceeds the 1000-line limit

Location: `packages/nodus-mcp-server/src/tools.ts`. Category: design. Verifier confidence: high. Phase: P10.

`wc -l` reports 1046 lines. The project rule is that no source file may exceed 1000 lines.

Fix: Split the tool declarations by domain (node, edge, frame, storyline, workspace/canvas) into separate modules and concatenate them into `NODUS_TOOLS`; the parity test's regex scan of this file will then need to read all parts.

### L2. delete_node soft-deletes the row when the node lookup fails, leaving the file in the vault

Location: `src-tauri/src/commands/deletion.rs:17`. Category: correctness. Verifier confidence: high. Phase: P1.

`if let Ok(Some(node)) = database::nodes::get_by_id(pool, &id).await` treats a database error the same as a missing node: the file is not moved and `soft_delete` proceeds. The module header states "A node is deleted only once its file has moved: leaving the file in the vault lets the watcher read it back, and the node returns", and `delete_nodes` enforces this by refusing to delete nodes whose move failed. The single-delete path therefore has the exact silent-return behaviour the design excludes.

Fix: Propagate the lookup error (`.map_err(|e| e.to_string())?`) and only skip the move when the node genuinely has no `file_path`.

### L3. get_deleted_nodes and restore_nodes_with_files have no caller

Location: `src-tauri/src/commands/deletion.rs:104`. Category: dead-code. Verifier confidence: high. Phase: P9.

Both commands are registered in `src-tauri/src/main.rs` (lines 292-293) but no `invoke('get_deleted_nodes')`, `invoke('restore_nodes_with_files')` or camelCase wrapper exists anywhere in `src/`, `packages/nodus-mcp-server/src` or `src-tauri/tests`. `restore_if_file_exists` is already reached through `sync_missing_files` (vault_watcher.rs:81). The project rule counts a command no interface exposes as dead code; docs/REVIEW.md:1810 already recorded this and it has not been acted on.

Fix: Remove both commands and their `generate_handler!` entries, or wire a trash/restore UI that uses them in the same change.

### L4. A second acquire_edit_lock for the same node is reported as another application holding the file

Location: `src-tauri/src/commands/file_locks.rs:60`. Category: correctness. Verifier confidence: medium. Phase: P2.

`FileLock::exclusive` opens a new file handle and `try_lock_exclusive`s it. With fs2 (flock on Unix, LockFileEx on Windows) a lock held on one handle conflicts with a second handle in the same process, so while a node's lock is in `LocksState` a further `acquire_edit_lock(node_id)` fails and is mapped to "File is being edited in another application". Two UI surfaces acquire independently for the same node without checking `lockedNodeIds` first (src/composables/useNodeEditLocking.ts:48 and src/components/StorylineReader.vue:104), so opening a note in the reader while it is being edited produces a false external-lock notification.

Fix: Check `locks_state` for an existing entry for `node_id` before locking and return `Ok(())` (idempotent acquire), or reference-count holders so the first release does not unlock a file another surface is still editing.

### L5. get_locked_nodes has no caller

Location: `src-tauri/src/commands/file_locks.rs:87`. Category: dead-code. Verifier confidence: high. Phase: P9.

`get_locked_nodes` is registered in `src-tauri/src/main.rs:349` but there is no `invoke('get_locked_nodes')` or `getLockedNodes` wrapper in `src/`, `packages/nodus-mcp-server/src` or the Rust tests. Lock state on the frontend is tracked separately in `lockedNodeIds` (src/composables/useNodeEditLocking.ts).

Fix: Remove the command and its handler entry, or use it to reconcile `lockedNodeIds` after a reload.

### L6. should_exclude_file is defined twice with different rules

Location: `src-tauri/src/commands/mod.rs:53`. Category: consistency. Verifier confidence: high. Phase: P2.

`commands/mod.rs:53` defines `should_exclude_file` (excludes hidden files plus CLAUDE.md/README.md) and `import_helpers.rs:16` defines a private `should_exclude_file` (excludes only CLAUDE.md/README.md). The import walker relies on `is_visible_vault_entry` for dot-files, the watcher/vault_watcher uses the mod.rs version. Two copies of the exclusion rule have already diverged and will keep drifting.

Fix: Keep one definition (in `import_helpers`, which already owns vault-walk rules) and import it from `commands/vault_watcher.rs`; make the hidden-file rule explicit in that single place.

### L7. create_node_from_file fails after insert on wikilink sync error, unlike create_node_impl

Location: `src-tauri/src/commands/nodes.rs:212`. Category: consistency. Verifier confidence: high. Phase: P2.

`create_node_impl` (lines 80-91) deliberately logs and continues when `sync_wikilinks_for_node` fails, with the comment that the node is already inserted and an error would make the frontend create a duplicate. `create_node_from_file` performs the same sequence but uses `super::wikilinks::sync_wikilinks_for_node(pool, &node_id, &links).await?;` so a wikilink failure returns an error after the row exists; the caller in `useFileSync.ts` then sees a failure for a file that now has a node, and a retry hits `Node already exists for this file`. In the same block, `create_node_impl` line 91 silently discards the `merge_bidirectional_wikilinks` error with `let _ =` while the preceding call is logged.

Fix: Apply the same log-and-continue handling in `create_node_from_file`, and log the merge error in `create_node_impl` instead of discarding it.

### L8. create_file_for_node is registered but has no caller

Location: `src-tauri/src/commands/nodes.rs:226`. Category: dead-code. Verifier confidence: high. Phase: P9.

`create_file_for_node` is listed in `main.rs:326` `generate_handler!` but no `invoke('create_file_for_node')` exists in `src/` or `packages/` (grep over *.ts/*.vue). `docs/REVIEW.md` L27 already recorded the TypeScript wrapper `createFileForNode` as unreachable; the wrapper has since been removed but the Rust command remains. The command also duplicates the title-sanitizing and file-creation logic of `export_nodes_to_files` while diverging from it: it has no `file_path.exists()` guard, so `std::fs::write(&file_path, ...)` at line 272 would silently overwrite another node's file with the same title, and an empty title yields the hidden filename `.md`.

Fix: Delete `create_file_for_node` and its registration in `main.rs`. If a per-node export is wanted later, implement it on top of the shared path used by `export_nodes_to_files`, with the exists check.

### L9. folder_file_counts is populated and never read

Location: `src-tauri/src/commands/vault_watcher.rs:369`. Category: dead-code. Verifier confidence: high. Phase: P2.

`let mut folder_file_counts: HashMap<String, usize> = HashMap::new();` (line 369) is filled at line 382 from `folder_counts` and then never used again; grep across src-tauri finds no other reference. The loop at 387 iterates `folder_counts` directly.

Fix: Delete lines 368-370 and 380-383.

### L10. Raw SQL for pending_wikilinks and wikilink_synced_hash lives in the commands layer with errors discarded

Location: `src-tauri/src/commands/wikilinks.rs:31`. Category: consistency. Verifier confidence: high. Phase: P2.

`set_synced_hash`, `resolve_pending_links_to`, `sync_workspace_wikilinks_impl` and `sync_wikilinks_for_node_with_map` issue nine `sqlx::query` calls directly (lines 31, 66, 128, 291, 296). Every other command file goes through `database::nodes`/`database::edges` (the three `sqlx::query` hits in nodes.rs are inside `#[cfg(test)]`). Three of these writes swallow their result with `let _ =` (lines 31, 291, 296): if the `DELETE FROM pending_wikilinks` fails but the inserts succeed, stale pending records accumulate; if `set_synced_hash` fails, the incremental pass silently re-processes the node forever.

Fix: Move the queries into `database::nodes` (e.g. `set_wikilink_synced_hash`, `get_wikilink_synced_hashes`) and a `database::pending_wikilinks` module returning `DatabaseError`, and propagate or log the errors.

### L11. CreateWorkspaceInput.vault_path is never populated: frontend sends camelCase

Location: `src-tauri/src/commands/workspaces.rs:17`. Category: correctness. Verifier confidence: high. Phase: P1.

`CreateWorkspaceInput` has no `#[serde(rename_all = "camelCase")]`, so serde expects `vault_path`. The only caller, `src/stores/workspaces.ts:145-152`, sends `{ id, name, color, vaultPath: null }`. serde ignores the unknown `vaultPath` key and defaults the `Option` to `None`, so the command only appears to work because the frontend currently passes null; any non-null value would be dropped silently. `CreateFrameInput` in frames.rs uses `rename_all = "camelCase"` and the frame store sends camelCase, while `CreateNodeInput`, `CreateEdgeInput` and `CreateStorylineInput` are snake_case and their stores send snake_case; workspaces is the one mismatched pair.

Fix: Either add `#[serde(rename_all = "camelCase")]` to `CreateWorkspaceInput` or change the store to send `vault_path`; add `#[serde(deny_unknown_fields)]` to the input structs so a key mismatch fails loudly rather than silently defaulting.

### L12. frames::update_folder_path and get_by_folder_path_and_workspace have no callers

Location: `src-tauri/src/database/models.rs:728`. Category: dead-code. Verifier confidence: high. Phase: P9.

Both functions (lines 728-770) carry `#[allow(dead_code)]` and a grep over the entire src-tauri/src tree (including commands/vault_watcher.rs, the frame-folder sync code) finds no call site for either. The project rule is to remove code nothing reaches rather than silence the lint.

Fix: Delete both functions and the `#[allow(dead_code)]` attributes; reintroduce them together with the code that uses them when folder-frame sync needs them.

### L13. stop_server returns before the server has stopped; running/port stay stale

Location: `src-tauri/src/mcp_websocket.rs:240`. Category: correctness. Verifier confidence: medium. Phase: P4.

`stop_server` only sends on the shutdown channel and returns `Ok(())`. The flags are cleared later by the accept-loop task after it observes the message:

```rust
_ = shutdown_rx.recv() => { break; }
...
*state_clone.running.write().await = false;
*state_clone.port.write().await = None;
```

So after `await invoke('stop_mcp_server')` resolves, `get_mcp_status` can still report `running: true` with the old port, and a `start_mcp_server` issued immediately afterwards (toggle off/on, restart on settings change) hits `if *state.running.read().await { return Err("Server already running") }` at line 170 and fails although the listener is about to be dropped. The frontend (`useMcpServer.startServer`) then treats the error as 'already running' and re-syncs `isRunning = true` from the stale status, leaving the UI believing a server is up that has just shut down.

Fix: Have `start_server` keep a `JoinHandle` (or a oneshot 'stopped' notifier) in state and make `stop_server` await it after sending shutdown, clearing `running`/`port`/`shutdown_tx` itself before returning. Alternatively perform the flag reset in `stop_server` under one lock and let the task only close sockets.

### L14. FileLock::shared and WatcherError::NotInitialized are unreachable in production and hidden by allow(dead_code)

Location: `src-tauri/src/watcher.rs:36`. Category: dead-code. Verifier confidence: high. Phase: P9.

Grep over `src-tauri/src` shows `FileLock::shared` is called only from `#[cfg(test)]` tests in watcher.rs; every production caller (`commands/file_locks.rs`, `commands/nodes.rs`, `commands/okf.rs`) uses `FileLock::exclusive`. `WatcherError::NotInitialized` is never constructed anywhere. Both are silenced with `#[allow(dead_code)]` (lines 16, 29, 36) instead of being removed or wired. The project's file-locking rule ('shared lock on read, exclusive on write') is therefore not implemented: reads in `commands/mod.rs::read_file_content` take no lock at all, and the only shared-lock code is test-only.

Fix: Either take a shared lock in the read commands (`read_file_content`, `read_file_with_checksum`) so the documented rule holds and drop the allow attributes, or delete `FileLock::shared`, its tests and `NotInitialized`, and update the file-locking documentation to match.

### L15. App.vue is 1273 lines, over the 1000-line project limit

Location: `src/App.vue`. Category: design. Verifier confidence: medium. Phase: P10.

`wc -l src/App.vue` reports 1273 lines (the CSS is already externalised to App.css). The project rule is that no source file exceeds 1000 lines. The script block alone holds the workspace editor (open/save/delete/reset/vault sync/OKF backfill/OKF export), the import dialog, MCP wiring, undo/service composition and the storyline layer state machine.

Fix: Extract the workspace editor dialog (editingWorkspace state plus openWorkspaceEditor/saveWorkspaceChanges/selectVaultFolder/clearVaultPath/syncVaultFiles/surveyWorkspaceBackfill/applyWorkspaceBackfill/exportWorkspaceAsOkf/deleteCurrentWorkspace/confirmDeleteWorkspace/resetDefaultWorkspace and their templates) into a WorkspaceEditorDialog component, and the import dialog into an ImportVaultDialog component. Add a gate test that fails when any src file exceeds 1000 lines.

### L16. createNewWorkspace fires switchWorkspace without awaiting, then clears the canvas underneath it

Location: `src/App.vue:439`. Category: correctness. Verifier confidence: high. Phase: P1.

```
const ws = await store.createWorkspace(...)
store.switchWorkspace(ws.id)
store.clearCanvas()
```
switchWorkspace is async (stops the watcher, reloads all nodes, switches id, reloads edges/frames). It runs concurrently with clearCanvas, which empties nodes and splices edgesStore.edges; the in-flight reload then overwrites both, so clearCanvas is a no-op at best and a flash at worst, and any rejection from switchWorkspace is unhandled. importVault (line 776) awaits the same call.

Fix: `await store.switchWorkspace(ws.id)` and drop the clearCanvas call (switchWorkspace already reloads state; see the comment in nodes/advanced.ts lines 58-63), or move clearCanvas before the await if the intent is a blank canvas during the switch.

### L17. Workspace description field is edited but never saved / saveWorkspaceChanges has no error handling and drops the rename promise

Location: `src/App.vue:467`. Category: correctness. Verifier confidence: high. Phase: P1.

The editor binds `<textarea v-model="editingWorkspace.description">` (line ~1090) and openWorkspaceEditor always seeds `description: ''` (lines 457, 462), but saveWorkspaceChanges never reads it, the workspaces store has no description, and `DbWorkspace` / the Rust workspace model carry no description column (only storylines do). The user types text that is silently discarded on Save.

Second report of the same location: `store.renameWorkspace(...)` (line 470) is async and not awaited; `setWorkspaceVaultPath`, `setWorkspaceSync`, `store.watchVault` and `store.stopWatching` are awaited with no try/catch. A rejection leaves the dialog open, skips the success toast and surfaces only as an unhandled promise rejection from the click handler. Every sibling handler in this file (syncVaultFiles, applyWorkspaceBackfill, exportWorkspaceAsOkf, createNewWorkspace, importVault) wraps its awaits and calls showToast on failure.

Fix: Either remove the description field from the dialog and from the editingWorkspace type, or add the column end to end (Rust model, get_workspaces/rename command, workspaces store, save handler) with a test proving the round trip. Await renameWorkspace, wrap the body in try/catch and report the failure through showToast(String(e), 'error') like the sibling handlers.

### L18. handleDelete re-implements NodeService.deleteNode instead of using the injected service

Location: `src/App.vue:655`. Category: consistency. Verifier confidence: high. Phase: P9.

App.vue constructs a NodeService (line 287) whose docstring says 'All code paths that delete or move nodes should use this service to ensure undo works consistently', yet handleDelete (lines 655-671) hand-rolls the same capture-edges/pushDeletionUndo/deleteNode sequence per node. The only NodeService method called anywhere in src is `deleteNodes` (useMarkerHandlers.ts:342); `deleteNode`, `moveNode` and `moveNodes` have no callers and no tests.

Fix: Replace the loop with `nodeService.deleteNodes([...store.selectedNodeIds])`. Then delete the uncalled NodeService.deleteNode/moveNode/moveNodes methods (or route the drag-end position commits through moveNodes if that was the intent), and add a test for the service.

### L19. File is 2481 lines, 2.5x the 1000-line project limit

Location: `src/canvas/GraphCanvas.vue`. Category: design. Verifier confidence: high. Phase: P10.

The project rule is that no source file exceeds 1000 lines. GraphCanvas.vue is grandfathered in `src/__tests__/file-size-limit.test.ts` (`'src/canvas/GraphCanvas.vue': 2481`) as a ratchet, which stops growth but leaves the rule violated. The script block (~2000 lines) is mostly composable wiring plus several local functions that already have a natural home elsewhere: `fitNodeToContent`/`fitAllNodesToContent`/`fitNodeNow`/`fitSelectedNodes`/`resetAllNodeSizes` (node fitting), `expandFrameToFitNode` (frames), `getNodeHeight`+`COLLAPSED_NODE_HEIGHT` (edge routing), `onCanvasPointerDown` (viewport input), the file-move collision dialog state, and the export dialog state.

Fix: Extract the listed groups into `composables/nodes/useNodeFitting.ts`, `composables/frames/`, `composables/viewport/`, and lower the ratchet number in file-size-limit.test.ts with each extraction.

### L20. useStorylines is handed array snapshots of selectedNodeIds and workspaces

Location: `src/canvas/GraphCanvas.vue:1904`. Category: correctness. Verifier confidence: high. Phase: P6.

`useStorylines({ store: { selectedNodeIds: store.selectedNodeIds, ..., workspaces: store.workspaces } })`. `selectedNodeIds` is a `ref<string[]>` whose array is replaced (not mutated) by `selectNode` (`selectedNodeIds.value = [id]`, state.ts:288), by deletion (crud.ts:588/617) and by the lasso in this very file (`store.selectedNodeIds = ids`, line 548), so the composable's fallback path in `getTargetNodeIds()` (`store.selectedNodeIds.length > 1 && ...includes(...)`) reads a stale array after the first selection. `workspaces` is a ComputedRef value captured at setup; workspaces loaded afterwards are invisible, so `moveNodesToWorkspace` falls back to the literal name 'workspace' in its toast.

Fix: Change the `UseStorylinesContext.store` fields to getters (`getSelectedNodeIds`, `getWorkspaces`) as `useCitationFetch`/`useContextMenu` already do, and pass `() => store.selectedNodeIds` / `() => store.workspaces`.

### L21. Entity section labels are hard-coded English, singularised by slicing, and carry an unused `icon` field

Location: `src/canvas/components/CanvasContextMenu.vue:92`. Category: consistency. Verifier confidence: high. Phase: P8.

```ts
const entityTypeConfig: Record<EntityNodeType, { icon: string; label: string }> = {
  character: { icon: 'user', label: 'Characters' },
  ...
}
```

`icon` is never read anywhere in the template. `label` is shown raw (line 255) and turned into a singular by string surgery on line 280: `New {{ entityTypeConfig[type].label.slice(0, -1) }}...`. Every other user-visible string in this component goes through `t()`, and slicing the last character does not survive translation (or English irregular plurals).

Fix: Drop `icon`; add i18n keys such as `contextMenu.entityTypes.character` (plural section header) and `contextMenu.newEntity.character` (singular create item) and use `t()` for both.

### L22. `currentPlan` is never assigned a plan, so the APPROVED PLAN prompt section can never render

Location: `src/canvas/composables/agent/useAgentRunner.ts:139`. Category: dead-code. Verifier confidence: high. Phase: P3.

`currentPlan` is created (139), reset to null (172), passed to `buildSystemPrompt` (238) and returned (625); nothing in the file or in any caller (grep for `agentRunner.currentPlan`/`runner.currentPlan` finds none) ever sets it to a plan. The approval flow keeps the plan in `planState.currentPlan` instead. Consequently `buildSystemPrompt`'s `if (plan && mode === 'execute')` block in systemPrompt.ts:189-198 is unreachable in production, and the executing agent never sees its approved plan in the system prompt.

Fix: Either wire it (set `currentPlan.value = planState.currentPlan.value` on resume with approval, or have the caller pass planState's plan into AgentContext) so the execute-mode prompt carries the plan, or remove `currentPlan` and the `plan` parameter of buildSystemPrompt.

### L23. Unreachable statements after return

Location: `src/canvas/composables/agent/useAgentRunner.ts:573`. Category: dead-code. Verifier confidence: high. Phase: P3.

Lines 573-575 follow an unconditional `return { status: 'done', ... }` at line 571:
```
return { status: 'done', message: msg.content.slice(0, 200) }

// Prompt to continue
messages.push({ role: 'user', content: 'Use tools only. Call done() when finished.' })
continue
```
They can never execute.

Fix: Delete lines 573-575.

### L24. Switch cases that the dispatcher can never reach

Location: `src/canvas/composables/agent/useLLMTools.ts:209`. Category: dead-code. Verifier confidence: high. Phase: P3.

GraphCanvas.executeAgentTool runs `executeTool` (registry) first, then `markerHandlers.handleMarker`, and only calls `executeLLMTool` when the registry result starts with `__UNHANDLED__:`. The registry has real handlers for `for_each_node` (batchTools.ts:175, never returns __UNHANDLED__) and marker-returning handlers for `create_plan`, `request_approval` and `research` (agentTools.ts), whose markers useMarkerHandlers consumes and returns non-null. So the `case 'for_each_node'`, `case 'create_plan'`, `case 'request_approval'` and `case 'research'` blocks here are unreachable from the only production caller (grep: GraphCanvas.vue:1295 is the sole non-test call). The dead `for_each_node` copy also diverges from the live one (it drops the per-node `results` array it builds, silently swallowing `llm failed` entries, and matches the filter against content while the live one matches title only).

Fix: Delete the four unreachable cases (and the duplicated `for_each_node` logic) so there is one implementation per tool; add a dispatch test asserting each tool name is handled by exactly one layer.

### L25. Third hand-rolled Wikipedia client instead of the shared research module

Location: `src/canvas/composables/agent/useNodeAgent.ts:108`. Category: consistency. Verifier confidence: high. Phase: P3.

`executeWikipediaSearch` + `fetchWithTimeout` re-implement the MediaWiki search and TextExtracts calls that src/llm/research.ts already provides (`fetchWikipediaArticle`, used by useMarkerHandlers), and useMarkerHandlers.ts:141-178 contains a fourth inline copy of the search call. Timeouts (10 s vs 15 s), truncation and URL construction differ between the copies.

Fix: Move Wikipedia search into src/llm/research.ts next to `fetchWikipediaArticle` and call it from both useNodeAgent and useMarkerHandlers.

### L26. Routing cache uses deep-reactive refs written from inside a computed, unlike the sibling memo

Location: `src/canvas/composables/edges/useEdgeRouting.ts:110`. Category: design. Verifier confidence: high. Phase: P6.

`cachedRoutedEdges = ref<Map<...>>` and `lastRoutingKey = ref('')` are read and then assigned inside the `edgeLines` computed (lines 383-398). Writing tracked reactive state from a computed getter is a side effect the Vue docs warn against, and `ref()` around a `Map` wraps it in a deep reactive proxy, so every `routedEdges.get(edge.id)` (line 500) and every `routed.path[i]` access in the label loop goes through collection/object proxies for ~1,000 edges per recompute. The memo introduced right below (lines 131-133) correctly uses plain `let` variables for the same purpose, so the file now has two caching mechanisms with opposite conventions. The `watch` at line 136 only needs to clear the keys, which plain variables also allow.

Fix: Replace both refs with plain module-scope variables (like `memoEdgeLines`/`memoKey`), and reuse the `edgeKey` string for `fullKey` (line 246) instead of joining the edge list twice per recompute.

### L27. Port assignment pipeline is duplicated between the composable and routeAllEdges and can disagree

Location: `src/canvas/composables/edges/useEdgeRouting.ts:336`. Category: design. Verifier confidence: high. Phase: P6.

The composable computes sides, `assignPorts`, and `optimizePortAssignments` itself (lines 336-356) to derive `x1/y1/x2/y2` and label positions, while `routeAllEdges` (routing/index.ts lines 238-241) independently runs `analyzeEdges` + `assignPorts` (without `optimizePortAssignments`) to produce the drawn `svgPath`. Both sorts use `portOrderKey`, but their tie ordering differs: `assignPorts` groups entries in edge-list order (source and target entries interleaved), `optimizePortAssignments` iterates all source assignments first, then targets. When one node side carries both an outgoing and an incoming edge to the same far node (A->B and B->A with different link types, or storyline edges which skip dedup at line 280), the two passes can swap port indices, so the endpoint the composable reports diverges from the path actually drawn by 25 px (PORT_SPACING). `routeAllEdges` already returns `debugInfo.srcOffset/tgtOffset/srcSide/tgtSide` per edge, which the composable ignores. The two pipelines also use different constants (`STANDOFF_DIST = 120` here vs `STANDOFF = 80` in routeAllEdges) and different obstacle rectangles: `nodeRects` (lines 319-325) uses full node dimensions while `nodeMap` (lines 257-270) shrinks tag nodes, so `routeThreeSegment`'s `checkMidClear` (which reads the `nodes` array) sees different obstacles than `findObstacles` (which reads the spatial index built from `nodeMap`).

Fix: Make `routeAllEdges` the single source of port geometry: return the port points (or reuse `debugInfo`) and derive `x1..y2`, hit points and labels from `RoutedEdge.path`; pass `Array.from(nodeMap.values())` as the obstacle list; delete the composable's own assignPorts/optimizePortAssignments run (and update edge-crossing-reduction.test.ts which asserts the string 'optimizePortAssignments' appears in this file).

### L28. Barrel file has no importers anywhere in the tree

Location: `src/canvas/composables/index.ts`. Category: dead-code. Verifier confidence: high. Phase: P9.

`grep` for `canvas/composables'`, `'./composables'`, `'../composables'` (from src/canvas) and `composables/index` across src, tests and config finds nothing. GraphCanvas.vue and every sub-component import from the domain folders directly (`./composables/viewport`, `./composables/nodes`, ...). The 134-line re-export list is unreachable code that also has to be kept in sync by hand with the sub-barrels.

Fix: Delete `src/canvas/composables/index.ts`.

### L29. Nodes with a dangling frame_id are silently excluded from global layout

Location: `src/canvas/composables/layout/useAutoLayout.ts:202`. Category: correctness. Verifier confidence: high. Phase: P6.

In the grouping loop, a node with `frame_id` set is added to `frameNodes` only when `frameMap.has(node.frame_id)`; regardless of that check, `if (!laidOutBySelection) continue` runs (lines 202-209). A node whose frame is not in `getFilteredFrames()` (frame deleted, or filtered out of the current view while the node is not) is therefore neither framed nor pushed to `unframedNodes`, so it is dropped from the run with no warning and stays where it was. `computeRadialLayout` handles the same case differently (it treats any truthy `frame_id` as framed), so the two paths disagree about what a dangling frame_id means.

Fix: Move the `continue` inside the `frameMap.has` branch so a node whose frame is absent is laid out as unframed, and add a test with a node referencing a missing frame.

### L30. Child frames are laid out independently of their parent, contrary to the documented behaviour

Location: `src/canvas/composables/layout/useLayoutFrameAware.ts:306`. Category: correctness. Verifier confidence: high. Phase: P6.

`prepareFrameAwareLayout` adds every frame in `allFrames`, nested children included, as its own `FRAME_PREFIX` virtual node (lines 92-102). `processFrameAwareLayoutResults` then assigns each frame the position the layout produced for it (lines 306-319), while `resolveFrameOverlaps` filters children out with the comment 'Child frames (with parent_frame_id) are skipped - they move with their parent' (useFrameCollision.ts:404-413). Nothing moves them with the parent: the frames store's `updateFramePosition` (stores/frames.ts:146) updates only the one frame, and nested frames are a live feature (`getChildFrames`, `parent_frame_id` on the type). After a force or hierarchical layout a child frame can therefore land outside its parent and overlap other frames with no resolution applied to it.

Fix: Treat only top-level frames as virtual layout nodes, map nodes in child frames to their top-level ancestor for edge remapping, and move children by the ancestor's delta; or include children in the overlap resolution and update the docstring to state what actually happens.

### L31. UseNodeDraggingContext requires many fields the composable never reads

Location: `src/canvas/composables/nodes/useNodeDragging.ts:12`. Category: dead-code. Verifier confidence: high. Phase: P9.

The context demands `scale`, `offset`, `canvasRef`, `gridLockEnabled`, `neighborhoodMode`, `focusNodeId`, `isLODMode`, `isSemanticZoomCollapsed`, `layoutNeighborhood`, `pushOverlappingNodesAway` and `store.filteredNodes`, `store.filteredEdges`, `store.refreshNodeFromFile`, `store.nodeLayoutVersion`, none of which appear in the function body (only `ctx.onFullscreenOpen`, `ctx.pushFrameAssignmentUndo`, `ctx.moveNodeFile`, `ctx.getVaultPath`, `ctx.checkFileCollision`, `ctx.showCollisionDialog`, `ctx.markProgrammaticMove` and the destructured names are used). GraphCanvas.vue (lines 1613-1662) builds getters/setters and a `computed` offset purely to satisfy the interface, and `src/__tests__/drag-interrupted.test.ts` has to mock them too.

Fix: Trim the interface to what the composable uses and remove the matching plumbing in GraphCanvas and the test fixture.

### L32. clearAutosaveTimers is never called; autosave timers outlive the canvas

Location: `src/canvas/composables/nodes/useNodeEditor.ts:383`. Category: dead-code. Verifier confidence: high. Phase: P9.

`clearAutosaveTimers` is returned but grep finds no caller anywhere in src (GraphCanvas does not destructure it and no onUnmounted calls it). The debounced `autosaveContentTimer`/`autosaveTitleTimer` therefore can fire after the canvas unmounts. Likewise `onAfterSave`, `onSaveComplete` (lines 23-24) are never supplied by any caller outside tests, and `saveEditing` itself is only reached from `startEditing` (see the high finding).

Fix: Either wire `clearAutosaveTimers` into an `onUnmounted` inside the composable (it is a composable, so it can register its own cleanup) or remove it. Wire `onAfterSave` from `useCanvasEventHandlers` as part of the fix above, or drop the options.

### L33. Tooltip preview renders the raw frontmatter block

Location: `src/canvas/composables/nodes/useNodeHover.ts:78`. Category: correctness. Verifier confidence: high. Phase: P5.

`tooltipContent` strips markdown syntax from `hoveredNode.value.markdown_content`, but `markdown_content` carries the YAML frontmatter (that is why `useNodeEditor` splits it with `splitFrontmatter` before editing). None of the regexes remove a leading `---\n...\n---` block, so the first 200 characters of the tooltip for any OKF node are `--- type: ... title: ... ---`.

Fix: Apply `splitFrontmatter(content).body` from `lib/contentParser` before stripping, as the editor and preview panel already do.

### L34. pushOverlappingNodesAway, isSemanticZoomCollapsed and isLODMode are required but unused

Location: `src/canvas/composables/nodes/useNodeResizing.ts:24`. Category: dead-code. Verifier confidence: high. Phase: P9.

`pushOverlappingNodesAway` (line 24, non-optional), `isSemanticZoomCollapsed` (29) and `isLODMode` (30) are declared on `UseNodeResizingContext` but never destructured or referenced; the only mention of collision pushing is the comment at line 269 saying it is disabled. GraphCanvas still passes all three.

Fix: Remove the three fields and the corresponding arguments in GraphCanvas.vue line 1573ff. If collision pushing is not coming back, also delete the TODO comments here and in useNodeDragging line 301.

### L35. renderSingleNode has no production caller; GraphCanvas re-implements it inline without the card cap

Location: `src/canvas/composables/rendering/useContentRenderer.ts:203`. Category: dead-code. Verifier confidence: high. Phase: P5.

`renderSingleNode` is referenced only by `src/__tests__/render-benchmark.test.ts`. `GraphCanvas.vue:1799-1802` (`fitNodeNow`) does the same job by hand: `nodeRenderedContent.value = { ...nodeRenderedContent.value, [nodeId]: renderMarkdown(node.markdown_content) }`. That inline copy uses the uncapped `renderMarkdown` rather than `renderCardMarkdown`, so the fitted card is rendered with the full document instead of the card preview, and it does not update `nodeContentHashes`, so the next `updateRenderedContent` pass sees an unchanged key and leaves the uncapped HTML in place. `renderSingleNode` itself also ignores the node size (calls `renderCardMarkdown(content)` with no node), despite the comment 'Same map the cards read, so the same cap applies'.

Fix: Make `renderSingleNode(nodeId, content, node?)` pass the size through and update `nodeContentHashes`, then call it from `fitNodeNow` instead of the inline copy; or delete it and the benchmark reference.

### L36. collisionMultiplier is never read and the onTick 'animated mode' is never used and leaks the d3 timer

Location: `src/canvas/layout/forceLayout.ts:43`. Category: dead-code. Verifier confidence: high. Phase: P6.

`collisionMultiplier?: number` is declared in `ForceLayoutOptions` but is not destructured or used anywhere in `applyForceLayout`. `onTick` is never supplied by any caller (`grep onTick src` matches only this file), so lines 157-170 are unreachable. If it were used it would misbehave twice: the callbacks fire synchronously inside a tight `for` loop, so nothing is animated; and unlike the instant branch, `simulation.stop()` is never called, so the `forceSimulation` auto-started d3-timer keeps ticking in the background after the function returns.

Fix: Remove `collisionMultiplier` and the `onTick` option/branch; always `simulation.stop()` before manual ticking.

### L37. LayoutStrategy interface family is exported but never implemented or consumed

Location: `src/canvas/layout/types.ts`. Category: dead-code. Verifier confidence: high. Phase: P9.

`LayoutStrategy`, `LayoutOptions`, `LayoutResult` and `LayoutAnimationOptions` are re-exported by `layout/index.ts` (as `StrategyLayoutNode`/`StrategyLayoutEdge` etc.) and referenced nowhere else - no strategy object implements `calculate()`, no registry exists, `useLayoutStrategies.ts` defines its own unrelated `LayoutStrategyStore`. The header says "Defines interfaces for pluggable layout algorithms", which is aspirational: the actual layouts are plain functions.

Fix: Delete `types.ts` and its block in `layout/index.ts`, or actually route `useAutoLayout` through the strategy interface if pluggability is wanted.

### L38. `visible` prop is never passed by any caller

Location: `src/components/AgentTaskPanel.vue:9`. Category: dead-code. Verifier confidence: high. Phase: P8.

The only usage is `<AgentTaskPanel />` in `src/canvas/GraphCanvas.vue:2474` with no binding, and `src/__tests__/agent-task-panel.test.ts` does not reference the prop either. The block comment on lines 6-8 itself states the caller never binds it. The `withDefaults`/`props.visible &&` machinery (lines 9-14, 46-48) therefore exists only to neutralise a prop nothing sets.

Fix: Remove the `visible` prop and `withDefaults`, and let `shouldShow` be `tasksStore.totalTasks > 0` (or have the parent `v-if` the component).

### L39. Rename accepts an empty, whitespace-only, or unchanged file name

Location: `src/components/FileMoveCollisionDialog.vue:40`. Category: correctness. Verifier confidence: high. Phase: P8.

`handleRename` emits `customName.value` verbatim. The downstream check in `src/canvas/composables/nodes/useNodeDragging.ts:423` is only `dialogResult.newName` truthiness, so `'   '` or a name equal to `existingFileName` (the very collision being resolved) or one containing `/` passes through to `moveNodeFile`, which then either fails (logged to console and the frame assignment silently reverted) or overwrites the file the user was trying not to replace. The dialog is the only place that knows `existingFileName`, so validation belongs here.

Fix: Trim the input, disable the Rename card/Enter when the trimmed name is empty, equals `existingFileName`, or contains a path separator, and show an inline hint.

### L40. Unknown icon names render an empty SVG silently; one live caller hits this

Location: `src/components/Icon.vue:65`. Category: correctness. Verifier confidence: high. Phase: P8.

`v-html="icons[name] || ''"` swallows unknown names. `src/components/StorylineReferencesSidebar.vue:309` renders `<Icon name="arrow-right" :size="10" />`, and no `arrow-right` entry exists in the map, so that reference row shows a blank 10px box with no error. The `name: string` type gives no compile-time protection.

Fix: Add the missing `arrow-right` glyph, type `name` as `keyof typeof icons` (export the union), and at minimum log a warning in dev when a name is not found.

### L41. One shortcut row and both aria-labels bypass vue-i18n

Location: `src/components/KeyboardShortcutsModal.vue:42`. Category: consistency. Verifier confidence: high. Phase: P8.

Every other shortcut row is built from `t('shortcuts.keys.*')`/`t('shortcuts.descriptions.*')`, but line 42 is `{ key: 'S', desc: 'Snug frame to fit contents' }` with literal English, so it is the only row that never translates and the only one search cannot match in a non-English locale. `aria-label="Close"` (108) and `aria-label="Search keyboard shortcuts"` (118) are also literal while the sibling dialogs use `:aria-label="t('common.close')"`. No `snug` key exists in `src/i18n/locales/en.json`.

Fix: Add `shortcuts.keys.snugFrame` / `shortcuts.descriptions.snugFrame` to all five locale files and bind the aria-labels through `t()`.

### L42. Accent colours read CSS variables that are not defined anywhere

Location: `src/components/NotificationToast.vue:8`. Category: consistency. Verifier confidence: high. Phase: P8.

`getColor` returns `var(--color-error, #ef4444)`, `var(--color-warning, ...)`, `var(--color-success, ...)`, `var(--color-info, ...)`. A grep of `src/**/*.css` and `*.vue` finds no definition of `--color-error`, `--color-warning`, `--color-success` or `--color-info`; the theme system defines `--danger-color`, `--success-color`, `--primary-color` (see `src/assets/main.css:16,102`), which the sibling components use. The fallbacks therefore always apply and toasts ignore the active theme (e.g. the cyber theme's `--danger-color: #ff3366`).

Fix: Map the toast types to the existing theme tokens (`--danger-color`, `--warning-color` if present, `--success-color`, `--primary-color`) or define the `--color-*` tokens in `main.css` for every theme.

### L43. Exposed `show()` method has no caller

Location: `src/components/OnboardingFlow.vue:84`. Category: dead-code. Verifier confidence: high. Phase: P9.

`defineExpose({ show })` (lines 84-89) is annotated `Expose for manual triggering (e.g., from help menu)`, but the only mount is `<OnboardingFlow @complete="onOnboardingComplete" />` in `src/App.vue:1239` with no template ref, and no file in `src/` calls `.show()` on it. Replaying the tour is wired to `gestureCoach.restart()` instead (`App.vue:1235`). The code is unreachable.

Fix: Delete the `defineExpose` block, or wire the settings `replayTour` action to it if re-running the onboarding flow is the intended behaviour.

### L44. Plan intent summary and action labels are hardcoded English in an i18n component

Location: `src/components/PlanApprovalModal.vue:103`. Category: consistency. Verifier confidence: high. Phase: P8.

The component uses `t()` for its chrome but builds all user-facing summary text in English: `create ${created} new node${...}`, `edit ... named node`, `delete an unstated number of nodes (...)`, `add connections` (lines 103-120), `ACTION_LABEL` values `New/Edit/Delete/Connect/Research/Other` (lines 124-131), the template strings `This plan will` (169), `New nodes:` (177), the `'Plan'` fallback title (165) and the literal `X` close glyph (160). German/French/Spanish/Italian users get a mixed-language dialog, and the pluralisation logic bakes in English grammar.

Fix: Move these strings into the `plan.*` namespace of the locale files and use `t()` with vue-i18n pluralisation (`t('plan.intent.create', count)`); render the close button with `&times;` like the sibling dialogs.

### L45. HTML5 drag handlers are unreachable since reordering moved to pointer events

Location: `src/components/StorylineNodeList.vue:150`. Category: dead-code. Verifier confidence: high. Phase: P7.

Reordering is done by usePointerReorder (pointerdown + document pointermove/pointerup; onPointerDown calls e.preventDefault(), which also suppresses native drag start). No element in this component or its parents carries draggable="true" (grep for `draggable=`/`dragstart` in src/components/Storyline*.vue returns nothing), and the canvas-to-storyline drop (useStorylineDropTarget) is also pointer-based. The five handlers `onDragOverInsertZone`, `onDropInsertZone`, `onDragOverEnd`, `onDropEnd`, `onDragLeave` (lines 150-201) and their `@dragover`/`@dragleave`/`@drop` bindings (lines 238-240, 316-318) can therefore never run with `draggingNodeIndex !== null`, which every one of them requires; they are dead code left over from the HTML5 implementation. Their comments ('Handle drag over insert zones') describe a mechanism that no longer exists.

Fix: Delete the five drag* handlers and the @dragover/@dragleave/@drop bindings on the insert zones. If a drop-between-items affordance is wanted, implement it inside usePointerReorder so both node lists and the storyline list share it.

### L46. Scroll listener registered twice and never removed; RAF not cancelled

Location: `src/components/StorylineReferencesSidebar.vue:161`. Category: correctness. Verifier confidence: high. Phase: P7.

`watch(() => props.contentRef, el => el.addEventListener('scroll', syncScroll), { immediate: true })` and `onMounted(() => props.contentRef.addEventListener('scroll', syncScroll))` both attach the same listener when `contentRef` is already set at mount, and the watcher never detaches from the previous element when the ref changes. There is no `onUnmounted`, so toggling the references sidebar (it is `v-if`-mounted) leaks a listener per open, and `scrollRaf` may fire after unmount.

Fix: Keep one registration path (the immediate watcher), remove the listener from the old element in the watcher, and add `onUnmounted` that removes the listener and cancels `scrollRaf`.

### L47. Debounce timers are never cleared on unmount

Location: `src/components/settings/LLMSettingsPanel.vue:301`. Category: correctness. Verifier confidence: high. Phase: P8.

`fetchDebounceTimer` (line 301) and `validateDebounceTimer` (line 307) are module-level `setTimeout` handles with no `onUnmounted` cleanup. The panel is `v-if`-mounted per tab, so typing a base URL or key and switching tabs within 500-800 ms leaves a pending callback that runs `fetchModels()`/`validateApiKey()` against a torn-down component: it mutates dead refs, calls `provider.configure(...)`, and can emit success/error notifications for a panel that no longer exists. The sibling panels have no timers, so there is no established pattern to follow; the project checklist explicitly calls out intervals/timeouts not cleaned up in `onUnmounted`.

Fix: Import `onUnmounted` and clear both timers there (`if (fetchDebounceTimer) clearTimeout(fetchDebounceTimer)` etc.).

### L48. testCloudConnection re-implements zoteroApi.testConnection with a raw fetch and weaker validation

Location: `src/components/settings/ZoteroSettingsPanel.vue:63`. Category: consistency. Verifier confidence: high. Phase: P9.

`testCloudConnection` issues `fetch(\`https://api.zotero.org/users/${zoteroUserId.value}/collections?limit=1\`, { headers: { 'Zotero-API-Key': ... } })` directly. `ZoteroWebApi.testConnection()` (src/lib/zoteroApi.ts line 132) already performs exactly this request through `request()`, which additionally rejects non-numeric user IDs, `encodeURIComponent`s the ID before interpolating it into the URL, and sends the `Zotero-API-Version: 3` header. The panel's copy does none of that, so an unvalidated, unencoded user-supplied string reaches the URL, and the connection test can succeed or fail differently from every subsequent `zoteroApi` call made from the same panel (`getCollections`, `getItems`, `getCollectionItems`). Meanwhile `fetchCloudCollections` two lines later does use `zoteroApi`, so the component mixes both access paths.

Fix: Replace the raw fetch with `const ok = await zoteroApi.testConnection()`; set `cloudStatus` from the boolean. Remove the direct `https://api.zotero.org` URL from the component.

### L49. cancelBuild is never called and does not cancel anything

Location: `src/composables/useCitationGraph.ts:551`. Category: dead-code. Verifier confidence: high. Phase: P9.

`cancelBuild()` flips `isBuilding` and clears `progress`, but `buildCitationGraph` never consults either, so the loop runs to completion and then overwrites both values. Grep across src (including tests) finds no caller of `cancelBuild`. The docstring 'Cancel building (best effort)' describes behaviour the function does not have.

Fix: Delete `cancelBuild` from the composable and its return object. If cancellation is wanted, add a `buildCancelled` flag checked inside the loop, mirroring `fetchCancelled`.

### L50. getEntitiesByType and getNodesReferencingEntity are wired through the store but never consumed

Location: `src/composables/useEntityOperations.ts:31`. Category: dead-code. Verifier confidence: high. Phase: P9.

Both functions are re-exported through `stores/nodes/advanced.ts`, `stores/nodes.ts` and `stores/nodes/index.ts`, but grep across src, tests, llm tools and mcp finds no call of `store.getEntitiesByType(` or `store.getNodesReferencingEntity(` outside that forwarding chain. `inferEntityLinkType` is also returned from the composable but only used internally.

Fix: Remove the two functions and their forwarding wrappers in the three store files, or add the UI/agent surface that was meant to use them. Drop `inferEntityLinkType` from the return object.

### L51. stopWatching leaves pending-deletion timers and programmatic-move marks alive

Location: `src/composables/useFileSync.ts:156`. Category: correctness. Verifier confidence: medium. Phase: P2.

`pendingDeletions` timers (500 ms) and `pendingProgrammaticMoves` are never cleared in stopWatching. A timer that fires after switchWorkspace has stopped the watcher evaluates `isSyncEnabled()` against the NEW workspace and, if enabled, calls `deps.removeNode(node.id)`, which deletes the node from the database (src/stores/nodes.ts:171-185). A stale programmatic-move mark likewise suppresses the next genuine move of that node.

Fix: In stopWatching clear every pending timeout, empty `pendingDeletions` and `pendingProgrammaticMoves`.

### L52. importVault forks edge deduplication with different semantics than the edges store

Location: `src/composables/useImport.ts:385`. Category: consistency. Verifier confidence: high. Phase: P2.

The inline dedup keys edges by the unordered node pair only (`${ids[0]}:${ids[1]}`), ignoring link_type, direction and storyline. edgesStore.deduplicateEdgesLocal (src/stores/edges.ts:240-258) keys on link_type and respects direction. After an import a wikilink edge and a manual 'supports' edge between the same two nodes (or two storyline edges) are collapsed to one in the view while both remain in the database until the next reload.

Fix: Delete the inline filter and call the edges store's deduplication (or simply setEdges and let loadEdges dedupe).

### L53. handleAsyncError rethrows, so every fallback return is unreachable and callers get rejections

Location: `src/composables/useImport.ts:414`. Category: correctness. Verifier confidence: high. Phase: P2.

handleAsyncError (src/lib/errorHandling.ts:29-31) throws unless `rethrow: false` is passed; none of the four call sites (lines 415, 482, 540, 627) pass it. `return []` (420, 487), the OntologyImportResult fallback (545) and `return 0` (632, whose comment admits it) are dead. App.vue:790-793 catches the rethrow and shows a second toast on top of the notification already raised at line 418; GraphCanvas.vue:1064 `refreshFromFiles` has no catch, so a refresh failure is an unhandled rejection.

Fix: Pick one contract: pass `rethrow: false` and keep the neutral returns, or drop the unreachable returns and let callers handle the rejection without a duplicate notification.

### L54. NodeLayoutDeps.updateNodeSize is declared and supplied but never used

Location: `src/composables/useNodeLayout.ts:16`. Category: dead-code. Verifier confidence: high. Phase: P9.

`updateNodeSize: (id, width, height) => Promise<void>` is part of `NodeLayoutDeps`, and `stores/nodes.ts:507` builds a dedicated wrapper for it, but nothing in useNodeLayout.ts calls `deps.updateNodeSize` (the code explicitly says 'Do NOT resize nodes'). Grepped the file and the store: no call site.

Fix: Remove `updateNodeSize` from `NodeLayoutDeps` and the wrapper passed in `stores/nodes.ts`.

### L55. Five exported comment helpers have no caller

Location: `src/composables/useStorylineReaderComments.ts:46`. Category: dead-code. Verifier confidence: high. Phase: P7.

`expandComment`, `collapseComment`, `expandAllComments`, `collapseAllComments` and the returned `collapsedComments` ref are never referenced outside this file (grep across src, including tests: only StorylineReader imports the composable and destructures `getCommentMeta`, `isCommentCollapsed`, `toggleCommentCollapsed`).

Fix: Delete the unused functions and stop returning `collapsedComments`, or wire an expand/collapse-all control if the behaviour is intended.

### L56. pushContentUndo is never invoked anywhere

Location: `src/composables/useUndoRedo.ts:156`. Category: dead-code. Verifier confidence: high. Phase: P9.

The store now records content steps itself (undoRecorder.ts, crud.ts:236-242). Grep across src for any call of `pushContentUndo(` finds only this definition; the function is still exported, provided under the 'pushContentUndo' key (provideUndoHandlers.ts:16), injected in useUndoHandlers.ts:10/41, threaded through useLLMTools.ts:147/200 and declared in llm/registry.ts:44, but no code path calls it.

Fix: Remove pushContentUndo and its plumbing (provide key, useUndoHandlers wrapper, LLM context field).

### L57. isConnected is a computed with no reactive dependency and never updates

Location: `src/composables/useZotero.ts:101`. Category: correctness. Verifier confidence: high. Phase: P8.

`const isConnected = computed(() => zoteroApi.isConfigured)` reads a plain getter that in turn reads localStorage (`zoteroStorage.isConfigured()`). Nothing reactive is tracked, so Vue evaluates the computed once and caches the result for the lifetime of the component instance. `useCanvasZotero` creates its instance in GraphCanvas setup and passes `zotero.isConnected.value` as `:zotero-available` to the context menu (GraphCanvas.vue:2453); ZoteroSettingsPanel gates the collections section on it (line 279). A user who enters credentials during a session keeps a false `isConnected` (no 'Add to Zotero' menu entry, no collections section) until the app is reloaded. `isApiConfigured` (line 513) has the same construction.

Fix: Back the configured state with a reactive source: keep a module-level `ref` that `zoteroStorage.setUserId/setApiKey/clear` (or a small wrapper in useZotero) update, and derive `isConnected` from it. Alternatively expose a plain function and re-read it at the call sites that need it.

### L58. Several exported members of useZotero have no callers

Location: `src/composables/useZotero.ts:515`. Category: dead-code. Verifier confidence: high. Phase: P9.

Grep across src (components, canvas, llm, tests) for each returned member: `isApiConfigured`, `getChildCollections`, `formatCreator`, `formatCreators`, `addToZotero` (only the i18n key `contextMenu.addToZotero` matches, not the function), `formatItemAsMarkdown`, `getAllItems` and `getCollectionItems` are never used outside this file (the last three are only called internally; ZoteroSettingsPanel uses `zoteroApi.getCollectionItems` directly). `addToZotero` also exists only to forward to `addToZoteroViaApi`, which is otherwise unused as well.

Fix: Remove `isApiConfigured`, `getChildCollections`, `formatCreator`, `formatCreators`, `addToZotero` and `addToZoteroViaApi`; keep `formatItemAsMarkdown`, `getAllItems`, `getCollectionItems` as private helpers and drop them from the return object.

### L59. Unreachable `else if (data.year)` branch in formatCitationAsMarkdown

Location: `src/lib/citationFormat.ts:79`. Category: dead-code. Verifier confidence: high. Phase: P5.

Line 75 does `if (data.year || data.date) pubInfo.push(...)`. Whenever `data.year` is truthy, `pubInfo` is therefore non-empty and the `if (pubInfo.length > 0)` branch runs, so `else if (data.year) { lines.push(`*${data.year}*`) }` on lines 79-82 can never execute.

Fix: Remove lines 79-82.

### L60. extractFrontmatterTitle returns null for any title containing an apostrophe or quote

Location: `src/lib/extraction.ts:102`. Category: correctness. Verifier confidence: high. Phase: P5.

The pattern `/^title:\s*["']?([^"'\n]+)["']?\s*$/m` forbids quote characters inside the captured title, so `title: Newton's laws` and `title: "Newton's laws"` both fail to match and the function returns `null` (verified by running it). `useFileSync.ts:267` uses this to title nodes created from vault files, so files with such titles lose their frontmatter title.

Fix: Match the rest of the line and strip one matching pair of surrounding quotes afterwards, as `parseFrontmatterRaw` in the same file already does, or route both through `contentParser.splitFrontmatter` plus one shared key reader.

### L61. Exported `clamp` has no callers

Location: `src/lib/geometry.ts:47`. Category: dead-code. Verifier confidence: high. Phase: P9.

The three importers of lib/geometry (stores/frames.ts, stores/nodes/crud.ts, useNodeClipboard.ts) import clampCoord, clampFrameSize, clampNodeSize and isValidCoordinate only. `git grep '\bclamp\b'` finds no import of it anywhere; tooltipPlacement.ts and usePanelReveal.ts define their own local clamps.

Fix: Remove `clamp` from geometry.ts, or adopt it in the two files that hand-roll the same helper (tooltipPlacement's variant deliberately differs for max < min, so probably remove).

### L62. downloadTypst is only referenced from tests

Location: `src/lib/pdf-export.ts:83`. Category: dead-code. Verifier confidence: high. Phase: P5.

`git grep downloadTypst` matches src/lib/pdf-export.ts and src/__tests__/pdf-export.test.ts only. No component or composable calls it; ExportDialog.vue imports only `exportToPdf`. It also uses an `<a download>` click, which is not a working download path inside the Tauri webview.

Fix: Delete `downloadTypst` and its test, or wire it into the export dialog via the Tauri save dialog if `.typ` export is a wanted feature.

### L63. retryWithBackoff is documented as exponential backoff but waits linearly

Location: `src/lib/retry.ts:39`. Category: naming. Verifier confidence: high. Phase: P9.

The file header and the JSDoc say "exponential backoff", yet the wait is `(maxRetries + 1 - retries) * baseDelayMs`, i.e. 1x, 2x, 3x base delay - linear. The name and docstring describe behaviour that is not implemented.

Fix: Either implement exponential growth (`baseDelayMs * 2 ** attempt`) or rename/redocument as linear backoff so the docs match the code.

### L64. sanitizeMermaidSvg and sanitizeSvg are identical

Location: `src/lib/sanitize.ts:96`. Category: consistency. Verifier confidence: high. Phase: P9.

Both functions are `DOMPurify.sanitize(svg, svgConfig as ...)` with the same config; only the docstrings differ. MarkdownRenderService.ts imports and calls both (lines 219 and 325), so two names now describe one behaviour, and a future tightening of one config silently misses the other path.

Fix: Keep one function (`sanitizeSvg`) and delete the other, or give Mermaid a genuinely distinct config if foreignObject/HTML should not be allowed for Typst output.

### L65. truncateText is exported but never imported; systemPrompt.ts carries a byte-identical private copy

Location: `src/lib/textProcessing.ts:182`. Category: dead-code. Verifier confidence: high. Phase: P9.

`git grep truncateText` finds no importer of the lib function. The only other occurrence is a local `function truncateText(text, maxLength)` in src/canvas/composables/agent/systemPrompt.ts:17 with the same body (`text.slice(0, maxLength - 3) + '...'`). This is both dead library code and a fork of library logic into a consumer, which the project rules forbid.

Fix: Delete the private copy in systemPrompt.ts and import `truncateText` from lib/textProcessing, or delete the lib export if the consumer should own it. Either way keep one definition.

### L66. addToCollection is never called and would fail or destroy collection membership if it were

Location: `src/lib/zoteroApi.ts:243`. Category: dead-code. Verifier confidence: high. Phase: P9.

No caller of `addToCollection` exists in src/, packages/ or the tests (grep). It is also wrong as written: `GET /items/{key}` returns the envelope `{ key, version, data: {...} }` (which is why `getItems` unwraps `.data` via `transformApiItems`), so `item.collections` is always `undefined`, `collections` becomes `[collectionKey]`, and the PATCH would remove the item from every other collection. The PATCH also omits the `If-Unmodified-Since-Version` header (or `version` body field) Zotero requires for writes, so the API answers 428. docs/REVIEW.md L22 already records this and it is still present.

Fix: Delete `addToCollection`. If collection assignment is needed later, read `envelope.data.collections`, send `If-Unmodified-Since-Version: envelope.version`, and wire it to a UI action in the same change.

### L67. Execute whitelist names tools that are not registered

Location: `src/llm/agentModes.ts:187`. Category: correctness. Verifier confidence: high. Phase: P3.

```ts
// Reporting progress, so the task panel advances as work is done
// (PRODUCT_DESIGN.md > Showing agent progress)
'set_tasks',
'update_task_status',
```
No tool with either name is defined anywhere under src/llm/tools or elsewhere in src (only these two lines match). `filterToolsForMode` is an intersection with registered definitions, so the entries are inert and the progress reporting the comment promises does not exist. The tool-reachability test checks registered-to-exposed only, so phantom whitelist entries pass unnoticed.

Fix: Either register the two tools or delete the entries and the comment; extend tool-reachability.test.ts with the inverse assertion (every whitelisted name is registered) so this cannot recur.

### L68. Half of usePlanState is never called and history is recorded twice

Location: `src/llm/planState.ts:226`. Category: dead-code. Verifier confidence: high. Phase: P3.

`completeCurrentStep` (226), `failCurrentStep` (250), `updateStepStatus` (263), `getPlanSummary` (295), `clearPlan` (284), plus the `planHistory` ref (29) and the `hasPendingPlan`, `isApproved`, `currentStepIndex`, `progress` computeds have no consumers outside this file (usePlanHandlers uses approvePlan, rejectPlan, modifyStep, addStep, removeStep, startExecution, showApprovalModal, currentPlan). The `_reason` parameter of `rejectPlan` (126) is accepted and ignored. Within the unused code the bookkeeping is also inconsistent: `rejectPlan` (135) and the completion paths (243, 275) push the plan onto `planHistory`, and `clearPlan` (286) pushes the same plan again, so a rejected or completed plan would appear twice. `addStep` (162) accepts no `action`/`targets`, unlike `createPlan`, so steps a user adds in the approval dialog fall back to keyword classification in planIntent.ts.

Fix: Delete the unused functions, computeds and `planHistory`; drop `_reason`; give `addStep` the same `{action, targets}` shape as `createPlan` so the approval summary stays accurate.

### L69. Parse failures are reported as 'Cannot connect to Ollama'

Location: `src/llm/providers/ollama.ts:136`. Category: correctness. Verifier confidence: high. Phase: P3.

In the streaming loop `const data = JSON.parse(line)` runs without a guard, and `response.json()` in both generate() and chat() can throw as well. The catch blocks map every non-abort, non-`Ollama error` exception to a connection failure:
```ts
throw new Error('Cannot connect to Ollama. Start it with: ollama serve')
```
A malformed NDJSON line or a non-JSON body from a proxy therefore tells the user to start a server that is already running, and the accumulated partial `content` is lost. chat() (line 205-211) does the same for any error thrown after the response arrived.

Fix: Only translate errors thrown by `fetch` itself into the connection message; let parse errors propagate with their own message (or skip an unparseable line and continue, as sse.ts does).

### L70. Unused config persistence API and write-only configs map

Location: `src/llm/providers/registry.ts:90`. Category: dead-code. Verifier confidence: high. Phase: P3.

`getProviderConfig` (90), `loadConfigs` (97) and `exportConfigs` (109) have no callers anywhere in src or tests; the `configs` map (15) is only written by `configureProvider`. Persistence actually happens through `llmStorage` in src/lib/storage.ts. The trailing `export type { ILLMProvider, ProviderConfig, ProviderModel } from './types'` (122) duplicates `export * from './types'` in providers/index.ts.

Fix: Remove the three methods, the `configs` map and the duplicate type re-export.

### L71. SSE accumulator only recognises LF event boundaries and never flushes the tail

Location: `src/llm/providers/sse.ts:61`. Category: correctness. Verifier confidence: medium. Phase: P3.

```ts
let boundary = buffer.indexOf('\n\n')
```
The SSE specification allows CRLF line endings; a server that emits `\r\n\r\n` produces no `\n\n` substring, so no event is ever dispatched, `done()` stays false and openai-compatible generate() throws `The response ended before it was complete` for a stream that completed. The accumulator also has no end-of-stream flush: a final `data: [DONE]` block that is not followed by a blank line stays in `buffer` and is dropped, with the same result.

Fix: Normalise `\r\n` to `\n` on push (or search for `/\r?\n\r?\n/`), and add a `finish()` that processes any remaining buffer, called by httpStreamFetch consumers before checking `done()`.

### L72. pendingCount getter builds a non-reactive computed per access; useLLMQueue is unused

Location: `src/llm/queue.ts:231`. Category: correctness. Verifier confidence: high. Phase: P3.

```ts
get pendingCount() {
  return computed(() => this.queue.length)
}
```
`this.queue` is a plain array, so the computed has no dependency and freezes at its first value; every property access also allocates a fresh computed. The only consumer is `useLLMQueue()` (246), which itself has no callers in src or tests, and `getStats()` (220) is reachable only through it. `withRetry` blocks for generate and chat (128-144, 154-174) are duplicated verbatim apart from the provider call.

Fix: Remove `useLLMQueue`, `pendingCount` and `getStats` (or make `queue` a `shallowRef`/reactive array if a live count is wanted); factor the two retry invocations into one helper.

### L73. Unused registry methods: unregister, getToolsByCategory, getToolNames, getCategories

Location: `src/llm/registry.ts:142`. Category: dead-code. Verifier confidence: high. Phase: P3.

`unregister` (142), `getToolsByCategory` (168), `getToolNames` (260) and `getCategories` (267) have no callers in src or tests (only `getToolsByCategories` is used, by useNodeAgent.ts:158). The header describes a plugin system ('Plugins can add tools without modifying core files', 'useful for plugin cleanup') that does not exist in the codebase.

Fix: Delete the four methods and reword the header to describe what exists: a registry populated by registerCoreTools().

### L74. Five edges-store methods have no callers

Location: `src/stores/edges.ts:304`. Category: dead-code. Verifier confidence: high. Phase: P9.

Grep over src and packages finds no external references to `debugGetAllEdges` (line 304), `getEdgesForNodes` (65), `getEdgesByLinkType` (364), `updateEdgeStoryline` (213), `findEdgeBetween` (323) or `edgeExists` (334) (the `edgeExists` hits elsewhere are local variables in storylines.ts). They are returned from the store but nothing invokes them.

Fix: Delete them; if `debug_get_all_edges` is meant for the diagnostics panel, wire it there in the same change.

### L75. Seven frames-store members have no callers

Location: `src/stores/frames.ts:243`. Category: dead-code. Verifier confidence: high. Phase: P9.

No external references exist for `updateFrameParent` (line 243), `getChildFrames` (256), `getFramePath` (263), `isPointInFrame` (305), `findFrameAtPoint` (319), `findFrameByFolderPath` (327) or the `selectedFrame` computed (20); every `selectedFrame` hit elsewhere is `selectedFrameId`. Nested-frame support therefore exists only as unreachable store code.

Fix: Delete them, or wire nested frames into the UI in the same change per the 'never implement something without connecting it' rule.

### L76. Store barrel files are never imported

Location: `src/stores/index.ts`. Category: dead-code. Verifier confidence: high. Phase: P9.

No file imports from 'stores', 'stores/index', 'nodes/index', './index' or '../index' (grep over src and packages). `src/stores/index.ts` re-exports five stores that every consumer imports directly. `src/stores/nodes/index.ts` is doubly unreachable: with `moduleResolution: bundler` the specifier `./nodes` resolves to `stores/nodes.ts` before `stores/nodes/index.ts`, so the only import that could hit it (`stores/index.ts` line 7) goes to nodes.ts instead. It is also already stale (it omits `updateEdgeLabel`, `persistFramePosition`, `persistFrameSize` that nodes.ts imports).

Fix: Delete src/stores/index.ts and src/stores/nodes/index.ts.

### L77. syncTagEdgesIfEnabled has no enabled check

Location: `src/stores/nodes.ts:245`. Category: naming. Verifier confidence: high. Phase: P9.

```
function syncTagEdgesIfEnabled() {
  syncAllTagNodes().catch(...)
}
```
The name and docstring ('when tag nodes are switched on') promise a gate on the tag-node setting, but the function unconditionally runs syncAllTagNodes; syncAllTagNodes only checks that the composable exists. Per the design comment at lines 531-537 the setting is a view preference and data is always created, so the current behaviour may be intended, but then the name is aspirational.

Fix: Rename to `syncTagEdges` (and fix the docstring) or add the real gate if one is intended.

### L78. Deleting a wikilink edge rewrites the source node body without recording an undo step

Location: `src/stores/nodes/edges.ts:21`. Category: correctness. Verifier confidence: high. Phase: P1.

deleteEdge replaces `[[Target]]` with plain text and persists it via a direct `invoke('update_node_content', ...)` (lines 46-52), bypassing `updateNodeContent` and therefore `recordContentBefore`. undoRecorder.ts states that recording belongs in the store 'so a caller cannot forget'; this store path forgets. Undoing the edge deletion (restoreEdge) restores the edge but not the wikilink text, so the next content save deletes the edge again.

Fix: Record the prior content with `recordContentBefore` before the rewrite (or call the store's updateNodeContent with an option that skips wikilink sync), and add a test to undo-is-automatic.test.ts.

### L79. nodes/index.ts barrel is unreachable (shadowed by nodes.ts) / Barrel file is imported by nothing and is out of date

Location: `src/stores/nodes/index.ts`. Category: dead-code. Verifier confidence: high. Phase: P9.

See the finding on src/stores/index.ts: nothing imports `stores/nodes/index`, and `./nodes` resolves to `nodes.ts`. The 114-line re-export list is maintained by hand and has already drifted from nodes.ts.

Second report of the same location: All consumers import `from '../stores/nodes'`, which resolves to the sibling file src/stores/nodes.ts (file wins over directory index); nodes.ts imports submodules by explicit path and grep finds no import of 'nodes/index'. The barrel also claims to 're-export all submodule functions' yet omits updateEdgeLabel (edges.ts:91), persistFramePosition and persistFrameSize (frames.ts:42/63).

Fix: Delete the file. Delete src/stores/nodes/index.ts.

### L80. removeNodeFromStoryline mutates chain edges before the backend confirms the removal

Location: `src/stores/storylines.ts:215`. Category: correctness. Verifier confidence: high. Phase: P1.

Edges belonging to the storyline are deleted (lines 229-231) and the prev/next bridge edge created (lines 234-241) before `invoke('remove_node_from_storyline')` at line 243. If the backend call fails the function throws, the node is still a storyline member, but its chain edges are gone and a bridging edge exists - the sequence the reader walks no longer matches the edges. addNodeToStoryline does the opposite (backend first, then edges).

Fix: Call the backend first, then adjust edges, matching addNodeToStoryline; storyline-chain-edges.test.ts can cover the failure ordering.

### L81. recoverWorkspace drops vault_path and sync_enabled

Location: `src/stores/workspaces.ts:200`. Category: correctness. Verifier confidence: high. Phase: P1.

The InternalWorkspace docstring (lines 51-56) records that dropping sync_enabled in the mapping meant 'nothing in the frontend could tell a workspace that syncs from one that does not'. loadWorkspacesFromDatabase now keeps both fields, but recoverWorkspace (lines 217-221) builds a plain `Workspace` from the DbWorkspace and pushes it, so a recovered workspace has `sync_enabled: undefined` and `currentVaultPath` is null; `expectsFileWrite` in crud.ts then suppresses the vault-write-missed warning for it.

Fix: Map the DbWorkspace through the same converter used in loadWorkspacesFromDatabase (extract a `toInternalWorkspace(w)` helper).

## Appendix A: low-severity findings (not verified)

Reported by the reviewers but not passed through the adversarial verifier. Treat each as a lead, not a confirmed defect.

| File | Category | Finding |
|---|---|---|
| `packages/nodus-mcp-server/src/index.ts:42` | consistency | Server advertises version 0.1.0 while package.json is 0.2.0 |
| `packages/nodus-mcp-server/src/tools.ts:406` | typing | Schemas declare colour/frame_id as string while instructing clients to pass null |
| `packages/nodus-mcp-server/src/tools.ts:770` | docstring | Storyline section header sits above frame tools |
| `packages/nodus-mcp-server/src/tools.ts:1044` | dead-code | getTool is exported but never called |
| `packages/nodus-mcp-server/src/websocket-client.ts:61` | dead-code | onMessage option and disconnect() are never used |
| `packages/nodus-mcp-server/src/websocket-client.ts:215` | correctness | Per-request 30 s timeout timer is never cleared once the request settles |
| `src-tauri/src/checksum.rs:47` | design | compute_string duplicates compute_bytes |
| `src-tauri/src/commands/deletion.rs:82` | design | restore_node trusts a caller-supplied Node instead of the stored row |
| `src-tauri/src/commands/edges.rs:16` | consistency | get_edges match arms are identical; delete_edge calls the command instead of the impl |
| `src-tauri/src/commands/edges.rs:221` | dead-code | debug_get_all_edges is reachable only through an unused store function |
| `src-tauri/src/commands/file_locks.rs:35` | docstring | acquire_edit_lock doc comment describes a return value the function does not have |
| `src-tauri/src/commands/file_locks.rs:68` | consistency | Mutex poisoning is unwrapped in state commands while dropped_paths recovers from it |
| `src-tauri/src/commands/nodes.rs:151` | correctness | Duplicate-file check swallows DB errors and matches soft-deleted nodes |
| `src-tauri/src/commands/nodes.rs:387` | consistency | New vault files are written without the exclusive lock used elsewhere |
| `src-tauri/src/commands/nodes.rs:454` | correctness | Read failure before write-back silently drops the file's frontmatter |
| `src-tauri/src/commands/nodes.rs:623` | design | move_node_file 'replace' permanently deletes a file another node may own |
| `src-tauri/src/commands/nodes.rs:710` | dead-code | Leftover debug logging in update_node_size |
| `src-tauri/src/commands/okf.rs` | design | Whole-workspace blocking file IO inside async commands |
| `src-tauri/src/commands/okf.rs:230` | design | Wikilink regex compiled per node during export; workspace name fetched twice |
| `src-tauri/src/commands/ontology.rs:112` | docstring | Comment claims nodes and edges are saved transactionally, but they are two separate transactions |
| `src-tauri/src/commands/pdf.rs:15` | design | Blocking file read and PDF text extraction run directly on the async runtime |
| `src-tauri/src/commands/storylines.rs:62` | dead-code | get_storyline and get_node commands are registered but never invoked |
| `src-tauri/src/commands/wikilinks.rs:40` | consistency | node_link_keys and build_title_to_id_map duplicate the key derivation |
| `src-tauri/src/database/edges.rs:236` | dead-code | Unused binding `_updated` in merge_bidirectional_wikilinks |
| `src-tauri/src/database/mod.rs` | design | Storing markdown_content for canvas-only nodes contradicts the stated data-separation rule |
| `src-tauri/src/database/mod.rs:69` | naming | DatabaseError::Migration is used for non-migration failures |
| `src-tauri/src/database/mod.rs:84` | docstring | edges_matches_current_schema has two stacked, contradictory doc summaries |
| `src-tauri/src/database/models.rs` | docstring | Most public database functions have no rustdoc |
| `src-tauri/src/database/models.rs:624` | consistency | Frames store created_at/updated_at in milliseconds; every other table stores seconds |
| `src-tauri/src/database/nodes.rs:65` | correctness | restore_if_file_exists performs blocking filesystem stats and per-row UPDATEs inside an async function |
| `src-tauri/src/import_helpers.rs:26` | docstring | Doc comment for collect_markdown_files is attached to is_visible_vault_entry |
| `src-tauri/src/import_helpers.rs:95` | design | Wikilink regexes are recompiled on every call |
| `src-tauri/src/main.rs:21` | consistency | MCP and Typst Tauri commands are defined in main.rs while every other command lives under commands/ |
| `src-tauri/src/main.rs:256` | correctness | on_menu_event unwraps the main window lookup |
| `src-tauri/src/mcp_websocket.rs:133` | dead-code | Unused JSON-RPC error constants and write-only McpConnection.id field |
| `src-tauri/src/mcp_websocket.rs:170` | correctness | Concurrent start_server calls can orphan a listener |
| `src-tauri/src/mcp_websocket.rs:258` | design | approve_connection holds the connections write lock across a database await |
| `src-tauri/src/ontology/parser.rs:33` | dead-code | OWL_RESTRICTION constant is unused |
| `src-tauri/src/ontology/parser.rs:347` | consistency | Class and property descriptions are synced only for rdfs:comment, individuals also accept dc:description |
| `src-tauri/src/ontology/parser.rs:745` | design | Restriction/union parsing is covered only by tests that need files under /Users/sdrwacker and silently pass otherwise |
| `src-tauri/src/ontology/transformer.rs:441` | docstring | Hierarchical layout comment claims to keep the maximum depth, but the visited guard fixes the first depth |
| `src-tauri/src/ontology/types.rs:22` | dead-code | OntologyProperty.description is written but never read; allow(dead_code) hides it |
| `src-tauri/src/ontology/types.rs:122` | consistency | Format detection accepts .xml and .json, but the module doc and the directory import do not |
| `src-tauri/src/pdf.rs:106` | correctness | CMYK colour arrays are decoded as RGB |
| `src-tauri/src/themes.rs:99` | dead-code | Redundant checks in validate_theme and validate_color |
| `src-tauri/src/watcher.rs:157` | consistency | Mutex poisoning handled inconsistently between watcher.rs and dropped_paths.rs |
| `src/App.vue:318` | consistency | StorylineService is provided under a string key while NodeService uses a typed Symbol |
| `src/App.vue:400` | consistency | User-visible strings bypass vue-i18n in a component that otherwise uses t() |
| `src/App.vue:558` | dead-code | Debug console.log statements left in syncVaultFiles and the startup sync path |
| `src/App.vue:710` | consistency | Startup watcher block duplicates switchWorkspace's watcher logic and re-imports a statically imported helper |
| `src/canvas/GraphCanvas.vue:8` | dead-code | Stale narrative comments describing code that no longer lives here |
| `src/canvas/GraphCanvas.vue:548` | consistency | Selection is replaced in one composable and spliced in place in others |
| `src/canvas/GraphCanvas.vue:683` | consistency | User-visible strings bypass vue-i18n and use alert() |
| `src/canvas/GraphCanvas.vue:712` | dead-code | nodeBorderWidth and frameBorderWidth are the same computed twice |
| `src/canvas/GraphCanvas.vue:1058` | consistency | resetAllNodeSizes hard-codes 200x120 instead of NODE_DEFAULTS |
| `src/canvas/components/CanvasAgentLogPanel.vue:34` | consistency | Header label hard-coded while the buttons use `t()` |
| `src/canvas/components/CanvasCitationProgress.vue:33` | consistency | Mixed i18n: several user-visible strings bypass `t()` |
| `src/canvas/components/CanvasColorBar.vue:95` | consistency | Hard-coded tooltips and button label next to a `t()` call |
| `src/canvas/components/CanvasContextMenu.vue:20` | dead-code | `hasDOI` prop is passed but never read |
| `src/canvas/components/CanvasContextMenu.vue:452` | dead-code | Empty `.entity-submenu` rule with only a comment |
| `src/canvas/components/CanvasFrames.vue:12` | dead-code | `frameBorderWidth` prop is declared and passed but never used; the template recomputes a different value |
| `src/canvas/components/CanvasFrames.vue:39` | correctness | Frame background assumes a 6-digit hex colour |
| `src/canvas/components/CanvasHoverTooltip.vue:28` | docstring | JSDoc for `displayTitle` is attached to the render watcher |
| `src/canvas/components/CanvasHoverTooltip.vue:87` | consistency | Truncation length duplicated as a magic number |
| `src/canvas/components/CanvasLLMBar.vue:54` | consistency | `copyLog` duplicates CanvasAgentLogPanel.copyLog but without its error handling |
| `src/canvas/components/CanvasLODCanvas.vue:214` | typing | `hitTest` is typed on `PointerEvent` but is called with `MouseEvent` via casts |
| `src/canvas/components/CanvasNodeCard.vue:16` | typing | Local `interface Node` shadows the shared `Node` type, which is imported under an alias |
| `src/canvas/components/CanvasNodeCard.vue:48` | dead-code | `scale` prop is declared and passed but never used |
| `src/canvas/components/CanvasNodeCard.vue:99` | consistency | `nodesStore` is used in `classes` before it is declared |
| `src/canvas/components/CanvasNodeCard.vue:107` | dead-code | `deleteButtonStyle` computed returns an empty object |
| `src/canvas/components/CanvasNodeCard.vue:292` | consistency | In-node search bar strings bypass i18n |
| `src/canvas/components/CanvasPreviewPanel.vue:25` | dead-code | `content` prop is never read; the parent renders markdown for it on every change for nothing |
| `src/canvas/components/CanvasPreviewPanel.vue:431` | consistency | Action buttons, AI bar and a notification are hard-coded English |
| `src/canvas/components/CanvasStatusBar.vue:42` | dead-code | `isWatching` prop is never passed and never rendered |
| `src/canvas/components/CanvasZoteroProgress.vue:20` | consistency | No i18n at all in a sibling of an i18n-using component |
| `src/canvas/composables/agent/useAgentPrompt.ts:51` | correctness | Resumed runs are not covered by the in-flight guard or the selection release |
| `src/canvas/composables/agent/useAgentRunner.ts:469` | dead-code | `AGENT_PAUSED:` marker has no producer |
| `src/canvas/composables/agent/useAgentRunner.ts:552` | design | Run end inferred from natural-language wording despite the rule stated directly above |
| `src/canvas/composables/agent/useAgentRunner.ts:631` | dead-code | `getFilteredTools` is exported from the runner but never used outside it |
| `src/canvas/composables/agent/useCanvasLLMState.ts:27` | dead-code | `clearGraphPrompt` is never called |
| `src/canvas/composables/agent/useLLMTools.ts:61` | docstring | Stale comments: colour tools are no longer dispatched here, and the JSDoc is duplicated |
| `src/canvas/composables/agent/useLLMTools.ts:288` | correctness | smart_move / smart_connect apply mutations after the agent was stopped |
| `src/canvas/composables/agent/useLLMTools.ts:338` | consistency | Reads the search API key from raw localStorage instead of llmStorage |
| `src/canvas/composables/agent/useLLMTools.ts:371` | dead-code | Four copies of an unreachable `typeof args === 'string'` re-parse |
| `src/canvas/composables/agent/useMarkerHandlers.ts:25` | consistency | Second `PlanStateInterface` with a different shape than the one in useLLMTools |
| `src/canvas/composables/agent/useNodeAgent.ts:23` | consistency | Side-effecting call placed between import statements; tool list in error message is stale |
| `src/canvas/composables/agent/useNodeAgent.ts:377` | correctness | Missing `content`/`text` argument crashes the run instead of being reported to the model |
| `src/canvas/composables/agent/usePlanHandlers.ts:33` | dead-code | Debug console.log statements left in production code |
| `src/canvas/composables/agent/usePlanHandlers.ts:61` | correctness | Resumed run after rejection is a floating promise |
| `src/canvas/composables/edges/useEdgeManipulation.ts:73` | dead-code | startEdgeCreation is never called and duplicates useNodeDragging's alt-drag block |
| `src/canvas/composables/edges/useEdgeRouting.ts:38` | dead-code | EdgeLine fields hitX1..hitY2, strokeWidth and debugInfo have no consumers |
| `src/canvas/composables/edges/useEdgeStyling.ts:375` | dead-code | Unused and duplicated public API on useEdgeStyling |
| `src/canvas/composables/edges/useEdgeVisibility.ts:112` | dead-code | Ternary with identical branches |
| `src/canvas/composables/frames/useFrameOperations.ts:84` | consistency | Node moves in resolveFrameCollisions are floating promises while organizeFrame awaits them |
| `src/canvas/composables/frames/useFrames.ts:30` | dead-code | `assignNodesToFrame` is declared in the Store slice but never used by useFrames |
| `src/canvas/composables/frames/useFrames.ts:121` | correctness | Document pointer listeners are not removed if the component unmounts mid-gesture |
| `src/canvas/composables/layout/useFrameCollision.ts:25` | dead-code | isNodeInFrame and isNodeCenterInFrame have only test callers |
| `src/canvas/composables/layout/useLayout.ts:296` | design | Radial z-order is delivered through a window CustomEvent instead of the injected interface |
| `src/canvas/composables/layout/useLayout.ts:398` | dead-code | stopAnimation and radialLayout are returned but never consumed; Store.layoutNodes is required but unused |
| `src/canvas/composables/layout/useLayoutStrategies.ts` | naming | File named 'Strategies' contains one viewport function and dead interfaces |
| `src/canvas/composables/layout/useNeighborhoodMode.ts:124` | consistency | Two BFS traversals of the same neighbourhood; exit() and toggle() reset different state |
| `src/canvas/composables/nodes/useCanvasEntityLinking.ts:21` | docstring | Two stacked doc comments; one is stale |
| `src/canvas/composables/nodes/useColorOperations.ts:4` | docstring | Header claims undo support for frames; frame colour has none |
| `src/canvas/composables/nodes/useNodeClipboard.ts:294` | consistency | pasteNodes swallows failures with console.debug and no user feedback |
| `src/canvas/composables/nodes/useNodeCollision.ts:78` | consistency | pushOverlappingNodesAway and pushOverlappingNodesAwayExcept duplicate 50 lines |
| `src/canvas/composables/nodes/useNodeDragging.ts:318` | correctness | A node whose frame no longer exists is never re-evaluated for a new frame |
| `src/canvas/composables/nodes/useNodeDragging.ts:401` | correctness | handleFileMove is a floating promise with uncaught paths |
| `src/canvas/composables/nodes/useNodeNavigation.ts:4` | dead-code | Exported NodeLike type is unused |
| `src/canvas/composables/nodes/useNodeResizing.ts:168` | correctness | Resize threshold only applies when pushSizeUndo is supplied |
| `src/canvas/composables/rendering/useContentRenderer.ts:48` | dead-code | nodesWithMermaid set is maintained but never read |
| `src/canvas/composables/rendering/useGraphMetrics.ts:221` | correctness | Staging RAF is never cancelled on unmount |
| `src/canvas/composables/selection/useSelectionActions.ts:17` | dead-code | Declared `selectedNodeIds` setter is never used; selection is mutated by splice |
| `src/canvas/composables/util/useCanvasKeyboardShortcuts.ts:229` | consistency | Cmd+0 persists font scale inline while +/- delegate to injected callbacks |
| `src/canvas/composables/util/useCanvasTheme.ts:37` | correctness | isDarkMode starts false while currentTheme is read from the DOM |
| `src/canvas/composables/util/useCitationFetch.ts:97` | dead-code | currentFetchDirection is written but never read |
| `src/canvas/composables/util/useFrameProfiler.ts` | naming | File named as a composable but exports a plain factory |
| `src/canvas/composables/util/useGraphExport.ts:99` | correctness | Edge fields are interpolated into YAML without escaping |
| `src/canvas/composables/util/usePdfDrop.ts:401` | consistency | processingStatus error handling differs per drop type |
| `src/canvas/composables/util/usePdfDrop.ts:618` | correctness | setup() has no rejection handling and can leak the drag-drop listener |
| `src/canvas/composables/util/usePdfGraphImport.ts:168` | correctness | One graph import records two undo steps |
| `src/canvas/composables/util/useStorylineDropTarget.ts:10` | design | Depends on the concrete Pinia store type rather than a narrow interface |
| `src/canvas/composables/viewport/useCanvasDisplay.ts:16` | dead-code | isLargeGraph is required by the context but never used |
| `src/canvas/composables/viewport/useCanvasPan.ts:99` | dead-code | panStart and onPanMove are exported without consumers |
| `src/canvas/composables/viewport/useCanvasPinch.ts:188` | correctness | stopListening is 'exposed for teardown' but nothing tears it down |
| `src/canvas/composables/viewport/useCanvasZoom.ts:87` | consistency | Anchored-zoom formula is duplicated three times |
| `src/canvas/composables/viewport/useCanvasZoom.ts:159` | design | Native pinch bridge is a window global rather than an injected channel |
| `src/canvas/composables/viewport/useCanvasZoom.ts:162` | correctness | Unmount leaves the zoom RAF, momentum RAF and pinch timers running |
| `src/canvas/composables/viewport/useMinimap.ts:53` | consistency | Literal 200/120 fallbacks instead of NODE_DEFAULTS on non-optional fields |
| `src/canvas/composables/viewport/useViewState.ts:31` | consistency | View state bypasses lib/storage and exposes dead helpers |
| `src/canvas/constants.ts:10` | dead-code | NODE_DEFAULTS.MIN_HEIGHT and MAX_HEIGHT are never read; nodeSizing repeats the literals |
| `src/canvas/layout/forceLayout.ts:20` | consistency | LayoutNode/LayoutEdge are defined three times with identical shape |
| `src/canvas/layout/forceLayout.ts:208` | dead-code | layoutNodesWithForce has no callers |
| `src/canvas/routing/index.ts:168` | consistency | Three private SVG path builders with two output formats |
| `src/canvas/routing/index.ts:561` | correctness | Arrow endpoint offset is applied to every edge, including undirected and bidirectional ones |
| `src/canvas/routing/orthogonalRouter.ts:568` | docstring | Two stacked JSDoc blocks on has180DegreeTurn; duplicate cleanPath call |
| `src/canvas/utils/SpatialGrid.ts:102` | dead-code | getStats and the nodePositions map it reads are unused |
| `src/canvas/utils/nodeColors.ts:37` | dead-code | Old-opacity lightToDark entries are unreachable after legacy normalisation |
| `src/canvas/utils/nodeColors.ts:115` | consistency | Dark-theme predicate duplicated across three modules |
| `src/components/FileMoveCollisionDialog.vue:10` | consistency | Exported CollisionResolution type is redeclared as a literal union in its consumers |
| `src/components/FileMoveCollisionDialog.vue:53` | consistency | Inline English default messages passed to every t() call |
| `src/components/FullscreenNodeModal.vue:34` | dead-code | 'render-mermaid' emit is declared but never emitted |
| `src/components/FullscreenNodeModal.vue:232` | correctness | hasUnsavedChanges is cleared even when a newer edit was armed during the flush |
| `src/components/FullscreenNodeModal.vue:438` | correctness | Global keydown listener stays active while the modal is hidden |
| `src/components/FullscreenNodeModal.vue:574` | consistency | Footer hint strings bypass vue-i18n |
| `src/components/Icon.vue:20` | dead-code | Icon entries arrow-down, arrow-up and search are never referenced |
| `src/components/ImportOptionsModal.vue` | consistency | Most dialogs in this group cannot be dismissed with Escape |
| `src/components/ImportOptionsModal.vue:7` | consistency | Exported ImportOptions interface is not used by the consumer, which redeclares the shape |
| `src/components/KeyboardShortcutsModal.vue:298` | dead-code | `.modal-footer kbd` style has no matching element |
| `src/components/MarkdownContent.vue:70` | correctness | Initial mount triggers two renderPendingContent passes |
| `src/components/McpApprovalModal.vue:45` | naming | Approve/Reject buttons are classed `import-btn`/`cancel-btn` |
| `src/components/NodePicker.vue:14` | dead-code | position prop and .position-above CSS have no caller |
| `src/components/NodePicker.vue:34` | consistency | Comment type labels and 'more nodes' text bypass vue-i18n; native title used instead of data-tooltip |
| `src/components/PdfHighlightPicker.vue:100` | consistency | Confirm button stays enabled with nothing selected |
| `src/components/SettingsModal.vue:47` | consistency | Watcher marked async without awaiting anything |
| `src/components/SettingsModal.vue:528` | dead-code | Unused CSS rules `.integration-content` and `.section-divider` |
| `src/components/StorylineEntitySidebar.vue:76` | consistency | Hardcoded strings despite existing locale keys; unreachable empty state |
| `src/components/StorylineEntitySummary.vue:32` | consistency | Duplicated entity-type label map and empty-record literal; hardcoded strings |
| `src/components/StorylineNodeList.vue:15` | dead-code | storylineId prop is declared but never used |
| `src/components/StorylineNodeList.vue:63` | design | defineModel('expandedNodeIds') is never written, so the v-model is one-way |
| `src/components/StorylineNodeList.vue:708` | dead-code | CSS for .node-hover-preview has no matching element |
| `src/components/StorylinePanel.vue:250` | consistency | Hardcoded English strings in an i18n component |
| `src/components/StorylineReader.vue` | design | File exceeds the 1000-line limit (1214 lines) |
| `src/components/StorylineReader.vue:70` | docstring | Orphaned comment above nodeHeadings |
| `src/components/StorylineReader.vue:166` | correctness | Full-width reader width does not follow window resizes |
| `src/components/StorylineReader.vue:522` | consistency | Hardcoded aria-labels in an i18n component |
| `src/components/StorylineReader.vue:784` | dead-code | Unused `fadeIn` keyframes (defined twice) |
| `src/components/StorylineReferencesSidebar.vue:451` | dead-code | Unused CSS classes, fields and a no-op truncation |
| `src/components/StorylineSection.vue:72` | consistency | Hardcoded user-facing strings in an i18n component |
| `src/components/StorylineTimelines.vue:61` | consistency | solidColor only handles rgba(); legacy hex node colors are not normalized |
| `src/components/StorylineTimelines.vue:210` | consistency | Direct write to store.hoverHighlightNodeId duplicates what the hover bus already does |
| `src/components/StorylineTimelines.vue:229` | design | Edge arcs and shared-node connectors ignore span (date_end) marks |
| `src/components/WorkspaceSwitcher.vue:59` | correctness | Enter does nothing after filtering when the highlight index is past the shortened list |
| `src/components/settings/CanvasSettingsPanel.vue:141` | consistency | Edge style picker omits the 'direct' style that the type, storage, i18n, and CanvasControls all support |
| `src/components/settings/LLMSettingsPanel.vue:76` | consistency | Panel's OpenAI default model disagrees with the provider's own default |
| `src/components/settings/McpSettingsPanel.vue:116` | dead-code | Unreachable 'stopped' branch and redundant nested v-if inside the isRunning block |
| `src/components/settings/WorkspaceDiagnosticsSection.vue:32` | consistency | Dynamic import of @tauri-apps/api/core bypasses the shared lib/tauri wrapper used by the sibling panel |
| `src/components/settings/WorkspaceDiagnosticsSection.vue:83` | consistency | console.log of workspace stats bypasses the logger whose level this same component configures |
| `src/components/settings/WorkspaceDiagnosticsSection.vue:187` | consistency | Edge cleanup block hardcodes English while the rest of the component uses vue-i18n |
| `src/components/settings/ZoteroSettingsPanel.vue:222` | consistency | Local-library import failures are only logged; cloud import failures are shown to the user |
| `src/components/settings/ZoteroSettingsPanel.vue:554` | dead-code | Unused CSS rules .zotero-connect, .detect-btn, .zotero-connected, .connected-status |
| `src/composables/useAppSearch.ts:20` | consistency | Diacritic-stripping normalisation duplicated between useAppSearch and useWorkspaceSwitcher |
| `src/composables/useAppSearch.ts:67` | design | Search focus is obtained by probing the document for a shared class name |
| `src/composables/useCitationGraph.ts` | design | No tests cover the citation graph or Zotero composables |
| `src/composables/useCitationGraph.ts:15` | dead-code | Unused backwards-compatibility re-exports and returned utilities |
| `src/composables/useCitationGraph.ts:192` | consistency | isFetchingCitations/fetchProgress are reset on the error path only |
| `src/composables/useCommentMeta.ts:60` | dead-code | useCommentMeta() wrapper is never called; serializeCommentMeta is unreachable from outside |
| `src/composables/useFileSync.ts:345` | consistency | Deleted-file handling with sync off clears file_path in memory only |
| `src/composables/useImport.ts:151` | dead-code | Orphaned doc comments and stale references to a removed helper |
| `src/composables/useImport.ts:555` | dead-code | syncFramesFromFolders has no UI caller |
| `src/composables/useImport.ts:608` | consistency | Dynamic import of syncAllWikilinks from a module already statically imported |
| `src/composables/useKeyboardShortcuts.ts:83` | dead-code | onKeydown is returned but no caller uses it |
| `src/composables/useNodeLayout.ts:57` | correctness | Position updates from collision pushes are fire-and-forget without rejection handling |
| `src/composables/useNotifications.ts:68` | dead-code | clearAll has no callers |
| `src/composables/usePanelReveal.ts:44` | consistency | localStorage access is unguarded, unlike sibling composables |
| `src/composables/useScrollObserver.ts:97` | dead-code | visibleIndices and disconnectObserver are exposed but unused by the only consumer |
| `src/composables/useScrollPositionMemory.ts:74` | dead-code | clearPosition and isRestoring are exposed but never consumed |
| `src/composables/useStorylineMarkdownRendering.ts:65` | docstring | renderAllNodes doc comment detached and inaccurate |
| `src/composables/useStorylineNavigation.ts:103` | dead-code | handleKeydown exported but never consumed outside |
| `src/composables/useStorylineReaderContent.ts:23` | typing | renderAllNodes option typed as returning void but awaited |
| `src/composables/useStorylineReaderContent.ts:105` | dead-code | handleWikilinkClick is exported but consumed only internally |
| `src/composables/useTagNodes.ts:99` | dead-code | getTagNodes has no consumer outside a test |
| `src/composables/useUndoRedo.ts` | consistency | User-visible strings hardcoded while the app ships five locales |
| `src/composables/useUndoRedo.ts:129` | consistency | maxUndo trimming and redo clearing duplicated across eleven push functions |
| `src/composables/useWorkspaceSwitcher.ts:79` | correctness | Highlight index is not clamped when the query shrinks the row list |
| `src/i18n/index.ts:52` | dead-code | Tombstone comment describes a removed function |
| `src/lib/bibtex.ts:84` | correctness | parseFields overwrites the entry type and key with same-named BibTeX fields |
| `src/lib/bibtex.ts:136` | dead-code | The \c{c} cedilla replacement can never match |
| `src/lib/contentParser.ts:30` | docstring | Orphaned docstring for extractWikilinks sits above splitFrontmatter |
| `src/lib/edgeGesture.ts:63` | typing | createEdgeStepper has no doc comment or explicit return type |
| `src/lib/edgeGesture.ts:121` | dead-code | onPointerLeave keeps a top/bottom-edge check whose outcome is never used |
| `src/lib/extraction.ts` | consistency | Frontmatter block regex duplicated six times instead of reusing contentParser.splitFrontmatter |
| `src/lib/geometry.ts:41` | consistency | isValidCoordinate hard-codes 1_000_000 and disagrees with clampCoord at the bound |
| `src/lib/ids.ts:14` | docstring | generateShortId docstring says 10 characters; ID_LENGTH is 8 |
| `src/lib/pdf-export.ts:25` | consistency | Logs with console.* while the sibling typst.ts uses createLogger |
| `src/lib/pdfGraph.ts:257` | correctness | Citation edges reference a nonexistent root when the document has only a references section |
| `src/lib/perfMonitor.ts:201` | docstring | Registered globally in every build although main.ts describes it as dev-only |
| `src/lib/promptSecurity.ts:56` | correctness | IPv6 link-local check covers only fe80:, not the full fe80::/10 range |
| `src/lib/semanticScholar.ts:283` | correctness | A 404 on a later citations page caches a partial list as complete |
| `src/lib/semanticScholar.ts:352` | correctness | Retry recursion inside the outer try re-enters the catch and multiplies retries |
| `src/lib/storage.ts:82` | docstring | Orphaned section docstrings |
| `src/lib/storage.ts:317` | dead-code | Several storage accessors and keys have no callers |
| `src/lib/storage.ts:421` | consistency | Three storage objects reimplement the JSON parse helper |
| `src/lib/tauri.ts:153` | typing | Public wrappers return Promise<unknown> |
| `src/lib/tauri.ts:203` | dead-code | Trailing comment with no code |
| `src/lib/templates.ts:208` | consistency | German starter text mixes three different umlaut conventions |
| `src/lib/templates.ts:1246` | dead-code | Dangling 'Legacy exports' comment and unused StarterTitleKey export |
| `src/lib/textProcessing.ts:46` | correctness | splitIntoChunks skips the whitespace fallback when a sentence end exists but is too early |
| `src/lib/themeInjector.ts:170` | dead-code | clearInjectedTheme is only referenced from tests |
| `src/lib/timelineDates.ts:31` | dead-code | extractFrontmatterDate is only referenced from tests |
| `src/lib/toolCallSummary.ts:20` | docstring | describeToolCall lacks a doc comment and its args fallback contradicts its type |
| `src/lib/typst-export.ts:100` | correctness | Content headings are promoted above the node's own section heading |
| `src/lib/typst-export.ts:122` | dead-code | Code-block and inline-code replacements are identity transforms |
| `src/lib/typst-export.ts:167` | correctness | citationToTypst never emits the journal when authors are present |
| `src/lib/typst-export.ts:292` | dead-code | nodeToTypst is referenced only by tests |
| `src/lib/typst.ts:12` | naming | Cache described as LRU evicts FIFO |
| `src/lib/typst.ts:23` | design | A failed WASM initialisation is sticky: initPromise is never cleared on rejection |
| `src/lib/zoteroApi.ts:202` | consistency | getAllDOIs re-fetches the same endpoint as getItems |
| `src/llm/agentModes.ts:5` | docstring | Header and orphaned doc comment misdescribe the modes |
| `src/llm/providers/anthropic.ts:130` | docstring | Stale prefill comment and legacy default model ids |
| `src/llm/providers/http.ts:9` | consistency | Duplicated isTauri check; httpStreamFetch lacks the fallback and header handling of httpFetch |
| `src/llm/providers/openai.ts:173` | consistency | Tool-call mapping duplicates parseOpenAIToolCalls; model filter hides non-gpt models |
| `src/llm/research.ts:72` | consistency | Reads the search API key with a duplicated localStorage literal |
| `src/llm/research.ts:196` | docstring | Disambiguation handling and follow-up queries are anatomy/history-specific heuristics |
| `src/llm/tokenEstimator.ts:65` | docstring | Node estimate ignores content despite comment and parameter type |
| `src/llm/toolExecutor.ts:31` | dead-code | Duplicate getAgentTools, unused hasTool, and unused barrel exports |
| `src/llm/tools/batchTools.ts:100` | correctness | JSON repair regex corrupts colons inside string values |
| `src/llm/tools/handlers/colorHandlers.ts:206` | design | color_regex compiles a model-supplied pattern and runs it over every node on the UI thread |
| `src/llm/tools/handlers/index.ts:44` | naming | Local `toolRegistry` Map shadows the name of the registry singleton |
| `src/llm/tools/handlers/types.ts:112` | dead-code | Handler ToolContext requires fields no handler reads; ToolDefinition export is unused |
| `src/llm/tools/index.ts:63` | docstring | `agentTools` is a load-time snapshot but documented as returning fresh data |
| `src/llm/tools/knowledgeBaseTools.ts:220` | correctness | Target-reached check measures pre-existing graph size, not build progress |
| `src/llm/tools/nodeEditTools.ts:11` | dead-code | Node-edit and fetch_url handler bodies return markers nothing consumes |
| `src/llm/tools/nodeTools.ts:135` | consistency | create_edges_batch has no guard for a missing or string `edges` argument |
| `src/llm/tools/planningTools.ts:4` | docstring | File headers list a subset of the tools they register and describe a stale dispatch path |
| `src/llm/tools/queryTools.ts:21` | typing | `as never` cast disables type checking on the shared connected-components call |
| `src/llm/tools/queryTools.ts:199` | dead-code | query_nodes computes a `preview` field it never outputs |
| `src/llm/tools/selectionTools.ts:181` | consistency | connect_selected_to re-implements title lookup instead of using findNodeByTitle |
| `src/llm/types.ts:23` | naming | Two different ToolDefinition types in the same module |
| `src/mcp/handlers/edgeHandlers.ts:8` | consistency | Two separate import statements from the same module |
| `src/mcp/handlers/edgeHandlers.ts:128` | consistency | batch_create_edges silently drops invalid pairs and still reports success |
| `src/mcp/handlers/frameHandlers.ts:264` | consistency | Containment geometry differs between the four places that compute it |
| `src/mcp/handlers/frameHandlers.ts:343` | dead-code | Redundant null check inside a branch that already guarantees non-null |
| `src/mcp/handlers/frameHandlers.ts:502` | correctness | Handler mutates the store's frame object directly with an unclamped value |
| `src/mcp/handlers/index.ts:9` | dead-code | Re-exports of converters and helpers that nothing outside the handlers directory imports |
| `src/mcp/handlers/nodeHandlers.ts:577` | correctness | A position update with only x or only y is silently ignored |
| `src/mcp/messageHandler.ts:371` | typing | Router casts params to narrower shapes than the handlers accept |
| `src/mcp/types.ts:141` | dead-code | Unused JSON-RPC error codes |
| `src/services/MarkdownRenderService.ts:115` | dead-code | Theme and cacheKey are computed only to be discarded with `void cacheKey` |
| `src/stores/agentTasks.ts:129` | dead-code | failTask, getTask, getSummary and sessionStartedAt are never used outside the store |
| `src/stores/display.ts:42` | docstring | readNode carries showAgentPanel's docstring; showAgentPanel is unused |
| `src/stores/edges.ts:138` | consistency | Edge mutations disagree on whether a failed backend write is applied locally |
| `src/stores/frames.ts:60` | consistency | createFrame and createFrameAsync duplicate the frame construction body |
| `src/stores/nodes.ts:466` | consistency | Inline callbacks duplicate store functions |
| `src/stores/nodes/advanced.ts:1` | docstring | Module header does not describe its contents |
| `src/stores/nodes/advanced.ts:187` | consistency | resetDefaultWorkspace reads the locale from localStorage instead of the i18n module |
| `src/stores/nodes/crud.ts:167` | consistency | Debug console.log left in hot paths and mixed logging APIs |
| `src/stores/nodes/crud.ts:179` | dead-code | refreshNodeFromFile is passed around but never called |
| `src/stores/nodes/edges.ts:70` | correctness | restoreEdge and deduplicateEdges drop the promises they wrap |
| `src/stores/nodes/edges.ts:88` | docstring | updateEdgeLabel is documented as 'Update edge color' |
| `src/stores/nodes/hashtagBackfill.ts:84` | docstring | onTags parameter is never supplied and its docstring describes behaviour that does not exist |
| `src/stores/nodes/state.ts:174` | dead-code | initializeStore takes a `_createNode` parameter it never uses |
| `src/stores/nodes/state.ts:176` | dead-code | initializeStore takes a _createNode parameter it never uses |
| `src/stores/nodes/state.ts:202` | consistency | Raw console.* logging mixed with storeLogger in the store modules |
| `src/stores/nodes/state.ts:244` | design | Any load failure replaces the graph with mock sample data |
| `src/stores/nodes/undoRecorder.ts:92` | dead-code | resetUndoRecorder is used only by tests |
| `src/stores/nodes/wikilinkSync.ts:31` | dead-code | syncWikilinks accepts _content that it never uses |
| `src/stores/storylines.ts:302` | naming | getStorylineNodes is a getter that deletes and creates edges |
| `src/stores/themes.ts:7` | consistency | themes store imports invoke from @tauri-apps/api/core instead of the lib/tauri wrapper |
| `src/stores/workspaces.ts:164` | consistency | deleteWorkspace removes the workspace locally after a failed backend delete |
| `src/types/index.ts:20` | dead-code | NodeType, LinkType, ImportOntologyInput and OntologyLayout are declared but never used |

## Appendix B: refuted findings

Reported by a reviewer and rejected by the verifier after reading the code. Listed so they are not re-raised.

- `src-tauri/src/pdf.rs:165` Contents is reported as both the highlighted text and the comment
- `src-tauri/src/commands/workspaces.rs:101` delete_workspace permanently removes files while delete_node moves them to trash
- `src-tauri/src/commands/vault_watcher.rs:617` delete_originals permanently removes the user's files and leaves content only in SQLite
- `src/canvas/GraphCanvas.vue:1790` fitNodeNow re-implements save-on-exit and fires updateNodeContent without awaiting it
- `src/canvas/composables/edges/useEdgeManipulation.ts:104` reverseEdge and insertNodeOnEdge delete the edge before the replacement is created, with no error handling
- `src/composables/useMcpServer.ts:9` Listens via @tauri-apps/api/event directly and leaves listener promises unhandled
- `src/components/KeyboardShortcutsModal.vue:83` Window keydown listener is never removed on unmount and duplicates the backdrop handler
