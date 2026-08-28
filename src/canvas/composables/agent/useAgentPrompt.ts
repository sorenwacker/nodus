/**
 * Sending a prompt to the agent, and fixing what the run acts on.
 *
 * A run acts on the nodes that were selected when the user asked. Reading the
 * live selection instead let a click made while the model was still thinking
 * redirect the change to a node the user never named, overwriting its content
 * (PRODUCT_DESIGN.md > What the agent acts on).
 *
 * Composed before the agent's tools, which read `runSelection`; the runner is
 * referenced lazily inside `run`, so it need not exist at that point.
 */
import { ref, type Ref } from 'vue'

export interface AgentPromptContext {
  /** The text box the user types into */
  prompt: Ref<string>
  /** True while a run is in flight, so a second run cannot start */
  isLoading: Ref<boolean>
  /** The selection as it is right now */
  getSelectedNodeIds: () => string[]
  savePromptToHistory: (prompt: string) => void
  run: (prompt: string) => Promise<{ status: string } | undefined>
  /** How a failure reaches the user */
  reportError: (message: string) => void
}

export function useAgentPrompt(ctx: AgentPromptContext) {
  /**
   * The selection the current run started with, or null when none is running.
   * Read by the agent's tool store in place of the live selection.
   */
  const runSelection = ref<string[] | null>(null)

  async function sendPrompt(): Promise<void> {
    if (!ctx.prompt.value.trim() || ctx.isLoading.value) return

    const prompt = ctx.prompt.value.trim()
    ctx.savePromptToHistory(prompt)

    ctx.isLoading.value = true
    runSelection.value = [...ctx.getSelectedNodeIds()]

    let result: { status: string } | undefined
    try {
      result = await ctx.run(prompt)
      ctx.prompt.value = ''
    } catch (e) {
      ctx.reportError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      ctx.isLoading.value = false
      // Held while the run is paused for approval: the resumed execution is the
      // same run and must act on the same nodes. Released once it truly ends.
      if (result?.status !== 'paused') {
        runSelection.value = null
      }
    }
  }

  return { sendPrompt, runSelection }
}
