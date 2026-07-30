import { describe, it, expect } from 'vitest'
import { moveItem } from '../composables/usePointerReorder'

describe('moveItem', () => {
  const list = ['a', 'b', 'c', 'd']

  it('moves an item up', () => {
    expect(moveItem(list, 2, 0)).toEqual(['c', 'a', 'b', 'd'])
  })

  it('moves an item down, adjusting for its own removal', () => {
    expect(moveItem(list, 0, 2)).toEqual(['b', 'a', 'c', 'd'])
  })

  it('moves an item to the end', () => {
    expect(moveItem(list, 0, 4)).toEqual(['b', 'c', 'd', 'a'])
  })

  it('does not mutate the input', () => {
    moveItem(list, 0, 3)
    expect(list).toEqual(['a', 'b', 'c', 'd'])
  })
})
