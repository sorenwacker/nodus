/**
 * LLM-based math formatter.
 *
 * Rewrites the math in a note as Typst math syntax so it renders via the Typst
 * engine (see composables/useTypst.ts). The model is given the Typst syntax it
 * must target, because it cannot be assumed to know Typst (as opposed to the far
 * more common LaTeX). This replaces the earlier regex converter, which only
 * handled a fixed symbol set and failed on anything outside it.
 */

/** Reference of the Typst math syntax the model must produce. */
export const TYPST_MATH_FORMAT = `Typst math syntax:
- Fraction: a/b or frac(a, b)            (LaTeX \\frac{a}{b})
- Square root: sqrt(x), root(n, x)       (LaTeX \\sqrt{x}, \\sqrt[n]{x})
- Subscript / superscript: x_1, x_(i+1), x^2, x^(n+1)
- Sum / integral / product: sum_(i=0)^n i, integral_0^1 f(x) dif x, product_(i=1)^n
- Greek letters: alpha, beta, gamma, delta   (LaTeX \\alpha, ...)
- Accents: hat(x), arrow(x), overline(x), dot(x)
- Operators: times, dot, <=, >=, ->, in, subset   (LaTeX \\times, \\leq, \\rightarrow, \\in)
- Matrix: mat(1, 2; 3, 4)    Column vector: vec(x, y, z)
- Text inside math: "word"   (LaTeX \\text{word})    Bold: bold(v)   Blackboard: bb(R)`

/** System prompt instructing the model to convert a note's math to Typst. */
export const TYPST_FORMAT_SYSTEM_PROMPT = `You reformat the mathematics in a note so it uses Typst math syntax.

Rewrite every mathematical expression using Typst syntax and wrap it in math
delimiters: $...$ for inline math and $$...$$ for display (block) math. Leave all
non-mathematical text, markdown structure, code blocks, and already-correct Typst
math unchanged.

${TYPST_MATH_FORMAT}

Rules:
- Output ONLY the full note content with math converted. No explanations, no commentary, no code fences.
- Change only mathematical notation; preserve everything else exactly.
- If the note contains no math, return it unchanged.`

/** Remove a single surrounding markdown code fence, if the model added one. */
function stripCodeFence(text: string): string {
  const trimmed = text.trim()
  const match = trimmed.match(/^```[a-zA-Z]*\n([\s\S]*?)\n```$/)
  return match ? match[1] : trimmed
}

/**
 * Reformat the math in `content` to Typst syntax using the language model.
 *
 * @param content Note content that may contain LaTeX or other math notation.
 * @param generate Function that runs an LLM completion (prompt, system) and
 *   returns the model's text (e.g. `llmQueue.generate`).
 * @returns The content with math rewritten as Typst. Returns the original
 *   content unchanged when it is empty or the model returns nothing usable, so a
 *   failed call never destroys the note.
 */
export async function formatMathToTypst(
  content: string,
  generate: (prompt: string, system?: string) => Promise<string>
): Promise<string> {
  if (!content.trim()) return content

  const response = await generate(content, TYPST_FORMAT_SYSTEM_PROMPT)
  const cleaned = stripCodeFence(response ?? '')
  return cleaned.length > 0 ? cleaned : content
}
