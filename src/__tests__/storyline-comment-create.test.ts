/**
 * A comment is created the same way from the storyline panel and the reader
 * (PRODUCT_DESIGN.md > Creating a comment).
 *
 * The panel dropped the type the user chose and wrote the raw text: no meta
 * header recorded the type, so a question or a todo was shown as a plain note,
 * and no anchor tied the comment to the passage it was about. The reader did
 * all of this in its own copy of the handler.
 */
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { useStorylineOperations } from '../composables/useStorylineOperations'
import { createCommentContent, parseCommentMeta } from '../composables/useCommentMeta'
import { commentAnchorTitle, anchorCommentInText } from '../lib/anchoredNodes'
import type { Node } from '../types'

function node(id: string, content: string): Node {
  return { id, title: id, node_type: 'note', markdown_content: content } as Node
}

function panelOperations(storylineNodes: Node[]) {
  const store = {
    nodes: storylineNodes,
    createNode: vi.fn(async (data: Record<string, unknown>) => ({ id: 'c1', ...data }) as unknown as Node),
    updateNodeContent: vi.fn().mockResolvedValue(undefined),
    addNodeToStoryline: vi.fn().mockResolvedValue(undefined),
  }
  const storylineService = { addNode: vi.fn().mockResolvedValue(undefined) }
  const ops = useStorylineOperations({
    store: store as never,
    storylineService: storylineService as never,
    selectedStorylineId: { value: 's1' },
    storylineNodes: () => storylineNodes,
  } as never)
  return { ops, store, storylineService }
}

describe('creating a comment from the storyline panel', () => {
  const text = 'Is the quota confirmed?'

  it('records the type the user chose in the comment', async () => {
    const { ops, store } = panelOperations([node('a', 'First passage.'), node('b', 'Second.')])

    await ops.handleCommentCreate(1, text, 'question')

    const created = store.createNode.mock.calls[0][0] as { markdown_content: string; node_type: string }
    expect(created.node_type).toBe('comment')
    expect(created.markdown_content).toBe(createCommentContent(text, 'question'))
    expect(parseCommentMeta(created.markdown_content).meta.type).toBe('question')
  })

  it('anchors the comment in the passage before it', async () => {
    const { ops, store, storylineService } = panelOperations([node('a', 'First passage.'), node('b', 'Second.')])
    const title = commentAnchorTitle(text, ['a', 'b'])

    await ops.handleCommentCreate(1, text, 'question')

    expect((store.createNode.mock.calls[0][0] as { title: string }).title).toBe(title)
    expect(store.updateNodeContent).toHaveBeenCalledWith('a', anchorCommentInText('First passage.', title))
    expect(storylineService.addNode).toHaveBeenCalledWith('s1', 'c1', 1)
  })
})

describe('the reader', () => {
  it('creates comments through the same implementation as the panel', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/components/StorylineReader.vue'), 'utf8')
    expect(source).toContain('createStorylineComment(')
    expect(source).not.toContain('createCommentContent(')
  })
})
