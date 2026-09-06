# Changelog

All notable changes to Nodus are documented in this file.

## [1.6.0-rc.4] - 2026-09-06

### Changed
- Newly visible cards mount a few per frame while a viewport gesture is live. A grid layout crosses the viewport margin in columns, so mounting is a sawtooth: measured on a dense workspace, the cards mounting per frame are 0 for most frames and then 20 in one, 30 at higher density, 60 to 120 under a fast drag. Mounting is the expensive part, so the burst is what is felt while a healthy median frame time hides it. The margin is what makes staging safe - it exists so a node mounts before it is on screen, so admitting it a frame or two later costs nothing visible. Departures apply immediately, and staging stops when the gesture does
- A tag earns a node of its own once at least two notes share it. One node per distinct tag put 606 tag nodes into a workspace holding 360 real ones, and 542 of them - 89% - were reachable from a single note or none. A tag used once labels that note rather than linking anything, and its card already shows it as a chip. On the same data the threshold yields roughly 60 nodes instead of 606

## [1.6.0-rc.3] - 2026-09-06

### Added
- Settings > Canvas > Show performance readout puts frame timing over the graph while panning or zooming: median, 95th percentile, worst frame, how many frames missed the 16.7ms budget, and the time attributed to each named phase, alongside which renderer is live and how many nodes and edges it is drawing. Measuring the canvas from outside the browser kept clearing the code - culling and node styling at 0.015ms per frame, the edge model at 0.41ms for 1,000 edges - while the canvas stayed laggy, and lag in bubble mode ruled out cards, DOM subtrees, SVG and CSS filters alike. What remains is rendering, which only the running app can be asked about. Frames are sampled only while a gesture is live, and the readout is off by default

## [1.6.0-rc.2] - 2026-09-06

### Changed
- A live pan, pinch or zoom drops the drop-shadow glow on edges and restores it when the gesture settles. The per-frame JavaScript was never the cost: culling and node styling together measure 0.015ms per frame over a steady pan of a 360-node workspace, against a 16.7ms budget. Paint is, and a filter forces its own paint pass over a region larger than the path it decorates - `.edge-highlighted` carries one in every theme, the cyber theme puts one on every visible edge, and selecting a hub highlights its whole fan. It is also why zooming out stayed smooth: above the level-of-detail threshold edges are drawn on a 2D canvas, where no CSS filter applies
- A card's content cap is derived from its width, height and the user's font scale instead of a flat 4000 characters. A 200x120 card shows about 162 characters while the flat cap rendered an average of 896; measured over 400 nodes of a real vault that is 38 DOM elements per card against 7. The card's size is part of the render cache key, so a resized card fills the space it gained

## [1.6.0-rc.1] - 2026-09-05

### Added
- A `#tag` in a node's text always creates its tag node and the edge to it. Creation was gated on a setting named for display, so typing a tag produced no edge unless that setting was on
- Loading a workspace scans every node's body for tags, so content that predates tag extraction, or that another editor wrote into the vault, is tagged like anything else. Measured on a 12,853-node vault: 1,193 nodes held tags the graph did not know about
- Loading a workspace also connects any node whose tags have no edges, whatever wrote them - the body scan, or an agent setting tags over MCP. An existing connection is never duplicated, so a connected workspace costs nothing
- Settings > Canvas > Repair Tag Nodes merges tag nodes that duplicate each other and restores a missing hash prefix, left by an earlier lookup that compared a bare name against a title stored with its hash

### Changed
- Neighbourhood mode arranges its subgraph with the canvas layout algorithms instead of a placement of its own, and the layout controls act on the subgraph while it is open. Depth-1 neighbours were sorted into a family tree - parents in a row above, children below, siblings in two columns - which put every neighbour of a hub in one row: 13,650px across for forty neighbours, against a bounded ring. Nothing is persisted and no undo step is pushed, so leaving the mode restores the canvas exactly as it was
- Deleting a `#tag` from the text withdraws it: the tag leaves the node, its edge is deleted, and the tag node goes once the last note using it lets go. Only a tag the previous body carried and the new one does not is taken away, so a tag added by hand from a card's chips survives an edit
- The tag setting is a view preference. It no longer decides whether tag nodes exist, and switching it off no longer deletes every tag node - a control that reads as "show" must not destroy data

### Fixed
- A context menu opens where it fits rather than where the pointer was. Right-clicking a node near the bottom of the canvas ran the menu past the window with most of its items unreachable; it now flips to the other side of the pointer, clamps when neither side has room, and pins to the top-left when larger than the window
- Selecting a node highlights the borders of its neighbours, not only their edges. The collapsed-card dimming wrote a border colour inline, which outranks any stylesheet whatever its specificity, and light-theme card rules outweighed the highlight in the cascade

## [1.5.0] - 2026-09-05

A canvas pass: the viewport survives large graphs without an out-of-memory kill, and a graph too dense to read as cards is drawn as circles instead.

### Added
- Below a zoom threshold node cards become circles drawn on a 2D canvas, with their edges on the same canvas. The threshold has a hysteresis band, so a canvas held near it does not flip between forms
- The preview panel is available in bubble mode, where a card never appears
- Zoom and pan respond to two touch or pen contacts, and a touchpad pinch zooms the canvas rather than scaling the whole page
- A node carries a date, and its anchored comments appear in the fullscreen view
- The timelines sheet opens from the toolbar
- An edge label sits on its curve, an edge shows its own colour, and search matches the rendered text
- Every locale carries every key, and the components that had no translations were translated

### Changed
- The zoom-out floor is derived from the content rather than a constant, and the zoom range is defined once so fit-to-content can reach its own limit
- The renderer holds steady while a zoom or pan gesture is live
- The edge list is returned unchanged when nothing that routes an edge has changed
- The dot grid renders on its own layer, so a pan no longer repaints the viewport
- Edge form is chosen by zoom as well as by graph size; highlighted edges are painted in a second group instead of re-sorting the list, and a non-highlighted edge is dimmed once per edge
- Node hover is ignored while the canvas is panning
- Pan offset writes are coalesced to one per animation frame
- Force-layout spacing scales with the card size it separates, and each radial ring is sized from its own radius
- Ports are ordered so fewer edges cross, and a detour runs perpendicular to the segment so edges stop crossing nodes
- A frame press becomes a drag only after 3px of travel, and a frame resize is stored once instead of on every pointer move
- Undo is recorded in the store, so no writer can omit it; setting a date, fitting a frame, a bulk rewrite, a colour choice and a resize are each one undo step

### Fixed
- The zoom tiers that keep the canvas out of an out-of-memory kill are gated by tests, and the webview zoom guard applies on every route into a page zoom
- Selecting a node highlights its neighbours again. The highlight sets a border colour and a glow; the collapsed-card dimming wrote a border colour inline, which outranks any stylesheet, and light-theme card rules outweighed it in the cascade. Only the border was lost, so the glow still showed and the frames did not
- A wikilink is read through one parser and a frontmatter block is found one way, so the timeline sees what other views see
- A node is deleted only once its file is in the trash
- Wikilink edges survive a backend failure, and an edge type change is stored
- Frontmatter survives on CRLF files, and one block is written per exported document
- A fresh database gets the same edges schema an upgraded one gets
- A storyline drag ends on pointercancel, not only on pointerup
- Caller-supplied paths are checked against the vaults before being acted on, and the PDF parser is patched against malformed input
- The approval dialog opens when a plan is created, not when the model asks
- An agent run ends on the done tool rather than on the words in a reply, a superseded node-agent loop no longer writes the new run's state, and a failure across the MCP boundary says what actually failed

### Removed
- Six components no interface mounts, and every export nothing imports, each gated against reappearing

## [1.4.0] - 2026-08-26

Releases the work of 1.4.0-rc.1 through rc.3. The individual candidate entries below record each change in detail; this entry is the consolidated view for anyone upgrading from 1.3.0.

### Added
- Documents leave the canvas as documents. A storyline or a canvas selection exports to PDF or Typst source, with title, author, paper size, and an optional list of the connections between exported nodes. A storyline exports in its own order, because the sequence is the argument
- Highlights in a dropped PDF become nodes, each holding its passage, coloured to match, and linked to the document it came from
- A dropped paper can become a graph rather than a single node: sections connected along the document outline, bibliography entries as citation nodes verified against Semantic Scholar, and an optional model pass extracting claims. Verification reports "not checked" when the service is unreachable, rather than marking a reference missing
- A wikilink expands into a callout where it sits while reading at full width, and any node can be opened alone in the reader
- An existing vault can be brought to Open Knowledge Format. The survey reports what would change and writes nothing until confirmed; the backfill prepends frontmatter and never touches the body
- Both agent surfaces state the storage format, naming OKF v0.2 and leaving frontmatter to Nodus
- The log level is selectable in Settings > General > Advanced and persists across restarts
- The agent's log names each tool as it is called, with its arguments

### Changed
- Panning and zooming are driven by a single container transform rather than per-node styles: 24ms per frame became 1.52ms
- A node card renders the leading part of its content and marks where the text continues. An imported paper measured 82ms to render against 6.7ms for the capped preview; the fullscreen view and the reader still render the whole document
- Content is rendered for the nodes the viewport shows rather than every node in the workspace
- Deleting a group of nodes went from 16.2ms to 3.1ms
- A layout animation stores only where the nodes land, instead of one write per node per frame
- The agent can reach the tools it was told about, and tools with no surface are declared as such
- The backend owns the export save dialog, so the path written is one the user chose

### Fixed
- The plan the agent asks approval for is the plan it built. Processing the create_plan marker created the plan a second time from a payload carrying no steps, and since approval is refused for a plan with no steps, no approval dialog opened: the agent reported it was waiting on a plan the user was never shown, then retried and wrote the plan into the chat as prose
- An edit is written to the node it was typed into. Both editors previously resolved a pending autosave against whichever node was open when the timer fired, losing the last keystrokes with nothing reported
- Deleting a merged connection deletes it, rather than leaving a wikilink for the watcher to read back
- Frontmatter is read the same way whatever the line endings
- A tag matches its node with or without a leading `#`, so tagging no longer creates a duplicate
- Copying reads the live selection, and pasting prefers copied Nodus nodes over reading their text as a citation
- Cached mermaid diagrams render instead of blanking
- A selected node in bubble mode can be dragged again
- The plan approval dialog counts what a step actually affects
- Every way an agent run can end is reported in the chat
- Tooltips are placed from measurement, so none is clipped at a screen edge
- MCP single-entity lookups are scoped to the open workspace, as the list operations already were

### Removed
- The PixiJS and WebGL dependencies, which were declared and documented but never used. Rendering is DOM cards, SVG edges, and a 2D canvas above the LOD threshold, and the documentation now says so

### Enforcement
- Gates added for rendering and culling budgets, pan and zoom smoothness, platform portability, version consistency, tool reachability, architecture honesty, and the 1000-line file limit
- A gate rejects a registered command that binds none of its inputs while reporting success

## [1.4.0-rc.3] - 2026-08-25

This release candidate is the remediation of a full codebase review: 388 files reviewed, 241 findings confirmed by an adversarial verification pass, recorded in `docs/REVIEW.md`. All ten high-severity findings are fixed, each with a gate that fails on the unfixed code.

### Added
- The log level is selectable in Settings > General > Advanced, and the choice persists across restarts. Twenty-five `logger.debug()` call sites existed while the threshold could never fall below `info`, so none of them could ever emit
- The agent's log names each tool as it is called, with its arguments, and reports a failed call rather than only its count

### Changed
- The agent can reach the tools it was told about. Twenty-seven of seventy-one registered tools were exposed to no surface; the frames, storyline and selection tools are now both whitelisted and backed by a store that answers them. Tools with no surface are declared as such rather than left to look available
- A layout animation stores only where the nodes land. It previously issued one database write and one IPC call per node per frame: about 18,000 writes for a 600ms animation of 500 nodes, of which 500 mattered

### Fixed
- An edit typed into one node is written to that node. Following a wikilink in the fullscreen view within the 500ms autosave window resolved the pending write against the newly opened node, found nothing to write, and lost the previous node's last keystrokes with nothing reported. The same defect in the canvas editor is fixed alongside it
- Deleting a merged connection deletes it. The wikilink was removed from the source file only, so the file watcher read the target's surviving link and recreated the edge
- MCP single-entity lookups are scoped to the open workspace, as the list operations already were
- A tag matches its node whether or not either carries a `#`, so tagging an existing tag no longer creates a second node beside it
- Frontmatter is read the same way whatever the line endings, so a CRLF file's metadata is no longer parsed as body text
- Copying reads the live selection instead of the one present when the canvas was constructed, and pasting prefers copied Nodus nodes over interpreting their text as a citation
- A cached mermaid diagram renders. The cache returned SVG that sanitization then stripped, blanking every diagram after its first render
- A collapsed node's title is budgeted against the type size as rendered rather than as declared
- `update_node` was registered as a command, ignored its input, and reported success. It is removed, and a gate rejects any command that binds none of its parameters
- The root typecheck passes again, so CI is green on main

### Enforcement
- The 1000-line file limit is gated as a ratchet: the seven files already over it may shrink but never grow, and no other file may cross it
- A gate rejects a registered command that binds none of its inputs while reporting success

## [1.4.0-rc.2] - 2026-08-24

### Added
- An existing vault can be brought to Open Knowledge Format. Settings > Workspaces surveys which files would gain OKF frontmatter and writes nothing until confirmed; the backfill prepends a frontmatter block and never touches the body, so wikilinks, tags and prose survive unchanged, and a file that already has frontmatter is skipped rather than merged into
- Both agent surfaces state the storage format. The in-app agent's prompts and the MCP server's instructions and tool documentation name OKF v0.2 and tell the model to write the body only, since Nodus writes the frontmatter itself

### Changed
- A node card renders the first part of its content and marks where the text continues. A node holding an imported paper measured 82ms to render - five dropped frames on one click - against 6.7ms for the capped preview. The fullscreen view and the reader still render the whole document
- Node content is rendered for the nodes the viewport shows rather than every node in the workspace, which cost 157ms for 300 nodes in one synchronous pass. Cache eviction follows whether a node still exists, not whether it is on screen, so scrolling does not re-render
- The backend owns the export save dialog, so the path written is one the user chose rather than one the interface named
- A collapsed node title is clamped to the number of lines its own card can hold, instead of a fixed count that cut long titles mid-line on tall cards

### Fixed
- A selected node in bubble mode can be dragged again. The circle canvas covers the viewport and omits selected nodes from its hit test, and the card rendered underneath it, so a press on a selected node reached neither
- The plan approval dialog states an unnamed scope instead of counting steps as nodes. A step described as updating 317 nodes was summarised as editing one, which is the opposite of what an approval dialog is for
- Every way an agent run can end now says so in the chat. A run that finished in tool calls, paused for approval, was stopped, or hit its iteration limit previously left the panel showing a tool-call count and silence
- Exporting no longer clobbers a neighbouring file: the temporary name is appended to the file name rather than replacing its extension
- The macOS release builds again. Declaring the Apple signing variables while their secrets are unset made the bundler attempt a certificate import with an empty value and fail

## [1.4.0-rc.1] - 2026-08-24

### Added
- Documents leave the canvas as documents. A storyline or a canvas selection exports to PDF or Typst source, with title, author, paper size, and an optional list of the connections between exported nodes. A storyline exports in storyline order, because the sequence is the argument; a loose selection exports top to bottom, left to right. The generator and the PDF compiler already existed and no interface reached them
- Highlights in a dropped PDF become nodes. A picker lists every highlight with its page, colour, and comment, and each chosen one becomes a node holding the passage, coloured to match, linked to the document it came from. Re-dropping the same file offers only what is new. A highlight whose text the file does not store is listed as unavailable rather than imported empty
- A dropped paper can become a graph rather than one node: sections as nodes connected along the document outline and grouped in a frame, bibliography entries as citation nodes, each reference verified against Semantic Scholar, and an optional model pass that extracts claims as nodes linked to their section. Verification has three states, so an unreachable service reports "not checked" instead of marking a reference missing
- Notes anchor where they belong. A wikilink in a node's text expands into a callout at that point while reading at full width, and creating a comment writes such a link into the text it comments on. Any node can be opened alone in the reader from the canvas
- Sections can be edited where they are read. Double-clicking a section's text edits its markdown in place, behind the same file lock the canvas uses
- The contents sidebar lists the headings inside each node, indented by level, and clicking one scrolls to it
- Nodus reports when a newer version exists, in a strip that can be dismissed. Installing stays the user's choice, and being offline is silence rather than an error
- A first-run coach teaches the edge gestures by having the user perform each one, since nothing on screen suggested they existed. Settings > General replays it

### Changed
- Pan and zoom cost one container transform instead of a restyle of every visible card. A frame took 24 ms at 500 nodes against a 16.67 ms budget; it takes 1.52 ms
- Each screen edge listens only at a handle in its middle, drawn on screen. A window that does not fill the display crosses its borders constantly, and a fully live edge opened panels during ordinary mouse travel
- Model responses stream. A long generation arriving as one buffered body is indistinguishable from a stalled connection, and gateways cut it
- Tooltips are placed by measuring the trigger and the label against the viewport. The previous default-plus-override-per-container scheme clipped labels in every container nobody had written a rule for
- The rendering documentation describes the renderer that exists: DOM cards, SVG edges, and a 2D canvas above the level-of-detail threshold. The specified PixiJS renderer was never built, and both `pixi.js` and `katex` are removed as unused

### Fixed
- Files dropped on the canvas land at the cursor on macOS, where drop positions arrive in logical rather than physical pixels
- Dropped PDFs outside a workspace vault can be read, which is nearly all of them. The path guard now accepts what the operating system reports the user dropped
- PDF text that extracts cleanly survives an unreachable model; cleanup runs in sections, and a lost section costs only that section
- An annotation's author is never used as its highlighted text, which gave every highlight in a file the same content
- A selection layout moves every selected node, including nodes in frames, and frames follow their contents instead of ejecting them
- Deleting a group of nodes no longer scans every edge in the workspace once per node
- The status bar, which holds the agent log button, clears the agent panel instead of sitting behind it, and the left-anchored overlays slide with the panel rather than jumping
- A failed request reports its cause - a timeout, a refused connection, a DNS failure - instead of reading as an unreachable endpoint
- The provider status light tests the completions endpoint the application uses, not the model listing, and shows why a check failed
- The reader slides as one painted panel, keeps its content while switching storylines, and scrolls only its own pane

## [1.3.0] - 2026-08-22

### Added
- The canvas agent is a chat, not a fire-and-forget prompt. A full-height panel on the canvas's left edge holds the conversation: every prompt and every answer in full, each answer listing the tools it used behind a collapsible line. Previously a text-only reply was truncated to 80 characters into a log panel that opened only on errors, so an answer that changed nothing on the canvas left no trace at all. The panel folds away and back through one toggle in the canvas's top-left corner or a left-edge push, and its folded state persists
- The agent states what it will actually see before a prompt is sent: with nodes selected it names them, otherwise it gives the node count of the whole graph. The list shown and the list handed to the model come from one source, so the claim cannot drift from the payload
- The in-app agent can set node dates and tags. `create_node` and `update_node` accept `date`, `date_end` and `tags`, with dates written as frontmatter by the same helper the MCP surface uses; setting a date leaves the note body intact. Asking the agent to date nodes previously could not work, because only MCP clients could write those fields
- MCP `create_edge` accepts a colour, which the Rust backend has always stored but the TypeScript plumbing dropped
- The agent panel and the timelines sheet are resizable and remember their size, as the storyline overview already did. The timelines sheet keeps fitting its lane count until the user drags it, after which their height wins
- The storyline reader's contents sidebar and width now persist across folding the layer away and coming back

### Changed
- Every panel that can be resized uses one composable, so drag direction, clamping and persistence cannot drift between them; the reader's separate implementation is gone
- Documentation is built and deployed with Zensical, the toolchain its config describes; the unused mkdocs config is removed and every page carries a generation notice

### Fixed
- Panning and zooming no longer recompute every visible edge on every frame. Culling returned a fresh array and set each frame even when the same nodes were on screen, invalidating all downstream work; it now keeps its identity until a node genuinely enters or leaves the viewport
- Edge gestures fire reliably: a fast flick reached the desktop before any pointer sample landed inside the 12px edge band, so the storyline reveal and timelines sheet often ignored it. Leaving the window now counts as a push on the edge it left through
- MCP `update_edge` applies the label it advertised. It accepted the parameter, reported success, and changed nothing
- Tooltips no longer open off screen: controls anchored to a window edge state a direction, so the toolbar, edge filters, timelines sheet, storyline layers and the agent panel's input row all keep their labels on screen. The edge filter tooltips were also hardcoded English and are now translated
- The published documentation site works again: its images were left out of the build after the toolchain change, its reference pages were unreachable from the navigation, and its links were generated for the wrong base path
- Emoji removed from the documentation. They were encoded as HTML entities, so they survived every scan for emoji characters while rendering as icons on the published page
- Dependencies nothing imports are gone (yjs, three TipTap packages, the Tauri fs JS binding, and the Rust `dirs` crate), and the documentation no longer claims an editor and a database the project does not use

## [1.2.0] - 2026-08-19

### Added
- Edge labels have their own zoom threshold (Settings > Appearance, default 50%): below it labels are hidden, since counter-scaled labels otherwise stay full-size while nodes collapse and dominate the zoomed-out view. Setting it to 0 keeps labels always visible
- Starter content now demos every feature: a "Demo Project" frame with three dated notes (including a date range) threaded by a violet "Project Story" storyline, hashtags that become tag chips, a dated DOI citation outside the storyline (showing the timeline's unassigned lane and the broken-axis gap), an "Entity Types" frame with character, location, term, and item nodes cross-linked by wikilinks, and a comment node annotating the research example - localized in all five languages. Resetting the default workspace clears its previous frames and storylines before reseeding

### Changed
- The timelines sheet closes with an upward motion instead of a left-edge push: a push into the top edge band or the pointer leaving the window through the top region folds it in, mirroring how it opened from the bottom. The left edge remains reserved for stepping back through the storyline layers
- The minimap sits tucked into the canvas's top-right corner instead of floating 16px away from it
- Tagged builds publish their GitHub release immediately instead of leaving a draft that only reaches users when someone presses publish

### Fixed
- Repeated layout runs no longer displace nodes out of their frames or stack frames on top of each other: layouts treat each frame and its member nodes as one rigid unit (member targets come from offsets captured at run start, clamped into the frame, so a run repairs prior escapes), frame-frame overlaps are resolved after every global layout, a new run settles the previous in-flight animation instead of freezing it mid-flight, and stale post-layout expansion timers are cancelled. Enforced by invariant tests covering single and interrupting runs
- CI's Rust job no longer fails every pull request: a new clippy lint (result_large_err) fired on the websocket origin-check callback whose error type is imposed by tungstenite's API
- Canvas overlays (minimap, zoom controls) no longer lag behind the pointer and rubber-band when the storyline panel's separator is dragged: their offset transition is suppressed for the duration of the drag, while edge-step opens and closes keep the shared easing
- Releases reach users again: the release pipeline had been failing since June - the version-consistency gate compared a stripped tag against the full manifest version so every rc tag failed its own check, and the MSI bundler rejects pre-release versions outright (Windows now ships the NSIS installer)

## [1.1.0] - 2026-07-31

### Added
- Canvas and timelines are cross-linked: hovering a node highlights its timeline mark and vice versa, and clicking a timeline mark selects the node (opening the preview at low zoom, like a canvas click) and zooms to it. Tags are also editable in the preview panel, which works at any zoom level
- Tags are editable on the card: a selected node's chips gain remove buttons and a "+ #" chip adds tags; tag nodes and tagged edges are a toggleable canvas layer, and all edge-filter toggles moved from the toolbar to a cluster on the canvas beside the content they filter
- MCP node tools understand metadata: create_node and update_node accept `date`, `date_end` (written as frontmatter, empty string clears), and `tags`; node reads expose the date fields directly so agents can build timelines without parsing YAML
- Storylines can be reordered by dragging their rows in the overview, with the same pointer-drag mechanism as node reordering (extracted into one shared composable); the order persists and the timelines lanes follow it. The overview also shortens above an open timelines sheet instead of overlapping it
- Node dates are editable in place: click the date chip (or "+ Set date" on a selected node) to set `date` and `date_end` without touching YAML; the timelines sheet also sizes itself to its lanes instead of always taking 45% of the window
- MCP connections can scope themselves to a specific workspace (`list_workspaces` / `set_workspace`), independent of the one open in the app, so several agents can work different workspaces in parallel; scoped changes stay off the user's undo stack
- MCP connection trust persists: approving a client issues a token (only its hash is stored) that the bridge saves and presents on reconnect, so app restarts no longer re-prompt; unauthenticated clients still get the approval dialog. Settings > Integrations shows the trusted-client count with a forget-all revoke
- Timelines view: a bottom sheet showing all storylines as horizontal lanes in their colors, opened with a bottom-edge push or the overview's timelines button; the graph stays visible above and the storyline overview can remain open beside it. Nodes with `date_end:` render as spanning bars, a from/to range fixes the axis window (persisted), axis labels adapt from years down to minutes, and hovering a bead or bar shows the node's rendered preview. Only dated nodes are placed, and large empty gaps between event clusters are abbreviated with axis breaks. Lanes have a fixed identity column beside a scrollable plot; storylines without a color get a stable hue from a colorblind-validated palette with separate dark-mode steps. Nodes with a `date:` frontmatter field (including BC dates like `date: 20 BC`) are placed on a shared time axis, undated nodes are interpolated between dated neighbours, nodes shared between storylines are joined by dashed connectors, and graph edges between timeline nodes are drawn as arcs; clicking a lane opens its reader
- Node cards show their tags as chips, and YAML frontmatter (OKF metadata) is hidden from rendered content instead of appearing as raw text
- Frontmatter is fully structured metadata now: every editor (inline, fullscreen, preview panel) shows only the note body and preserves the metadata header across edits, while the card surfaces OKF fields as chips — date/date range and lifecycle status alongside tags
- Open Knowledge Format (OKF v0.2) support: export any workspace as an OKF bundle (frontmatter documents grouped by node type, root index.md, wikilinks rewritten as Markdown links) from the workspace editor; files Nodus creates in a vault carry OKF frontmatter, and content write-backs preserve existing frontmatter blocks

### Changed
- The full wikilink sync on startup and workspace switch is incremental: nodes whose content hash is unchanged since their last sync are skipped without touching the filesystem or the edge table. Links to nodes that do not exist yet are recorded and become edges the moment a matching node is created or renamed, instead of waiting for a full re-scan
- Storylines are navigated in steps along the screen edges: right-edge pushes go deeper (overview, half-screen reader with the graph visible, full-screen reader) and left-edge pushes step back down to the graph. The overview keeps its expanded sections across these steps and the reader's contents sidebar sits on the right. All storyline layers slide over the canvas with transform animations on a shared easing curve, so the graph no longer reflows during transitions. Returning to the canvas also closes an unpinned overview; the toolbar book button pins it. The separator between panel and canvas is a visible drag handle and the chosen width persists across sessions
- Storyline panel is now an accordion: every storyline is a collapsible section, several can be open at once, and titles wrap to two lines instead of truncating; dropping a node onto a section adds it to that storyline
- Settings modal reorganized into six tabs: Zotero merged into Citations, and About/License moved into a collapsible section under General alongside Advanced

### Fixed
- The timelines sheet opens smoothly: it stays mounted with its height settled, so sliding up is a pure transform instead of a mount-render-resize stutter
- The reader genuinely stops above an open timelines sheet: an explicit height on its overlay was overriding the bottom offset, so the two overlapped
- The timelines sheet no longer opens from a glancing pass: the pointer must dwell at the bottom edge briefly (100ms) before it slides up
- Timelines now cover every dated node: nodes outside all storylines appear in a gray Unassigned lane; marks use the node's own color (solidified) with the storyline color as fallback; bead hovers drive the same hover tooltip as the canvas instead of a separate preview; and the sheet stays open alongside the overview and reader (the reader shortens to sit above it)
- Mermaid diagram labels render again: DOMPurify 3.4.12 empties foreignObject content (mXSS hardening), which blanked mermaid's HTML labels, so mermaid now renders native SVG text labels instead
- Storyline layers stay open while the pointer is inside them: auto-close on mouse-leave is gone (left-edge push or the book button steps back), and stepping deeper while a layer is open requires pressing against the very window edge so panel interaction near the border no longer skips ahead
- Canvas overlays (minimap, zoom controls, hover preview) shift left in sync with the storyline layers instead of being covered by or floating above them
- Clicking a storyline row opens the reader directly; expanding the item list moved to the row's chevron. Previously the reader was only reachable via a button that appeared on hover
- The right-edge hover reveal works regardless of canvas overlays: edge detection moved from an invisible hot-zone element to a capture-phase pointer listener
- The storyline panel closes again after clicking inside it; a focus guard meant for text inputs was keeping it open after any click
- Nodes created with content (e.g. via MCP create_node or the LLM agent) now get wikilink edges for their `[[links]]` immediately; previously edges only appeared after a later content edit (#45)
- Hashtags in initial node content are now extracted into tags on creation, matching the behavior of content edits
- Node content updates no longer rewrite vault files while folder sync is off. Write-back now requires a sync-enabled workspace whose vault contains the file; otherwise only the database changes (#43)
- Wikilink sync no longer creates a parallel edge when the node pair is already connected by a manual edge, in either direction (#43)
- Edges of trashed notes are excluded from edge queries, graph summaries, structure, and orphan detection, and the database orphan cleanup now removes them; ghost "Unknown" entries no longer appear in analytics (#44)
- Content updates resolve wikilinks through the backend resolver, so `[[folder/note]]` and `[[note#section]]` links create edges from every code path instead of being silently dropped and having their existing edges deleted (#45)
## [1.0.0] - 2026-07-20

First stable release. Consolidates the 0.7.0-rc.1 review remediation (backend
hardening, database integrity, LLM agent pipeline, edge port ordering) with the
port-cache fix below; edge routing is crossing-free across all styles.

### Fixed
- Edge ports are now assigned purely from the current layout on every render.
  A port-order cache populated on node click was never invalidated, so once a
  node was touched its edges' port order was pinned to that moment's layout and
  drifted back into crossings as the graph changed. Removing the cache makes the
  angle-based fan ordering the single source of truth.

### Removed
- Unused crossing-reduction subsystem (barycentric/greedy port reordering) that
  was reachable only through the removed port cache; the angle-based fan
  ordering supersedes it.

## [0.7.0-rc.1] - 2026-07-19

### Fixed
- Edge port ordering now sorts by angle, so hub edges fan correctly when
  neighbours are in a row (not only a column); left and right sides wind
  consistently and no longer cross before attaching
- Orthogonal edge routing no longer inverts fan nesting: the left/right hub
  fans that crossed before attaching are now clean (curved and direct routing
  are fully crossing-free; some orthogonal/diagonal fan cases remain)
- Edges follow the node live during drag/zoom while keeping their routed style
- Edge labels stay legible when zoomed out (counter-scaled, capped at 12px)
- MCP approval prompts no longer storm: rejected connections are no longer
  force-closed into a client reconnect loop
- Database integrity: migration that never ran now applies; edge de-duplication
  keeps distinct link types; positional storyline insert no longer violates the
  unique constraint; ontology import is transactional
- Backend security: workspace-vault containment on file moves, SSRF guards on
  HTTP/fetch, MCP WebSocket origin check, fail-fast database initialisation
- LLM agent pipeline: unreachable smart tools, premature completion, dropped
  Anthropic tool messages, and LaTeX-corrupting content cleaning
- Zotero import pagination, markdown code escaping, HiDPI drop position, and
  other library/UI correctness fixes

### Changed
- Unified edge port ordering into a single shared function across assignment,
  optimisation, and crossing reduction
- Deferred node/frame position writes to drag end; memoised viewport culling

### Removed
- Dead code: unused canvas composables and agent/Zotero helpers

## [0.5.0] - 2026-05-14

### Added
- Zoom mode setting: choose between "Scroll to Zoom" and "Pinch to Zoom"
- Pinch zoom momentum for smooth glide after releasing gesture
- Selection-aware AI tools (update, append, rename, color, delete selected nodes)
- Frame-to-frame collision detection and resolution
- Auto-organize nodes when resizing frames (pulls overlapping nodes inside)

### Changed
- Unified AI interface: removed NodeLLMBar, CanvasLLMBar handles all operations
- Selected nodes become both context AND targets for AI operations
- CanvasLLMBar shows selection badge and dynamic placeholder
- Frames hidden in neighborhood view mode

### Removed
- NodeLLMBar component (functionality merged into CanvasLLMBar)
- Organize frames button (now automatic on resize)

## [0.5.0-rc.1] - 2026-05-12

### Added
- Frame collision detection and layout improvements
- Toast notifications positioning above controls bar

### Fixed
- Flaky performance test threshold for CI

## [0.4.20-rc.1] - 2026-04-10

### Added
- Performance monitor for canvas operations
- Entity system: EntityPanel, EntityNodeCard, EntityCreatePopover, EntityBadge components
- Entity picker modal for quick entity linking
- Entity sidebar and summary section in StorylineReader/StorylinePanel
- Link to Entity submenu in context menu
- Entity store helpers for nodes and edges
- Citation fetch countdown with rate limit handling
- Display settings tab with font scale and threshold controls
- Reactive display settings store for live updates
- More starter content examples with colored nodes and directed edges

### Changed
- Consolidate settings into 4 tabs: General, Appearance, Canvas, Integrations
- Strip markdown formatting in magnifier for cleaner preview
- Apply font-scale CSS variable across all text elements
- Enhanced stripMarkdown to handle wikilinks, HTML, and math delimiters

### Fixed
- Neighborhood mode drag lag by removing transform transition
- Content preview for untitled nodes when zoomed out
- Blank nodes when zoomed out without title
- Neighbor-highlighted nodes position by removing scale transform
- Blurry text with native resolution node rendering and improved font smoothing
- Entity performance via memoized linked entities map
- Citation fetch rate limits with cacheOnly mode
- Font-scale initialization on app load
- Magnifier body text rendering with flex layout
- Dynamic MAGNIFIER_THRESHOLD via storage getter
- Context limit errors with prompt truncation

### Security
- Bump lodash from 4.17.23 to 4.18.1
- Bump vite from 6.4.1 to 6.4.2

## [0.4.19] - Previous Release

See git history for earlier changes.
