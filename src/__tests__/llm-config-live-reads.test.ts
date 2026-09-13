/**
 * The model and context length a run reports follow the settings.
 *
 * Both were `computed` over a plain function call, which gives Vue no
 * dependency to invalidate: the first read was cached for the life of the
 * session. A user who changed model in settings went on being told, and went
 * on sending, the model that was configured when the canvas loaded
 * (PRODUCT_DESIGN.md > Reads that stay live).
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../lib/storage', () => ({
  llmStorage: {
    getSystemPrompt: (fallback: string) => fallback,
    setSystemPrompt: vi.fn(),
    getProvider: () => 'ollama',
    getProviderConfig: () => ({ model: 'model-one', contextLength: 4096 }),
    getPromptHistory: () => [],
    setPromptHistory: vi.fn(),
  },
}))

describe('the model a run reports', () => {
  it('follows a change made in settings', async () => {
    const { useLLM } = await import('../llm/useLLM')
    const { providerRegistry } = await import('../llm/providers')

    const llm = useLLM()
    expect(llm.model.value).toBe('model-one')
    expect(llm.contextLength.value).toBe(4096)

    // The user picks another model in settings
    providerRegistry.configureProvider('ollama', { model: 'model-two', contextLength: 8192 })

    expect(llm.model.value, 'the run would use the model configured at load').toBe('model-two')
    expect(llm.contextLength.value).toBe(8192)
  })
})
