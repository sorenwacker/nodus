# Codebase Review — 260718

Full review of the Nodus codebase covering performance, security, maintainability, and elegance.
Method: 22 module-group review agents read all 296 source files; every high/medium finding was
then checked by an independent adversarial verification agent instructed to refute it. Only
confirmed findings appear in the main sections; verifier-corrected severities are used.

## Baseline gates

| Gate | Command | Result |
|------|---------|--------|
| Frontend lint | `npm run lint` (eslint) | Pass — 3 warnings, all `vue/no-v-html` |
| Frontend tests | `vitest run` | Pass — 444/444 tests, 28 files |
| Rust lint | `cargo clippy -- -D warnings` | Pass |
| Rust tests | `cargo test` | Pass — 67/67 (1 ignored) |
| Dependency audit (npm) | `npm audit` | 3 vulnerabilities (2 high, 1 moderate) in pinned vite 6.4.2 |
| Dependency audit (Rust) | `cargo audit` | Not installed; not a configured gate |
| File-size rule (1000 LOC) | project rule | 1 violation: `src/canvas/PixiCanvas.vue` (2332 lines) |

Note: `cargo test`/`clippy` require the `dist/` directory to exist (Tauri `frontendDist`); a fresh
checkout without a frontend build fails to compile the test binary.

## Summary

- Files reviewed: 296
- Raw findings: 345
- Confirmed by adversarial verification: 180 (15 high, 110 medium, 55 low after severity correction)
- Refuted (false positives removed): 6
- Unverified low-severity notes (appendix): 159

### Recurring themes

1. **Unvalidated filesystem and network surfaces in the Rust backend.** `move_node_file` moves or
   deletes caller-controlled paths without the vault containment check its sibling commands use;
   `http_request` is an unrestricted proxy; `fetch_url` routes URLs through r.jina.ai; the MCP
   WebSocket server performs no Origin check and leaves rejected/stale connections open.
2. **Silently swallowed database errors.** Most migrations run under `let _ =`; migration 008 is
   invalid SQL and has never executed; `deduplicate()` deletes legitimate multi-type edges;
   storyline `add_node` violates its own UNIQUE constraint; several multi-row operations lack
   transactions.
3. **Two parallel LLM tool systems that have drifted apart.** The registry (`src/llm/tools`) and the
   canvas layer (`useLLMTools`/`useMarkerHandlers`) both implement tools; marker strings connect
   them, and several markers have no consumer, leaving smart_move, smart_connect, web_search and
   others unreachable no-ops. The agent runner also has ordering bugs (completion heuristic before
   tool parsing) and the Anthropic provider drops tool-role messages entirely.
4. **Dead or duplicated canvas code.** The whole layout-strategy subsystem, `useCanvasNodeSizing`,
   and `useCanvasInit` are unreachable; PixiCanvas.vue (2332 lines) duplicates logic that exists in
   composables; coordinate math and frame-membership rules are each defined in multiple places.
5. **Hot-path performance debt in the canvas.** Per-frame edge re-routing, full Map rebuilds in
   viewport culling, O(n^3) synchronous tetris layout, and one backend invoke per node per
   pointermove during frame drags all work against the 500-nodes-at-60fps target.

## High severity (15)

#### move_node_file allows arbitrary filesystem move/delete outside workspace vaults

`src-tauri/src/commands/nodes.rs:841` — correctness

`move_node_file(node_id, target_folder, collision_resolution)` never validates `target_folder` against workspace vaults, even though the module provides `validate_path_in_workspace` (mod.rs:61) and uses it in pdf.rs and read_file_content. `target_folder` comes straight from the webview: `let target_dir = Path::new(&target_folder); let mut new_path = target_dir.join(filename);` and later `std::fs::create_dir_all(target_dir)` + `std::fs::rename(old_path, &new_path)`. Worse, the "replace" resolution executes `std::fs::remove_file(&new_path)` on a path fully controlled by the caller (target_folder + filename). A compromised webview (e.g. XSS via LLM output) can move vault files anywhere on disk or delete arbitrary files the user can write to. `check_file_collision` (line 798) has the same unvalidated `target_folder`.

**Fix:** Call `validate_path_in_workspace(target_dir)` (or resolve target_folder relative to the node's workspace vault and reject paths outside it after canonicalization) before any fs operation, in both move_node_file and check_file_collision.

#### deduplicate() deletes legitimate edges: groups by source/target only, ignoring link_type

`src-tauri/src/database/edges.rs:153` — correctness

`DELETE FROM edges WHERE id NOT IN (SELECT MIN(id) FROM edges GROUP BY source_node_id, target_node_id)` contradicts the schema's own `UNIQUE(source_node_id, target_node_id, link_type)` constraint (001_init.sql / 008), which deliberately allows multiple edges of different link_types between the same pair ("needed for ontology imports where classes can have multiple relationships"). deduplicate() is invoked automatically after vault import (commands/vault_watcher.rs:602) and via the deduplicate_edges command, so an ontology import that creates e.g. a 'cites' and a 'supports' edge between the same two nodes will have one of them destroyed. Additionally, `MIN(id)` over UUID-string ids picks an arbitrary edge, not "the first one" as the doc comment claims — the survivor is not the oldest.

**Fix:** Group by (source_node_id, target_node_id, link_type), and pick the survivor by MIN(created_at) (tie-break on id) so the doc comment 'keeping only the first one' becomes true.

#### Migration 008 always fails: RAISE(IGNORE) is invalid outside a trigger, and the error is swallowed

`src-tauri/src/database/mod.rs:110` — correctness

migrations/008_edge_multi_type.sql begins with `SELECT CASE WHEN EXISTS (...) THEN RAISE(IGNORE) END;`. In SQLite, RAISE() may only be used within a trigger program; this statement fails at prepare time unconditionally (verified: `Error: in prepare, RAISE() may only be used within a trigger-program`). Because mod.rs runs it as `let _ = sqlx::query(include_str!("../../migrations/008_edge_multi_type.sql")).execute(pool).await;`, the entire multi-statement migration silently never executes. Databases created before 001_init.sql gained `UNIQUE(source_node_id, target_node_id, link_type)` keep the old `UNIQUE(source, target)` constraint forever, so multi-link-type edges (the whole point of 008, needed for ontology import) silently fail to insert on legacy databases.

**Fix:** Replace the RAISE(IGNORE) guard with a Rust-side check (query sqlite_master or pragma_index_list for the 3-column unique index, like the `directed` column check at mod.rs:120), run the table-rebuild statements inside a transaction, and propagate errors instead of discarding them.

#### storylines::add_node with explicit position violates UNIQUE constraint and corrupts ordering on duplicate insert

`src-tauri/src/database/models.rs:247` — correctness

storyline_nodes has `UNIQUE (storyline_id, sequence_order)` (002_storylines.sql). The positional-insert path runs `UPDATE storyline_nodes SET sequence_order = sequence_order + 1 WHERE storyline_id = ? AND sequence_order >= ?`. SQLite checks the unique constraint per-row during UPDATE, so shifting two or more consecutive rows upward fails with a constraint violation — the exact problem reorder_nodes (line 346) works around with its negative-temp-value two-pass trick, which add_node does not use. Two further defects in the same function: (1) the shift executes before the `INSERT OR IGNORE`, so when the node is already in the storyline the insert is ignored but the shift is not rolled back, leaving a permanent gap in sequence_order; (2) unlike its siblings reorder_nodes and workspaces::delete, none of this runs in a transaction, so a mid-way failure leaves half-shifted state.

**Fix:** Wrap add_node in a transaction; check for existing membership before shifting; perform the shift with the same negative-offset two-pass technique used by reorder_nodes (or shift in descending sequence_order).

#### File is 2332 lines, violating the 1000-line hard rule

`src/canvas/PixiCanvas.vue` — design

PixiCanvas.vue is 2332 lines against the project hard rule of 1000. The script block is mostly composable wiring plus several self-contained feature clusters that do not need to live here: LLM/agent wiring (lines ~1052-1298: useLLM destructure, useCanvasLLMState, useMarkerHandlers, useLLMTools, executeAgentTool, useAgentRunner, usePlanHandlers, sendGraphPrompt, onPromptKeydown), node fitting workflows (fitNodeToContent ~999, fitAllNodesToContent ~1018, resetAllNodeSizes ~1040, fitSelectedNodes ~1685, fitNodeNow ~1716), frame auto-expansion (expandFrameToFitNode ~1443-1500), window-event listeners (~206-262), and the file-move collision dialog state (~127-157). The template also renders ~10 modal/overlay children that could be grouped.

**Fix:** Concrete split plan: (1) extract useCanvasAgentIntegration (agent/LLM wiring + executeAgentTool + sendGraphPrompt, ~250 lines); (2) extract useNodeFitting (fitNodeToContent/fitAllNodesToContent/fitSelectedNodes/fitNodeNow/resetAllNodeSizes, ~150 lines); (3) move expandFrameToFitNode into composables/frames (it only touches frame store APIs); (4) extract useCanvasWindowEvents for the 8 window listeners; (5) extract a CanvasOverlays.vue wrapper for the modal/progress children (PlanApprovalModal, ImportOptionsModal, CitationProgress, ZoteroProgress, LinkPickerModal, FileMoveCollisionDialog, KeyboardShortcutsModal). This brings the file under ~1000 lines without changing behavior.

#### Frame-assignment revert is a no-op: node.frame_id already mutated before revert

`src/canvas/composables/nodes/useNodeDragging.ts:418` — correctness

In stopNodeDrag, `store.assignNodesToFrame([nodeId], assignedFrameId)` (line 382) mutates `node.frame_id` in place (confirmed: assignNodesToFrame in src/stores/nodes/frames.ts sets `node.frame_id = frameId` on the same object `store.getNode` returns). The async `handleFileMove` closure later 'reverts' with `store.assignNodesToFrame([nodeId], node.frame_id)` on user cancel (line 418) and on move failure (line 440) — but by then `node.frame_id` IS the new frame id, so the call is a no-op (the `node.frame_id !== frameId` guard in the store even skips the backend invoke). If the user cancels the collision dialog or the file move fails, the node stays assigned to the new frame while its .md file remains in the old folder, silently desyncing DB metadata from the file system.

**Fix:** Capture the pre-assignment frame id (`currentFrameId` or `oldAssignments.get(nodeId)`) before calling assignNodesToFrame and use that captured value in both revert paths.

#### Completion heuristic runs before fallback tool-JSON parsing, causing premature termination

`src/canvas/composables/agent/useAgentRunner.ts:436` — correctness

In the msg.content branch: `if (msg.content.includes('?') || /done|complete|finished|empty/i.test(msg.content)) { ... return { status: 'done' ... } }` executes BEFORE the fallback tool-call parsers at lines 441-492. Any embedded tool JSON whose text contains a '?' or the substrings done/complete/finished/empty terminates the agent without executing the tool. Example: a model without native tool calling emits `{"name": "create_node", "arguments": {"title": "Task complete", ...}}` or `<|channel|>commentary to=done<|message|>{...}` — the word 'complete'/'done' matches, the run returns status 'done', and the balanced-JSON extraction that was written specifically for this format (extractBalancedJson, channelMatch) is unreachable for those inputs. This also defeats the hasEmbeddedToolsInContent skip at line 332: after deliberately skipping native tool calls to process the content, the content is then killed by this heuristic.

**Fix:** Attempt tool-JSON extraction first; only apply the done/question heuristics when no tool JSON was found. Consider anchoring the heuristic (e.g., short messages only, as useNodeAgent.ts line 435 does with `msg.content.length < 100`).

#### smart_move, smart_connect, and web_search implementations are unreachable; tools no-op in the agent flow

`src/canvas/composables/agent/useLLMTools.ts:234` — correctness

The registry versions of these tools (src/llm/tools/smartTools.ts, src/llm/tools/planningTools.ts) return raw markers: `return `__SMART_MOVE__:${args.instruction}``, `__SMART_CONNECT__:...`, `__WEB_SEARCH__:${args.query}`. Grep across the whole tree shows NO consumer for these three markers. In PixiCanvas.executeAgentTool the dispatch order is: executeTool (registry) -> handleMarker (does not handle these markers, returns null) -> `if (!result.startsWith('__UNHANDLED__:')) return result` -> the raw marker string is returned to the LLM as the tool result. The real implementations in useLLMTools (cases 'smart_move' line 234, 'smart_connect' line 270, 'web_search' line 306) are therefore never executed in production; they only run in unit tests that call executeLLMTool directly. The system prompt (systemPrompt.ts lines 229-235) still advertises smart_move/smart_connect to the model, so the agent calls a tool that silently does nothing and receives '__SMART_MOVE__:...' back as its result.

**Fix:** Either make the registry handlers return `__UNHANDLED__:smart_move` (matching smart_color/color_matching) so the flow falls through to useLLMTools, or add __SMART_MOVE__/__SMART_CONNECT__/__WEB_SEARCH__ cases to useMarkerHandlers.handleMarker. Add an integration test that drives executeAgentTool end-to-end for these tool names.

#### Drop position uses Tauri PhysicalPosition as logical client coordinates

`src/canvas/composables/util/usePdfDrop.ts:455` — correctness

`setup()` passes `event.payload.position` from Tauri v2's onDragDropEvent straight into `viewState.screenToCanvas(position.x, position.y)`. The drag-drop payload position is a PhysicalPosition (physical pixels), while screenToCanvas (src/canvas/composables/viewport/useViewState.ts:111) subtracts `rect.left`/`offsetX` which are logical CSS pixels. On any HiDPI display (e.g. 2x Retina), dropped PDFs/markdown/bib files are created at 2x the intended canvas coordinates — far from the cursor.

**Fix:** Convert to logical coordinates first, e.g. `const dpr = window.devicePixelRatio; screenToCanvas(position.x / dpr, position.y / dpr)` or use `position.toLogical(await getCurrentWindow().scaleFactor())`.

#### cleanContent corrupts legitimate LaTeX and code content

`src/llm/utils.ts:8` — correctness

cleanContent() runs `.replace(/\\n/g, '\n')` and `.replace(/\\t/g, '\t')` on all LLM-generated node content (applied in nodeTools.ts, updateTools.ts, batchTools.ts). These match ANY literal backslash-n / backslash-t sequence, so LaTeX commands are silently mangled: `\nabla` -> newline+`abla`, `\neq` -> newline+`eq`, `\times` -> tab+`imes`, `\theta` -> tab+`heta`, `\text{...}` -> tab+`ext{...}`. Since the app explicitly supports math notes (typstFormat.ts exists to convert LaTeX to Typst), LLM output containing LaTeX is a normal case and gets destroyed before typst conversion can see it. Additionally `.replace(/;\s*$/gm, '')` strips trailing semicolons from every line, corrupting any code block in C/Java/JS/Rust style where lines legitimately end with `;`. The `/direct\s*\.end/gi` removal is an undocumented model-specific hack that could also delete legitimate prose.

**Fix:** Only unescape `\n`/`\t` when the string demonstrably came from double-escaped JSON (e.g. contains no raw newlines at all, or apply only to strings that fail a heuristic like `!text.includes('\n') && text.includes('\\n')`). Never strip trailing semicolons; if a specific model emits artifacts, strip them in that provider adapter, not globally.

#### console.log writes to stdout and corrupts the MCP stdio protocol

`packages/nodus-mcp-server/src/websocket-client.ts:66` — correctness

The MCP server communicates with the host (e.g. Claude Desktop) over stdout via StdioServerTransport. Any non-protocol bytes on stdout break JSON-RPC framing. index.ts is careful to use console.error everywhere, but websocket-client.ts uses console.log at lines 66, 71, 82, 158, 164, 171, and 202 (e.g. `console.log(`[MCP Client] Connecting to ${url}...`)`). Every connect, disconnect, reconnect, and approval event injects garbage into the MCP stdout stream, which can make the host drop or fail to parse protocol messages.

**Fix:** Replace all console.log calls in websocket-client.ts with console.error (stderr), matching index.ts.

#### chat() silently drops tool-role messages and assistant tool_calls, breaking agent tool loops

`src/llm/providers/anthropic.ts:160` — correctness

The message conversion loop only handles 'system', 'user', and 'assistant' roles: `} else if (msg.role === 'user' || msg.role === 'assistant') { messages.push({ role: msg.role, content: msg.content }) }`. The agent runner (src/canvas/composables/agent/useAgentRunner.ts:369) pushes `{ role: 'tool', content: result, tool_call_id: tc.id }` after executing each tool. With the Anthropic provider those tool results are discarded entirely, and the preceding assistant turn loses its tool_calls (they are not converted to tool_use content blocks). Additionally, a pure tool-call assistant turn has content '' and Anthropic rejects empty text content blocks, so the follow-up request fails with a 400. Net effect: multi-turn tool use does not work with the Anthropic provider, while it does with OpenAI/Ollama/OpenAI-compatible.

**Fix:** Convert assistant tool_calls into Anthropic tool_use content blocks, convert role:'tool' messages into user messages containing tool_result blocks keyed by tool_call_id, and skip empty text blocks.

#### Panel is permanently hidden: optional boolean prop defaults to false, defeating the 'visible !== false' guard

`src/components/AgentTaskPanel.vue:38` — correctness

The component declares `visible?: boolean` via type-only defineProps and gates rendering with `const shouldShow = computed(() => (props.visible !== false) && tasksStore.totalTasks > 0)`. In Vue 3, a prop declared with Boolean type that is absent is cast to `false`, not `undefined`. The only usage in the codebase is `<AgentTaskPanel />` in src/canvas/PixiCanvas.vue:2325 (no `visible` binding), so `props.visible` is `false`, `props.visible !== false` is `false`, and the task panel never renders even when agent tasks exist. The entire agent task progress UI is dead at runtime.

**Fix:** Use `withDefaults(defineProps<{ visible?: boolean }>(), { visible: true })` and gate with `props.visible && tasksStore.totalTasks > 0`, or drop the prop entirely since no caller sets it.

#### getItems/getCollectionItems silently truncate to 25 items (no pagination)

`src/lib/zoteroApi.ts:163` — correctness

The Zotero Web API v3 returns at most 25 items per request unless a `limit` parameter is passed (max 100). `getItems()` requests `/items/top?itemType=-attachment&format=json` and `getCollectionItems()` requests `/collections/{key}/items?itemType=-attachment&format=json` with no `limit`/`start` and no pagination loop, so any library or collection with more than 25 items is silently truncated. Both are used for import flows (src/composables/useZotero.ts:142,162 and ZoteroSettingsPanel.vue:194,211), meaning users importing a real library get only the first 25 references with no error. The sibling method `getAllDOIs()` (line 175) already implements the correct pagination pattern (`limit=100&start=...` loop), so the two read paths are inconsistent within the same class.

**Fix:** Extract the pagination loop from getAllDOIs into a private `requestAllPages<T>(endpoint)` helper and use it in getItems, getCollectionItems, and getAllDOIs.

#### Custom code renderer emits code text and lang into HTML without escaping

`src/lib/markdown.ts:13` — correctness

The custom marked renderer returns `<pre><code${langClass}>${trimmedCode}</code></pre>` with `trimmedCode` and `lang` interpolated raw. marked's default code renderer HTML-escapes code content; this override drops that. Consequences: (1) any code block containing `<`, `>`, or `&` renders wrong — e.g. `#include <stdio.h>` is parsed as an HTML tag and then stripped by the downstream sanitizeHtml() in MarkdownRenderService.renderMarkdown, silently losing content; (2) a code fence is a raw-HTML injection point into the pre-sanitization pipeline (only DOMPurify at the end prevents XSS; e.g. `<img src=...>` survives since img/src are in htmlConfig ALLOWED_TAGS); (3) `lang` comes from the fence info string and is interpolated into `class="language-${lang}"` unescaped, so a `"` in the info string breaks out of the attribute; (4) MarkdownRenderService's mermaid post-processing calls decodeHtmlEntities(code) expecting entity-encoded content, so mermaid source that legitimately contains entity-like sequences (e.g. `&amp;`) is double-decoded and corrupted.

**Fix:** Escape `text` (and `lang`) before interpolation, e.g. reuse an escape helper equivalent to marked's `escape()` or drop the custom renderer and post-process trimming instead.

## Medium severity (110)

### rust-commands

#### delete_edge on a merged bidirectional wikilink edge only strips the source side

`src-tauri/src/commands/edges.rs:80` — correctness

For `link_type == "wikilink"` the command rewrites only the source node: `remove_wikilinks_to_target(content, &target.title)` on `source.markdown_content`. The codebase merges reciprocal wikilinks into a single undirected edge (`merge_bidirectional_wikilinks`, invoked in sync_node_wikilinks line 194 and sync_all_wikilinks line 262). When such a merged edge (directed=false) is deleted, the target file still contains `[[source]]`, so the next wikilink sync recreates the edge — the user's deletion does not stick.

**Fix:** When the edge is undirected (edge.directed == false), also rewrite the target node's content to remove wikilinks pointing at the source title.

#### http_request is an unrestricted HTTP proxy (SSRF surface)

`src-tauri/src/commands/http.rs:26` — correctness

`pub async fn http_request(input: HttpRequestInput)` forwards any URL, method, headers, and body from the webview with no host allowlist and no scheme restriction: `let mut request = match input.method.to_uppercase().as_str() { "GET" => client.get(&input.url), ... }`. It deliberately bypasses CORS, so any script in the webview (including code paths driven by LLM output via src/llm/providers/http.ts) can probe localhost services, cloud metadata endpoints (169.254.169.254), or intranet hosts, with arbitrary headers (e.g. exfiltrating stored API keys to any origin). The file comment says it exists "for LLM API calls" but nothing constrains it to LLM providers.

**Fix:** Maintain an allowlist of configured LLM provider base URLs (or at least require https and reject private/loopback/link-local IP ranges after DNS resolution), and reject non-allowlisted destinations.

#### create_node_from_file vault containment check is bypassable

`src-tauri/src/commands/nodes.rs:95` — correctness

The canonicalize/starts_with vault check only runs inside `if let Some(ref ws_id) = workspace_id { if let Ok(Some(workspace)) = ... { if let Some(vault_path) = ... } } }`. Passing `workspace_id: None` (or an id whose workspace has no vault_path, or a lookup error since `if let Ok(...)` swallows Err) skips validation entirely, leaving only the weak `file_path.contains("..")` test — which absolute paths pass trivially. Any readable `.md` file on disk (e.g. ~/.ssh notes, other apps' data) can then be ingested into the database and displayed. This contradicts the enforcement pattern of `validate_path_in_workspace` used by pdf.rs and read_file_content.

**Fix:** Make the containment check unconditional: require the file to resolve inside some workspace vault via validate_path_in_workspace, and treat workspace lookup failure as an error rather than skipping validation.

#### create_file_for_node silently overwrites an existing vault file

`src-tauri/src/commands/nodes.rs:449` — correctness

After sanitizing the title, the command writes with `std::fs::write(&file_path, &content)` without checking existence. If the vault already contains `<title>.md` (created by Obsidian or another node), its content is destroyed and the node claims the path. The sibling bulk exporter `export_nodes_to_files` (line 555) explicitly guards this case: `if file_path.exists() { println!("[ExportNodes] Skipping..."); continue; }`. Same operation, divergent behavior — and the single-node path is the data-destroying one.

**Fix:** Check `file_path.exists()` and either error out or auto-rename with a numeric suffix (as move_node_file's "auto" resolution does) before writing.

#### update_node is a registered no-op stub that reports success

`src-tauri/src/commands/nodes.rs:597` — naming

`pub async fn update_node(_input: UpdateNodeInput) -> Result<(), String>` does nothing except get the pool and `Ok(())` (`// TODO: Implement partial update`). It is registered in main.rs:192, so any caller receives success while no update happens — a silent data-loss trap. Grep shows no `invoke('update_node')` anywhere in src/ or packages/ (the `update_node` hits are the MCP tool name routed through store actions in src/mcp/messageHandler.ts), so today it is also dead code, and `UpdateNodeInput` carries `#[allow(dead_code)]` to suppress the evidence. This violates both the naming-honesty rule and the no-dead-code rule.

**Fix:** Either implement the partial update or delete the command, its registration in main.rs, and the UpdateNodeInput struct with its #[allow(dead_code)].

#### import_ontology inserts nodes/edges one-by-one with no transaction

`src-tauri/src/commands/ontology.rs:111` — correctness

Nodes and edges are persisted with sequential awaited inserts: `for node in &result.nodes { database::nodes::create(pool, node).await.map_err(...)?; }` and the same for edges. The function explicitly anticipates ontologies with >500 entities (grid-layout fallback at line 90), which means thousands of individual DB round trips, and the `?` on each insert aborts mid-loop leaving a partially imported graph with no rollback. The same per-row insert pattern exists in import_vault (vault_watcher.rs lines 524 and 593) and sync_wikilinks_for_node_with_map (nodes.rs lines 368, 377).

**Fix:** Wrap the import in a transaction (LibSQL supports it; the design doc cites BEGIN CONCURRENT) and/or add batch insert helpers in the database layer; roll back on failure.

#### fetch_url leaks every URL to r.jina.ai and falls back to unvalidated direct fetch

`src-tauri/src/commands/web_search.rs:109` — correctness

`let jina_url = format!("https://r.jina.ai/{}", url);` routes every fetched URL — including private, intranet, or credential-bearing URLs — through a third-party service without user disclosure or opt-out. On non-success it falls back to `fetch_url_direct`, an unvalidated GET of the raw URL (SSRF into localhost/intranet). This command is exposed to the LLM agent (src/canvas/composables/agent/useNodeAgent.ts registers 'fetch_url'), so prompt-injected content can direct fetches. Additionally, `fetch_url_direct` recompiles four `regex::Regex::new(...).unwrap()` patterns on every call.

**Fix:** Document/gate the Jina proxying behind a setting, validate the scheme is http(s) and reject loopback/private address ranges, and compile the regexes once with std::sync::LazyLock.

### rust-core

#### Database initialization failure is logged and swallowed; app launches in a broken state

`src-tauri/src/main.rs:86` — correctness

In setup, `if let Err(e) = database::initialize(&app_handle).await { eprintln!(...) }` prints to stderr and continues. If the DB cannot be initialized (disk full, corrupt file, permissions), the app starts anyway and every subsequent command fails with unrelated-looking errors; the user gets no indication of the root cause. The comment above it even says 'must complete before app starts'.

**Fix:** Propagate the error from setup (`return Err(e.into())`) so Tauri aborts startup with a clear message, or surface a blocking error dialog before continuing.

#### Website/Docs menu items rely on window.open inside the webview, which wry does not open externally

`src-tauri/src/main.rs:179` — correctness

The `website` and `docs` menu handlers do `window.eval("window.open('https://nodus.app', '_blank')")`. Inside a Tauri v2 wry webview, `window.open` to an external URL does not open the system browser — new-window requests are not honored by default, and no frontend interceptor exists (grep of src/ shows only the same window.open pattern in src/lib/tauri.ts:54). These menu items are most likely no-ops on macOS.

**Fix:** Open the URL from Rust using the shell plugin that is already registered: `app.shell().open("https://nodus.app", None)` (tauri_plugin_shell::ShellExt), or use tauri-plugin-opener. Same fix applies to the fallback in src/lib/tauri.ts.

#### stop_server does not disconnect existing clients

`src-tauri/src/mcp_websocket.rs:221` — correctness

The shutdown channel only breaks the accept loop. Per-connection tasks spawned in the accept loop keep running: their WebSocket streams stay open, the outgoing forwarder task stays alive, and clients remain connected after the server reports 'stopped'. `state.connections.write().await.clear()` removes registry entries, so subsequent messages from those still-connected clients hit `connections.get(&connection_id) == None`, are treated as unapproved, and receive 'Connection pending approval' errors indefinitely — while `get_mcp_status` reports the server as not running.

**Fix:** On shutdown, iterate current connections and close them: either send a Close frame through each connection's channel (requires the channel to carry `Message`) or store per-connection abort handles / a watch channel that handle_connection selects on, so all sockets are torn down when the server stops.

#### Rejected connections are never closed

`src-tauri/src/mcp_websocket.rs:258` — correctness

`approve_connection` with `approved == false` sets `conn.state = ConnectionState::Rejected` and sends a NOT_APPROVED error, but the comment says 'Send rejection and close' while nothing closes the socket. handle_connection keeps reading; since `is_approved` is false, a rejected client can sit connected forever receiving 'Connection pending approval' (a misleading message for a rejected connection), and the entry stays in the connections map until the client chooses to disconnect. The ConnectionState::Rejected variant is effectively indistinguishable from PendingApproval in the message loop.

**Fix:** After rejection, drop the connection: send a Close frame (or drop the sender and have handle_connection detect Rejected state and break out of the read loop), and remove the entry from the map. Also branch the unapproved-message error on Rejected vs PendingApproval.

#### No Origin check on WebSocket handshake; approval dialog gives the user nothing to identify the client

`src-tauri/src/mcp_websocket.rs:322` — correctness

The server binds to 127.0.0.1 (good), but `tokio_tungstenite::accept_async` accepts any handshake, including ones initiated by JavaScript on an arbitrary web page (cross-site WebSocket hijacking: browsers allow ws:// connections to localhost from any origin). The only gate is user approval, and `ConnectionRequestEvent` carries just a random UUID — no Origin header, process info, or client-supplied name — so the user has no way to distinguish a legitimate MCP client from a hostile browser tab and will plausibly click approve. An approved hostile page then gets full MCP tool access (node content read/write, file paths).

**Fix:** Use `accept_hdr_async` to inspect the handshake: reject requests that carry a browser `Origin` header (native MCP clients don't send one), and surface any client-identifying info (user-agent, requested subprotocol, client name from an initial handshake message) in ConnectionRequestEvent so the approval dialog shows something meaningful. A shared token in the URL query (displayed in the Nodus UI) would be a stronger fix.

#### WebSocket Ping answered with a text data frame that corrupts the JSON-RPC stream

`src-tauri/src/mcp_websocket.rs:438` — correctness

In handle_connection, `Ok(Message::Ping(data))` is handled by pushing `c.sender.send(format!("PONG:{}", hex::encode(&pong_data)))` through the outgoing channel. The outgoing task wraps every channel message in `Message::Text`, so the client receives a *text data frame* containing `PONG:<hex>` on the same stream that otherwise carries only JSON-RPC messages. Any MCP client that pings will get a non-JSON message and its JSON-RPC parser will fail. tokio-tungstenite already replies to Ping frames with proper Pong control frames automatically, so this branch is both wrong and redundant.

**Fix:** Delete the Ping match arm entirely (fall through to `_ => {}`) and rely on tungstenite's automatic Pong handling. If an explicit Pong is desired, the outgoing channel must carry `Message` values rather than `String` so a real `Message::Pong(data)` control frame can be sent.

#### Typst compilation runs in a synchronous Tauri command on the main thread

`src-tauri/src/typst_render.rs:87` — correctness

`render_typst_math` (main.rs:21) is a sync command, and Tauri v2 executes sync commands on the main thread. `render_math_to_svg` performs a full Typst compile per uncached expression, and the first call also pays the `FONTS` Lazy initialization, which parses the entire embedded typst-assets font collection — easily hundreds of milliseconds. A note containing several math expressions will visibly stall the UI, working against the 60fps canvas target.

**Fix:** Make the command `async fn` and wrap the compile in `tauri::async_runtime::spawn_blocking`, or mark the command `#[tauri::command(async)]`. Optionally warm the FONTS Lazy during setup so the first render doesn't pay font parsing.

#### write_file_locked computes the checksum after releasing the exclusive lock (TOCTOU race)

`src-tauri/src/watcher.rs:69` — correctness

`write_file_locked` writes under an exclusive lock, then does `drop(lock);` and only afterwards calls `crate::checksum::compute_file(path)`. Between the unlock and the re-read, an external editor (Obsidian) can modify the file, so the returned checksum may describe content Nodus never wrote. Callers (src/commands/nodes.rs:757) store this checksum as the known-good state, so a race here silently masks an external modification — exactly the class of integrity bug the checksum system exists to catch. The content string is already in hand, so re-reading the file is also wasted I/O.

**Fix:** Return `crate::checksum::compute_string(content)` (already used everywhere else, e.g. nodes.rs:127, vault_watcher.rs:154) instead of re-reading the file. This removes the race and the extra read, and makes the checksum provably match the written bytes.

### rust-database

#### Seven migrations run with `let _ =`, swallowing all errors, not just 'column exists'

`src-tauri/src/database/mod.rs:82` — correctness

Migrations 003, 004, 005, 008, 009, 010, 011 are executed as `let _ = sqlx::query(...).execute(pool).await;` with comments like "ignore if already exists". This discards every failure mode — I/O errors, locked database, syntax errors (which is exactly how the broken 008 migration has gone unnoticed) — not just the expected duplicate-column error. The file already contains the correct pattern for the `directed` column (lines 120-132: query pragma_table_info, then ALTER only if missing), so the module is internally inconsistent about how idempotent column additions are handled.

**Fix:** Apply the pragma_table_info existence-check pattern to each ADD COLUMN migration and propagate the ALTER error, or adopt sqlx's built-in migrator with versioned migrations so each runs exactly once.

#### models.rs bundles four unrelated CRUD modules, breaking the one-entity-per-file pattern of its siblings

`src-tauri/src/database/models.rs` — design

nodes.rs and edges.rs each hold one entity's model plus its CRUD operations, but models.rs (744 lines) contains four inline modules — workspaces, storylines, themes, frames — each a full CRUD layer, re-exported from mod.rs "for backward compatibility". The name 'models' is also inaccurate: the file is mostly query functions, not data models, and the two entities one would expect in a models file (Node, Edge) live elsewhere. The file is approaching the 1000-line hard limit and each added frame/storyline feature pushes it closer.

**Fix:** Split into workspaces.rs, storylines.rs, themes.rs, frames.rs alongside nodes.rs and edges.rs, declare them in mod.rs, and drop the backward-compatibility re-export layer.

#### markdown_content stored in SQLite contradicts the module doc and the project's data-separation rule

`src-tauri/src/database/nodes.rs:11` — consistency

mod.rs's module doc states "Stores metadata and canvas positions only - text content stays in .md files", and .claude/CLAUDE.md marks this as a critical architecture rule ("Never store text content in SQLite"). Yet Node has `pub markdown_content: Option<String>` and the module exposes `update_content` and `update_content_and_checksum`, which are actively used (commands/nodes.rs:738,760,770; commands/vault_watcher.rs:673) to persist full note text into the nodes table. Either the architecture rule/doc is stale (content is intentionally cached in SQLite for ad-hoc nodes without files) or the implementation diverged; as written, the code and its own module docstring make contradictory claims.

**Fix:** Decide which is authoritative. If SQLite intentionally holds content for file-less nodes, update mod.rs's doc and the architecture docs to say so explicitly (e.g. 'content cache for nodes without a backing file, .md file wins when present'). Otherwise remove the column usage and route content exclusively through files.

### rust-ontology

#### Base IRI built from raw filesystem path breaks on paths with spaces or non-ASCII

`src-tauri/src/ontology/parser.rs:87` — correctness

parse_turtle and parse_rdf_xml build the base IRI with `let base_iri = format!("file://{}", path.display());` then `oxiri::Iri::parse(base_iri)`. A path containing a space or non-ASCII character (common on macOS, e.g. '~/My Ontologies/x.ttl' or iCloud's 'Mobile Documents') produces an invalid IRI, so Iri::parse fails and the whole import errors with 'Invalid base IRI' even though the file is perfectly parseable. Windows-style paths would also produce invalid IRIs. The same pattern is duplicated in both functions (lines 87 and 109).

**Fix:** Build the base IRI with percent-encoding, e.g. via url::Url::from_file_path(path) (Url handles platform paths and escaping), and fall back to no base if conversion fails. Factor the shared open-file/base-IRI/collector boilerplate of parse_turtle and parse_rdf_xml into one helper while doing so.

#### JSON-LD path creates individual nodes for OWL property/ontology definitions, unlike Turtle/RDF-XML path

`src-tauri/src/ontology/parser.rs:645` — consistency

into_ontology_data (Turtle/XML) only emits an OntologyIndividual when the subject is an owl:NamedIndividual or has a type outside the owl#/rdfs# namespaces. parse_json_ld has no such filter: every @id item that is not owl:Class becomes an individual (line 645), so items typed owl:ObjectProperty, owl:DatatypeProperty, owl:AnnotationProperty, or owl:Ontology are imported as canvas nodes. The class detection also only matches OWL_CLASS full IRI and the literal string "owl:Class" — rdfs:Class (which the triple path handles via RDFS_CLASS) is missed. Importing the same ontology as .jsonld vs .ttl therefore yields a different node set.

**Fix:** Apply the same type filter as the triple path before pushing an individual: skip items whose only types are in the owl:/rdfs: namespaces (compact or full form), and treat rdfs:Class like owl:Class.

#### Tests depend on absolute paths in a personal home directory and silently pass when absent

`src-tauri/src/ontology/parser.rs:746` — design

test_parse_ppeo, test_parse_prov_o, test_parse_sosa_ssn_directory, test_parse_oeso, test_parse_oboe_directory, test_parse_obi and test_all_ontologies_summary (and transformer.rs tests test_transform_ppeo_with_classes, test_miappe_properties, test_sosa_properties) all hardcode `/Users/sdrwacker/workspace/ontologies/...` and `if !path.exists() { return; }` — on CI or any other machine they pass green while testing nothing. Furthermore test_miappe_properties and test_sosa_properties contain no assertions at all; they are println debug harnesses, and test_all_ontologies_summary prints a formatted report table. This conflicts with the project's TDD emphasis: only test_parse_turtle (parser) and test_transform_individuals (transformer) actually verify behavior portably.

**Fix:** Move the external-ontology suite behind a feature flag or #[ignore] with an env-var path (e.g. NODUS_ONTOLOGY_FIXTURES), delete or convert the assertion-free println tests into real assertions on small in-repo fixture files (a trimmed .ttl/.owl checked into a tests/fixtures dir).

#### apply_hierarchical_layout does O(n^2)-O(n^3) linear scans; large imports forced to Grid as a workaround

`src-tauri/src/ontology/transformer.rs:482` — design

Every node position lookup is a linear scan: `nodes.iter_mut().find(|n| &n.id == node_id)` inside the per-layer positioning loop (line 482), inside the two-pass parent-centering loop (lines 502, 507), and inside the overlap-resolution loop (line 531). With p parents per node this is O(passes * n^2 * p). The consumer in commands/ontology.rs line 90 works around this: 'Force grid layout for large ontologies (hierarchical is too slow)' above 500 entities — so hierarchical layout is unavailable exactly for the ontologies (OBOE ~291, OESO ~120 are fine, but OBI ~5074 classes) where it matters. The algorithm is linear-time with an index.

**Fix:** Build a HashMap<String, usize> from node id to index in `nodes` once at the top and index into the slice, removing all iter().find() calls. That should let the 500-entity cap in commands/ontology.rs be raised or removed.

### canvas-main

#### Component named PixiCanvas but PixiJS is not used anywhere

`src/canvas/PixiCanvas.vue` — naming

grep shows no `from 'pixi.js'` (or dynamic import) anywhere in src/. Rendering is DOM node cards (CanvasNodeCard), SVG edges (CanvasEdgesSVG), and a Canvas2D LOD layer (CanvasLODCanvas). The name violates the naming-honesty hard rule and misleads: comments across src/llm/tools/*.ts say 'handled by PixiCanvas'. Consequences: (a) `pixi.js: ^7.4.3` in package.json is a dead dependency; (b) .claude/CLAUDE.md architecture tables ('PixiJS (WebGL) for canvas, edges, backgrounds', 'PixiJS Container + DOM overlay') document an architecture that does not exist, violating the document-driven rule that docs are updated when implementation diverges.

**Fix:** Rename to CanvasView.vue (or GraphCanvas.vue), update the App.vue import and comments referencing it, remove the pixi.js dependency from package.json, and update .claude/CLAUDE.md to describe the actual DOM+SVG+Canvas2D hybrid renderer.

#### Screen-to-canvas coordinate math duplicated inline three times

`src/canvas/PixiCanvas.vue:1106` — consistency

`screenToCanvas` from useViewState is already destructured (line 180) and passed to most composables, yet the same `(clientX - rect.left - offsetX) / scale` math is re-implemented inline in the pdfDrop viewState config (lines 1106-1122, both getViewportCenter and screenToCanvas), in onCanvasPointerDown frame placement (lines 1341-1343), and node-centering math is re-derived in focusNode (lines 1908-1917) although nodeNavigation.zoomToNode implements the same centering. Any future change to the transform (e.g. rotation, devicePixelRatio handling) must now be applied in four places.

**Fix:** Pass the existing `screenToCanvas` into the pdfDrop config, use it in onCanvasPointerDown, and implement focusNode in terms of nodeNavigation (e.g. zoomToNode with current scale preserved) or a shared centerOnNode helper in useViewState.

#### Three different notification mechanisms in one component

`src/canvas/PixiCanvas.vue:1294` — consistency

Errors from the agent prompt use blocking `alert(e instanceof Error ? e.message : 'Unknown error')` (line 1294), edge-label saves use `notifications$.success('Edge label saved')` (line 667), and citation/Zotero/entity flows use the injected `showToast`. `alert()` blocks the UI thread in a Tauri webview and is inconsistent with the app's toast system used everywhere else in this same file.

**Fix:** Replace the `alert()` call with `notifications$.error(...)` (or showToast with type 'error'), and pick one of notifications$/showToast as the single notification channel for this component.

#### Two parallel saveEditing implementations for the same edit state

`src/canvas/PixiCanvas.vue:1798` — design

useNodeEditor implements its own saveEditing (useNodeEditor.ts:140, used internally by its autosave timer and keydown paths), while PixiCanvas wires a second, separately implemented saveEditing from useCanvasEventHandlers (useCanvasEventHandlers.ts:165) for manual saves, both operating on the same editingNodeId/editContent refs and both calling updateNodeContent. The comment at line 609 ('content editing functions are local for mermaid render + auto-fit') documents the workaround. Two save paths over shared state can drift (e.g. one adding mermaid re-render or fit behavior the other lacks), producing different results for autosave vs blur/escape save.

**Fix:** Make useNodeEditor the single owner of saveEditing and give it optional onAfterSave hooks (mermaid render, auto-fit) that PixiCanvas supplies; have useCanvasEventHandlers call the editor's save instead of reimplementing it.

### canvas-nodes

#### pushUndo on every pointerdown destroys the redo stack on plain clicks

`src/canvas/composables/nodes/useNodeDragging.ts:155` — correctness

`pushUndo()` is called unconditionally in onNodePointerDown, before the DRAG_THRESHOLD check promotes the interaction to a drag. pushUndo (src/composables/useUndoRedo.ts) snapshots all node positions AND clears `redoStack`. So merely clicking a node (select, open, etc.) pushes a no-op position snapshot and wipes redo history: undo → click a node → redo silently no longer works. It also makes Ctrl+Z appear dead (restores identical positions). Additionally `store.triggerLayoutUpdate()` at line 452 fires on every pointerup even when no drag occurred, invalidating layout on plain clicks.

**Fix:** Defer pushUndo (and the drag-end triggerLayoutUpdate) until the drag threshold is crossed, i.e. where pendingDragNode is promoted to draggingNode in onNodeDrag.

#### Resize listeners lack pointercancel/blur cleanup that the sibling drag composable has

`src/canvas/composables/nodes/useNodeResizing.ts:151` — consistency

useNodeDragging registers `pointercancel` and window `blur` handlers plus an `e.buttons === 0` safety check to recover from interrupted drags. useNodeResizing registers only `pointermove`/`pointerup` (line 151-152). If the pointer is cancelled (touch interruption, OS gesture) or the window loses focus mid-resize, `pointerup` never fires: resizingNode stays set, the listeners stay attached, and the next pointer movement anywhere continues resizing the node. The direct width/height mutations applied to other selected nodes during multi-resize (lines 199-205) also remain unpersisted in that state.

**Fix:** Mirror the drag composable: add a cleanupResize handler registered for pointercancel and window blur, and bail out of onResizeMove when e.buttons === 0.

### canvas-edges-viewport-selection

#### reverseEdge and insertNodeOnEdge silently drop edge color and directed flag

`src/canvas/composables/edges/useEdgeManipulation.ts:113` — correctness

reverseEdge deletes the edge and recreates it with only `source_node_id, target_node_id, link_type, label` — `CreateEdgeInput` (src/types/index.ts:145) also supports `color` and `directed`, so reversing a user-colored edge loses its color, and reversing an edge previously made non-directional (makeNonDirectional in this same file) silently resurrects it as directed (default `directed ?? true` per isEdgeDirected). insertNodeOnEdge (lines 168-177) additionally drops `label` and `color` on both replacement edges. There is also no failure handling: `deleteEdge` succeeds, then if `createEdge` throws, the original edge is permanently lost with no rollback and no user notification.

**Fix:** Pass `color: edge.color ?? undefined` and `directed: edge.directed` through both operations (and `label` in insertNodeOnEdge), and create the replacement edge(s) before deleting the original, or wrap in a try/catch that restores on failure.

#### Drag/zoom deferral flag triggers full re-routing every frame, opposite of its documented contract

`src/canvas/composables/edges/useEdgeRouting.ts:312` — correctness

The context docs (lines 69-72) state isDragging/isZooming mean 'skip complex routing and use cached edges (for drag performance)', and the comment at line 294 repeats this. The implementation does the opposite: `if (routingKey !== lastRoutingKey.value || isDeferringRouting()) { ... routeAllEdges(...) }` — while dragging or zooming, the condition is always true, so a new SpatialIndex is built and routeAllEdges (the expensive obstacle-avoidance pass over all edges and nodes) runs on every recompute of the edgeLines computed, i.e. every pointer-move frame during drag. The 'simple path during drag' fallback branch at line 436 (`else if (isDeferringRouting())`) is only reachable for edges routeAllEdges failed to route, since routedEdges was just freshly computed. The inline comment at line 311 ('Always recalculate routing for live updates during drag') contradicts both the interface docs and the cache machinery (cachedRoutedEdges, the isDragging watch that invalidates lastRoutingKey on drag end — pointless if routing was never deferred). Either the flags should defer routing as documented, or the cache/watch/fallback code and the docs are dead weight. As written this is the single largest obstacle to the 500-nodes-at-60fps drag target.

**Fix:** Make the code match the contract: when isDeferringRouting(), skip routeAllEdges and use cachedRoutedEdges (falling back to the existing simple-path branch for uncached edges); recompute once on drag end via the existing watch. Update the comments to describe actual behavior.

#### edgeLines computed writes its own reactive dependencies, causing double evaluation of the routing pipeline

`src/canvas/composables/edges/useEdgeRouting.ts:319` — design

Inside the `edgeLines` computed, `lastRoutingKey.value` is read (line 312) and written (line 321), and `cachedRoutedEdges.value` is read (line 327) and written (line 319). Writing a dependency from inside a computed invalidates that computed, so every routing change evaluates the full pipeline twice (first pass writes lastRoutingKey -> invalidation -> second pass takes the cache branch). Additionally `cachedRoutedEdges` is a deep `ref` wrapping a Map of routed paths (arrays of points), so Vue deep-proxies every path point of every edge for no benefit.

**Fix:** Hold the cache in plain module-level/closure variables (they are only consumed inside this computed, so reactivity is unnecessary), or at minimum use shallowRef and move cache invalidation out of the computed.

#### Large unused public surface: 7 returned members and a context dependency have no callers

`src/canvas/composables/edges/useEdgeStyling.ts` — dead-code

Grepped all call sites: PixiCanvas.vue (the only consumer, line 1619-1631) destructures only edgeStyleMap, globalEdgeStyle, edgeStrokeWidth, edgeColorPalette, highlightColor, selectedColor, nodeColors, cycleEdgeStyle, getEdgeColor, getEdgeHighlightColor, changeEdgeColor, and there are no `edgeStyling.` member accesses. Unused returned members: `edgeStyles`, `getEdgeStyle`, `setEdgeStyle`, `allMarkerColors`, `frameColors`, `highlightedStrokeMultiplier`, `getArrowMarkerId`. Notably CanvasEdgesSVG.vue:37 re-implements getArrowMarkerId locally instead of importing it, and useEdgeVisibility.ts:208 inlines the same `arrow-${color.replace('#','')}` format a third time — three copies of an id scheme that must stay in sync. Also `store.updateEdgeLinkType` is declared in UseEdgeStylingContext (line 23) and wired up in PixiCanvas.vue:1611 but never called inside the composable. Separately, the unused `getEdgeStyle` defaults to 'diagonal' while the live path in useEdgeRouting uses `edgeStyleMap[id] || globalEdgeStyle` — a divergence that would become a bug if anyone started using it.

**Fix:** Delete the unused return members and the updateEdgeLinkType context field; keep one exported getArrowMarkerId (or a shared constant format) and use it from CanvasEdgesSVG.vue and useEdgeVisibility.

#### getEdgeHighlightColor assumes 6-digit hex; rgba color_theme values defeat the brightness guard and break arrow marker IDs

`src/canvas/composables/edges/useEdgeStyling.ts:362` — correctness

The light-mode node palette in this same file (`defaultNodeColors`, line 86) stores `rgba(239, 68, 68, 0.18)`-style values, which end up in `node.color_theme`. getEdgeHighlightColor does `nodeColor.replace('#','')` then `parseInt(hex.substr(0,2),16)` — for an rgba string this yields NaN, `NaN > 200` is false, and the function returns the near-transparent rgba tint as the highlight color, which is exactly the invisible-in-light-mode case the docstring says it avoids. Downstream, useEdgeVisibility line 208 builds `arrowMarkerId: \`arrow-${edgeHighlightColor.replace('#','')}\`` from this value, producing an id containing spaces, commas and parentheses (`arrow-rgba(239, 68, 68, 0.18)`), which cannot be referenced by `url(#...)`, so the arrow marker silently disappears on hover-highlighted edges.

**Fix:** Detect non-hex colors first (e.g. startsWith('#') and length check); for rgba values either parse the channels or map through the display color, and fall back to highlightColor when brightness cannot be determined.

#### O(edges x selectedNodes) Array.includes scans on a hover-hot computed

`src/canvas/composables/edges/useEdgeVisibility.ts:118` — design

`selectedNodes` is a plain array and `selectedNodes.includes(...)` is called up to four times per edge: neighbor-set build (lines 118-122), large-graph filter (lines 135-137), per-edge isDirect (lines 157-158), and isConnectedToSelected (lines 176-178). visibleEdgeLines recomputes on every hoveredNodeId change; with select-all on a 500-node graph and a comparable edge count this is hundreds of thousands of comparisons per hover event, working against the 60fps target.

**Fix:** Build `const selectedSet = new Set(selectedNodes)` once at the top of the computed and use Set.has throughout.

### canvas-layout

#### Frame expand-to-fit block duplicated between processFrameAwareLayoutResults and useLayout.expandFramesToFitNodes

`src/canvas/composables/layout/useLayoutFrameAware.ts:195` — consistency

The 'expand frame if needed (never shrink)' logic - compute required left/top/right/bottom with padding 30, expand each side, then conditional updateFramePosition/updateFrameSize - is copy-pasted: useLayoutFrameAware.ts lines 195-242 and useLayout.ts lines 149-215 are structurally identical apart from the bounding-box source (target positions vs current node positions). A divergence in one copy (e.g. changing padding or shrink policy) will silently desynchronize the two paths.

**Fix:** Extract a shared `expandFrameToFit(frame, bounds, padding)` helper (natural home: useFrameCollision.ts) returning the new rect plus changed flags, and call it from both sites.

#### tetrisGridLayout is O(n^3)-O(n^4) and runs synchronously on the main thread for up to 500 nodes

`src/canvas/composables/layout/useTetrisLayout.ts:108` — correctness

executeAutoLayout only switches to fastGridLayout above FAST_GRID_THRESHOLD = 500, so grid layouts of up to 500 nodes go through tetrisGridLayout synchronously. `findBestPosition` generates candidates from every placed rect plus a nested placed-x-placed gap scan (O(k^2) candidates for the k-th node), and each candidate is validated with `checkOverlap` which is O(k). Summed over n nodes this is O(n^4) worst case; at n approaching 500 this can freeze the UI for seconds, violating the 500-nodes-at-60fps target. There is no yielding (unlike batchUpdatePositions) and no spatial index.

**Fix:** Lower the tetris cutoff (e.g. 150-200 nodes), add a spatial grid/skyline structure to make overlap checks O(1), or chunk the placement loop across requestAnimationFrame/Web Worker.

#### Entire layout-strategy subsystem is unreachable from production code

`src/canvas/layout/registry.ts` — dead-code

Grepping the whole source tree shows no production caller for the strategy layer. `layout.executeStrategy` and `layout.getAvailableLayouts` (returned by useLayout) are never invoked anywhere - PixiCanvas.vue only calls `layout.autoLayout(...)` (line 977) and `layout.fitToContent()` (line 983). Consequently registry.ts (LayoutRegistry, layoutRegistry, autoSelect, getSuitableStrategies, unregister, list, has), strategies/ForceLayoutStrategy.ts, strategies/HierarchicalLayoutStrategy.ts, strategies/GridLayoutStrategy.ts, types.ts LayoutStrategy/LayoutResult/LayoutAnimationOptions, and useLayoutStrategies.executeStrategy/getAvailableLayouts are all dead in production. `autoSelect` and `getSuitableStrategies` have zero callers even internally. The subsystem also silently diverges from the live path (e.g. ForceLayoutStrategy defaults chargeStrength -8000/linkDistance 150/gravity 0.6 vs the live -20000/350/0.01, GridLayoutStrategy default gap 360 vs live gridGap 24), so if it were ever wired up it would behave differently than the existing layouts. Project hard rule: remove dead code.

**Fix:** Either wire the strategy registry into the UI and migrate executeAutoLayout onto it, or delete registry.ts, strategies/*, the strategy exports in canvas/layout/index.ts and types.ts, and executeStrategy/getAvailableLayouts in useLayoutStrategies.ts (keeping fitToContent, which is used).

#### Private ~180-line copy of tetrisGridLayout duplicates useTetrisLayout.ts and has diverged

`src/canvas/layout/strategies/GridLayoutStrategy.ts:22` — consistency

GridLayoutStrategy.ts embeds its own `tetrisGridLayout` (lines 22-202) that is a copy of src/canvas/composables/layout/useTetrisLayout.ts with different edge field names (source/target vs source_node_id/target_node_id). The copies have already diverged: the strategy copy lacks the gap-filling candidates (`fillsGap`), the edge-aligned candidate generation, and the `containerWidth` constraint that the canonical version supports. Duplicated algorithm logic that should be shared (or removed with the dead strategy subsystem).

**Fix:** Delete the private copy and adapt the canonical tetrisGridLayout via a thin edge-shape adapter - or remove GridLayoutStrategy entirely if the strategy subsystem is deleted.

### canvas-agent

#### pruneMessages assumes messages[1] is the user request, but run() inserts conversation history before it

`src/canvas/composables/agent/systemPrompt.ts:301` — correctness

`pruneMessages` keeps `messages[0]` (system) and `messages[1]` (named `userRequest`). However useAgentRunner.run() builds the array as `[systemPrompt, ...recentHistory (up to 6 prior messages), { role: 'user', content: enhancedRequest }]`. With any prior conversation, messages[1] is the OLDEST history message, and after 10+ iterations the actual current request sits in the pruned middle — `slice(-keepRecent)` keeps only the last 6 tool exchanges, so the agent loses its instruction and keeps a stale history line instead. Additionally, `slice(-6)` can start at a `role: 'tool'` message whose parent assistant `tool_calls` message was pruned, which strict APIs reject.

**Fix:** Track the index of the current user request explicitly (or pass it to pruneMessages), and align the slice boundary to start at an assistant or user message, never an orphaned tool message.

#### setPlan and setMode are never called; the plan section of the system prompt can never render

`src/canvas/composables/agent/useAgentRunner.ts:145` — dead-code

Grep across src/ (ts + vue) finds no caller of `agentRunner.setPlan(...)` or `agentRunner.setMode(...)`; `run()` sets `currentPlan.value = null` and nothing ever assigns a plan. Consequently `buildSystemPrompt(..., currentPlan.value, ...)`'s `plan && mode === 'execute'` branch (systemPrompt.ts lines 189-198, the 'APPROVED PLAN' section) is dead in practice — after approval the agent only learns the plan from message history. `AgentRunResult.planData` (line 105) is likewise never consumed by any caller (PixiCanvas discards run()'s result fields beyond awaiting it). This is aspirational API surface that does not reflect actual behavior.

**Fix:** Either wire usePlanHandlers.handlePlanApprove to call agentRunner.setPlan(planState.currentPlan.value) before resume(), so the approved plan actually reaches the execute-mode system prompt, or remove setPlan/setMode/planData and the planSection parameter entirely.

#### Restarting the agent races with the old loop over the shared isRunning ref

`src/canvas/composables/agent/useAgentRunner.ts:160` — correctness

`run()` does `if (ctx.isRunning.value) stop()` then sets `ctx.isRunning.value = true`. The old runLoop is still awaiting `llmQueue.chat`; cancellation makes that await reject asynchronously, and the old loop's catch handler (lines 509-513) then executes `ctx.isRunning.value = false` — after the new run has already set it to true. The new loop's next iteration sees `!ctx.isRunning.value` and returns 'stopped', silently killing the fresh request. The same shared-ref clobbering applies to the error paths (lines 526, 531).

**Fix:** Give each run a generation token (e.g. incrementing runId captured by the loop) and only mutate shared state when the token still matches, or await the previous loop's termination before starting the new one.

#### Embedded-tool detection is computed twice with different patterns; the ```json case logs but does not skip native calls

`src/canvas/composables/agent/useAgentRunner.ts:314` — correctness

`hasEmbeddedTools` (lines 315-317) includes three patterns, among them ```/```json[\s\S]*?"name"\s*:/```, and logs '> Processing embedded tool calls from content...' with a comment saying native calls will be skipped. But the variable that actually gates execution, `hasEmbeddedToolsInContent` (lines 327-330), re-evaluates only two of the three patterns — the ```json fence pattern is missing. So when a model emits both a ```json tool block in content and native tool_calls, the code logs that it will process embedded tools, then executes the native tool calls anyway, and the content block is never parsed (the content branch is an else-if). The first check's entire if-block has no effect besides the misleading log line.

**Fix:** Compute the embedded-tool predicate once in a single variable used for both the log and the gate, and align the pattern set deliberately (include or exclude the ```json fence in both).

#### Skipping native tool calls leaves an assistant message with unanswered tool_calls in history

`src/canvas/composables/agent/useAgentRunner.ts:327` — correctness

When `hasEmbeddedToolsInContent` is true, the assistant message containing `tool_calls` has already been pushed (`messages.push(msg)`, line 311) but the native-call branch is skipped, so no `role: 'tool'` messages with matching `tool_call_id`s are ever appended. The fallback path then pushes `role: 'assistant'`/`role: 'user'` messages (lines 478-479). Strict OpenAI-compatible endpoints reject the next chat request with a 400 ('tool_calls must be followed by tool messages responding to each tool_call_id'), turning a recoverable formatting quirk into a hard agent error.

**Fix:** When skipping native tool calls, either strip `tool_calls` from the pushed assistant message or append stub tool results for each tool_call_id before continuing.

#### Tool executes with empty args after argument JSON parse failure

`src/canvas/composables/agent/useAgentRunner.ts:360` — correctness

When `JSON.parse(tc.function.arguments)` throws, the code logs a warning but falls through to `await ctx.executeAgentTool(tc.function.name, parsedArgs)` with `parsedArgs = {}`. For mutating tools this runs the tool with defaults instead of the model's intent — e.g. `delete_matching` with no filter, or `update_node` with empty title/content — and the model receives a success-shaped result rather than being told its arguments were malformed, so it cannot self-correct. (The inner `argsPreview` on line 362 also shadows the outer one from line 338.)

**Fix:** On parse failure, push a `role: 'tool'` error message ('Malformed JSON arguments, please retry') and `continue`, mirroring the disallowed-tool path at lines 344-352.

#### for_each_node, create_plan, request_approval, and research cases are unreachable duplicates of registry handlers

`src/canvas/composables/agent/useLLMTools.ts:178` — dead-code

PixiCanvas.executeAgentTool only reaches executeLLMTool when the registry returns `__UNHANDLED__:<name>`. Verified by grep: 'for_each_node' is fully implemented in src/llm/tools/batchTools.ts (returns a real result, never __UNHANDLED__), and 'create_plan'/'request_approval'/'research' in src/llm/tools/agentTools.ts return __CREATE_PLAN__/__REQUEST_APPROVAL__/__RESEARCH__ markers that useMarkerHandlers consumes. So the switch cases 'for_each_node' (line 178), 'create_plan' (399), 'request_approval' (421), 'research' (435) in useLLMTools can never execute in the app. Worse, the duplicates have diverged: the dead for_each_node supports evalMathExpr `{expr}` templates and content-substring filtering while the live batchTools version does not, and the dead create_plan emits a marker payload with `stepCount` instead of `steps`, which useMarkerHandlers would parse into a plan with zero steps if it ever ran. Only 'plan', 'update_task', 'smart_move', 'smart_connect', 'web_search' can be reached (the latter three are themselves broken, see separate finding).

**Fix:** Delete the four unreachable cases (or migrate their extra template features into batchTools first), per the project's no-dead-code rule. Keep tool logic in exactly one place: the registry.

#### Wikipedia API logic duplicated in three places

`src/canvas/composables/agent/useMarkerHandlers.ts:135` — consistency

The Wikipedia search-and-format code in the `__WIKIPEDIA_SEARCH__` handler (lines 135-172: same api.php URL construction, snippet stripping, article URL building) is duplicated in useNodeAgent.executeWikipediaSearch (useNodeAgent.ts lines 108-148, which additionally fetches extracts) and again in src/llm/research.ts (lines 168-183 search, 206/259 extracts). Each copy has drifted: different timeout mechanisms (AbortSignal.timeout vs manual AbortController vs none), different truncation rules, different error text. Web-search result formatting is similarly duplicated between useLLMTools ('web_search' case) and useNodeAgent.executeWebSearch.

**Fix:** Extract shared `searchWikipedia`/`fetchWikipediaExtract` helpers into src/llm/research.ts (which already owns fetchWikipediaArticle) and have both composables call them.

### canvas-util-rendering-frames

#### Two conflicting definitions of frame membership across sibling composables

`src/canvas/composables/frames/useFrames.ts:113` — design

useFrames.onPointerDown decides which nodes move with a dragged frame by geometric 50%-overlap (lines 101-116), while useFrameOperations.resolveFrameCollisions (line 82) and useFrameFitting (line 50) use the persisted `n.frame_id`. A node assigned to the frame but currently outside its bounds is left behind during drag yet moved by collision resolution moments later in stopDrag — the same gesture applies two different membership rules, producing surprising node displacement.

**Fix:** Pick one membership definition (frame_id, falling back to geometry only for unassigned nodes) and share it as a util used by all three frame composables.

#### Frame drag issues one backend invoke per node per pointermove and triggers layout per node

`src/canvas/composables/frames/useFrames.ts:129` — correctness

onDrag runs on every document pointermove and calls `store.updateFramePosition(...)` plus `store.updateNodePosition(nodeId, ...)` for every contained node. Both store functions fire a Tauri `invoke` (DB round trip) per call (src/stores/nodes/crud.ts:65 `await invoke('update_node_position', ...)`, src/stores/frames.ts:153), and updateNodePosition is called without `{ skipLayoutTrigger: true }`, so `nodeLayoutVersion++` fires per node per move event, forcing edge re-routing recomputation N times per pointermove. Dragging a frame with 30 nodes at ~120 Hz pointer rate produces thousands of IPC/DB calls and layout invalidations per second — directly against the 500 nodes @ 60fps target. onResize has the same per-move invoke pattern (2 invokes per event). The crud.ts comment explicitly says 'Skip layout trigger during drag for performance - caller should trigger once at drag end', which this caller ignores.

**Fix:** During drag, update positions in-memory only (or pass skipLayoutTrigger and a persist:false option), then persist all positions and bump nodeLayoutVersion once in stopDrag/stopResize.

#### Node-change watcher keys on count + total content length, missing same-length edits

`src/canvas/composables/rendering/useContentRenderer.ts:189` — correctness

setupWatchers watches `getFilteredNodes().length + sum(markdown_content.length)`. Any content change that preserves total length — a same-length edit to one node (e.g. external file sync rewriting 'foo' to 'bar'), or offsetting changes across two nodes — produces an identical watch value and updateRenderedContent never runs, leaving stale rendered HTML. The comment 'shallow comparison' is inaccurate: it is a lossy length-sum heuristic. In-app edits are covered by renderSingleNode, but file-watcher/agent-driven updates flow through this watcher.

**Fix:** Watch a real fingerprint, e.g. join node.id + updated_at (nodes already maintain updated_at), or watch `() => getFilteredNodes().map(n => n.id + ':' + (n.updated_at ?? n.markdown_content?.length)).join()`.

#### visibleNodes rebuilds a full node Map every pan/zoom frame on large graphs

`src/canvas/composables/rendering/useViewportCulling.ts:128` — correctness

The `visibleNodes` computed depends on scale/offsetX/offsetY, so it recomputes on every pan and zoom frame. On the large-graph path (>=200 nodes) it executes `const nodeMap = new Map(nodes.map(n => [n.id, n]))` each time — an O(n) allocation per frame for exactly the graphs where the spatial grid was introduced to achieve O(k). At 1000+ nodes this creates per-frame GC pressure that works against the 60fps target.

**Fix:** Cache the id->node Map keyed on the displayNodes array identity (rebuild only when displayNodes.value changes, e.g. alongside the spatialGrid.build watcher).

#### useCanvasInit and useWorkspaceWatchers (243 lines) are never used

`src/canvas/composables/util/useCanvasInit.ts` — dead-code

Grep shows no importer outside util/index.ts. PixiCanvas.vue implements the equivalent logic inline with its own plain `let hasInitiallyCentered = false` (PixiCanvas.vue lines 160, 284-313) and its own mount-time listener setup. Additionally, within the dead file, UseCanvasInitContext declares `fitToContent`, `neighborhoodExit`, and `getFilteredNodesLength` which the useCanvasInit body never reads (they belong only to UseWorkspaceWatchContext), and useWorkspaceWatchers redundantly receives both `ctx.getFilteredNodesLength`/`ctx.hasInitiallyCentered` and separate `filteredNodesLength`/`currentWorkspaceId` parameters.

**Fix:** Either migrate PixiCanvas.vue onto these composables (preferred, per the 1000-line rule and the extraction intent) or delete useCanvasInit.ts and its exports from util/index.ts. If kept, remove the unused context fields.

#### Ctrl+Shift+R triggers both resetAllNodeSizes and refreshFromFiles

`src/canvas/composables/util/useCanvasKeyboardShortcuts.ts:160` — correctness

The Shift+R handler `if ((e.key === 'R' || e.key === 'r') && e.shiftKey) { resetAllNodeSizes() }` does not exclude ctrl/meta, and handlers in this function fall through (no return). Pressing Ctrl+Shift+R (the documented 'refresh workspace from files' shortcut at line 201) therefore also resets every node to default size — destroying all user sizing as a side effect of a refresh.

**Fix:** Guard the Shift+R branch with `&& !e.ctrlKey && !e.metaKey`, and consider `return` after each handled shortcut to prevent future fall-through combinations.

#### Entire composable (266 lines) is dead; PixiCanvas.vue duplicates it verbatim

`src/canvas/composables/util/useCanvasNodeSizing.ts` — dead-code

Grep across src/ and tests shows useCanvasNodeSizing is only referenced by util/index.ts (barrel re-export). PixiCanvas.vue contains verbatim copies of all six functions: fitNodeToContent (line 999), fitAllNodesToContent (1018), resetAllNodeSizes (1040), getNodeHeight (1306), fitSelectedNodes (1685), fitNodeNow (1716). The extraction commit ('Extract PixiCanvas sub-components and composables') created this file but PixiCanvas was never switched to use it, so ~150 lines of sizing logic exist twice and can silently diverge. This also inflates PixiCanvas.vue, which at 2332 lines already violates the 1000-line hard rule.

**Fix:** Wire PixiCanvas.vue to consume useCanvasNodeSizing (deleting the inline copies, cutting ~150 lines from PixiCanvas), or delete the composable and its index export. Given the 1000-line rule, adopting the composable is the right direction.

#### Aborting PDF processing strands the 'Processing PDF...' placeholder node

`src/canvas/composables/util/usePdfDrop.ts:140` — correctness

processPdfDrop creates a loading node ('Processing PDF...' / '_Cleaning up text with AI..._') before the LLM cleanup loop. If `stop()` is called, the aborted checks at lines 140/182 return early and the placeholder node is left on the canvas permanently with its loading text. The Store interface declares `deleteNode` (line 51) and `createEdge` (line 52) precisely for such cleanup, but neither is ever called anywhere in this file — they are dead interface members today.

**Fix:** On abort after loadingNode creation, call `store.deleteNode(loadingNode.id)` (and drop it from lastImportNodeIds); remove `createEdge` from the Store interface if it stays unused.

#### confirmBibImport silently discards importAttachments and layout options

`src/canvas/composables/util/usePdfDrop.ts:357` — correctness

`confirmBibImport(options: { createFrame: boolean; importAttachments: boolean; layout: 'grid' | 'force' })` forwards only `createFrame` to processBibDrop. ImportOptionsModal.vue renders an 'import attachments' checkbox and a layout selector and emits both values (ImportOptionsModal.vue:26-34, wired via PixiCanvas.vue:2306), but the user's choices have no effect — attachments are never imported and layout is always the fixed 4-per-row grid. The parameters make the API lie about what it implements.

**Fix:** Either implement attachment import and force-layout in processBibDrop, or remove the two options from the modal and the function signature until implemented.

### canvas-components

#### In-use color applied to a frame emits the node rgba tint instead of the display hex

`src/canvas/components/CanvasColorBar.vue:54` — correctness

`onInUseColorClick` does `emit('update-frame-color', color.value)` while the preset handler `onColorClick` correctly emits `color.display` for frames. For node-derived in-use colors the palette (useEdgeStyling.ts `defaultNodeColors`) has `value: 'rgba(239, 68, 68, 0.18)'` and `display: '#fecaca'` — so clicking an in-use node color while a frame is selected stores an 18%-alpha rgba tint as the frame color. CanvasFrames.vue then computes `frame.color + '40'` (line 39), which yields invalid CSS like `rgba(239, 68, 68, 0.18)40`, so the frame background silently fails. `isInUseColorActive` (line 47) has the mirror inconsistency: it compares `getFrameColor() === color.value` while the preset check `isColorActive` compares against `color.display`.

**Fix:** In both `onInUseColorClick` and `isInUseColorActive`, use `color.display` when `selectedFrameId` is set, matching `onColorClick`/`isColorActive`. Optionally guard the `frame.color + '40'` concatenation in CanvasFrames.vue to only apply to 6-digit hex values.

### llm-core

#### Queue invariant 'ALL LLM calls MUST go through this queue' is violated elsewhere

`src/llm/queue.ts:3` — consistency

The module contract states 'ALL LLM calls MUST go through this queue - no exceptions', but src/llm/tools/batchTools.ts (lines 206 and 296) calls `providerRegistry.getActiveProvider()` and invokes the provider directly, bypassing the queue and its retry/cancellation logic. Those direct calls do not honor `cancelCurrent()`/`cancel()` and get no `withRetry` backoff, so behavior diverges between tool paths.

**Fix:** Route batchTools' provider calls through `llmQueue.generate`/`llmQueue.chat`, or weaken the queue docstring to describe the real contract.

#### model/contextLength are one-shot snapshots that go stale after settings changes

`src/llm/useLLM.ts:45` — correctness

`const model = ref((getProviderConfig().model as string) || 'llama3.2')` and `contextLength` capture provider config once when useLLM() runs (PixiCanvas mount). Unlike `systemPrompt`, which has a `watch` persisting changes, these refs are never resynced when the user changes provider/model in settings: PixiCanvas's 'nodus-llm-config-change' handler only calls refreshLLMConfigured(). PixiCanvas passes them into ToolContext as `ollamaModel`/`ollamaContextLength` (PixiCanvas.vue:1199-1200), so tool handlers and token-budget checks operate on the stale model name and stale context length until app reload, while actual LLM calls (via providerRegistry) use the new config — an inconsistent split.

**Fix:** Derive model/contextLength from the provider registry on demand (computed or getter), or update them in the 'nodus-llm-config-change' handler.

### llm-tools

#### Bulk content writes skip the content-undo stack that sibling tools use

`src/llm/tools/batchTools.ts:141` — consistency

updateTools.ts `update_node` (line 26) and `batch_update` (line 92) call `ctx.pushContentUndo?.(...)` before `updateNodeContent`. But the update path of `create_nodes_batch` (line 141), both branches of `for_each_node` (lines 244 and 274), and colorHandlers-adjacent bulk edits call `ctx.store.updateNodeContent` directly with no undo push. These are exactly the operations that overwrite the most content at once (LLM rewrites of every matching node), and they are the ones the user cannot undo.

**Fix:** Call `ctx.pushContentUndo?.(node.id, node.markdown_content, node.title)` before every updateNodeContent in batchTools.ts, matching updateTools.ts.

#### Long-running registry tools have no cancellation path

`src/llm/tools/batchTools.ts:209` — design

`for_each_node` with `action="llm"` makes one provider.generate call per node (line 209 loop), `research_topic` runs up to 100 LLM batches, and `generate_sequence` creates up to 10000 nodes — all without any cancellation check. The registry-side `ToolContext` (src/llm/registry.ts:35) has no `isCancelled`, while the parallel handler-side `ToolContext` (handlers/types.ts:123) does, and colorHandlers dutifully checks it every iteration. So stopping the agent cancels a smart_color run but cannot stop a 500-node for_each_node LLM loop mid-flight.

**Fix:** Add `isCancelled?: () => boolean` to the registry ToolContext, thread it from the agent runner, and check it inside the loops of for_each_node, research_topic, and generate_sequence.

#### color_matching classifies criteria with a fragile regex heuristic, contrary to the project's no-regex-for-NL rule

`src/llm/tools/handlers/colorHandlers.ts:105` — design

.claude/CLAUDE.md ('LLM Agent Rules') states: 'No regex for natural language. Use LLM to extract semantic meaning... Regex is fragile.' `isLiteralPattern` decides literal-vs-semantic via `/^[A-Z][a-z]/.test(criterion) || / of\b/ || / and\b/` etc. A capitalized semantic category like "Person" or "Organization" (exactly the examples in the tool's own schema description, smartTools.ts:65) matches `^[A-Z][a-z]` and is silently downgraded to substring matching on titles — so 'color all Person nodes red' colors only nodes whose title literally contains "person".

**Fix:** Drop the heuristic: always run the semantic path (the tag shortcut can stay), or ask the LLM once whether the criterion is literal or semantic; literal text matching already has its own tool (color_regex).

#### push_task drops the context argument the schema declares as an object

`src/llm/tools/handlers/memoryHandlers.ts:110` — correctness

The tool schema in planningTools.ts:232 declares `context: { type: 'object' }`, so the model will send a JSON object. The handler reads it with `const contextStr = getStringArg(parsed, 'context', '')` — getStringArg (src/lib/parsing.ts:50) returns the default `''` for non-string values, so any object-valued context is silently discarded and never reaches `agentMemoryStorage.pushTask`. The subsequent `JSON.parse(contextStr)` path only works if the model violates its own schema by sending a string.

**Fix:** Read the raw value and accept both shapes: use it directly if `typeof value === 'object'`, JSON.parse it if it is a string.

#### Three divergent ToolContext/ToolHandler type families with colliding names

`src/llm/tools/handlers/types.ts:112` — design

`ToolContext`/`ToolHandler` are defined in src/llm/registry.ts (store exposes `filteredNodes: Node[]`) and again, with the same names but a different shape, in handlers/types.ts (store exposes `getFilteredNodes(): Node[]`, plus llmQueue/themesStore/planState). A third, near-verbatim copy of every handler interface exists in useLLMTools.ts (`LLMToolsNodeStore` = `ToolNodeStore`, `ThemesStoreInterface` = `ToolThemesStore`, `AgentMemoryStorageInterface` = `ToolAgentMemoryStorage`, etc.). Any store change must be mirrored in three places, and importing `ToolContext` resolves to different contracts depending on the path — selectionTools.ts already has to cast (`ctx as SelectionToolContext`) to bridge one of the gaps.

**Fix:** Make handlers/types.ts import/re-export a single source of truth; delete the duplicated interfaces in useLLMTools.ts and give the two context types distinct names (e.g. RegistryToolContext vs HandlerToolContext) if both must exist.

#### build_knowledge_base supervisor loop can never pass phase 1

`src/llm/tools/knowledgeBaseTools.ts:187` — correctness

evaluatePhase compares `nodesBefore = ctx.store.filteredNodes.length` and `nodesAfter` around a `deepResearch()` call, but deepResearch (src/llm/research.ts:484) only gathers findings — it never creates nodes or edges in the store. Node creation happens later, when the agent processes the returned `__KB_PHASE_INCOMPLETE__`/`__KB_BUILD_COMPLETE__` markers. So `nodesCreated` is always 0, which is always < `phase.minNodes` (10-15), so the first phase always returns `__KB_PHASE_INCOMPLETE__` with recommendation 'expand'. Phases 2-5, the target-reached check at line 234, and the `__KB_BUILD_COMPLETE__` path at line 252 are unreachable in normal operation (only reachable if every deepResearch call throws, since the catch at line 228 'continues to next phase'). The multi-phase supervisor pattern the file header advertises cannot function as written.

**Fix:** Either have the tool create nodes from findings itself (so deltas are measurable), or restructure so each phase returns findings to the agent and a follow-up call evaluates the store delta for the previous phase (e.g. pass a phase cursor/state through the marker protocol).

#### Documented 'clock' layout and 'reverse' sort are not implemented

`src/llm/tools/layoutTools.ts:17` — correctness

The parameter description offers `"grid", "horizontal", "vertical", "circle", "clock", "star", "force"` and sort `"alphabetical", "numeric", "reverse"`. There is no `clock` branch — it silently falls into the `else` grid branch (line 108). For sort, descending is only triggered by a `-` prefix (`sortKey.startsWith('-')`, line 29); passing the documented value `"reverse"` matches no key and the comparator returns 0, i.e. no sorting happens. The LLM will use exactly the documented values and get silently wrong results.

**Fix:** Implement clock and reverse (e.g. treat 'reverse' as '-title'), or remove them from the schema descriptions so the LLM cannot select them.

#### Node-by-title lookup duplicated ~10 times with inconsistent case sensitivity

`src/llm/tools/nodeTools.ts:69` — consistency

`create_edge` (line 69), `create_edges_batch` (line 116), `delete_node` (line 164), `update_edge` (line 225), `update_node` (updateTools.ts:23), `move_node` (updateTools.ts:46) and `batch_update` (updateTools.ts:84) all use case-sensitive `n.title === args.title`, while `delete_edges` (line 192), `connect_selected_to` (selectionTools.ts:182) and `create_nodes_batch` (batchTools.ts:130) match `toLowerCase()`. An LLM that emits 'brainstem' instead of 'Brainstem' can delete edges for the node but cannot create an edge to it — the same title string succeeds or fails depending on which tool is called. The lookup is also copy-pasted in every tool.

**Fix:** Extract a shared `findNodeByTitle(store, title)` helper (case-insensitive, optionally trimmed) in src/llm/utils.ts and use it in all title-resolving tools.

### llm-providers-mcp

#### Startup log claims tool calls retry the connection, but nothing does

`packages/nodus-mcp-server/src/index.ts:129` — naming

start() logs `'Will continue and retry connection when tools are called.'`, but the CallToolRequestSchema handler only checks `this.wsClient.isConnected()` and returns an error — it never initiates a reconnect. Reconnection only happens from the ws 'close' handler, capped at MAX_RECONNECT_ATTEMPTS (10 x 3 s = 30 s). If Nodus is started more than ~30 s after the MCP server, the client permanently gives up and every tool call fails with 'Not connected' even though Nodus is now running.

**Fix:** Either attempt `wsClient.connect()` lazily in the tool-call handler when not connected (making the log message true), or use indefinite reconnection with backoff and correct the log message.

#### isAvailable() makes a billable messages API call instead of the free models endpoint

`src/llm/providers/anthropic.ts:47` — design

isAvailable() POSTs to `/v1/messages` with `model: 'claude-3-haiku-20240307', max_tokens: 1` — a real, billable completion request fired every time availability is probed (e.g. from the settings panel). Sibling providers use a free GET models listing, and this same file already calls GET `/v1/models` in listModels(). It also hardcodes a model id independent of the configured model, and `return response.status !== 401` reports 4xx/5xx responses (e.g. 400, 429, 529) as 'available'.

**Fix:** Probe GET `${baseUrl}/v1/models` with the api key, mirroring listModels() and the other providers, and treat only 2xx as available.

#### generate() error handler swallows the detailed API error it just built

`src/llm/providers/anthropic.ts:140` — correctness

In generate(): `try { const error = JSON.parse(errorText); throw new Error(error.error?.message || ...) } catch { throw new Error(`Anthropic error: ${response.status}`) }` — the `throw new Error(error.error?.message ...)` executes inside the same try block, so it is immediately caught by its own catch and replaced with the generic `Anthropic error: <status>` message. The detailed message from the API (e.g. invalid model, quota, bad request cause) is never surfaced. chat() in the same file uses a different, working pattern (`response.json().catch(() => ({}))`).

**Fix:** Parse inside the try, throw outside it: `let msg = `Anthropic error: ${response.status}`; try { msg = JSON.parse(errorText).error?.message || msg } catch {}; throw new Error(msg)` — or reuse chat()'s `.json().catch()` pattern for consistency.

#### LLMMessage lacks tool_call_id and duplicates ChatMessage in src/llm/types.ts

`src/llm/providers/types.ts:6` — typing

The agent loop sends tool results as `{ role: 'tool', content, tool_call_id }` (useAgentRunner.ts:369, useNodeAgent.ts:431) and the OpenAI API requires tool_call_id on tool-role messages. But `LLMMessage` in providers/types.ts has no `tool_call_id` field; the value only survives because providers pass messages through untyped/spread. Meanwhile `ChatMessage` in src/llm/types.ts is a near-identical duplicate that does declare `tool_call_id`. Two divergent definitions of the same wire shape invite silent drift — e.g. a provider that reconstructs messages field-by-field (as anthropic.ts does) silently loses the field with no type error.

**Fix:** Add `tool_call_id?: string` to LLMMessage and make ChatMessage extend or alias it (single source of truth).

### components-storyline

#### click fires after a completed drag, triggering node navigation

`src/components/StorylineNodeList.vue:211` — correctness

`onPointerUp` resets `isDragging = false` and `draggingNodeIndex = null` before the browser dispatches the subsequent `click` event on the pointer-captured element. `@click="handleNodeClick(index)"` therefore emits `node-click` after every drag-reorder, causing the parent to scroll/zoom to the dragged node (`goToNode` in the reader, `zoom-to-node` in the panel) as an unwanted side effect of reordering.

**Fix:** Keep a `wasDragging` flag (or defer resetting `isDragging` until after the click) and early-return in `handleNodeClick` when the pointerup concluded a drag.

#### Comment type and meta silently dropped when creating comments from the panel

`src/components/StorylinePanel.vue:270` — correctness

StorylineNodeList emits `create-comment` with `(index, text, commentType)`. The panel binds `@create-comment="handleCommentCreate"` from useStorylineOperations, whose signature is `(index: number, text: string)` — the third argument is silently discarded, and the composable stores the raw `text` as `markdown_content` without wrapping it via `createCommentContent()`. StorylineReader.vue's own `handleCommentCreate` (line 190) does wrap it: `const content = createCommentContent(text, commentType)`. Result: a comment created as 'question'/'todo'/etc. from the panel loses its type and `resolved` flag (parseCommentMeta falls back to `{type:'note', resolved:false}`), while the identical action in the reader preserves it. Same UI action, divergent persisted data.

**Fix:** Change useStorylineOperations.handleCommentCreate to accept `commentType: CommentType = 'note'` and store `createCommentContent(text, commentType)`, matching StorylineReader.

#### Two competing active-index trackers on scroll; one miscounts comment nodes

`src/components/StorylineReader.vue:119` — correctness

`handleScroll` calls `baseHandleScroll()` (useStorylineNavigation), which on every scroll event runs `querySelectorAll('.node-section')` + `getBoundingClientRect()` per section and writes `activeNodeIndex`. The IntersectionObserver (`useScrollObserver`, selector `[data-node-index]`, synced at line 106) also writes `activeNodeIndex`. They disagree whenever comment nodes exist: comments render as `.comment-callout` (not `.node-section`) but do carry `data-node-index`, so `baseHandleScroll`'s index is computed over a filtered list while the observer's index matches template indices. The two mechanisms fight on each scroll, and the querySelectorAll+rect measurement per scroll event is redundant layout work on a hot path.

**Fix:** Remove the manual `baseHandleScroll` index computation and rely solely on the IntersectionObserver (keep only `schedulePositionSave()` in the scroll handler), or fix the selector to `[data-node-index]` and drop the observer.

#### Reader reimplements storyline node operations instead of using useStorylineOperations

`src/components/StorylineReader.vue:169` — consistency

`handleNodeAdd`, `handleNodeCreate`, `handleCommentCreate`, `handleNodeRemove`, `handleNodeReorder` (lines 169-235) duplicate useStorylineOperations, which StorylinePanel already uses. The copies have diverged: the reader wraps comments with `createCommentContent` while the composable does not (see the StorylinePanel finding), the composable shows toasts while the reader is silent, and the composable falls back to `store.addNodeToStoryline` when `storylineService` is absent while the reader silently no-ops (`if (!storylineService) return`). Duplicated logic guarantees further drift.

**Fix:** Extend useStorylineOperations with an optional `onMutated` callback (the reader passes a refetch of `nodes`), fix the comment-meta divergence there, and delete the reader's local copies.

#### Wikilink position recomputation on every scroll frame causes layout thrashing

`src/components/StorylineReferencesSidebar.vue:185` — correctness

`watch(scrollTop, () => updateWikilinkPositions())` runs on every animation frame while scrolling (scrollTop is updated per-scroll via RAF in `syncScroll`). `updateWikilinkPositions` does `querySelectorAll('[data-node-index]')`, then per-section `querySelectorAll('a.wikilink')` and `getBoundingClientRect()` per link. But positions are stored scroll-independent (`rect.top - containerRect.top + scrollTop`), so recomputing per scroll frame is pure waste — forced synchronous layout on the hottest path in the reader. The card `top` already subtracts `scrollTop` reactively in the template.

**Fix:** Drop the `watch(scrollTop, ...)` entirely; recompute positions only when content changes (nodes watch, after pending-content injection), and let the template's `- scrollTop` handle scrolling.

### components-modals

#### Wikilink navigation discards unsaved edits of the previous node

`src/components/FullscreenNodeModal.vue:56` — correctness

Clicking a wikilink emits `navigate-to-node`; `useFullscreenModal.handleNavigateToNode` changes `fullscreenNodeId` while the modal stays open. The `watch(() => props.nodeId, ...)` then overwrites `editTitle`/`editContent` with the new node's data and resets `hasUnsavedChanges = false` without calling `save()` first. Any edits made to the previous node within the 500 ms auto-save debounce window are lost, and the pending `saveTimeout` becomes a no-op because `save()` now compares the new node's values against itself.

**Fix:** Call `save()` (against the old nodeId) before repopulating the edit state in the nodeId watcher, e.g. by capturing the old id in the watcher callback `(id, oldId)` and flushing pending changes for `oldId` first.

#### Escape in wikilink picker search closes the whole modal

`src/components/FullscreenNodeModal.vue:221` — correctness

The Escape branch checks `showLinkPicker.value` and calls `stopPropagation()` to close only the picker. But NodePicker's search input has its own `@keydown.escape="$emit('close')"` (NodePicker.vue:182) which runs first during bubbling and sets `showLinkPicker` to false synchronously. When the same event reaches the window handler, `showLinkPicker.value` is already false, so the else branch runs `save()` + `emit('close')` and the entire modal closes. The intended two-stage Escape (close picker, then close modal) never happens while the picker search is focused.

**Fix:** Have NodePicker call `event.stopPropagation()` in its Escape handler (e.g. `@keydown.escape.stop`), or track picker-open state in a way that is not mutated before the window handler runs.

#### Search filter reads nonexistent field n.content; typecheck fails

`src/components/NodePicker.vue:54` — correctness

The search filter uses `(n.content && n.content.toLowerCase().includes(q))`, but the `Node` interface (src/types/index.ts:59) has `markdown_content`, not `content`. The expression is always undefined, so the picker silently searches titles only despite intending to search content. Verified with `npx vue-tsc --noEmit`, which reports `NodePicker.vue(54,10): error TS2339: Property 'content' does not exist on type 'Node'` — the project does not currently typecheck cleanly because of this line.

**Fix:** Change to `(n.markdown_content && n.markdown_content.toLowerCase().includes(q))`.

#### Keyboard shortcuts only work when focus is inside the overlay

`src/components/PlanApprovalModal.vue:137` — correctness

Escape and Cmd/Ctrl+Enter are bound via `@keydown="onKeydown"` on the overlay div with `tabindex="0"`, but nothing ever focuses the overlay when the modal opens (the `autofocus` attribute on the edit inputs only applies while editing, and is unreliable for dynamically inserted elements in WebKit). Until the user clicks inside the modal or focuses an input, keydown events target `body` and never reach the overlay, so the advertised shortcuts (`approveShortcut`, Escape-to-close) are dead. Sibling modals (FullscreenNodeModal, KeyboardShortcutsModal) attach window-level listeners instead.

**Fix:** Attach a window keydown listener guarded by `props.visible` (as in KeyboardShortcutsModal), or programmatically focus the overlay in a `watch` on `visible` with `nextTick`.

#### Dark-theme styling duplicated via hardcoded hex colors and theme-name list

`src/components/SettingsModal.vue:240` — design

Fifteen `:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) ...` selectors override colors with hardcoded hex values (#27272a, #3f3f46, #f4f4f5, #18181b), duplicating what the theme CSS variables already encode. Sibling modals (FullscreenNodeModal, KeyboardShortcutsModal, McpApprovalModal) style entirely with `var(--bg-surface)` etc. and need no per-theme overrides. This hardcodes the set of dark themes in a component; a new dark theme added to the themes store will silently render this modal with light-theme fallbacks.

**Fix:** Drop the per-theme overrides and use the semantic CSS variables (`--bg-surface`, `--bg-surface-alt`, `--border-default`, `--text-main`, `--text-muted`) which are already theme-aware.

### components-entity-misc

#### Entity type icon/label/color config duplicated across five components

`src/components/EntityBadge.vue:15` — consistency

The per-entity-type maps are re-declared with the same literal values in EntityBadge.vue (entityIcons, entityColors), EntityNodeCard.vue (entityIcons, entityColors), EntityPanel.vue (entityIcons, entityLabels), EntityPickerModal.vue (entityConfig), and EntityCreatePopover.vue (entityConfig with defaultColor); CanvasContextMenu.vue repeats the icon names again. The color set (#8b5cf6/#22c55e/#3b82f6/#f59e0b/#6b7280) and icon names (user/map-pin/quote/file-text/box) must stay in sync by hand — EntityBadge already drifted to emoji icons while the others use the Icon component. ENTITY_NODE_TYPES already lives in src/types, but its presentation metadata does not.

**Fix:** Export a single `ENTITY_TYPE_CONFIG: Record<EntityNodeType, { icon; label; color; placeholder }>` next to ENTITY_NODE_TYPES in src/types (or a small src/lib/entityTypes.ts) and import it everywhere.

### components-settings

#### Grid snap and grid size settings are written but never read by the canvas

`src/components/settings/CanvasSettingsPanel.vue:19` — correctness

The panel persists `canvasStorage.setGridSnap(...)` and `canvasStorage.setGridSize(...)`, but a repo-wide grep shows `canvasStorage.getGridSnap`/`getGridSize` are referenced only by this panel and storage.ts itself. The canvas uses `useCanvasSettings.ts`, which has its own independent state: `const gridLockEnabled = ref(false)` and a hardcoded `const gridSize = 20`. Unlike the edge settings, no `nodus-grid-*` event is dispatched either. Result: the 'Grid snap' checkbox and 'Grid size' input in Settings have no effect on canvas behavior — the actual snap toggle lives only in the canvas toolbar and always uses grid size 20.

**Fix:** Wire `useCanvasSettings` to initialize `gridLockEnabled`/`gridSize` from `canvasStorage` and listen for a change event (or shared store), or remove the two controls from the panel until they are functional.

#### Edge style picker omits the valid 'direct' style

`src/components/settings/CanvasSettingsPanel.vue:96` — consistency

The ref is typed `'orthogonal' | 'diagonal' | 'curved' | 'hyperbolic' | 'straight' | 'direct'` and 'direct' is a fully supported style (storage.ts accepts it, canvas/routing/index.ts renders it, CanvasControls.vue and useEdgeStyling.ts let the user cycle to it), but the settings template only renders five radio options. If the user selects 'direct' from the canvas toolbar, the settings panel shows no radio checked and offers no way to select it there.

**Fix:** Add a 'direct' radio option to the edge-style-grid (and import the shared EdgeStyleType instead of re-declaring the union literal).

#### API keys persisted in plaintext localStorage

`src/components/settings/LLMSettingsPanel.vue:181` — design

`saveProviderConfig()` stores the provider `apiKey` via `llmStorage.setProviderConfig` and `searchApiKey` via `llmStorage.setSearchApiKey`; both resolve to raw `localStorage.setItem` calls (src/lib/storage.ts lines 198-220). ZoteroSettingsPanel does the same with `zoteroStorage.setApiKey`. In a Tauri app, localStorage is an unencrypted file on disk readable by any process running as the user; secrets (Anthropic/OpenAI, Tavily, Zotero keys) should not live there.

**Fix:** Store secrets via the OS keychain (e.g. tauri-plugin-stronghold or tauri-plugin-keyring) and keep only non-secret config in localStorage.

#### Error state stubbed to null; start/stop failures are silently dropped

`src/components/settings/McpSettingsPanel.vue:25` — correctness

`const error = computed(() => null) // TODO: inject error state if needed` makes the `v-if="error"` block at line 94 unreachable dead code. Meanwhile `useMcpServer.startServer()` sets a real `error` ref and rethrows on failure, and `toggleServer()` awaits it with no try/catch — a failed start produces an unhandled promise rejection and zero user feedback, while the `.error-message` UI that was built for exactly this case can never render. Additionally, because `:checked="isRunning"` does not change when start fails, the native checkbox can remain visually checked while the server is stopped.

**Fix:** Provide `mcpServer.error` from App.vue and inject it here instead of the null stub; wrap toggleServer in try/catch and re-sync the checkbox state on failure.

#### Edge cleanup section uses hardcoded English strings instead of i18n

`src/components/settings/WorkspaceDiagnosticsSection.vue:176` — consistency

The section renders 'Edge Database Cleanup', 'Clean Up Edges', 'Cleaning...', 'Removes orphan edges (pointing to deleted nodes) and duplicates.' and builds `cleanupResult` as an English template string ('Removed X orphan edges, Y duplicates', 'Error: ...'), while the rest of this file and every sibling panel use `t(...)` keys with de/fr/es/it locales present. These strings will not be translated.

**Fix:** Move the strings into the locale files under settings.* and use `t()` with interpolation for the result message.

### composables

#### Consumer interface declares markProgrammaticMove with the wrong signature

`src/composables/useFileSync.ts:128` — typing

The composable defines `markProgrammaticMove(nodeId: string): void` and callers pass a single node id (useNodeDragging.ts:431), but `FileSyncInterface` in src/stores/nodes/types.ts:83 declares it as `(paths: string[]) => void` — wrong parameter type and a misleading name (`paths` vs node id). Any module coded against the interface would pass an array and silently break the programmatic-move suppression (the Set would contain an array, `has(nodeId)` would never match, and the watcher would double-handle the app's own file moves).

**Fix:** Change the interface declaration to `markProgrammaticMove: (nodeId: string) => void` to match the implementation.

#### Catch blocks look like they return safe defaults but actually rethrow

`src/composables/useImport.ts:419` — correctness

`handleAsyncError` (src/lib/errorHandling.ts) rethrows by default (`rethrow !== false → throw e`). All four catch blocks in this file call `handleAsyncError({...})(e)` and then `return []` / `return {...}` / `return 0` — those returns are unreachable dead code. Only `refreshWorkspace` acknowledges this ('unreachable due to rethrow'); `importVault`/`importCitations`/`importOntology` present the same pattern as if it returned a fallback. The functions therefore reject on error, and at least one caller — `refreshFromFiles` in PixiCanvas.vue:1049 (`await store.refreshWorkspace()` with no try/catch) — produces an unhandled promise rejection.

**Fix:** Decide the contract: either pass `rethrow: false` and keep the fallback returns (callers already show notifications via the handler), or delete the unreachable returns and wrap the remaining bare callers in try/catch. Also drop the redundant dynamic `import('../lib/tauri')` at line 613 — the module is already statically imported at the top.

#### Cmd/Ctrl+Shift+Z redo shortcut never fires

`src/composables/useKeyboardShortcuts.ts:30` — correctness

The redo branch checks `(e.key === 'z' && e.shiftKey) || e.key === 'y'`. When Shift is held, KeyboardEvent.key is the uppercase character 'Z', not 'z', so `e.key === 'z' && e.shiftKey` can never be true. Redo via Cmd+Shift+Z (the standard macOS redo binding, and this is the primary dev platform) silently does nothing; only Ctrl+Y works. The author handled this correctly a few lines later for Shift+R (`e.key === 'R' || e.key === 'r'`), confirming the inconsistency. App.vue:449 wires redo exclusively through this composable, so there is no other redo path.

**Fix:** Compare case-insensitively: `(e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y'` (and same for the undo branch for robustness).

#### handleScroll does per-scroll getBoundingClientRect scans — the exact pattern useScrollObserver exists to replace, and both run simultaneously

`src/composables/useStorylineNavigation.ts:64` — consistency

`handleScroll` runs `querySelectorAll('.node-section')` plus `getBoundingClientRect()` per section on every scroll event (forced synchronous layout). useScrollObserver.ts documents itself as 'Replaces manual getBoundingClientRect() calls for better performance', yet StorylineReader.vue wires BOTH: `@scroll="handleScroll"` calls `baseHandleScroll()` (this function) while also running the IntersectionObserver, so two competing mechanisms compute the active index and the expensive one still fires unthrottled on every scroll frame.

**Fix:** Delete handleScroll from useStorylineNavigation and let useScrollObserver's activeIndex be the single source of truth, or if the observer is insufficient, remove the observer — keep exactly one mechanism.

#### useTypst render pipeline is dead: its only consumer (MathRenderer.vue) is referenced nowhere

`src/composables/useTypst.ts` — dead-code

Grep shows `MathRenderer` appears only inside src/components/MathRenderer.vue itself — no component imports or renders it. The live math path is MarkdownRenderService, which invokes 'render_typst_math' directly and uses a separate cache in src/lib/typst.ts. Within useTypst, `renderToSvg` (lines 74-84) is a verbatim duplicate of `renderMath` (89-98); `renderCodeBlock`, `getCacheStats`, `clearCache`, `isInitializing`, and `initError` have zero external references (`isInitializing`/`initError` are also never written, so they are permanently false/null); only `hasMath`/`hasTypstBlock` are used, and only by a test. The app thus carries two parallel Typst caching implementations, one of which is unreachable.

**Fix:** Delete MathRenderer.vue and prune useTypst down to the helpers that are actually used (or move hasMath/hasTypstBlock into lib and delete the composable). Consolidate math rendering/caching into MarkdownRenderService + lib/typst.ts.

#### Ten push* functions and two ~120-line mirrored branches duplicate identical boilerplate

`src/composables/useUndoRedo.ts` — design

Every push function repeats the same four lines (`undoStack.value.push(...); if (length > maxUndo) shift(); redoStack.value = []`) ten times, and `undo()`/`redo()` are near-identical if/else chains over nine snapshot types (the redo branches are copy-pasted undo branches with the stacks swapped). Any new snapshot type must be added in four places, which is exactly how the missing deletion/creation redo branches happened.

**Fix:** Extract a `pushSnapshot(stack, snapshot)` helper, and model each snapshot type as {capture(current), apply(snapshot)} so undo/redo become one generic function that captures the inverse, applies the snapshot, and pushes to the opposite stack.

#### Undo of deletion/creation snapshots cannot be redone; redo() lacks those branches

`src/composables/useUndoRedo.ts:254` — correctness

In `undo()`, every snapshot type pushes an inverse snapshot onto `redoStack` except 'deletion' and 'creation' (the branches at lines 254-268 restore/delete nodes but push nothing). `redo()` (lines 359-473) also has no handlers for 'deletion' or 'creation'. Consequence: after undoing a node deletion, pressing redo either does nothing or, worse, replays an older stale snapshot still sitting on the redo stack, silently desynchronizing undo history from canvas state.

**Fix:** Push the inverse snapshot in both branches (undo of deletion pushes a creation snapshot with the restored node id and vice versa) and add matching branches in redo(), or explicitly clear redoStack for these types and document the limitation.

### stores

#### Task lifecycle machinery is never used — tasks can never progress

`src/stores/agentTasks.ts` — dead-code

Grep across src/ shows the only consumed members are `setTasks`, `tasks`, `totalTasks`, `completedTasks`, `progress`, `isComplete`, `hasErrors` (usePlanHandlers.ts, AgentTaskPanel.vue, PixiCanvas.vue). Never referenced anywhere: `startTask`, `startNextTask`, `completeTask`, `failTask`, `updateTaskStatus`, `clearTasks`, `getTask`, `getSummary`, `currentTaskIndex`, `currentTask`, `sessionStartedAt`, `isRunning`. Since nothing ever transitions a task out of 'pending', the store's progress/isComplete computeds can never change after setTasks — the progress display is aspirational, and ~60% of the file is dead.

**Fix:** Either wire the agent runner to call updateTaskStatus/completeTask as steps execute, or delete the unused lifecycle methods and state.

#### createEdge duplicate check ignores link_type/storyline_id, silently swallowing edge creation

`src/stores/edges.ts:82` — correctness

The pre-existence check is `edges.value.find(e => e.source_node_id === data.source_node_id && e.target_node_id === data.target_node_id)` — it ignores link_type, storyline_id, and directedness, and returns the existing edge of ANY type. Consequence: when any edge already connects a pair, (a) `updateNodeContent` (crud.ts) can never create a wikilink edge, (b) `repairStorylineEdges` and `addNodeToStoryline` (storylines.ts) can never attach a storyline edge — createEdge returns the unrelated manual edge without storyline_id, so the 'missing edge' condition stays true and repair re-attempts on every call, forever doing nothing. This also contradicts `deduplicateEdgesLocal` (line 225), whose dedupe key includes link_type and treats different link types between the same pair as distinct legitimate edges.

**Fix:** Include link_type (and storyline_id where relevant) in the duplicate key, matching deduplicateEdgesLocal semantics; for undirected edges also check the reverse direction.

#### Divergent error-handling among edge update methods

`src/stores/edges.ts:178` — consistency

`updateEdgeColor` (178) and `updateEdgeStoryline` (198) await invoke with no try/catch — on backend failure they throw and skip the local update. `updateEdgeDirected` (129), `deleteEdge` (141), `updateEdgeLabel` (186), and `restoreEdge` (153) catch, log, and apply the local update anyway. Same operation class, three different failure semantics (throw-and-skip, swallow-and-apply, and updateEdgeLinkType's no-persist), so callers cannot reason about optimistic-update behavior.

**Fix:** Pick one policy (optimistic with logged failure, or propagate) and apply it to all edge mutators.

#### updateNodePosition does a Tauri IPC + DB write on every call, invoked per pointermove during drag

`src/stores/nodes/crud.ts:65` — correctness

`await invoke('update_node_position', ...)` runs unconditionally. `useNodeDragging` calls `store.updateNodePosition(id, x, y, { skipLayoutTrigger: true })` on every pointermove (useNodeDragging.ts:263,268), so dragging issues one IPC round-trip and one DB write per frame per dragged node — for a multi-select drag of 50 nodes at 60fps that is ~3000 IPC calls/second. The `skipLayoutTrigger` option shows the hot path was considered, but only the reactivity half was optimized; persistence was not. Position is persisted again at drag end anyway.

**Fix:** Add a `skipPersist` (or `persist: false`) option used during drag, persisting once on drag end; or debounce/batch the invoke.

#### createNode silently fabricates a local-only node when the backend write fails

`src/stores/nodes/crud.ts:373` — design

On `invoke('create_node')` failure the catch block (commented 'Fallback for development') generates a local node with `generateShortId()` and pushes it into state. The same pattern exists in edges.ts createEdge (line 108). In production this masks persistence failures: the user sees a node/edge that vanishes on restart, with only a console.error and no user-facing notification (other failure paths use `notifications$`). This is aspirational dev-time behavior living on the production path.

**Fix:** Rethrow (or notify via notifications$) on failure; gate the mock fallback behind an explicit dev/browser-mode check (`isTauri()` from lib/tauri is available).

#### createFrame declared to return string but actually returns a Frame object

`src/stores/nodes/frames.ts:23` — typing

`export function createFrame(...): string { ... return framesStore.createFrame(...) }` — framesStore.createFrame returns a `Frame` (frames.ts:60-88). Confirmed vue-tsc error TS2322 'Type Frame is not assignable to type string'. The orchestrator (nodes.ts:316) inherits the wrong `string` type, while callers in PixiCanvas.vue:912 and App.vue:174 type the injected function as returning `Frame` — producing further downstream TS errors. The runtime value is a Frame, so the annotation is simply false.

**Fix:** Change the declared return type to `Frame`.

#### storylineNodes typed Map<string, StorylineNode[]> but runtime value is Map<string, string[]>

`src/stores/nodes/state.ts:126` — typing

`NodeStoreComputed.storylineNodes` (nodes/types.ts:60) declares `ComputedRef<Map<string, StorylineNode[]>>`, but `storylinesStore.storylineNodes` is `ref<Map<string, string[]>>` (storylines.ts:18) — it holds node-id strings, which is exactly how StorylinePanel.vue consumes it. Confirmed as a vue-tsc error: `state.ts(126,5): error TS2322: Type 'ComputedRef<Map<string, string[]>...>' is not assignable to type 'ComputedRef<Map<string, StorylineNode[]>>'`. Related: advanced.ts:268 declares `getStorylineNodes` returning `StorylineNode[]` while the store method actually returns `Promise<Node[]>` (error TS2740) — consumers (StorylineReader.vue, mcp handlers) rely on the real Promise<Node[]> behavior, so the annotations lie.

**Fix:** Change the NodeStoreComputed field to `ComputedRef<Map<string, string[]>>` and the advanced.ts forwarder return type to `Promise<Node[]>`.

#### Forwarder signatures contradict the functions they forward to (confirmed vue-tsc errors)

`src/stores/nodes/types.ts:83` — typing

Three confirmed mismatches: (1) `FileSyncInterface.markProgrammaticMove: (paths: string[]) => void` but useFileSync's actual implementation takes `(nodeId: string)` — nodes.ts(341) errors TS2345 when passing fileSync to switchWorkspace; (2) advanced.ts:97 `recoverWorkspace(...): Promise<void>` while workspaceStore.recoverWorkspace returns `Promise<Workspace | null>` (TS2322), silently discarding the recovered workspace from the type; (3) stores/nodes/edges.ts:85 `updateEdgeLinkType(...): Promise<void>` returns the store's `void` result (TS2322), and its sibling `restoreEdge` declares `void` while forwarding an async `Promise<void>` function, hiding awaitability from callers (App.vue(104) TS2322).

**Fix:** Align each forwarder's annotation with the forwarded function's real signature; these are 6 of the 50 vue-tsc errors currently in the repo, suggesting typecheck is not part of CI — consider adding `vue-tsc --noEmit` to the build.

### lib-a

#### BibTeX entry regex truncates entries whose field values contain '@'

`src/lib/bibtex.ts:95` — correctness

The entry regex `/@(\w+)\s*\{\s*([^,\s]+)\s*,([^@]*?)(?=\n\s*@|\s*$)/gs` uses `[^@]*?` for the entry body, so any `@` inside a field value — email addresses in `author`, `@` in `url` or `abstract` (common in Zotero exports) — terminates the body early. All fields after the `@` are silently dropped, and the remainder of the entry can be misparsed as the start of the next entry. The lookahead `(?=\n\s*@|\s*$)` already anchors entry boundaries to `@` at the start of a line, so the `[^@]` restriction inside the body is both unnecessary and harmful.

**Fix:** Change the body group to `([\s\S]*?)` (or `(.*?)` with the existing /s flag), relying on the `(?=\n\s*@|\s*$)` lookahead for entry boundaries; add a test with an abstract containing '@'.

#### 429 backoff releases the next queued request instead of pausing the queue

`src/lib/semanticScholar.ts:314` — correctness

In `rateLimitedFetch`, when a 429 (line 314) or CORS-masked rate-limit error (line 331) is hit, the code calls `this.processQueue()` BEFORE sleeping for the backoff. That immediately dequeues and executes the next pending request while the API is actively rate-limiting, so during a multi-request operation (e.g. `getCitations` pagination plus queued `getReferences` calls) subsequent requests fire after only the normal 3s interval, are likely to 429 as well, and each of them again releases the next request — defeating the backoff entirely. As a side effect, each concurrent waiter calls `startCountdown`, which clears and restarts the shared `countdownInterval`, so the UI countdown flickers between competing timers.

**Fix:** Do not call processQueue before the backoff sleep; keep the queue paused, sleep, retry in place, and only advance the queue after this request has fully resolved.

#### API keys persisted as plaintext localStorage entries

`src/lib/storage.ts:216` — design

`llmStorage.setSearchApiKey`, `zoteroStorage.setApiKey`, and LLM provider configs (which hold `apiKey`, per `isLLMConfigured`'s `Boolean(config.apiKey)`) all store secrets as plaintext strings in localStorage. In a Tauri app this ends up unencrypted on disk in the WebView profile, readable by any process with user-level file access and included in any localStorage dump. The review checklist explicitly calls out plaintext API-key storage as a security concern.

**Fix:** Store secrets via the OS keychain (e.g. tauri-plugin-keyring/stronghold) through a Tauri command, keeping only non-secret config in localStorage. At minimum, document the exposure.

#### markdownToTypst does not escape Typst special characters in body content

`src/lib/typst-export.ts:91` — correctness

Node titles are escaped via `escapeTypst()` (\, $, #, @, *, _), but `markdownToTypst()` passes body text through with raw `#`, `$`, and `@` intact. In Typst, `#` enters code mode and `$` opens math mode, so ordinary note content like `#hashtag`, `C# code`, `$100`, or an email address produces Typst compile errors or garbled output in the PDF export path (src/lib/pdf-export.ts calls exportToTypst). Intentional math (`$...$`) needs to survive, but plain `#` and `@` outside code fences do not. The asymmetry between escaped titles and unescaped bodies is the bug.

**Fix:** Escape `#` and `@` (and stray `$` outside recognized math spans) in text segments during markdownToTypst, using the same placeholder technique already used for bold/italic to protect code fences and math regions.

#### createItemFromNode is unused; item-building logic lives (duplicated) in useZotero instead

`src/lib/zoteroApi.ts:263` — dead-code

Grep shows no caller of `ZoteroWebApi.createItemFromNode`. The actual export path (src/composables/useZotero.ts, `addToZoteroViaApi`) builds items via its own `buildZoteroItemData(nodeTitle, nodeContent)` and calls `zoteroApi.createItem` directly. Two parallel node-to-ZoteroApiItem mappers (frontmatter/type/journal/date/creators/abstract extraction) is exactly the duplicated-logic situation the review is meant to catch: the dead one in zoteroApi.ts will drift from the live one in useZotero.ts. `testConnection` (line 133) is likewise uncalled — ZoteroSettingsPanel.vue tests the connection by calling `zoteroApi.getCollections()` directly (line 97); the only 'testConnection' hit in the panel is an i18n key.

**Fix:** Delete createItemFromNode and testConnection from ZoteroWebApi, or move buildZoteroItemData's logic into the class and make useZotero call it — one mapper, one owner.

### lib-b

#### pdf-export.ts is not reachable from application code

`src/lib/pdf-export.ts` — dead-code

Grep across src/ and packages/ shows exportToPdf and downloadTypst are referenced only by src/__tests__/pdf-export.test.ts, and downloadPdf / exportSelectedToPdf are referenced nowhere at all. The whole module (and its typst-export dependency, also test-only) is dead relative to the app, violating the project's no-dead-code rule. Secondary issues in the same file: it uses raw console.log/console.error while sibling src/lib/typst.ts uses createLogger; downloadPdf and downloadTypst duplicate the blob-anchor-download boilerplate; and a failed dynamic import leaves initPromise cached as a rejected promise so initialization is never retried.

**Fix:** Either wire the export feature into the UI or remove the module and its tests; when keeping it, switch to createLogger, extract a shared triggerDownload(blob, filename) helper, and reset initPromise on failure.

#### SSRF hostname blocklist has significant gaps

`src/lib/promptSecurity.ts:25` — correctness

isPrivateHostname (used by isValidFetchUrl to "prevent SSRF attacks") misses: 169.254.0.0/16 link-local — including the cloud metadata endpoint 169.254.169.254; the rest of 127.0.0.0/8 (127.0.0.2, `127.1`); non-dotted IP encodings (`http://2130706433/`, `0x7f000001`); IPv6 loopback/private variants other than the literal `[::1]` (`[0:0:0:0:0:0:0:1]`, `[::ffff:127.0.0.1]`, `[fc00::]/7`, `[fe80::]/10`); and CGNAT 100.64.0.0/10. Any LLM-driven fetch tool relying on this check can be steered to those targets.

**Fix:** Parse the hostname into a numeric IP when possible and compare against CIDR ranges (including IPv6 and IPv4-mapped forms) instead of string prefixes; explicitly block 169.254.0.0/16 and all of 127.0.0.0/8.

#### sanitizeMermaidSvg is a bypassable regex blacklist

`src/lib/sanitize.ts:92` — correctness

sanitizeMermaidSvg removes only `<script>` tags, quoted/unquoted `on*=` handlers, and quoted `href="javascript:..."`. It misses: `xlink:href="javascript:..."` (SVG's primary link attribute), unquoted `href=javascript:alert(1)`, `<iframe>/<object>/<embed>` inside `foreignObject` (mermaid SVGs contain foreignObject HTML and this output is set via innerHTML in MarkdownRenderService line 282), and event handlers with mismatched quotes (`onclick='a"b'` is only partially removed). Mermaid source ultimately comes from user markdown and LLM output, so this is a real XSS surface, not just defense-in-depth for trusted content as the comment claims.

**Fix:** Use DOMPurify with a config that permits foreignObject + the HTML subset mermaid needs (like svgConfig but with FORBID_TAGS for iframe/object/embed and URI scheme checks), or run mermaid with securityLevel: 'strict' and keep DOMPurify as the single sanitizer.

#### Unanchored substring file_path match shadows exact frame/filename resolution

`src/lib/wikilink.ts:43` — correctness

Resolution step 2 (`n.file_path?.toLowerCase().includes(decodedTarget.toLowerCase())`) runs before the exact frame+title match (step 3) and exact filename match (step 4). Because it is a raw substring test with no path-boundary anchoring, a target like `a/b` matches file paths such as `banana/bcd...` or any path merely containing the letters, returning a wrong node before the exact matches get a chance. Also the hand-rolled entity decoding handles only &amp;/&lt;/&gt; while data-target attributes are produced with &quot; escaping in MarkdownRenderService — sanitize.ts already exports decodeHtmlEntities for this.

**Fix:** Anchor the path match (compare against path segments or require match at a `/` boundary and `.md` suffix), move it below the exact frame/filename steps, and reuse decodeHtmlEntities from src/lib/sanitize.ts.

## Low severity, confirmed (55)

Findings reported as high/medium and downgraded to low by the verifier, or confirmed as minor.

- `src-tauri/src/commands/nodes.rs:202` (design): **Blocking std::fs I/O inside async commands on vault-sized loops** — sync_all_wikilinks does `std::fs::read_to_string(file_path)` per node inside an async Tauri command, blocking the async runtime thread for the whole vault scan; refresh_workspace (vault_watcher.rs:658), sync_missing_files (vault_watcher.rs:138), and ...
- `src-tauri/src/commands/nodes.rs:705` (dead-code): **get_deleted_nodes and restore_nodes_with_files are exposed but never called** — Both commands are registered in main.rs (lines 196-197) but grep across src/, packages/, and src-tauri finds no invoke of 'get_deleted_nodes' or 'restore_nodes_with_files' from any frontend or MCP code path (the underlying `restore_if_file_exists` is reached ...
- `src-tauri/src/pdf.rs:57` (correctness): **resolve_array drops annotations stored inline in the Annots array** — `resolve_array` returns only `Object::Reference` items and its callers then call `doc.get_object(annot_id)`. The PDF spec allows annotation dictionaries to appear inline (as `Object::Dictionary`) inside the Annots array; those are silently discarded by the `_ ...
- `src-tauri/src/pdf.rs:144` (naming): **extract_marked_content does not extract marked content; it duplicates the comment or returns the annotation author** — The function is documented as 'Extract the text content that was marked by the annotation' but QuadPoints extraction is unimplemented (acknowledged in a comment). Its fallbacks are: RC (rarely the selected text), then `Contents` — which is the same field ...
- `src-tauri/src/database/edges.rs:21` (correctness): **get_by_workspace returns edges attached to soft-deleted nodes** — The JOIN in get_by_workspace filters on `n1.workspace_id = ?` / `n2.workspace_id = ?` but never checks `deleted_at IS NULL`, while nodes::get_all and storylines::get_nodes_with_data both exclude soft-deleted nodes. Result: after a node is soft-deleted, the ...
- `src-tauri/src/database/mod.rs:3` (docstring): **Module doc claims LibSQL; the code uses sqlx's plain SQLite driver** — The module doc says "Uses LibSQL (SQLite fork) for local-first storage", and the project design docs justify LibSQL for WAL and BEGIN CONCURRENT. Cargo.toml declares `sqlx = { version = "0.8", features = ["runtime-tokio", "sqlite"] }` — the stock sqlx SQLite ...
- `src-tauri/src/database/models.rs:597` (consistency): **frames updates write updated_at in milliseconds; every other entity uses seconds** — All frames update functions (update_position, update_size, update_title, update_color, update_parent, update_folder_path) use `chrono::Utc::now().timestamp_millis()`, while nodes, workspaces, storylines, and themes all use `chrono::Utc::now().timestamp()` ...
- `src-tauri/src/database/models.rs:701` (dead-code): **frames::update_folder_path and frames::get_by_folder_path_and_workspace are dead code hidden by #[allow(dead_code)]** — Grep across src-tauri/src (including commands/, vault_watcher, ontology) finds zero callers of either function outside their definitions in models.rs (lines 701-715 and 717-743). The `#[allow(dead_code)]` attributes suppress the compiler warning that would ...
- `src-tauri/src/ontology/transformer.rs:442` (correctness): **Hierarchical layout never keeps max depth despite the comment; layer-update branch is unreachable** — In apply_hierarchical_layout, the BFS marks a node visited on first dequeue and skips any later dequeue (`if visited.contains(&id) ... continue`), and children are only enqueued when not yet visited. Therefore each node is processed exactly once, at its ...
- `src/canvas/PixiCanvas.vue:393` (correctness): **Per-frame watcher stringifies all visible node IDs during pan/zoom** — The mermaid-render watcher uses `watch(() => visibleNodes.value.map(n => n.id).join(','), ...)`. visibleNodes recomputes on every scale/offset change, i.e. every frame during pan and zoom, so the getter performs an O(n) map + string join per frame (500-node ...
- `src/canvas/PixiCanvas.vue:1415` (correctness): **Selection watcher does O(E*S) scan plus per-neighbor collision pass** — The deep watcher on `store.selectedNodeIds` loops over all filteredEdges calling `selectedIds.includes(...)` twice per edge (O(E*S)), then calls `pushOverlappingNodesAwayExcept(neighborId, protectedIds)` once per protected neighbor, each of which scans ...
- `src/canvas/composables/index.ts` (dead-code): **Barrel index.ts is imported nowhere and is stale** — No file in src/, src-tauri/, packages/, or tests imports from 'canvas/composables' or './composables' (verified by grep); PixiCanvas.vue imports directly from the subdirectory barrels ('./composables/viewport', './composables/nodes', etc.). The top-level ...
- `src/canvas/composables/nodes/useEntityOperations.ts` (naming): **Two different composables both exported as useEntityOperations** — This file exports `useEntityOperations` (canvas UI operations: badge click, link-from-context-menu, create-and-link), while src/composables/useEntityOperations.ts exports a different `useEntityOperations` (store-level entity queries: getEntities, ...
- `src/canvas/composables/nodes/useNodeCollision.ts:17` (dead-code): **pushOverlappingNodesAway is never invoked and duplicates pushOverlappingNodesAwayExcept** — Grepped the whole tree: `pushOverlappingNodesAway` (non-Except) is destructured in PixiCanvas.vue:1410 and passed into the dragging/resizing contexts (1518, 1587), but both consumers have collision pushing disabled ('Collision pushing disabled - was causing ...
- `src/canvas/composables/nodes/useNodeDragging.ts:11` (dead-code): **UseNodeDraggingContext requires twelve dependencies the composable never uses** — Grep confirms these required context/store fields appear only in the interface declaration and are never referenced in the function body: `scale`, `offset`, `canvasRef`, `gridLockEnabled`, `neighborhoodMode`, `focusNodeId`, `isLODMode`, ...
- `src/canvas/composables/edges/useEdgeVisibility.ts:89` (dead-code): **Ternary with identical branches** — `const selectedNodes = Array.isArray(selectedNodeIds.value) ? selectedNodeIds.value : selectedNodeIds.value` — both branches are the same expression; the Array.isArray check does nothing. Either a leftover from a removed normalization (e.g. wrapping a single ...
- `src/canvas/composables/viewport/useViewState.ts:7` (consistency): **Raw localStorage access bypasses the lib/storage abstraction and is not workspace-scoped** — useViewState reads/writes `localStorage` directly with a hardcoded key `'nodus-canvas-view'`, while every sibling composable in this module group goes through the storage layer (useEdgeStyling and useCanvasZoom use canvasStorage, useCanvasDisplay uses ...
- `src/canvas/composables/layout/useLayout.ts:60` (typing): **Store interface declares layoutNodes member that useLayout never calls, with a signature that mismatches the real store** — The local `Store` interface requires `layoutNodes: (nodeIds?: string[], options?: { centerX: number; centerY: number }) => Promise<void>`, but nothing in useLayout.ts ever calls `store.layoutNodes`. The real store method (src/stores/nodes.ts:506) accepts `{ ...
- `src/canvas/composables/layout/useRadialLayout.ts:222` (correctness): **O(n^2) linear scans: allNodes.find() called inside per-node ring placement loops** — Inside both ring-placement branches, `const node = allNodes.find(n => n.id === nodeId)` (lines 222 and 256) performs a linear scan per laid-out node, making the radial layout O(n^2) for what is otherwise O(n). An adjacency Map is already built for edges (line ...
- `src/canvas/layout/forceLayout.ts:202` (dead-code): **layoutNodesWithForce and the onTick option are dead code; onTick path also has a simulation-timer bug** — `layoutNodesWithForce` has zero callers anywhere in src/ or tests (only re-exported from canvas/layout/index.ts as a 'legacy export'). Likewise no caller ever passes `onTick`, so the animated branch (lines 151-164) is unreachable. That branch is also buggy: ...
- `src/canvas/composables/agent/useLLMTools.ts:310` (consistency): **Reads localStorage key directly instead of using llmStorage.getSearchApiKey()** — `const apiKey = localStorage.getItem('nodus_search_api_key')` bypasses the storage abstraction. The key literal is defined once in src/lib/storage.ts (line 40, `searchApiKey: 'nodus_search_api_key'`) with an accessor `getSearchApiKey()` that useNodeAgent.ts ...
- `src/canvas/components/CanvasLODCanvas.vue:217` (correctness): **Render watch omits highlightedNodeIds, leaving stale highlight rings on the LOD canvas** — `render()` reads `props.highlightedNodeIds` (highlight ring drawing, layer sorting, border color), but the watch list only covers `nodes, scale, offsetX, offsetY, selectedNodeIds, draggingNodeId, hoveredNodeId`. `highlightedNodeIds` is a ...
- `src/canvas/components/CanvasMinimap.vue:32` (correctness): **getNodePosition called four times per node on every minimap re-render** — The template binds `:x="getNodePosition(node).x"`, `:y`, `:width`, `:height` as four separate calls per node: `getNodePosition` (useMinimap.ts line 109) recomputes bounds math and NaN guards each time. The minimap re-renders whenever ...
- `src/llm/planState.ts:221` (dead-code): **Five plan lifecycle methods are never called; executing plans can never complete** — Grep across src/ and src/__tests__ shows `completeCurrentStep`, `failCurrentStep`, `updateStepStatus`, `clearPlan`, and `getPlanSummary` have zero callers (usePlanHandlers.ts and useLLMTools.ts only use ...
- `src/llm/queue.ts:223` (correctness): **pendingCount getter creates a non-reactive computed over a plain array** — `get pendingCount() { return computed(() => this.queue.length) }` has two problems: (1) `this.queue` is a plain (non-reactive) array that is also wholesale reassigned in `cancel()` (`this.queue = []`), so the computed has no reactive dependencies and will ...
- `src/llm/tokenEstimator.ts:115` (dead-code): **estimateBatchClassificationTokens is never called and misbehaves on empty input** — Grep across src/, src-tauri/, packages/ and tests finds no caller of `estimateBatchClassificationTokens` (batchClassifier.ts uses a fixed default batchSize of 15 instead). The function also contains an inert term `const tokensPerNode = estimateTokens('') + ...
- `src/llm/types.ts:23` (consistency): **Three structurally different types named ToolDefinition coexist in the LLM module** — `export type ToolDefinition = AgentTool` in types.ts (nested {type, function:{...}} shape), `ToolDefinition` in registry.ts (flat {name, description, parameters} shape, re-exported from index.ts), and a third `ToolDefinition` interface in ...
- `src/llm/useLLM.ts:91` (dead-code): **chatWithTools, addLog, clearState, stop, getActiveProvider are never used; stop() is misleadingly named** — useLLM() is called exactly once (PixiCanvas.vue:1053), which destructures only model, contextLength, isRunning, log, tasks, conversationHistory, simpleGenerate, savePromptToHistory, navigateHistory, agentTools, getActiveProviderId (plus usePdfDrop using ...
- `src/llm/utils.ts:130` (dead-code): **extractNumber and pruneMessages are dead; pruneMessages duplicates a diverging implementation** — Grep shows `extractNumber` has no caller anywhere (only its definition and the index.ts re-export). `pruneMessages` in utils.ts is likewise uncalled: the agent runner imports a different `pruneMessages` from src/canvas/composables/agent/systemPrompt.ts:301 ...
- `packages/nodus-mcp-server/src/websocket-client.ts:99` (correctness): **disconnect() does not stop auto-reconnect** — disconnect() calls `this.ws.close()` and nulls the socket, but the 'close' handler registered in connect() unconditionally calls `this.attemptReconnect()`. An intentional disconnect therefore schedules a reconnect 3 seconds later and the client re-establishes ...
- `packages/nodus-mcp-server/src/websocket-client.ts:155` (correctness): **Approval sniffing intercepts responses whose result contains a status field, leaving requests to time out** — handleMessage() checks every incoming message: if `result.status === 'approved'` or `'pending_approval'` it logs and `return`s before the pending-request resolution code runs. This conflates unsolicited approval notifications with normal JSON-RPC responses: ...
- `src/llm/providers/openai.ts:76` (correctness): **listModels() filters to ids starting with 'gpt', hiding o-series models** — .filter((m: { id: string }) => m.id.startsWith('gpt')) excludes OpenAI's o1/o3/o4-mini reasoning models (and any other non-'gpt'-prefixed chat model) from the model picker, so users cannot select them even though chat/completions supports them. The ...
- `src/llm/providers/registry.ts:90` (dead-code): **loadConfigs(), exportConfigs(), getProviderConfig() and the configs map are never used** — Grep over src/ and packages/ shows no caller of `providerRegistry.loadConfigs`, `providerRegistry.exportConfigs`, or `providerRegistry.getProviderConfig` — persistence actually goes through llmStorage (src/lib/storage.ts) and useLLM.ts calls only ...
- `src/components/StorylineNodeList.vue:231` (dead-code): **HTML5 drag-and-drop handlers are unreachable leftovers** — `onDragOverInsertZone`, `onDropInsertZone`, `onDragOverEnd`, `onDropEnd`, and `onDragLeave` (lines 231-282, bound to `@dragover`/`@drop`/`@dragleave` in the template) all guard on `draggingNodeIndex.value === null` and return. `draggingNodeIndex` is only ever ...
- `src/components/StorylineReferencesSidebar.vue:149` (correctness): **Reference keys and DOM position keys use different indexing schemes** — `references` keys are `${nodeIdx}-${i}-${link.target}` where `i` indexes regex matches over raw `markdown_content` (including wikilinks inside code fences/inline code, which the renderer does not turn into anchors). `wikilinkPositions` keys are ...
- `src/components/StorylineReferencesSidebar.vue:170` (correctness): **Scroll listener on parent's content element is never removed** — The `watch(() => props.contentRef, ...)` and `onMounted` both attach `syncScroll` to the parent-owned scroll container, but there is no `onUnmounted` cleanup and the watch does not remove the listener from the previous element when `contentRef` changes. The ...
- `src/components/FullscreenNodeModal.vue:219` (correctness): **Window keydown handler active while modal is hidden** — `onKeydown` is registered on `window` in `onMounted` and never checks `props.visible`. The component is mounted permanently in PixiCanvas.vue (line 2179, no `v-if`; visibility is handled inside the template). Consequently, with the modal closed: Escape ...
- `src/components/EntityPanel.vue` (dead-code): **EntityPanel.vue is never imported or mounted; it is the sole consumer of EntityNodeCard and EntityCreatePopover** — Grep across the whole repo shows no file imports `EntityPanel` (the string appears nowhere outside the file itself, and there is no component auto-import plugin in vite.config.ts). Consequently the entity sidebar (type tabs, search, create flow, footer ...
- `src/components/EntityPickerModal.vue` (dead-code): **EntityPickerModal.vue is unreferenced; its sourceNodeIds prop is unused even internally** — No file in the repo imports or renders `EntityPickerModal` (repo-wide grep, no dynamic/async component resolution found). Additionally, the declared prop `sourceNodeIds: string[]` (line 10) is never read in the component's script or template, so even the ...
- `src/components/MathRenderer.vue` (dead-code): **MathRenderer.vue is unreferenced and, unlike MarkdownContent, injects unsanitized content via v-html** — Repo-wide grep finds no import of MathRenderer (only its own console.error tag matches); math rendering in live code goes through MarkdownRenderService/MarkdownContent instead. If revived it would be an XSS vector: on the no-math path (line 17) and on the ...
- `src/components/NodePanel.vue` (dead-code): **NodePanel.vue is unreferenced anywhere in the repo, and contains latent persistence bugs** — A repo-wide grep for `NodePanel` (all .ts/.vue/.js, excluding node_modules/dist/target) finds no import or usage — the component is never mounted. It also carries two latent bugs that would surface if revived: (1) `updateNodeColor` mutates `node.color_theme` ...
- `src/composables/useCitationGraph.ts:537` (naming): **cancelBuild is unused and does not cancel anything** — `cancelBuild()` sets `isBuilding = false` and nulls `progress`, but the `buildCitationGraph` loop never checks either flag, so the build keeps running, keeps issuing API calls and DB writes, and immediately reassigns `progress` on the next iteration — the ...
- `src/composables/useZotero.ts:405` (consistency): **Half-singleton state: bulk-add progress/cancel refs are per-instance despite the documented singleton pattern** — Lines 65-69 declare module-level state with the comment 'Singleton state - shared across all useZotero() calls', but `addToZoteroProgress` and `addToZoteroCancelled` (lines 405-406) are created inside `useZotero()`. Two instances exist (useCanvasZotero.ts:42 ...
- `src/stores/edges.ts` (dead-code): **Five exported edge-query helpers are unused anywhere** — Verified by grep over src/ and packages/ (including tests): `getEdgesForNodes` (line 65), `getEdgesByLinkType` (349), `findEdgeBetween` (308), `edgeExists` (319, only caller of findEdgeBetween; useCitationGraph defines its own local edgeExists), and ...
- `src/stores/edges.ts:168` (correctness): **updateEdgeLinkType never persists — no invoke and no backend command exists** — `updateEdgeLinkType` only rewrites local state (`edges.value = edges.value.map(...)`). Every sibling updater (updateEdgeColor, updateEdgeLabel, updateEdgeDirected, updateEdgeStoryline) calls `invoke`. There is no `update_edge_link_type` Tauri command in ...
- `src/stores/frames.ts` (dead-code): **Frame-nesting and hit-testing helpers are entirely unused** — Verified by grep over src/ and packages/: `updateFrameParent` (line 204), `getChildFrames` (217), `getFramePath` (224), `isPointInFrame` (266), `findFrameAtPoint` (280), `findFrameByFolderPath` (288), and the `selectedFrame` computed (20) have no external ...
- `src/stores/themes.ts:7` (consistency): **themes store bypasses the lib/tauri wrapper every other store uses** — `import { invoke } from '@tauri-apps/api/core'` — all sibling stores import `invoke` from '../lib/tauri', which provides graceful browser-context fallback and a single mocking seam (tests mock '../../lib/tauri'). The direct import means theme loading throws ...
- `src/lib/storage.ts:560` (dead-code): **clearAllStorage is unused and does not do what its name claims** — Grep across src/, packages/, and tests finds no caller of `clearAllStorage`. It also only removes the base keys in `KEYS`, missing every dynamically-suffixed key this same module writes: workspace-scoped canvas settings (`${base}_${workspaceId}` from ...
- `src/lib/templates.ts:920` (dead-code): **Eight 'legacy' template exports have no consumers** — The block at lines 920-928 (`TYPST_MATH_REFERENCE`, `GETTING_STARTED`, `IMPORTING_FILES`, `MERMAID_DEMO`, `RESEARCH_IDEA`, `QUICK_NOTE`, `COUNTERPOINT`, `EVIDENCE`) is labeled 'Legacy exports for backwards compatibility', but grep across src/, packages/, ...
- `src/lib/zoteroApi.ts:243` (dead-code): **addToCollection is never called and is latently broken (wrong response shape, missing version precondition)** — Grep across src/, packages/, and tests shows no caller of `addToCollection`. It is also incorrect as written: (1) `GET /items/{key}` returns a wrapper `{ key, version, data: {...} }`, but the code reads `item.collections` off the top level, which is always ...
- `src/lib/contentParser.ts:14` (correctness): **extractHashtags matches hex colors/URL fragments and counts duplicates toward the cap** — The regex `#([a-zA-Z0-9][\w-]*)` matches `#3b82f6` in CSS snippets, `#section` in URLs like `https://x.com/page#section`, and hashes inside code blocks; since extracted hashtags auto-generate tag nodes (useTagNodes, 14 call sites), notes containing hex colors ...
- `src/lib/retry.ts:1` (naming): **retryWithBackoff documents exponential backoff but implements linear** — Both the module header and the function docstring say "exponential backoff", but `const waitTime = (maxRetries + 1 - retries) * baseDelayMs` yields 2s, 4s, 6s — linear. Also `maxRetries: 3` produces 3 total attempts (2 retries) because of the `retries > 1` ...
- `src/lib/tauri.ts` (dead-code): **Five exported wrappers are unused; fallback mocks are never cached** — Grep across src/ and packages/ finds zero references to convertLocalPath, getConvertFileSrc, extractPdfAnnotations, getLockedNodes, and createFileForNode outside this file. convertLocalPath is also a design trap: it silently returns the raw path unless ...
- `src/lib/typst.ts:102` (dead-code): **processMarkdownMath and clearCache are unused; math pipeline duplicated** — Grep shows processMarkdownMath has zero callers, and typst.ts's clearCache is never imported (the clearCache hits elsewhere are unrelated functions in useTypst.ts / useStorylineMarkdownRendering.ts / semanticScholar.ts). MarkdownRenderService implements its ...
- `src/types/index.ts:64` (typing): **Node.node_type and Edge.link_type are plain string despite NodeType/LinkType unions in the same file** — NodeType and LinkType unions are defined at lines 20 and 41, but the core interfaces declare `node_type: string` (line 64) and `link_type: string` (line 87), so the unions constrain nothing at the data layer and typos like 'citaton' compile. ...

## Appendix: unverified low-severity notes (159)

Reviewer notes below the verification threshold. Not adversarially checked; treat as leads.

- `src-tauri/src/commands/edges.rs:16` (design): **get_edges match has two identical arms** — `match workspace_id { Some(ref ws_id) => database::edges::get_by_workspace(pool, Some(ws_id))..., None => database::edges::get_by_workspace(pool, None)... }` — both arms call the same function with the same optionality; the match adds only noise.
- `src-tauri/src/commands/nodes.rs` (consistency): **nodes.rs is at 997 lines, at the 1000-line hard limit** — The file is 997 lines against the project's hard rule of no file over 1000 lines; any addition breaches it. It already spans four separable concerns: CRUD/position updates, wikilink sync (build_title_to_id_map, sync_wikilinks_for_node*), file export ...
- `src-tauri/src/commands/nodes.rs:958` (consistency): **Leftover debug logging in update_node_size; ad-hoc println!/eprintln! logging throughout** — update_node_size logs every call (`println!("[update_node_size] id={}, width={}, height={}", ...)` and a success line) while every sibling position/size/color updater is silent — this fires on each node resize commit and reads as forgotten debug output. More ...
- `src-tauri/src/commands/vault_watcher.rs:157` (consistency): **Grid-position magic numbers duplicated instead of using layout_config** — sync_missing_files computes `let x = (node_count % 5) as f64 * 250.0 + 100.0; let y = (node_count / 5) as f64 * 200.0 + 100.0;` and create_node_from_file (nodes.rs:139) duplicates the same literals, while import_vault in the same file correctly uses ...
- `src-tauri/src/commands/workspaces.rs:101` (consistency): **delete_workspace permanently deletes files while node deletion uses trash** — delete_workspace with delete_files=true calls `std::fs::remove_file(path)` directly for every node file, whereas delete_node/delete_nodes (nodes.rs:608/642) carefully move files into `.nodus-trash` for recoverability. Deleting a whole workspace — the ...
- `src-tauri/src/import_helpers.rs:32` (design): **Hidden-file/.md walkdir filtering duplicated between import_helpers and watcher** — collect_markdown_files (import_helpers.rs:32-45) and VaultWatcher::scan_existing_files (watcher.rs:165-182) both implement walkdir traversal with a skip-hidden filter_entry and an `extension == "md"` check, with a subtle divergence: the watcher's filter ...
- `src-tauri/src/import_helpers.rs:89` (correctness): **Wikilink regexes recompiled on every call inside import/sync loops** — `extract_wikilinks` and `remove_wikilinks_to_target` each call `regex::Regex::new(...).unwrap()` per invocation. extract_wikilinks is called once per file in vault import and wikilink sync loops (src/commands/vault_watcher.rs:458, 681; ...
- `src-tauri/src/mcp_websocket.rs:122` (dead-code): **Four JSON-RPC error constants are unused and suppressed with allow(dead_code)** — `INVALID_REQUEST`, `METHOD_NOT_FOUND`, `INVALID_PARAMS`, and `INTERNAL_ERROR` are declared with `#[allow(dead_code)]` and grep shows no usage anywhere in src-tauri (method dispatch happens in the frontend, which defines its own codes). Only PARSE_ERROR and ...
- `src-tauri/src/themes.rs:142` (consistency): **validate_color has an unreachable rgba branch and validate_theme checks only 4 of 13 required fields** — `color.starts_with("rgb")` already matches every string that `color.starts_with("rgba")` matches, so the rgba arm is dead logic. Separately, validate_theme validates bg_canvas, bg_surface, text_main, and primary_color but silently accepts empty or malformed ...
- `src-tauri/src/themes.rs:172` (consistency): **load_builtin_themes silently drops built-in themes that fail to parse** — `filter_map(|(name, content)| parse_yaml(content).ok()...)` discards any bundled theme whose YAML fails parsing or validation without logging, so a regression in a shipped theme file manifests only as a theme quietly missing from the picker. Sibling error ...
- `src-tauri/src/watcher.rs:16` (dead-code): **WatcherError::NotInitialized is never constructed; blanket allow(dead_code) hides it** — Grep across src-tauri/src shows `NotInitialized` only at its declaration (watcher.rs:25); no code path constructs it. The enum carries `#[allow(dead_code)]` which suppresses the compiler's report, contradicting the project rule to remove dead code. Similarly, ...
- `src-tauri/src/database/models.rs:415` (consistency): **Theme.is_builtin typed as i32 while sibling models use bool for flags** — Workspace.sync_enabled, Edge.directed, and Node.is_collapsed are all `bool` (sqlx maps SQLite INTEGER to bool transparently), but Theme.is_builtin is `i32`, forcing callers to compare `is_builtin == 1` (seed_builtin_themes line 507) and serialize a number ...
- `src-tauri/src/database/nodes.rs:63` (correctness): **restore_if_file_exists issues one UPDATE per node and does blocking filesystem calls in an async fn** — The loop performs `std::path::Path::new(path).exists()` (blocking syscall on a tokio worker) and a separate UPDATE round-trip per deleted node, outside any transaction. Called on every workspace open (vault_watcher.rs:80); with many soft-deleted nodes this is ...
- `src-tauri/src/database/nodes.rs:85` (consistency): **get_by_file_path does not exclude soft-deleted nodes, unlike get_by_id, with no doc explaining why** — get_by_id filters `AND deleted_at IS NULL`; get_by_file_path (`SELECT * FROM nodes WHERE file_path = ?`) does not. One caller (commands/nodes.rs:112) uses it as an existence check before creating a node for a file — a soft-deleted node will silently block ...
- `src-tauri/src/database/nodes.rs:327` (naming): **DatabaseError::Migration used for non-migration errors** — update_tags maps a serde_json serialization failure to `DatabaseError::Migration`, get_pool reports "Database not initialized" as Migration, and themes::seed_builtin_themes maps a serde_yaml error to Migration. The variant name misdescribes two of these three ...
- `src-tauri/src/ontology/parser.rs:347` (consistency): **Class and property descriptions sync only on rdfs:comment, ignoring dc:description accepted for individuals** — process_literal_object accepts RDFS_COMMENT, DC_DESCRIPTION, and DC_TERMS_DESCRIPTION as descriptions on SubjectData (line 324), so individuals get dc:description content. But the sync into OntologyClass (line 347) and PropertyDefinition (line 364) is gated ...
- `src-tauri/src/ontology/parser.rs:390` (consistency): **owl:unionOf resolved for property domains but not ranges** — process_blank_node_object records a blank-node domain (`RDFS_DOMAIN` -> property_blank_domains, line 390) and into_ontology_data walks the owl:unionOf RDF list to expand union domains (lines 425-453). The symmetric case — `rdfs:range` pointing at a blank ...
- `src-tauri/src/ontology/transformer.rs:168` (correctness): **Grid layout leaves empty cells when classes were already created as individuals** — In the class-node loop, `let total_idx = class_start_idx + idx;` uses the enumerate index over data.classes including entries skipped by `if iri_to_node_id.contains_key(&class.iri) { continue; }`. Each skipped class leaves a hole in the grid (its idx is ...
- `src-tauri/src/ontology/types.rs:22` (dead-code): **Blanket #[allow(dead_code)] on OntologyProperty hides the never-read description field** — OntologyProperty carries `#[allow(dead_code)]`. Grep across src-tauri shows `description` is populated by the parser (parser.rs line 512) but never read anywhere — format_class_content in transformer.rs uses only iri, label, domains, and ranges. The blanket ...
- `src/canvas/PixiCanvas.vue:468` (design): **Mirror ref plus watch used to work around declaration order** — `contextMenuVisibleRef` (line 468) exists only so usePreviewPanel can read context-menu visibility before useContextMenu is constructed, and a watcher (lines 795-797) copies contextMenu.visible into it. This duplicates one piece of state into two refs kept in ...
- `src/canvas/PixiCanvas.vue:1042` (consistency): **Hard-coded node dimensions bypass NODE_DEFAULTS** — resetAllNodeSizes calls `store.updateNodeSize(node.id, 200, 120)` with literals although NODE_DEFAULTS.WIDTH/HEIGHT (200/120) is imported and used elsewhere in the file; if defaults change, reset diverges silently. Similarly the edge-preview start anchor in ...
- `src/canvas/PixiCanvas.vue:1055` (naming): **Multi-provider LLM API locally aliased to Ollama-specific names** — useLLM's provider-agnostic `model`, `contextLength`, and `simpleGenerate` are destructured as `ollamaModel`, `ollamaContextLength`, and `callOllama` (lines 1055-1061), while the same destructure pulls `getActiveProviderId`, confirming multiple providers ...
- `src/canvas/PixiCanvas.vue:1745` (design): **Timing-based coordination via magic setTimeout delays and polling** — Render sequencing throughout the file relies on hard-coded delays: setTimeout(fitToContent, 50), setTimeout(renderMermaidDiagrams, 500/150/100), the 500ms wait in fitAllNodesToContent (line 1027) 'Wait longer for Mermaid SVGs to render', and fitNodeNow's ...
- `src/canvas/PixiCanvas.vue:1865` (naming): **startEditingAndSearch does not start editing** — `function startEditingAndSearch(nodeId: string)` only calls `openNodeSearch(nodeId)`; its own comment says search now works in view mode without entering edit mode (changed in commit 32e8926). The name violates the naming-honesty rule and misleads at the ...
- `src/canvas/PixiCanvas.vue:1987` (consistency): **Template uses O(n) filteredNodes.find instead of store.getNode** — The CanvasColorBar prop `:get-node-color="(id: string) => store.filteredNodes.find(n => n.id === id)?.color_theme"` performs a linear scan of all nodes per invocation, although `store.getNode` (a keyed lookup used everywhere else in this file) is available; a ...
- `src/canvas/composables/nodes/useCanvasNodeStyle.ts:161` (design): **getNodeStyle does an O(selection) Array.includes per node per render** — `selectedNodeIds.value.includes(node.id)` runs inside getNodeStyle, which the template evaluates for every visible node on every pan/zoom frame (scale/offset are in the returned style, so styles recompute per frame). With a large multi-selection on a 500-node ...
- `src/canvas/composables/nodes/useEntityOperations.ts:28` (docstring): **linkedEntitiesMap comment claims 'computed once and cached' and hardcodes the entity type list** — The comment 'Memoized linked entities map - computed once and cached' overstates: the computed rebuilds the entire map — calling store.getLinkedEntities for every non-entity node (O(nodes x edges)) — every time any reactive dependency changes. Additionally ...
- `src/canvas/composables/nodes/useNodeClipboard.ts:295` (consistency): **pasteNodes swallows all failures with console.debug and no user feedback** — The outer catch in pasteNodes does `console.debug('Paste failed:', e); return []`. This swallows genuine failures (store.createNode/createEdge rejections mid-paste, clipboard permission errors) at debug log level with no toast, leaving a partially-pasted ...
- `src/canvas/composables/nodes/useNodeDragging.ts:246` (correctness): **Drag threshold measured in canvas units, not screen pixels** — `DRAG_THRESHOLD = 3 // Pixels of movement` but dx/dy come from `screenToCanvas`, so the distance is in canvas coordinates. At scale 0.2 a 1px mouse jitter equals 5 canvas units and immediately promotes a click to a drag; at scale 2 the user must move 6 screen ...
- `src/canvas/composables/nodes/useNodeDragging.ts:445` (correctness): **handleFileMove is fire-and-forget; checkFileCollision/showCollisionDialog rejections are unhandled** — `handleFileMove()` is invoked without await or `.catch()`. The internal try/catch only wraps `ctx.moveNodeFile`; if `ctx.checkFileCollision` or `ctx.showCollisionDialog` rejects, the rejection escapes as an unhandled promise rejection, the file is never ...
- `src/canvas/composables/nodes/useNodeEditor.ts:153` (consistency): **saveEditing does not clear the pending content autosave timer, unlike saveTitleEditing** — saveTitleEditing explicitly clears `autosaveTitleTimer` before persisting (lines 119-122), but saveEditing leaves `autosaveContentTimer` armed and relies on the `if (editingNodeId.value)` guard inside the timer callback to no-op. That works only because ...
- `src/canvas/composables/nodes/useNodeVisibility.ts:37` (naming): **MASSIVE_GRAPH threshold (800) is smaller than HUGE_GRAPH threshold (1000)** — `HUGE_GRAPH_NODES = 1000` but `MASSIVE_GRAPH_NODES = 800`, so isMassiveGraph triggers before isHugeGraph. In ordinary usage massive > huge, so a graph of 900 nodes is 'massive' but not 'huge' — the names do not honestly reflect the ordering of the tiers and ...
- `src/canvas/composables/edges/useEdgeManipulation.ts:76` (correctness): **Document-level pointer listeners leak if component unmounts during edge creation** — startEdgeCreation adds `pointermove`/`pointerup` listeners on `document`, removed only inside onEdgeCreate. If the canvas component unmounts while an edge drag is in progress (workspace switch, navigation), the listeners persist, and onEdgeCreate will later ...
- `src/canvas/composables/edges/useEdgeRouting.ts:260` (consistency): **Tag-node dimensions differ between port map and routing obstacle list** — `nodeMap` (line 196-209) shrinks tag nodes to estimated fit-content size (title.length * 8 + 20, height 24) for port placement, but `nodeRects` (line 260-266) — passed to routeAllEdges as the obstacle set — uses full `node.width || NODE_DEFAULTS.WIDTH` and ...
- `src/canvas/composables/edges/useEdgeRouting.ts:515` (dead-code): **Unreachable labelX === undefined fallback** — `if (labelX === undefined) { labelX = ...; labelY = ... }` can never execute: labelX is declared as `let labelX: number = (x1 + x2) / 2` at line 461. If the preceding segment-walk loop exits without assigning (floating-point edge case where `accumulated + ...
- `src/canvas/composables/selection/useSelectionActions.ts:50` (consistency): **Declared selectedNodeIds setter is never used; mutation goes through the getter via splice** — The context interface declares `set selectedNodeIds(ids: string[])` and PixiCanvas.vue:1775 implements it, but `selectAllNodes` does `store.selectedNodeIds.splice(0, store.selectedNodeIds.length, ...nodeIds)` — invoking only the getter and mutating the ...
- `src/canvas/composables/selection/useSelectionActions.ts:65` (correctness): **Undo snapshot collects connected edges from filteredEdges, missing filtered-out edges** — deleteSelectedNodes gathers edges for the undo stack via `store.filteredEdges.filter(...)`. If any edges are currently excluded by active filters (wikilink/storyline hiding, workspace filters), deleting the node destroys them in the database, but undo ...
- `src/canvas/composables/viewport/useCanvasDisplay.ts:16` (dead-code): **isLargeGraph context member declared and supplied but never used** — UseCanvasDisplayContext requires `isLargeGraph: ComputedRef<boolean>` and PixiCanvas.vue:691 passes it, but the composable destructures only `{ scale, filteredNodes }` and never references isLargeGraph. Dead interface member that forces every caller to wire ...
- `src/canvas/composables/viewport/useCanvasDisplay.ts:49` (docstring): **Image-extraction comment does not match the regex behavior** — The comment says 'Handle URLs with parentheses by matching to last ) before newline', but `/!\[[^\]]*\]\((.+?)\)(?:\s|$)/` lazily matches to the FIRST `)` that is followed by whitespace or end of string — and without the `m` flag, `$` is end of the whole ...
- `src/canvas/composables/viewport/useCanvasZoom.ts:71` (consistency): **Zoom clamp bounds (0.01, 3) duplicated as magic numbers across two files** — The scale clamp `Math.min(Math.max(..., 0.01), 3)` appears in useCanvasZoom.applyPendingZoom (line 71) and applyZoomAtPoint (line 83), and again in useViewState.zoomIn/zoomOut/setScale (lines 87-98). Five copies of the same limits with no shared constant; ...
- `src/canvas/composables/viewport/useCanvasZoom.ts:163` (design): **localStorage read on every wheel event** — `const zoomMode = canvasStorage.getZoomMode()` executes `localStorage.getItem` (src/lib/storage.ts:345) inside onWheel, which fires dozens of times per second during trackpad scroll — a synchronous storage read on the hottest input path. The sibling ...
- `src/canvas/composables/viewport/useCanvasZoom.ts:225` (dead-code): **onCanvasPointerMove is an empty no-op bound to a hot pointermove event** — `function onCanvasPointerMove(_e: PointerEvent) { // Mouse tracking - kept for potential future use }` is exported and wired in PixiCanvas.vue:1973 as `@pointermove="onCanvasPointerMove"`, so Vue dispatches an empty handler on every pointer move over the ...
- `src/canvas/composables/layout/useAutoLayout.ts:100` (consistency): **Fast-grid path computes layout center from node top-left corners; every other path uses node centers** — In the >500-node fast-grid branch, the fallback center is `sumX += node.canvas_x` (lines 100-106), i.e. average of top-left corners, while the standard path (lines 212-215), layoutFramesOnly (lines 397-399), useLayoutStrategies (lines 128-132), forceLayout ...
- `src/canvas/composables/layout/useAutoLayout.ts:256` (docstring): **Comment claims setTimeout avoids blocking the UI, but dagre still runs synchronously** — Lines 256-269 wrap `applyHierarchicalLayout` in `setTimeout(..., 10)` with the comment 'Use setTimeout to avoid blocking UI'. dagre.layout is synchronous, so the main thread still blocks for the full layout duration - the timeout merely delays when the block ...
- `src/canvas/composables/layout/useFrameCollision.ts:191` (correctness): **Edge-spread step in pushNodesOutOfFrames can push nodes back into frames** — After the iterative push-out loop guarantees no node/frame overlap, the spreading pass (lines 177-208) offsets stacked nodes along the frame edge by `(i - centerIdx) * (nodeSize + nodeSpacing)` without re-running any overlap check. A node pushed to the left ...
- `src/canvas/composables/layout/useFrameCollision.ts:315` (dead-code): **isNodeFullyInsideFrame has no callers; isNodeInFrame and isNodeCenterInFrame are used only by tests** — Grep across src/ and tests: `isNodeFullyInsideFrame` appears nowhere outside its definition - fully dead. `isNodeInFrame` and `isNodeCenterInFrame` are referenced only in src/__tests__/frameCollision.test.ts and src/__tests__/layoutFrameIntegration.test.ts, ...
- `src/canvas/composables/layout/useNeighborhoodMode.ts:62` (consistency): **BFS scans the full edge list per frontier node instead of using an adjacency map** — Both `neighborhoodNodeIds` (lines 62-78) and `computeNodesByDepth` (lines 137-162) iterate `for (const edge of edges)` inside `for (const nodeId of frontier)`, giving O(frontier x E) per depth level (up to depth 5). The sibling module useRadialLayout.ts ...
- `src/canvas/composables/layout/useNeighborhoodMode.ts:383` (consistency): **exit() does not clear neighborhoodPositions while toggle() does** — `toggle()` resets all three pieces of state including `neighborhoodPositions.value = new Map()`, but `exit()` (used on workspace change) only resets neighborhoodMode and focusNodeId, leaving the stale positions Map of the previous workspace's nodes in memory. ...
- `src/canvas/composables/layout/useRadialLayout.ts:260` (correctness): **zOrder result includes nodes that were deliberately not laid out** — `nodeAngles.set(nodeId, angle)` executes before the `if (!nodeIdsToLayout.has(nodeId)) continue` guard (lines 225-229 and 259-263), so nodes excluded from layout (nodes in other frames) still receive angles and are included in the returned `zOrder`. ...
- `src/canvas/composables/layout/useTetrisLayout.ts` (naming): **Seven 'use*'-named files export plain functions, not Vue composables** — useTetrisLayout.ts, useRadialLayout.ts, useAutoLayout.ts, useFrameCollision.ts, useLayoutFrameAware.ts, useLayoutAnimation.ts and useLayoutStrategies.ts all carry the Vue composable `use` prefix but export stateless pure functions (tetrisGridLayout, ...
- `src/canvas/composables/agent/useAgentRunner.ts:495` (correctness): **looksComplete heuristic matches routine progress wording and ends the run** — `const looksComplete = /now shows|complete|finished|created|done|successfully/i.test(msg.content)` fires on ordinary narration such as 'I created three nodes, next I will connect them', returning `{ status: 'done', message: 'Done' }` mid-task after tool-JSON ...
- `src/canvas/composables/agent/useMarkerHandlers.ts:25` (consistency): **Two different exported PlanStateInterface types in sibling files** — useMarkerHandlers.ts (line 25) and useLLMTools.ts (line 91) both export an interface named `PlanStateInterface` with different shapes (the marker-handler one adds `showApprovalModal`, which handleMarker never uses). index.ts re-exports only the useLLMTools ...
- `src/canvas/composables/agent/useNodeAgent.ts:44` (consistency): **executeWebSearch does not handle a missing API key** — `llmStorage.getSearchApiKey()` can return an empty string, which is passed straight to the `web_search` Tauri command, surfacing as an opaque backend error. The sibling implementation in useLLMTools (line 312-315) explicitly checks for a missing key and ...
- `src/canvas/composables/agent/useNodeAgent.ts:428` (docstring): **Unknown-tool error message omits format_math from the available-tools list** — The default case returns `Error: Unknown tool "...". Available tools: web_search, fetch_url, wikipedia_search, update_content, append_content, update_title, node_done` — but `format_math` is in the allowedTools set (line 168), is handled by the switch (line ...
- `src/canvas/composables/agent/usePlanHandlers.ts:33` (dead-code): **Leftover console.log debug statements** — Lines 33, 35, and 55 contain `console.log('[usePlanHandlers] handlePlanApprove called')` etc. Sibling agent composables route operator-visible output through the injected agent log (`agentLog.value.push`) and use console.error only for genuine errors. These ...
- `src/canvas/composables/frames/useFrames.ts:2` (docstring): **Header docstring duplicates useFrameOperations' and misdescribes scope** — Both useFrames.ts and useFrameOperations.ts open with 'Frame operations composable'. useFrames actually handles creation, dragging, resizing, placement mode, and title editing; useFrameOperations handles collision resolution and node organization. The ...
- `src/canvas/composables/frames/useFrames.ts:148` (consistency): **Frame resize has no undo capture while frame drag does** — onPointerDown calls `pushFramePositionUndo?.()` before dragging, but startResize captures nothing before changing frame position and size (west/north resizes move canvas_x/canvas_y too). Resizing a frame is therefore not undoable, inconsistent with dragging. ...
- `src/canvas/composables/rendering/useGraphMetrics.ts:70` (naming): **isMassiveGraph threshold (800) is smaller than isHugeGraph (1000)** — isLargeGraph fires at >500 nodes, isMassiveGraph at >800, isHugeGraph at >1000. The names imply massive > huge, but the thresholds are inverted, so every 'huge' graph is also 'massive' but not vice versa — readers and future callers will misjudge which flag ...
- `src/canvas/composables/util/useCanvasNodeSizing.ts:165` (consistency): **resetAllNodeSizes hardcodes 200x120 instead of NODE_DEFAULTS** — `await ctx.store.updateNodeSize(node.id, 200, 120)` duplicates NODE_DEFAULTS.WIDTH/HEIGHT as magic numbers even though NODE_DEFAULTS is imported and used two functions away (line 123, 182-183). The same hardcoding exists in the inline copy in ...
- `src/canvas/composables/util/useGraphExport.ts:99` (consistency): **Node fields are YAML-escaped but edge fields are interpolated raw** — escapeYamlString is carefully applied to node id/title, but the edge block interpolates `e.id`, `e.source`, `e.target`, `e.style`, and `e.path` into double-quoted YAML without escaping. Edge paths are generated SVG strings today, so this mostly works, but the ...
- `src/canvas/composables/util/usePdfDrop.ts:499` (correctness): **Drag-drop listener leaks if cleanup runs before registration resolves; multi-bib drops clobber modal state** — setup() stores the unlisten function in a .then() callback; if cleanup() runs before the onDragDropEvent promise resolves (fast unmount/workspace switch), unlistenFileDrop is still null and the webview listener is never removed — subsequent mounts stack ...
- `src/canvas/components/CanvasContextMenu.vue:386` (dead-code): **Empty .entity-submenu CSS rule containing only a comment** — .entity-submenu { /* Entity submenu may need smaller height due to sections */ } declares no properties. The class is still applied in the template, but the rule is dead weight and the comment is speculative ("may need") — the project rule forbids leaving ...
- `src/canvas/components/CanvasEdgesSVG.vue:37` (consistency): **Arrow marker ID scheme duplicated between component and useEdgeVisibility** — `getArrowMarkerId(color)` returns `` `arrow-${color.replace('#', '')}` `` for the `<marker>` defs, while the `marker-end` URLs use `edge.arrowMarkerId`, which is built with the same literal formula in useEdgeVisibility.ts line 208 ...
- `src/canvas/components/CanvasHoverTooltip.vue:28` (docstring): **Orphaned JSDoc comment sits above the watch instead of displayTitle** — The block comment "Derive a display title from the node / Falls back to first line of content if no title is set" (lines 28-31) is immediately followed by an unrelated `watch` that triggers markdown/math rendering; the `displayTitle` computed it describes is ...
- `src/canvas/components/CanvasHoverTooltip.vue:87` (consistency): **Truncation indicator hardcodes 200, silently coupled to the slice in useNodeHover** — `{{ content }}{{ content.length >= 200 ? '...' : '' }}` assumes the parent truncated the plain-text preview at exactly 200 chars, which happens in useNodeHover.ts `tooltipContent` via `.slice(0, 200)`. If the composable's limit changes, the ellipsis logic ...
- `src/canvas/components/CanvasLLMBar.vue:27` (consistency): **copyLog lacks the clipboard fallback its sibling CanvasAgentLogPanel has** — `async function copyLog(log: string[]) { await writeText(log.join('\n')) }` calls the Tauri clipboard plugin with no error handling. The sibling component CanvasAgentLogPanel.vue wraps the same call in try/catch and falls back to ...
- `src/canvas/components/CanvasLODCanvas.vue:140` (design): **Canvas backing store only resyncs on window resize, not container resize** — `resize()` is registered solely on `window.addEventListener('resize', ...)`, but the canvas is sized `width: 100%; height: 100%` of its container. Any container-driven size change without a window resize (side panel opening, splitter drag, devicePixelRatio ...
- `src/canvas/components/CanvasNodeCard.vue:13` (naming): **Local `interface Node` shadows the canonical Node type, which is imported as `EntityNode`** — The file imports the real domain type as `import type { Node as EntityNode } from '../../types'` and then declares a local structural `interface Node` that duplicates a subset of its fields. The naming is inverted relative to every sibling (CanvasLODCanvas, ...
- `src/canvas/components/CanvasNodeCard.vue:97` (dead-code): **deleteButtonStyle computed always returns an empty object** — `const deleteButtonStyle = computed(() => ({ /* No transform needed - button scales naturally with node */ }))` is bound as `:style="deleteButtonStyle"` on the delete button but can never contribute any style. It is a leftover from a removed counter-scaling ...
- `src/llm/agentModes.ts:6` (docstring): **Header calls Explore mode 'read-only' but its whitelist includes write and delete tools** — The file header documents '- Explore: Read-only research mode', yet exploreMode's toolWhitelist includes create_node, create_nodes_batch, create_edge, update_node, delete_node, delete_edges, delete_matching, smart_color, batch_update, auto_layout, and its own ...
- `src/llm/batchClassifier.ts:53` (correctness): **Tag fast-path uses substring matching, so '#art' matches '#artificial'** — The fast path does `content.includes('#' + cat.toLowerCase())` on raw markdown. Because it is a plain substring check with no word boundary, a category 'art' matches nodes tagged '#artificial' or '#article', and 'bio' matches '#biology', silently ...
- `src/llm/batchClassifier.ts:218` (design): **Silent fallback to ['left','right'] categories can misplace nodes** — In batchClassifyForMove, when LLM category extraction fails or yields fewer than 2 categories, the code silently substitutes `categories = ['left', 'right']` and proceeds to classify (and downstream, move) every node into those buckets regardless of what the ...
- `src/llm/index.ts:14` (dead-code): **resetPositionCounter exported twice under two names and never called** — index.ts exports `resetPositionCounter` (via toolExecutor.ts) on line 9 and the same function again as `resetToolPositionCounter` (via ./tools) on line 14. Grep across the whole tree shows no caller of either name — the only hits are the definition in ...
- `src/llm/planState.ts:130` (correctness): **planHistory entries share the live steps array via shallow copy** — `planHistory.value.push({ ...currentPlan.value })` copies only top-level fields; `steps` remains the same array of the same step objects as the live plan. Any later mutation of step statuses (e.g. via modifyStep, or the execution flow if it is ever wired up) ...
- `src/llm/queue.ts:192` (design): **cancel()/cancelCurrent() cannot abort the in-flight provider call** — Cancellation is only observed at the start of each withRetry attempt (`if (this.cancelled) throw`). A provider request already in flight runs to completion; its network work is not aborted (no AbortSignal is threaded to provider.generate/chat) and its result ...
- `src/llm/research.ts:74` (consistency): **Direct localStorage access bypasses the storage utility; sync getApiKey is awaited** — getApiKey() reads `localStorage.getItem('nodus_search_api_key')` directly even though src/lib/storage.ts defines this exact key (`searchApiKey: 'nodus_search_api_key'`) as the sanctioned access path — and useLLMTools.ts:310 duplicates the same raw read. Line ...
- `src/llm/research.ts:343` (design): **generateFollowUpQueries hardcodes anatomy-flavored 'standard' queries for every topic** — The 'standard research queries' appended for any topic are `${topic} anatomy structure`, `${topic} function purpose`, `${topic} research findings`, `${topic} scientific overview`. For non-biological topics (e.g. deepResearch('French Revolution')) this yields ...
- `src/llm/tokenEstimator.ts:55` (typing): **estimateAgentTokens accepts markdown_content but never uses it** — The nodes parameter is typed `Array<{ title: string; markdown_content?: string | null }>` and the code comments say '(title + some content preview in certain operations)', but the estimate only counts `TOKENS_PER_NODE + estimateTokens(node.title)`. For ...
- `src/llm/tools/batchTools.ts:98` (correctness): **String-repair fallback in create_nodes_batch corrupts content with quotes/colons** — When `args.nodes` arrives as a malformed string, the fallback does `.replace(/'/g, '"')` and `.replace(/(\w+):/g, '"$1":')`. Any content containing an apostrophe ("don't") or a colon-suffixed word ("https://...", "Note: ...") is mangled — usually into invalid ...
- `src/llm/tools/batchTools.ts:129` (correctness): **create_nodes_batch dedup map misses duplicates within the same chunk** — The comment says 'Refresh existing nodes map for each chunk to catch newly created ones', but `existingByTitle` is built from `ctx.store.filteredNodes` once per 30-node chunk, before any node in that chunk is created, and newly created nodes are never added ...
- `src/llm/tools/handlers/colorHandlers.ts:200` (correctness): **color_regex compiles model-supplied regex without ReDoS protection** — `new RegExp(regexStr, 'i')` accepts whatever pattern the LLM produced and then runs `regex.test(text)` against the title or full markdown content of every node (line 211-218). A catastrophic-backtracking pattern (e.g. `(a+)+$`) against a long node body blocks ...
- `src/llm/tools/handlers/memoryHandlers.ts:155` (correctness): **Task context rendered as '[object Object]' in pop_task/peek_stack output** — `popTaskHandler` returns `` `...${task.context ? `\nContext: ${task.context}` : ''}` `` and `peekStackHandler` (line 170) does the same. `task.context` is `Record<string, unknown>`, so string interpolation yields `Context: [object Object]` — the LLM that ...
- `src/llm/tools/handlers/types.ts:137` (dead-code): **ToolDefinition interface and three ToolContext fields are never used** — `export interface ToolDefinition { name; description; handler }` at line 137 has zero consumers anywhere in the tree (grepped src, packages, tests; all other ToolDefinition references resolve to registry.ts or llm/types.ts). Additionally, ...
- `src/llm/tools/index.ts:65` (docstring): **Deprecated agentTools export claims to 'return fresh data' but is a load-time snapshot** — `export const agentTools: AgentTool[] = toolRegistry.getToolDefinitions()` is evaluated once at module load; the comment says 'Maintained for backwards compatibility - now returns fresh data'. It does not — any tool registered or unregistered after import ...
- `src/llm/tools/nodeTools.ts:31` (consistency): **create_node diverges from siblings: redundant try/catch and unconditional position-counter increment** — `create_node` is the only tool in the module wrapping its body in try/catch to return an error string; every sibling relies on toolRegistry.execute's catch (registry.ts:220) which produces the same 'Error executing ...' string, so the local handler only ...
- `src/llm/tools/researchTools.ts:4` (docstring): **Stale file-header tool inventories across four tool files** — researchTools.ts's header lists `web_search`, `fetch_url`, and `wikipedia_search` as the tools it provides, but it registers only `fetch_url` (web_search lives in planningTools.ts:83, wikipedia_search in agentTools.ts:138). Same pattern elsewhere: ...
- `src/llm/tools/selectionTools.ts:161` (consistency): **connect_selected_to executes directly, contradicting the file's marker-based contract** — The file header (lines 4-8) states 'These tools return markers that are handled by the agent in PixiCanvas', and all seven sibling tools do exactly that. `connect_selected_to` instead calls `ctx.store.createEdge` directly in a loop (line 195) — bypassing ...
- `packages/nodus-mcp-server/src/tools.ts:674` (consistency): **'Storyline operations' section comment sits above frame tools** — The comment block at lines 674-676 ("Storyline operations - Storylines are ordered sequences...") is immediately followed by batch_move_frames, batch_resize_frames, fit_frame_to_contents, fit_all_frames, check_frame_overlaps, and resolve_frame_overlaps — all ...
- `packages/nodus-mcp-server/src/tools.ts:948` (dead-code): **getTool() is exported but never called** — Grep across src/ and packages/ finds getTool referenced only in its own definition and in the compiled dist/tools.d.ts output. index.ts imports only NODUS_TOOLS. The function is dead code under the project's no-dead-code rule.
- `packages/nodus-mcp-server/src/websocket-client.ts:35` (dead-code): **WebSocketClientOptions.onMessage is declared but never invoked** — The `onMessage?: (request: JsonRpcRequest) => void` option exists on WebSocketClientOptions, but handleMessage() never calls `this.options.onMessage` anywhere, and no consumer (index.ts) passes it. It is an aspirational hook that does nothing.
- `src/llm/providers/anthropic.ts:117` (docstring): **Stale comment claims prefill is used, but no assistant prefill message exists** — generate() contains `// Use prefill to prevent preambles - assistant message forces model to continue directly`, but the messages array built directly below is only `[{ role: 'user', content: options.prompt }]` — there is no assistant prefill message. The ...
- `src/llm/providers/http.ts:24` (correctness): **FetchOptions.signal is accepted but ignored in the Tauri path; connectTimeout misnamed** — FetchOptions declares `signal?: AbortSignal`, but the Tauri branch never forwards or observes it — callers cannot cancel an in-flight request when running in Tauri (it only works in the browser-fetch fallback). Also `connectTimeout` is passed as `timeout_ms`, ...
- `src/llm/providers/ollama.ts:45` (consistency): **Ollama provider uses bare fetch while all sibling providers route through httpFetch** — openai.ts, openai-compatible.ts, and anthropic.ts all use the shared httpFetch wrapper (Tauri Rust backend, bypasses CORS/webview origin restrictions); ollama.ts uses window fetch directly with its own AbortController/clearTimeout plumbing duplicated in ...
- `src/llm/providers/openai.ts:154` (consistency): **chat() re-implements tool-call mapping instead of using the shared toolCallParser** — openai.ts maps `choice.message.tool_calls` inline with its own anonymous type, while openai-compatible.ts uses the shared `parseOpenAIToolCalls()` from toolCallParser.ts for the identical wire format. The inline version also skips the `filter((tc) => ...
- `src/llm/providers/types.ts:31` (consistency): **GenerateOptions.maxTokens is honored only by the openai-compatible provider** — GenerateOptions declares `maxTokens?: number`, but only openai-compatible.ts forwards it (`max_tokens: options.maxTokens`). openai.ts and ollama.ts ignore it entirely, and anthropic.ts uses its own configured `this.maxTokens` instead. A caller passing ...
- `src/components/StorylineEntitySidebar.vue:72` (dead-code): **Empty state and hasEntities prop are unreachable/redundant** — StorylineReader renders this component only when `showEntitySidebar && hasEntities` (StorylineReader.vue:397), so the `v-if="!hasEntities"` 'No entities in this scene' branch can never display. The `hasEntities` prop itself is derivable from `entitiesByType` ...
- `src/components/StorylineNodeList.vue:62` (design): **Redundant dual API: expandedNodeIds defineModel plus toggle-expand event** — The component declares `defineModel<Set<string>>('expandedNodeIds')` but never writes to it; expansion is instead requested via a separate `toggle-expand` emit that the parent handles by replacing its own Set, which flows back down through the model. Two ...
- `src/components/StorylineNodeList.vue:788` (dead-code): **Scoped CSS for .node-hover-preview has no matching element** — The `.node-hover-preview` rules (lines 788-815, including the `:has()` variant and compact override) target a class that appears nowhere in this component's template, and grep confirms no other file uses it. Hover previews were replaced by the ...
- `src/components/StorylinePanel.vue:112` (consistency): **Inconsistent error surfacing between storyline CRUD handlers** — `createStoryline` reports failures via `showToast?.(...)` while `saveEdit` (line 112) and `deleteStoryline` (line 132) only `console.error`, leaving the user with a silently-ignored rename/delete. Sibling operations in the same file should surface errors the ...
- `src/components/StorylineReaderFooter.vue` (consistency): **Hardcoded English strings alongside i18n in sibling components** — The storyline components mix `t()` with hardcoded UI strings: footer 'Previous'/'Next' and aria-labels; StorylineReader 'Skip to content', 'Loading...', 'This storyline has no nodes yet.'; StorylineNodeList 'No nodes yet', 'Add first node', 'Drop here to ...
- `src/components/StorylineReaderHeader.vue:38` (correctness): **Page indicator renders '1 / 0' for an empty storyline** — `{{ activeIndex + 1 }} / {{ nodeCount }}` displays '1 / 0' while loading or when the storyline has no nodes, since `activeIndex` defaults to 0. The footer guards on `nodes.length > 0`, the header does not.
- `src/components/StorylineReferencesSidebar.vue:44` (dead-code): **Declared 'pan-to-canvas' emit is never emitted; related dead members** — The `(e: 'pan-to-canvas', nodeId: string)` emit is declared and StorylineReader binds `@pan-to-canvas="panToEntity"` (StorylineReader.vue:419), but grep confirms `emit('pan-to-canvas', ...)` never occurs — the listener is dead wiring. Also dead in this file: ...
- `src/components/StorylineReferencesSidebar.vue:180` (correctness): **Deep watch over all storyline nodes is unnecessary and expensive** — `watch(() => props.nodes, ..., { deep: true })` traverses every node object including full `markdown_content` on each trigger. The parent replaces `nodes.value` wholesale after every mutation (StorylineReader reassigns the array), so a reference watch ...
- `src/components/CitationImportModal.vue:38` (dead-code): **Unnecessary Set re-creation with inaccurate reactivity comment** — `selected.value = new Set(selected.value) // trigger reactivity` is unnecessary: `selected` is a deep `ref`, so Vue 3's reactive proxy already tracks `Set.add`/`Set.delete` mutations made on the lines above. The workaround copies the whole Set on every ...
- `src/components/FileMoveCollisionDialog.vue:40` (correctness): **Rename option accepts empty or still-colliding names** — `handleRename` emits `('resolve', 'rename', customName.value)` without validation. The user can clear the input (or retype the existing file name) and press Enter, emitting a rename to an empty string or a name that still collides, pushing the failure to the ...
- `src/components/FullscreenNodeModal.vue:21` (dead-code): **Declared emit 'render-mermaid' is never emitted** — The emits declaration includes `(e: 'render-mermaid'): void`, but `emit('render-mermaid')` appears nowhere in the component (mermaid rendering now goes through `renderPendingContent`). PixiCanvas.vue:2184 still binds `@render-mermaid="renderMermaidDiagrams"` ...
- `src/components/FullscreenNodeModal.vue:78` (correctness): **Focus-on-open is a no-op because reading mode is the default** — The `visible` watcher runs `editorRef.value?.focus()` when the modal opens, but `readingMode` defaults to `true` and the editor pane is `v-if="!readingMode"`, so `editorRef` is null and nothing is focused. Keyboard interaction relies solely on the window ...
- `src/components/ImportOptionsModal.vue` (consistency): **Several modals lack Escape-to-close while siblings support it** — ImportOptionsModal, CitationImportModal, FileMoveCollisionDialog, SettingsModal, and McpApprovalModal offer no keyboard dismissal (Escape) — only overlay click and buttons. Sibling modals in the same directory (FullscreenNodeModal, KeyboardShortcutsModal, ...
- `src/components/KeyboardShortcutsModal.vue:42` (consistency): **Hardcoded untranslated shortcut entry among fully i18n'd list** — `{ category: t('shortcuts.categories.layout'), key: 'S', desc: 'Snug frame to fit contents' }` hardcodes the key label and description in English while every other entry uses `t('shortcuts.keys.*')` / `t('shortcuts.descriptions.*')`. The entry will not ...
- `src/components/KeyboardShortcutsModal.vue:80` (correctness): **Window keydown listener not removed on unmount** — The listener is added/removed in a `watch` on `props.show`. If the component is unmounted while `show` is true (e.g. parent canvas teardown or workspace switch), the `window.addEventListener('keydown', handleKeydown)` registration leaks and keeps emitting ...
- `src/components/McpApprovalModal.vue:155` (naming): **Approve/reject buttons named cancel-btn/import-btn** — The approve button uses class `import-btn` and reject uses `cancel-btn` — class names copied from the citation import dialog. Nothing is imported or cancelled in an MCP connection-approval dialog; the names do not reflect what the controls do.
- `src/components/PlanApprovalModal.vue:144` (consistency): **Close button renders literal 'X' text** — The close button content is the literal character `X`, whereas sibling modals use `&times;` (FullscreenNodeModal, KeyboardShortcutsModal, FileMoveCollisionDialog) or an SVG icon (SettingsModal). Visually inconsistent close affordance across the modal family.
- `src/components/MarkdownContent.vue:49` (design): **renderedHtml computed tracks store.filteredNodes via wikilinkExists, re-rendering markdown on unrelated node changes** — `renderedHtml` calls `renderMarkdown(props.content, { wikilinkExists })`, and `wikilinkExists` reads `store.filteredNodes` inside the computed, so the whole markdown-to-HTML conversion (plus the follow-up `triggerRender` with its rAF + 50 ms setTimeout and ...
- `src/components/NotificationToast.vue:8` (consistency): **getColor references undefined --color-* CSS variables; theme accents never apply to toasts** — `getColor` returns `var(--color-error, #ef4444)` etc., but src/assets/main.css defines the semantic palette as `--danger-color`, `--warning-color`, `--success-color` (with per-theme overrides such as `--danger-color: #ff3366` in the cyber theme). The ...
- `src/components/settings/LLMSettingsPanel.vue:215` (design): **Duplicated guard branches in validateApiKey** — `if (!requiresApiKey.value && !apiKey.value) { ...return }` followed by `if (requiresApiKey.value && !apiKey.value) { ...return }` are two branches with identical bodies whose union is simply `!apiKey.value`.
- `src/components/settings/LLMSettingsPanel.vue:289` (design): **Every config change saves and dispatches events twice** — The computed setters (`apiKey`, `selectedModel`, `timeout`, `maxTokens`, `contextWindow`) route through `setConfigValue()`, which already calls `saveProviderConfig()`. The additional `watch([maxTokens, contextWindow, timeout, selectedModel], ...
- `src/components/settings/LLMSettingsPanel.vue:295` (correctness): **Debounce timers not cleared on unmount** — `fetchDebounceTimer` and `validateDebounceTimer` schedule `fetchModels()` / `validateApiKey()` up to 800ms later but there is no `onUnmounted` cleanup. Closing the settings modal right after editing the base URL or API key runs network validation against a ...
- `src/components/settings/McpSettingsPanel.vue:27` (consistency): **Raw localStorage key duplicated with App.vue instead of using lib/storage** — `const MCP_ENABLED_KEY = 'nodus-mcp-enabled'` is written here via direct `localStorage.setItem`, and App.vue line 466 re-hardcodes the same string literal (`localStorage.getItem('nodus-mcp-enabled')`). Every sibling panel persists settings through the typed ...
- `src/components/settings/McpSettingsPanel.vue:80` (dead-code): **Unreachable 'stopped' branch inside v-if="isRunning" block** — `{{ isRunning ? t('mcp.running') : t('mcp.stopped') }}` sits inside `<div v-if="isRunning">` (line 76), and the inner `v-if="isRunning"` on the port row (line 84) is likewise always true; the ternary's else branch and the redundant v-if can never take effect.
- `src/components/settings/WorkspaceDiagnosticsSection.vue:82` (dead-code): **Debug console.log left in scanWorkspaces** — `console.log('[Settings] Workspace stats:', stats)` is leftover debug output on the success path; sibling panels only use console.error for failures.
- `src/components/settings/WorkspaceDiagnosticsSection.vue:90` (correctness): **Async switchWorkspace not awaited before closing the modal** — `nodesStore.switchWorkspace` is `async` (src/stores/nodes.ts line 340), but `switchToWorkspace` calls it without await in both branches before `emit('close')`. Rejections become unhandled, and the modal closes before the switch completes, so a failure leaves ...
- `src/components/settings/ZoteroSettingsPanel.vue:176` (correctness): **Silently swallowed per-item import failures skew the result** — In `importZoteroItems`, `catch { // Node creation failed - continue with remaining items }` drops the error entirely; if several `store.createNode` calls fail, the progress bar still reaches total and the user gets no count of failures — only fewer nodes than ...
- `src/components/settings/ZoteroSettingsPanel.vue:264` (consistency): **buildGraph lacks the try/catch used by every other async handler** — `buildGraph()` awaits `citationGraph.buildCitationGraph(...)` with no error handling, while all other async actions in this file (`testCloudConnection`, `fetchCloudCollections`, `importAllCloudItems`, `importCloudCollection`, `importCollection`, ...
- `src/components/settings/ZoteroSettingsPanel.vue:553` (dead-code): **Dead CSS for removed 'connect to Zotero' UI** — The selectors `.zotero-connect`, `.detect-btn` (plus its :hover/:disabled variants), `.zotero-connected`, and `.connected-status` match nothing: grep of the template shows zero uses of these classes. They are remnants of a removed local-Zotero connect flow.
- `src/composables/useCitationGraph.ts:153` (correctness): **edgeExists re-fetches and linearly scans all edges per candidate inside nested loops** — `edgeExists` calls `ctx.getEdges()` and does `edges.some(...)` for every reference and citation of every paper processed (`buildCitationGraph` loops papers × refs × edges). For a canvas with thousands of edges and dozens of papers this is O(P×R×E) with a ...
- `src/composables/useCitationGraph.ts:192` (design): **fetchPapersForNode never clears its own loading state** — `isFetchingCitations.value = true` is set at line 192 but no code path in this composable ever sets it back to false — not the early `return` when `getPaperByDOI` fails (line 196-198), nor normal completion. The state is only cleared because useCitationFetch ...
- `src/composables/useCitationGraph.ts:488` (consistency): **Misindented object property inside createEdge calls** — In both `buildCitationGraph` edge-creation blocks the `label: 'cites',` line is dedented out of alignment with its object literal (lines 487-489 and 505-507: `link_type: 'cites',\n            label: 'cites',`). It is syntactically fine but visually reads as ...
- `src/composables/useCommentMeta.ts:60` (dead-code): **useCommentMeta() wrapper is never called** — All consumers (useStorylineReaderComments.ts, StorylineNodeList.vue, StorylineReader.vue) import the standalone functions `parseCommentMeta`/`createCommentContent` directly. The composable-style wrapper `export function useCommentMeta() {...}` has zero call ...
- `src/composables/useEntityOperations.ts` (naming): **Two different composables share the name useEntityOperations** — src/composables/useEntityOperations.ts (store-level entity CRUD/link helpers, used by stores/nodes.ts) and src/canvas/composables/nodes/useEntityOperations.ts (canvas context-menu entity actions, used by PixiCanvas.vue) are unrelated implementations with ...
- `src/composables/useFileSync.ts:36` (correctness): **getFilename ignores Windows path separators; move detection keyed by basename can collide** — `getFilename` splits only on '/', while `getRelativeFolder` in the same file normalizes backslashes — on Windows a Tauri watcher event with backslash paths makes getFilename return the full path, breaking delete+create move pairing. Separately, ...
- `src/composables/useFileSync.ts:346` (dead-code): **handleFileChange and isWatching are exposed but never consumed** — The return object exposes `handleFileChange` and `isWatching`, but grep across src/ and tests finds no external reference to either (stores/nodes.ts re-exports only watchVault/stopWatching/markProgrammaticMove; FileSyncInterface in stores/nodes/types.ts omits ...
- `src/composables/useImport.ts:392` (correctness): **Post-import edge dedup key ignores link_type, dropping distinct edge kinds between the same node pair** — The deduplication in `importVault` builds its key from the sorted node-id pair only (`${ids[0]}:${ids[1]}`). Two legitimate edges of different types between the same nodes (e.g. 'cites' and 'related', which the edge-color spec treats as distinct ...
- `src/composables/useMcpServer.ts:160` (consistency): **mcp-message listener has no error guard, and logging bypasses the shared logger** — The 'mcp-message' listener does `await handleMessage(connection_id, request)` with no try/catch. handleRequest catches its own errors, but `sendResponse` (invoke 'send_mcp_response') can still reject — e.g. the connection dropped mid-request — producing an ...
- `src/composables/useNodeLayout.ts:178` (correctness): **O(n^2) node lookup inside the frame-constrain loop and sequential position persistence** — Within the `fitToFrame` branch, `deps.getNodes().find(n => n.id === id)` runs per positioned node — O(n) lookup × n nodes per layout. Combined with `useUndoRedo`'s position undo which awaits `updateNodePosition` sequentially per node, a 500-node layout/undo ...
- `src/composables/useTypst.ts:14` (correctness): **32-bit string hash used as cache key can collide and serve the wrong SVG** — `hashCode` is a 32-bit additive hash; the cache key is `hashCode(math + displayMode)` with no verification of the original string. A collision (birthday bound ~77k entries, but possible at any size) silently returns another expression's rendered SVG. The ...
- `src/stores/index.ts:3` (docstring): **Barrel claims to re-export all stores but omits three** — The header says 'Re-export all stores for convenient importing', but `useStorylinesStore`, `useDisplayStore`, and `useAgentTasksStore` are not exported — consumers import them directly from their modules, making the barrel's claim inaccurate and its usage ...
- `src/stores/nodes.ts:475` (correctness): **Window event listener registered in store setup is never removed** — `window.addEventListener('nodus-tag-nodes-change', handleTagNodesChange)` runs inside the defineStore setup and there is no removal path. display.ts establishes the store convention with explicit setupListener/cleanupListener functions; nodes.ts diverges. ...
- `src/stores/nodes/advanced.ts:61` (consistency): **'default' workspace sentinel normalized in some paths but not others** — initializeStore (state.ts:165) converts `'default'` to null before `edgesStore.initialize`, but `switchWorkspace` passes the raw workspaceId to `edgesStore.initialize(workspaceId)` and `getWorkspace(workspaceId)`, and nodes.ts:605 `loadEdges` passes ...
- `src/stores/nodes/crud.ts:106` (dead-code): **Debug console.log leftovers and an unused parameter** — Leftover debug logging: crud.ts:106/108 `console.log('[Nodes] Saving size...'/'Size saved successfully...')` on the resize path, and state.ts:178 `console.log('[Nodes] Node sizes from DB:', ...)` on every startup — both bypass storeLogger, which is the ...
- `src/stores/storylines.ts:50` (correctness): **N+1 sequential IPC round-trips in per-item loops** — `loadStorylines` awaits one `get_storyline_nodes` invoke per storyline inside a for loop (N+1 on every workspace init). Same sequential-invoke-per-item pattern: crud.ts `moveNodesToWorkspace` (one `update_node_workspace` per node), advanced.ts ...
- `src/lib/storage.ts:370` (consistency): **Three storage objects hand-roll JSON parsing instead of using the shared parseJson helper** — The module defines `parseJson<T>(value, fallback)` (line 51) and uses it in workspaceStorage/llmStorage, but `memoryStorage.getMemories`, `storylineReadingStorage.getPosition`, and `agentMemoryStorage.getSession`/`getStack` each reimplement the identical `if ...
- `src/lib/templates.ts:165` (consistency): **Non-English template bodies strip diacritics while edge labels in the same file use them** — The de/fr/es template strings systematically omit diacritics ('fur', 'unterstutzt', 'Menu', 'Gedachtnis', 'Creer des noeuds', 'Metodo de loci', 'Hipotesis'), but the `edgeLabels` table in the same file uses correct orthography ('gestützt durch', 'références', ...
- `src/lib/typst-export.ts:117` (dead-code): **Code-block and inline-code replacements in markdownToTypst are identity no-ops** — Lines 117-122: `result.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => `\`\`\`${lang}\n${code}\`\`\``)` reconstructs exactly the matched input, and `result.replace(/`([^`]+)`/g, '`$1`')` replaces a span with itself. Both transforms have no effect and ...
- `src/lib/typst-export.ts:161` (correctness): **citationToTypst never emits the journal line when an author line exists** — The journal is extracted with `content.match(/\*([^*]+)\*/)` but only used under `if (journalMatch && !authorMatch)`. Citations generated by `citationToMarkdown` contain both `**Author** (year)` and `*Journal*` lines, so for any well-formed citation the ...
- `src/lib/typst-export.ts:285` (dead-code): **nodeToTypst is referenced only by its own test file** — The comment says 'Export a single node to Typst format (for clipboard)', but grep across src/ (excluding __tests__) and packages/ finds no application caller — only src/__tests__/typst-export.test.ts imports it. The clipboard path (useNodeClipboard.ts) does ...
- `src/lib/citationFormat.ts:79` (dead-code): **Unreachable else-if branch and unescaped YAML values** — In formatCitationAsMarkdown, `else if (data.year)` (line 79) is unreachable: when data.year is truthy, line 75 already pushed `(${data.year})` into pubInfo, so `pubInfo.length > 0` always takes the first branch. Separately, frontmatter values are emitted ...
- `src/lib/contentParser.ts:35` (consistency): **Sibling extractors return different collection types** — extractHashtags returns string[] (converted from a Set) while extractWikilinks returns Set<string> directly; the two functions are siblings in the same module doing the same shape of work, and callers must remember which is which.
- `src/lib/extraction.ts:164` (dead-code): **extractFrontmatter aggregate is never used** — extractFrontmatter (the aggregate of title/tags/doi/zoteroKey/semanticScholarId) has zero callers anywhere in src/ or tests; consumers import the individual extractors directly. The file also re-implements the same `/^---\s*\n([\s\S]*?)\n---/` frontmatter ...
- `src/lib/geometry.ts:40` (consistency): **isValidCoordinate hardcodes the bound and disagrees with clampCoord at the boundary** — isValidCoordinate uses a literal `Math.abs(value) < 1_000_000` (exclusive) instead of MAX_CANVAS_COORD, while clampCoord clamps values to exactly ±MAX_CANVAS_COORD (inclusive). A coordinate produced by clampCoord at the limit is therefore rejected by ...
- `src/lib/ids.ts:14` (docstring): **generateShortId docstring says 10 characters; it generates 8** — The function docstring reads "Generate a short random ID (10 alphanumeric characters)" and "@returns A 10-character alphanumeric string", but ID_LENGTH is 8 (and the module header plus isShortId both say 8). Also `bytes[i] % ALPHABET.length` has modulo bias ...
- `src/lib/ids.ts:33` (dead-code): **isShortId is never used** — Grep across src/, src-tauri/, and packages/ (including tests) finds no reference to isShortId outside its definition, while its sibling isUUID has 11 call sites.
- `src/lib/markdown.ts:25` (dead-code): **parseMarkdown wrapper is never called** — The only consumer of this module (src/services/MarkdownRenderService.ts:15) imports `marked` directly and calls marked.parse itself; parseMarkdown has zero callers in src/ or tests. The docstring's "Single source of truth" claim holds only for the ...
- `src/lib/parsing.ts:50` (design): **Each getXArg call re-parses the same tool args** — getStringArg/getNumberArg/getBooleanArg/getArrayArg each call parseToolArgs(args), so a tool handler that reads five arguments JSON.parses the identical string five times. Not a hot render-loop path, but it is repeated serialization work in every LLM tool ...
- `src/lib/parsing.ts:136` (dead-code): **extractJSONObject is unused and its comment overstates capability** — extractJSONObject has zero callers (extractJSONArray has 2). Its comment says "handle nested braces" but the implementation is a single greedy `\{[\s\S]*\}` match from first `{` to last `}` — it fails whenever unrelated braces or trailing text follow the ...
- `src/lib/perfMonitor.ts:95` (correctness): **wheel/keydown interactions never end, misclassifying subsequent frames** — onInteractionStart is bound to pointerdown, wheel, and keydown, but only pointerup resets isInteracting. After a scroll or keypress with no subsequent click, every frame is tagged 'interaction' indefinitely, skewing the idle-vs-interaction FPS split the tool ...
- `src/lib/textProcessing.ts:179` (dead-code): **removeExtension, extractPreview, and normalizeWhitespace are unused** — Grep across src/ and packages/ (including tests) finds zero references to removeExtension (line 179), extractPreview (line 200), and normalizeWhitespace (line 208) outside this file; only splitIntoChunks, preProcessPdfText, sanitizeFilename, and truncateText ...
- `src/lib/themeInjector.ts:43` (design): **generateEffectsCSS repeats the same block five times** — Five near-identical blocks (node_card, node_card_hover, node_card_selected, edge_glow/edge_highlighted/edge_selected) each rebuild the props array from the same four optional keys and format a rule. A single table of `{ effectKey, selector }` pairs plus one ...
- `src/lib/typst.ts:12` (naming): **Cache labeled LRU is FIFO; renderMath can reject despite null-on-error contract** — The comment says "Simple LRU cache" but eviction removes the oldest inserted key and cache.get never refreshes recency, so it is FIFO. Also renderMath's doc says "@returns SVG string or null on error", yet `await initTypst()` is outside the try block, so a ...
- `src/types/theme.ts:96` (dead-code): **variableNameToCSS and THEME_CSS_VARIABLES are unused; runtime code in a types module** — Grep finds no references to variableNameToCSS or THEME_CSS_VARIABLES outside src/types/theme.ts. variableNameToCSS also duplicates the private toKebabCase in src/lib/themeInjector.ts (the actual consumer of this transformation), and shipping a runtime ...

## Refuted findings

- src-tauri/src/main.rs:165 on_menu_event unwraps get_webview_window("main") — panics when the window is closed
- src/canvas/composables/viewport/useCanvasZoom.ts:90 RAF and timeout handles never cleaned up on unmount; momentum keeps running against a dead component
- src/canvas/composables/agent/usePlanHandlers.ts:59 handlePlanReject fires agentRunner.resume() without awaiting; errors become unhandled rejections
- src/canvas/composables/util/useStorylineDropTarget.ts:84 Per-pointermove forced layout reads during node drag
- src/components/StorylineNodeList.vue:181 Drag reorder computes indices from document-wide query, breaks with two mounted lists
- src/components/settings/McpSettingsPanel.vue:29 onMounted syncs mcpRunning but not mcpPort from getStatus
