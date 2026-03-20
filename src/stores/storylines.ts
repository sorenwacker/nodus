import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { invoke } from '../lib/tauri'
import { storeLogger } from '../lib/logger'
import type { Storyline, CreateStorylineInput, Node, Edge } from '../types'

export interface StorylineStoreDeps {
  getCurrentWorkspaceId: () => string | null
  getEdges: () => Edge[]
  getNodes: () => Node[]
  createEdge: (data: { source_node_id: string; target_node_id: string; link_type: string; color?: string; storyline_id?: string }) => Promise<Edge>
  deleteEdge: (id: string) => Promise<void>
}

export const useStorylinesStore = defineStore('storylines', () => {
  // State
  const storylines = ref<Storyline[]>([])
  const storylineNodes = ref<Map<string, string[]>>(new Map())
  const storylineNodesVersion = ref(0)

  // Dependencies - set via initialize
  let deps: StorylineStoreDeps | null = null

  function setDependencies(d: StorylineStoreDeps) {
    deps = d
  }

  // Computed
  const filteredStorylines = computed(() => {
    if (!deps) return storylines.value
    const workspaceId = deps.getCurrentWorkspaceId()
    return storylines.value.filter(s =>
      s.workspace_id === workspaceId || (!s.workspace_id && !workspaceId)
    )
  })

  // Load storylines for current workspace
  async function loadStorylines(): Promise<void> {
    if (!deps) return
    try {
      const fetched = await invoke<Storyline[]>('get_storylines', {
        workspaceId: deps.getCurrentWorkspaceId()
      })
      storylines.value = fetched
      storeLogger.debug(`Loaded ${fetched.length} storylines`)

      const newMap = new Map<string, string[]>()
      for (const storyline of fetched) {
        try {
          const nodeData = await invoke<{ id: string }[]>('get_storyline_nodes', {
            storylineId: storyline.id
          })
          newMap.set(storyline.id, nodeData.map(n => n.id))
        } catch {
          newMap.set(storyline.id, [])
        }
      }
      storylineNodes.value = newMap
      storylineNodesVersion.value++
    } catch (e) {
      storeLogger.error('Failed to load storylines:', e)
    }
  }

  async function createStoryline(title: string, description?: string, color?: string): Promise<Storyline> {
    if (!deps) throw new Error('Storylines store not initialized')
    const input: CreateStorylineInput = {
      title,
      description,
      color,
      workspace_id: deps.getCurrentWorkspaceId() || undefined,
    }

    try {
      const storyline = await invoke<Storyline>('create_storyline', { input })
      storylines.value.push(storyline)
      storylineNodes.value.set(storyline.id, [])
      storeLogger.info(`Created storyline: ${title}`)
      return storyline
    } catch (e) {
      storeLogger.error('Failed to create storyline:', e)
      throw e
    }
  }

  async function updateStoryline(id: string, title: string, description?: string, color?: string): Promise<void> {
    try {
      await invoke('update_storyline', { id, title, description, color })
      const storyline = storylines.value.find(s => s.id === id)
      if (storyline) {
        storyline.title = title
        storyline.description = description || null
        storyline.color = color || null
        storyline.updated_at = Date.now()
      }
    } catch (e) {
      storeLogger.error('Failed to update storyline:', e)
      throw e
    }
  }

  async function deleteStoryline(id: string): Promise<void> {
    try {
      await invoke('delete_storyline', { id })
      storylines.value = storylines.value.filter(s => s.id !== id)
      storylineNodes.value.delete(id)
      storeLogger.info(`Deleted storyline: ${id}`)
    } catch (e) {
      storeLogger.error('Failed to delete storyline:', e)
      throw e
    }
  }

  async function addNodeToStoryline(storylineId: string, nodeId: string, position?: number): Promise<void> {
    if (!deps) throw new Error('Storylines store not initialized')
    try {
      await invoke('add_node_to_storyline', { storylineId, nodeId, position })

      const storyline = storylines.value.find(s => s.id === storylineId)
      const edgeColor = storyline?.color || undefined

      const nodeIds = [...(storylineNodes.value.get(storylineId) || [])]
      const insertPosition = position ?? nodeIds.length

      // If inserting in middle, delete old edge between prev and next
      if (position !== undefined && position > 0 && position < nodeIds.length) {
        const prevNodeId = nodeIds[position - 1]
        const nextNodeId = nodeIds[position]
        const oldEdge = deps.getEdges().find(
          e => e.storyline_id === storylineId &&
               ((e.source_node_id === prevNodeId && e.target_node_id === nextNodeId) ||
                (e.source_node_id === nextNodeId && e.target_node_id === prevNodeId))
        )
        if (oldEdge) {
          await deps.deleteEdge(oldEdge.id)
        }
      }

      // Create edge from previous node
      if (insertPosition > 0) {
        const prevNodeId = nodeIds[insertPosition - 1]
        const edgeExists = deps.getEdges().some(
          e => (e.source_node_id === prevNodeId && e.target_node_id === nodeId) ||
               (e.source_node_id === nodeId && e.target_node_id === prevNodeId)
        )
        if (!edgeExists) {
          await deps.createEdge({ source_node_id: prevNodeId, target_node_id: nodeId, link_type: 'related', color: edgeColor, storyline_id: storylineId })
        }
      }

      // If inserting in middle, create edge to next node
      if (position !== undefined && position < nodeIds.length) {
        const nextNodeId = nodeIds[position]
        const edgeExists = deps.getEdges().some(
          e => (e.source_node_id === nodeId && e.target_node_id === nextNodeId) ||
               (e.source_node_id === nextNodeId && e.target_node_id === nodeId)
        )
        if (!edgeExists) {
          await deps.createEdge({ source_node_id: nodeId, target_node_id: nextNodeId, link_type: 'related', color: edgeColor, storyline_id: storylineId })
        }
      }

      // Update local cache
      if (position !== undefined) {
        nodeIds.splice(position, 0, nodeId)
      } else {
        nodeIds.push(nodeId)
      }

      const newMap = new Map(storylineNodes.value)
      newMap.set(storylineId, nodeIds)
      storylineNodes.value = newMap
      storeLogger.debug(`Added node ${nodeId} to storyline ${storylineId}`)
    } catch (e) {
      storeLogger.error('Failed to add node to storyline:', e)
      throw e
    }
  }

  async function removeNodeFromStoryline(storylineId: string, nodeId: string): Promise<void> {
    if (!deps) throw new Error('Storylines store not initialized')
    try {
      const nodeIds = storylineNodes.value.get(storylineId) || []
      const nodeIndex = nodeIds.indexOf(nodeId)

      const storyline = storylines.value.find(s => s.id === storylineId)
      const edgeColor = storyline?.color || undefined

      // Delete edges belonging to this storyline that involve this node
      const storylineEdges = deps.getEdges().filter(
        e => e.storyline_id === storylineId &&
             (e.source_node_id === nodeId || e.target_node_id === nodeId)
      )
      for (const edge of storylineEdges) {
        await deps.deleteEdge(edge.id)
      }

      // If node was in the middle, reconnect prev and next
      if (nodeIndex > 0 && nodeIndex < nodeIds.length - 1) {
        const prevNodeId = nodeIds[nodeIndex - 1]
        const nextNodeId = nodeIds[nodeIndex + 1]
        const edgeExists = deps.getEdges().some(
          e => (e.source_node_id === prevNodeId && e.target_node_id === nextNodeId) ||
               (e.source_node_id === nextNodeId && e.target_node_id === prevNodeId)
        )
        if (!edgeExists) {
          await deps.createEdge({ source_node_id: prevNodeId, target_node_id: nextNodeId, link_type: 'related', color: edgeColor, storyline_id: storylineId })
        }
      }

      await invoke('remove_node_from_storyline', { storylineId, nodeId })

      const newMap = new Map(storylineNodes.value)
      newMap.set(storylineId, nodeIds.filter(id => id !== nodeId))
      storylineNodes.value = newMap
      storeLogger.debug(`Removed node ${nodeId} from storyline ${storylineId}`)
    } catch (e) {
      storeLogger.error('Failed to remove node from storyline:', e)
      throw e
    }
  }

  async function reorderStorylineNodes(storylineId: string, nodeIds: string[]): Promise<void> {
    if (!deps) throw new Error('Storylines store not initialized')
    try {
      // Update local state first
      const newMap = new Map(storylineNodes.value)
      newMap.set(storylineId, [...nodeIds])
      storylineNodes.value = newMap
      storylineNodesVersion.value++

      await invoke('reorder_storyline_nodes', { storylineId, nodeIds })

      const storyline = storylines.value.find(s => s.id === storylineId)
      const edgeColor = storyline?.color || undefined

      // Delete all old edges belonging to this storyline
      const oldStorylineEdges = deps.getEdges().filter(e => e.storyline_id === storylineId)
      for (const edge of oldStorylineEdges) {
        await deps.deleteEdge(edge.id)
      }

      // Create edges between consecutive nodes
      for (let i = 0; i < nodeIds.length - 1; i++) {
        await deps.createEdge({ source_node_id: nodeIds[i], target_node_id: nodeIds[i + 1], link_type: 'related', color: edgeColor, storyline_id: storylineId })
      }

      storeLogger.debug(`Reordered nodes in storyline ${storylineId}`)
    } catch (e) {
      storeLogger.error('Failed to reorder storyline nodes:', e)
      throw e
    }
  }

  async function getStorylineNodes(storylineId: string): Promise<Node[]> {
    try {
      const nodeData = await invoke<Node[]>('get_storyline_nodes', { storylineId })
      const newMap = new Map(storylineNodes.value)
      newMap.set(storylineId, nodeData.map(n => n.id))
      storylineNodes.value = newMap
      storylineNodesVersion.value++
      await repairStorylineEdges(storylineId)
      return nodeData
    } catch (e) {
      storeLogger.error('Failed to get storyline nodes:', e)
      throw e
    }
  }

  function getStorylinesForNode(nodeId: string): Storyline[] {
    return storylines.value.filter(s => {
      const nodeIds = storylineNodes.value.get(s.id)
      return nodeIds?.includes(nodeId)
    })
  }

  async function repairStorylineEdges(storylineId: string): Promise<void> {
    if (!deps) return
    try {
      const nodeIds = storylineNodes.value.get(storylineId) || []
      if (nodeIds.length < 2) return

      const storyline = storylines.value.find(s => s.id === storylineId)
      const edgeColor = storyline?.color || undefined

      const expectedPairs = new Set<string>()
      for (let i = 0; i < nodeIds.length - 1; i++) {
        const pair = [nodeIds[i], nodeIds[i + 1]].sort().join(':')
        expectedPairs.add(pair)
      }

      // Delete orphan edges
      const storylineEdges = deps.getEdges().filter(e => e.storyline_id === storylineId)
      for (const edge of storylineEdges) {
        const pair = [edge.source_node_id, edge.target_node_id].sort().join(':')
        if (!expectedPairs.has(pair)) {
          await deps.deleteEdge(edge.id)
          storeLogger.debug(`Deleted orphan storyline edge ${edge.id}`)
        }
      }

      // Create missing edges
      for (let i = 0; i < nodeIds.length - 1; i++) {
        const sourceId = nodeIds[i]
        const targetId = nodeIds[i + 1]
        const edgeExists = deps.getEdges().some(
          e => e.storyline_id === storylineId &&
               ((e.source_node_id === sourceId && e.target_node_id === targetId) ||
                (e.source_node_id === targetId && e.target_node_id === sourceId))
        )
        if (!edgeExists) {
          await deps.createEdge({ source_node_id: sourceId, target_node_id: targetId, link_type: 'related', color: edgeColor, storyline_id: storylineId })
          storeLogger.debug(`Created missing storyline edge ${sourceId} -> ${targetId}`)
        }
      }
    } catch (e) {
      storeLogger.error('Failed to repair storyline edges:', e)
    }
  }

  async function updateStorylineEdgeColors(storylineId: string, color: string | null): Promise<void> {
    if (!deps) return
    const edges = deps.getEdges().filter(e => e.storyline_id === storylineId)
    for (const edge of edges) {
      edge.color = color
      try {
        await invoke('update_edge_color', { id: edge.id, color })
      } catch (e) {
        storeLogger.error(`Failed to update edge color for ${edge.id}:`, e)
      }
    }
  }

  return {
    // State
    storylines,
    storylineNodes,
    storylineNodesVersion,

    // Computed
    filteredStorylines,

    // Methods
    setDependencies,
    loadStorylines,
    createStoryline,
    updateStoryline,
    deleteStoryline,
    addNodeToStoryline,
    removeNodeFromStoryline,
    reorderStorylineNodes,
    getStorylineNodes,
    getStorylinesForNode,
    repairStorylineEdges,
    updateStorylineEdgeColors,
  }
})

export type { Storyline }
