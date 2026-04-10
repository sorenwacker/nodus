/**
 * Tool Call Parser
 * Shared utility for extracting tool calls from raw LLM content
 */

export interface ParsedToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

/**
 * Extract tool calls from raw content when model outputs special tokens
 * Handles formats like:
 * - Qwen-style: <|channel|>commentary to=function_name <|constrain|>json<|message|>{"args"...}
 * - Plain JSON: {"name": "func", "arguments": {...}}
 */
export function extractToolCallsFromContent(content: string): ParsedToolCall[] {
  const toolCalls: ParsedToolCall[] = []

  // Pattern for Qwen-style tool calls: to=function_name ... <|message|>{json}
  const qwenPattern = /to=(\w+)[^{]*(\{[\s\S]*?\}(?=\s*(?:<\||$)))/g
  let match
  let idx = 0
  while ((match = qwenPattern.exec(content)) !== null) {
    const [, funcName, argsJson] = match
    try {
      JSON.parse(argsJson) // Validate JSON
      toolCalls.push({
        id: `call_${idx++}`,
        type: 'function',
        function: {
          name: funcName,
          arguments: argsJson,
        },
      })
    } catch {
      // Invalid JSON, skip
    }
  }

  // Also try to find plain JSON tool calls like {"name": "func", "arguments": {...}}
  if (toolCalls.length === 0) {
    const jsonPattern = /\{[^{}]*"name"\s*:\s*"(\w+)"[^{}]*"arguments"\s*:\s*(\{[^{}]*\})[^{}]*\}/g
    while ((match = jsonPattern.exec(content)) !== null) {
      const [, funcName, argsJson] = match
      try {
        JSON.parse(argsJson)
        toolCalls.push({
          id: `call_${idx++}`,
          type: 'function',
          function: {
            name: funcName,
            arguments: argsJson,
          },
        })
      } catch {
        // Invalid JSON, skip
      }
    }
  }

  return toolCalls
}

/**
 * Parse tool calls from Ollama's native format
 */
export function parseOllamaToolCalls(
  rawToolCalls: Array<{ function?: { name?: string; arguments?: unknown } }>
): ParsedToolCall[] {
  return rawToolCalls
    .filter((tc) => tc.function?.name)
    .map((tc, idx) => ({
      id: `call_${idx}`,
      type: 'function' as const,
      function: {
        name: tc.function!.name!,
        arguments: typeof tc.function!.arguments === 'string'
          ? tc.function!.arguments
          : JSON.stringify(tc.function!.arguments || {}),
      },
    }))
}

/**
 * Parse tool calls from OpenAI-compatible format
 */
export function parseOpenAIToolCalls(
  rawToolCalls: Array<{ id: string; function?: { name?: string; arguments?: string } }>
): ParsedToolCall[] {
  return rawToolCalls
    .filter((tc) => tc.function?.name)
    .map((tc) => ({
      id: tc.id,
      type: 'function' as const,
      function: {
        name: tc.function!.name!,
        arguments: tc.function!.arguments || '{}',
      },
    }))
}
