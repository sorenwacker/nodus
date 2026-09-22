/**
 * Node-edit tools, used by the node agent on the note it is editing:
 * update_content, append_content, update_title, format_math, node_done.
 *
 * The note arrives as the `nodeDraft` context service, which the node agent
 * composes per run; `node_done` ends the run with a typed signal
 * (PRODUCT_DESIGN.md > Tool signals).
 */

import { defineTool } from '../registry'
import { formatMathToTypst } from '../typstFormat'

export function registerNodeEditTools(): void {
  defineTool<{ content: string }>(
    'update_content',
    'Update the note content with new text. THIS SAVES YOUR WORK.',
    {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'New content for the note (markdown)' },
      },
      required: ['content'],
    },
    async (args, ctx) => {
      const content = args.content ?? ''
      await ctx.nodeDraft!.updateContent(content)
      ctx.log(`  Updated content (${content.length} chars)`)
      return 'Content updated and saved'
    },
    { modes: ['node'], mutates: true, requires: ['nodeDraft'] }
  )

  defineTool<{ text: string }>(
    'append_content',
    'Append text to the end of the note.',
    {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to append' },
      },
      required: ['text'],
    },
    async (args, ctx) => {
      const draft = ctx.nodeDraft!
      await draft.updateContent(draft.content + '\n' + (args.text ?? ''))
      ctx.log('  Appended text')
      return 'Text appended and saved'
    },
    { modes: ['node'], mutates: true, requires: ['nodeDraft'] }
  )

  defineTool<{ title: string }>(
    'update_title',
    'Change the note title.',
    {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'New title' },
      },
      required: ['title'],
    },
    async (args, ctx) => {
      const title = args.title ?? ''
      await ctx.nodeDraft!.updateTitle(title)
      ctx.log(`  Title: ${title}`)
      return `Title changed to "${title}"`
    },
    { modes: ['node'], mutates: true, requires: ['nodeDraft'] }
  )

  defineTool<Record<string, never>>(
    'format_math',
    'Reformat the math in the note to Typst syntax using the model. Use this when the note contains LaTeX (like \\frac{a}{b} or \\alpha) or other non-Typst math that should render correctly.',
    {
      type: 'object',
      properties: {},
      required: [],
    },
    async (_args, ctx) => {
      const draft = ctx.nodeDraft!
      const original = draft.content
      ctx.log('  Formatting math to Typst...')
      const formatted = await formatMathToTypst(original, (p, s) => ctx.llm!.generate(p, s))
      if (formatted === original) {
        ctx.log('  Math already in Typst format')
        return 'Math already in Typst format (content unchanged)'
      }
      await draft.updateContent(formatted)
      ctx.log(`  Formatted math to Typst (${formatted.length} chars)`)
      return 'Math reformatted to Typst and saved'
    },
    { modes: ['node'], mutates: true, requires: ['nodeDraft', 'llm'] }
  )

  // Node-specific done tool with content validation
  // This is separate from the graph agent's done() which checks for edges
  defineTool<{ summary: string }>(
    'node_done',
    'Signal that the node editing task is complete. You MUST call update_content first.',
    {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Brief summary of what was done' },
      },
      required: ['summary'],
    },
    async (args, ctx) => {
      if (!ctx.nodeDraft!.saved) {
        ctx.log('  WARNING: No content saved yet!')
        return `REJECTED: You cannot call node_done() yet because you have not saved any content to the note.

YOUR NEXT STEP: Call update_content with your answer. Example:
update_content("# Pi\\n\\nPi (\\u03c0) is a mathematical constant equal to approximately 3.14159...")

After update_content succeeds, then you may call node_done().`
      }
      const summary = args.summary || 'Done'
      ctx.log(`> Done: ${summary}`)
      return { text: summary, signal: 'node_done' }
    },
    { modes: ['node'], mutates: false, requires: ['nodeDraft'] }
  )
}
