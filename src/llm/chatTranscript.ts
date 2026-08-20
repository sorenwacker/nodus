/**
 * Chat transcript for the agent bar.
 *
 * The visible record of an agent session: the prompts sent, the answers given
 * in full, and the actions taken during each answer. Distinct from the agent
 * log, which stays a diagnostic surface for errors.
 */

export type ChatTurnRole = 'user' | 'assistant'

export interface ChatTurn {
  id: string
  role: ChatTurnRole
  /** Message text, kept verbatim - answers are never truncated for display */
  text: string
  /** Tools invoked while producing this answer; empty for user turns */
  actions: string[]
  status: 'ok' | 'error'
}

let counter = 0

function nextId(): string {
  counter += 1
  return `turn-${counter}`
}

function makeTurn(role: ChatTurnRole, text: string): ChatTurn {
  return { id: nextId(), role, text, actions: [], status: 'ok' }
}

/**
 * The assistant turn currently being built, creating it if the last turn is
 * not already one. Actions recorded before any text arrives land here, so
 * they stay attached to the answer they belong to.
 */
function currentAssistantTurn(turns: ChatTurn[]): ChatTurn {
  const last = turns[turns.length - 1]
  if (last && last.role === 'assistant') return last
  const turn = makeTurn('assistant', '')
  turns.push(turn)
  return turn
}

/** Record a prompt the user sent */
export function appendUserTurn(turns: ChatTurn[], text: string): void {
  turns.push(makeTurn('user', text))
}

/**
 * Append assistant text to the current answer. Consecutive fragments merge
 * into one turn so a multi-step run reads as a single reply.
 */
export function appendAssistantText(turns: ChatTurn[], text: string): void {
  if (!text.trim()) return
  const turn = currentAssistantTurn(turns)
  turn.text = turn.text ? `${turn.text}\n\n${text}` : text
}

/** Note a tool the agent invoked while producing the current answer */
export function recordAction(turns: ChatTurn[], action: string): void {
  currentAssistantTurn(turns).actions.push(action)
}

/** Close the current answer as failed, so the transcript does not dangle */
export function failCurrentTurn(turns: ChatTurn[], message: string): void {
  const turn = currentAssistantTurn(turns)
  turn.status = 'error'
  turn.text = turn.text ? `${turn.text}\n\n${message}` : message
}
