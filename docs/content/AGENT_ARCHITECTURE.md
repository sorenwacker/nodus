# Agent Architecture

Nodus runs an LLM agent against the graph. This page describes the system it
sits in, the loop it executes, and the three memories that feed its prompt.

## The agentic system

```mermaid
flowchart TB
    subgraph UI["Agent panel (canvas left edge)"]
        Prompt[Prompt input]
        Transcript[Chat transcript]
        Log[Activity log<br/>errors and diagnostics]
        Tasks[Task list]
    end

    subgraph Runner["Agent runner"]
        Mode{Mode<br/>explore / plan / execute}
        Loop[Iteration loop]
        Parse[Tool-call extraction<br/>native + text fallbacks]
    end

    subgraph Context["Prompt context"]
        Sys[System prompt]
        Mem[Session / Stack / Facts memory]
        Nodes[Selected nodes,<br/>or the whole filtered graph]
        Hist[Last 3 exchanges]
    end

    subgraph Exec["Execution"]
        Queue[LLM queue<br/>serialised, cancellable, retrying]
        Provider[Provider adapter<br/>Ollama / OpenAI / Anthropic / compatible]
        Tools[Tool executor]
    end

    subgraph State["Application state"]
        Stores[Pinia stores<br/>nodes, edges, frames, storylines]
        DB[(SQLite)]
        Files[(Markdown vault)]
    end

    Prompt --> Runner
    Mode --> Loop
    Context --> Queue
    Loop --> Queue
    Queue --> Provider
    Provider --> Parse
    Parse --> Loop
    Loop --> Tools
    Tools --> Stores
    Stores --> DB
    Stores --> Files
    Tools -->|result| Loop
    Loop --> Transcript
    Loop --> Log
    Loop --> Tasks
    Mem --> Sys
    Sys --> Context
    Stores --> Nodes

    MCP[External agents<br/>via MCP server] --> Stores
```

The same capabilities are reachable from both the in-app agent and the MCP
server; a gate test fails when one surface gains a tool, or a field of a
shared tool, that the other lacks.

## The execution loop

```mermaid
flowchart TB
    Start([User sends a prompt]) --> Enhance[Enhance prompt<br/>+ push user turn to transcript]
    Enhance --> Build[Build messages:<br/>system prompt + memory + graph context<br/>+ last 3 exchanges]
    Build --> Pin[Pin those messages<br/>so pruning cannot drop them]
    Pin --> Iter{Iteration < mode cap?<br/>explore/plan 200, execute 500}

    Iter -->|no| Stop([Stop: cap reached])
    Iter -->|yes| Prune{Every 10th<br/>iteration?}
    Prune -->|yes| DoPrune[Prune to the last 6 messages<br/>keeping pinned ones]
    Prune -->|no| Call
    DoPrune --> Call[Queue the request<br/>tools filtered by mode]

    Call --> Provider[Provider call<br/>retry with backoff]
    Provider -->|token limit| Limit([Stop: context too large<br/>reported in transcript and log])
    Provider --> Reply{Reply shape?}

    Reply -->|native tool_calls| Run[Execute each tool]
    Reply -->|text containing<br/>JSON fence, python_tag,<br/>channel marker or raw JSON| Extract[Extract the embedded call]
    Extract --> Run
    Reply -->|plain text| Say[Append the answer<br/>to the transcript in full]
    Say --> Iter

    Run --> Record[Record the tool in the turn's<br/>action list; append result]
    Record --> Marker{Result marker?}

    Marker -->|AGENT_DONE| Done([Done: summary becomes<br/>the assistant turn])
    Marker -->|CREATE_PLAN| Plan[Plan created] --> Iter
    Marker -->|approval requested| Pause[Pause, save the iteration]
    Marker -->|none| Iter

    Pause --> Decide{User decides}
    Decide -->|approve| Resume[Resume from the saved iteration] --> Iter
    Decide -->|reject| Revise[Feed the rejection back] --> Iter

    Err[Any error] --> Fail([Fail: message closes the<br/>current turn, log opens])
```

### Loop details

| Concern | Behavior |
|---------|----------|
| Modes | `explore` (read-only), `plan` (design for approval), `execute` (mutate). The mode filters which tools are offered, so a read-only run cannot write |
| Iteration cap | 200 for explore and plan, 500 for execute; reaching it stops the run rather than looping forever |
| Serialisation | Every model call goes through one queue, so concurrent runs cannot interleave writes; the queue is cancellable, which is what the stop button uses |
| Retry | Transient provider failures retry with backoff; a context-length error is not retried but reported, since repeating it cannot help |
| Context pruning | Every 10th iteration the message list is pruned to the last 6, keeping the pinned prompt and graph context |
| Tool-call fallbacks | Models without native tool calling emit calls inside text; the runner extracts them from JSON fences, `python_tag` and channel markers, or a bare JSON object |
| Generation guard | Each run increments a generation counter, so a late reply from a cancelled run cannot mutate the graph |
| Visible output | Answers land in the transcript in full; tool names collapse into a per-turn action list; errors open the log panel |

## The three memories

The system prompt is assembled from three memories with different lifetimes.

```mermaid
flowchart TB
    subgraph Memory
        Session[Session<br/>goal, progress, steps]
        Stack[Stack<br/>LIFO task queue]
        Facts[Facts<br/>long-term knowledge]
    end

    Session --> SP[System Prompt]
    Stack --> SP
    Facts --> SP
    SP --> Agent[Agent Runner]
```

## Session Memory

Tracks current goal and progress. Cleared on completion.

| Field | Description |
|-------|-------------|
| `goal` | What the user asked for |
| `progress` | 0-100% |
| `completed` | Actions done |
| `current_step` | Current work |
| `next_steps` | Upcoming work |
| `blockers` | Issues |

## Stack Memory

LIFO todo queue. Persists across refresh.

| Field | Description |
|-------|-------------|
| `id` | Unique identifier |
| `description` | Task description |
| `priority` | high/medium/low |
| `context` | Optional data |

## Facts Memory

Long-term knowledge (up to 50 per workspace).

## Tools

### Session

| Tool | Parameters |
|------|------------|
| `set_goal` | `goal`, `steps?` |
| `update_progress` | `progress`, `completed_action?` |
| `complete_goal` | `summary` |

### Stack

| Tool | Parameters |
|------|------------|
| `push_task` | `description`, `priority?`, `context?` |
| `pop_task` | - |
| `peek_stack` | - |
| `clear_stack` | - |

### Facts

| Tool | Parameters |
|------|------------|
| `remember` | `message` |

## Storage Keys

| Type | Key |
|------|-----|
| Session | `nodus_agent_session_{workspaceId}` |
| Stack | `nodus_agent_stack_{workspaceId}` |
| Facts | `nodus_memories_{workspaceId}` |

## Files

- `src/llm/types.ts` - Type definitions
- `src/lib/storage.ts` - Storage functions
- `src/llm/tools/planningTools.ts` - Tool registrations
- `src/canvas/composables/agent/useLLMTools.ts` - Tool handlers
- `src/canvas/composables/agent/systemPrompt.ts` - Prompt builder
