
"use client";

import type { Mindmap, CreateMindmapInput, NodeData, NodesObject, EditNodeInput } from '@/types/mindmap';
import { useState, useEffect, useCallback }
from 'react';
import { getMindmapsFromStorage, saveMindmapsToStorage } from '@/lib/localStorage';
import { v4 as uuidv4 } from 'uuid';

// Moved constants inside the hook as per previous fix for initialization errors
export function useMindmaps() {
  const NODE_CARD_WIDTH = 300;
  const LOGICAL_CANVAS_WIDTH_FOR_FIRST_ROOT = 5000; // As per v0.0.3 logical canvas
  const Y_OFFSET_FOR_FIRST_ROOT = 100;
  const ROOT_X_SPACING = NODE_CARD_WIDTH + 50;
  const CHILD_X_OFFSET = 0;
  const CHILD_Y_OFFSET = 180; // Includes approx node height + spacing


  const getApproxNodeHeight = useCallback((node: Partial<NodeData> | null): number => {
    if (!node) return 120; // Default height if no node data
    let height = 20; // Base padding (top+bottom for content)

    // Header height (title + buttons)
    height += 40; // Approximate height for header (py-2 + button heights)

    if (node.title) {
      const titleCharsPerLine = Math.max(1, (NODE_CARD_WIDTH - 2 * 16 - (node.emoji ? 32 : 0) - 70 /* buttons space */) / 9); // Avg char width ~9px for text-lg
      const titleLines = Math.ceil((node.title.length / titleCharsPerLine)) + (node.title.split('\n').length -1);
      height += Math.max(28, titleLines * 28); // text-lg line height ~28px
    } else {
      height += 28; // Minimum for one line of title
    }

    // Description box base padding (py-3)
    height += 24;

    if (node.description && node.description.trim() !== "") {
      const descCharsPerLine = Math.max(1, (NODE_CARD_WIDTH - 2 * 16) / 7); // Avg char width ~7px for text-sm
      const descLines = Math.ceil((node.description.length / descCharsPerLine)) + (node.description.split('\n').length -1);
      height += Math.max(20, descLines * 20); // text-sm line height ~20px
    } else {
       height += 20; // Minimum height for description area even if empty
    }
    return Math.max(90, height); // Ensure a minimum functional height
  }, [NODE_CARD_WIDTH]);


  const [mindmaps, setMindmaps] = useState<Mindmap[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadedMindmaps = getMindmapsFromStorage();
    setMindmaps(loadedMindmaps.map(m => {
      const migratedNodes: NodesObject = {};
      let nextRootX = (LOGICAL_CANVAS_WIDTH_FOR_FIRST_ROOT / 2) - (NODE_CARD_WIDTH / 2) + ROOT_X_SPACING;

      const rootsToProcess = Array.isArray(m.data.rootNodeIds) ? [...m.data.rootNodeIds] : [];
      
      const assignPositions = (nodeId: string, parentNode?: NodeData, siblingIndex: number = 0, isFirstRootOfMap: boolean = false) => {
        const node = m.data.nodes[nodeId];
        if (!node) return;

        let x, y;
        if (node.x === undefined || node.y === undefined) {
          if (parentNode) { 
            const parentX = parentNode.x ?? (LOGICAL_CANVAS_WIDTH_FOR_FIRST_ROOT / 2) - (NODE_CARD_WIDTH / 2);
            const parentY = parentNode.y ?? Y_OFFSET_FOR_FIRST_ROOT;
            const parentNodeHeight = getApproxNodeHeight(parentNode);
            
            y = parentY + parentNodeHeight + CHILD_Y_OFFSET;
            
            const childrenCount = parentNode.childIds?.length || 0;
            if (childrenCount > 1) {
                const totalWidthOfChildren = childrenCount * NODE_CARD_WIDTH + (childrenCount -1) * 30;
                const startX = parentX + (NODE_CARD_WIDTH / 2) - (totalWidthOfChildren / 2);
                x = startX + siblingIndex * (NODE_CARD_WIDTH + 30);
            } else { // handles 0 or 1 child
                x = parentX + CHILD_X_OFFSET;
            }
          } else { 
            if (isFirstRootOfMap) {
                x = (LOGICAL_CANVAS_WIDTH_FOR_FIRST_ROOT / 2) - (NODE_CARD_WIDTH / 2);
                y = Y_OFFSET_FOR_FIRST_ROOT;
            } else {
                x = nextRootX;
                y = Y_OFFSET_FOR_FIRST_ROOT; 
                nextRootX += ROOT_X_SPACING;
            }
          }
          migratedNodes[nodeId] = { ...node, x, y };
        } else {
          migratedNodes[nodeId] = { ...node };
          if (!parentNode && node.x !== undefined && node.x >= nextRootX && node.x !== ((LOGICAL_CANVAS_WIDTH_FOR_FIRST_ROOT / 2) - (NODE_CARD_WIDTH / 2))) { 
            nextRootX = node.x + ROOT_X_SPACING;
          }
        }
        
        if (Array.isArray(node.childIds)) {
          node.childIds.forEach((childId, index) => {
            assignPositions(childId, migratedNodes[nodeId], index, false);
          });
        }
      };

      rootsToProcess.forEach((rootId, index) => assignPositions(rootId, undefined, 0, index === 0));
      
      Object.keys(m.data.nodes).forEach(nodeId => {
        if (!migratedNodes[nodeId]) { 
          const node = m.data.nodes[nodeId];
           migratedNodes[nodeId] = { 
            ...node, 
            x: node.x === undefined ? nextRootX : node.x, 
            y: node.y === undefined ? Y_OFFSET_FOR_FIRST_ROOT : node.y 
          };
          if (node.x === undefined && !node.parentId) nextRootX += ROOT_X_SPACING;
        }
      });
      
      return {
        ...m,
        updatedAt: m.updatedAt || new Date().toISOString(),
        data: {
          ...m.data,
          nodes: migratedNodes,
          rootNodeIds: Array.isArray(m.data.rootNodeIds) ? m.data.rootNodeIds : []
        }
      };
    }));
    setIsLoading(false);
  }, [CHILD_X_OFFSET, CHILD_Y_OFFSET, Y_OFFSET_FOR_FIRST_ROOT, NODE_CARD_WIDTH, ROOT_X_SPACING, getApproxNodeHeight, LOGICAL_CANVAS_WIDTH_FOR_FIRST_ROOT]);

  useEffect(() => {
    if (!isLoading) {
      saveMindmapsToStorage(mindmaps);
    }
  }, [mindmaps, isLoading]);

  const createMindmap = useCallback((input: CreateMindmapInput): Mindmap => {
    const newMindmap: Mindmap = {
      id: uuidv4(),
      name: input.name,
      category: input.category,
      data: {
        nodes: {},
        rootNodeIds: [],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setMindmaps(prev => [...prev, newMindmap]);
    return newMindmap;
  }, []);

  const getMindmapById = useCallback((id: string): Mindmap | undefined => {
    return mindmaps.find(m => m.id === id);
  }, [mindmaps]);

  const updateMindmap = useCallback((id: string, updatedData: Partial<Omit<Mindmap, 'id' | 'createdAt'>>): Mindmap | undefined => {
    let changedMindmap: Mindmap | undefined;
    setMindmaps(prev =>
      prev.map(m => {
        if (m.id === id) {
          changedMindmap = { ...m, ...updatedData, updatedAt: new Date().toISOString() };
          return changedMindmap;
        }
        return m;
      })
    );
    return changedMindmap;
  }, []);

  const deleteMindmap = useCallback((id: string) => {
    setMindmaps(prev => prev.filter(m => m.id !== id));
  }, []);

  const addNode = useCallback((mindmapId: string, parentId: string | null = null, nodeDetails: EditNodeInput, initialX?: number, initialY?: number): NodeData | undefined => {
    const mindmap = getMindmapById(mindmapId);
    if (!mindmap) return undefined;

    const newNodeId = uuidv4();
    let x, y;

    const currentNodes = mindmap.data.nodes;
    const currentRootNodeIds = Array.isArray(mindmap.data.rootNodeIds) ? mindmap.data.rootNodeIds : [];
    const existingRootNodes = currentRootNodeIds.map(id => currentNodes[id]).filter(Boolean);

    if (initialX !== undefined && initialY !== undefined) {
      x = initialX;
      y = initialY;
    } else if (parentId) {
      const parentNode = currentNodes[parentId];
      if (parentNode) {
        const parentNodeX = parentNode.x ?? (LOGICAL_CANVAS_WIDTH_FOR_FIRST_ROOT / 2) - (NODE_CARD_WIDTH / 2);
        const parentNodeY = parentNode.y ?? Y_OFFSET_FOR_FIRST_ROOT;
        const parentNodeHeight = getApproxNodeHeight(parentNode);
        const siblingCount = (parentNode.childIds || []).length;

        y = parentNodeY + parentNodeHeight + CHILD_Y_OFFSET;

        if (siblingCount > 0) {
           const totalWidthOfChildren = (siblingCount + 1) * NODE_CARD_WIDTH + siblingCount * 30; // 30px spacing
           const startX = parentNodeX + (NODE_CARD_WIDTH / 2) - (totalWidthOfChildren / 2);
           x = startX + siblingCount * (NODE_CARD_WIDTH + 30);
        } else {
           x = parentNodeX + CHILD_X_OFFSET;
        }
      } else { 
        parentId = null; 
        if (existingRootNodes.length > 0) {
          const lastRootNode = existingRootNodes.reduce((latest, node) => ((node.x !== undefined && latest.x !== undefined && node.x > latest.x) || latest.x === undefined) ? node : latest, existingRootNodes[0]!);
          x = (lastRootNode.x ?? (LOGICAL_CANVAS_WIDTH_FOR_FIRST_ROOT / 2) - (NODE_CARD_WIDTH / 2)) + ROOT_X_SPACING;
          y = Y_OFFSET_FOR_FIRST_ROOT;
        } else {
          x = (LOGICAL_CANVAS_WIDTH_FOR_FIRST_ROOT / 2) - (NODE_CARD_WIDTH / 2);
          y = Y_OFFSET_FOR_FIRST_ROOT;
        }
      }
    } else { 
      if (existingRootNodes.length > 0) {
         const lastRootNode = existingRootNodes.reduce((latest, node) => {
              return ((node.x !== undefined && latest.x !== undefined && node.x > latest.x) || latest.x === undefined) ? node : latest;
         }, existingRootNodes[0]!);
         x = (lastRootNode?.x ?? ((LOGICAL_CANVAS_WIDTH_FOR_FIRST_ROOT / 2) - (NODE_CARD_WIDTH / 2) - ROOT_X_SPACING) ) + ROOT_X_SPACING;
         y = Y_OFFSET_FOR_FIRST_ROOT;
      } else { 
        x = (LOGICAL_CANVAS_WIDTH_FOR_FIRST_ROOT / 2) - (NODE_CARD_WIDTH / 2);
        y = Y_OFFSET_FOR_FIRST_ROOT;
      }
    }

    const newNode: NodeData = {
      id: newNodeId,
      title: nodeDetails.title,
      description: nodeDetails.description,
      emoji: nodeDetails.emoji,
      parentId,
      childIds: [],
      x: x,
      y: y,
      // customBackgroundColor removed
    };

    const updatedNodes = { ...currentNodes, [newNodeId]: newNode };
    let updatedRootNodeIds = [...currentRootNodeIds];

    if (parentId && updatedNodes[parentId]) {
      const parentNodeFromMap = updatedNodes[parentId];
      updatedNodes[parentId] = {
        ...parentNodeFromMap,
        childIds: [...(Array.isArray(parentNodeFromMap.childIds) ? parentNodeFromMap.childIds : []), newNodeId]
      };
    } else if (!parentId) {
      if (!updatedRootNodeIds.includes(newNodeId)) {
        updatedRootNodeIds.push(newNodeId);
      }
    }
    updateMindmap(mindmapId, { data: { nodes: updatedNodes, rootNodeIds: updatedRootNodeIds } });
    return newNode;
  }, [getMindmapById, updateMindmap, getApproxNodeHeight, NODE_CARD_WIDTH, Y_OFFSET_FOR_FIRST_ROOT, ROOT_X_SPACING, CHILD_X_OFFSET, CHILD_Y_OFFSET, LOGICAL_CANVAS_WIDTH_FOR_FIRST_ROOT]);


  const updateNode = useCallback((mindmapId: string, nodeId: string, updates: EditNodeInput) => {
    const mindmap = getMindmapById(mindmapId);
    if (!mindmap || !mindmap.data.nodes[nodeId]) return;

    const existingNode = mindmap.data.nodes[nodeId];
    const updatedNodeData: NodeData = {
      ...existingNode,
      title: updates.title,
      description: updates.description,
      emoji: updates.emoji || undefined,
      // customBackgroundColor removed
    };

    const updatedNodes = {
      ...mindmap.data.nodes,
      [nodeId]: updatedNodeData
    };
    updateMindmap(mindmapId, { data: { ...mindmap.data, nodes: updatedNodes }});
  }, [getMindmapById, updateMindmap]);

  const updateNodePosition = useCallback((mindmapId: string, nodeId: string, x: number, y: number): Mindmap | undefined => {
    const mindmap = getMindmapById(mindmapId);
    if (!mindmap || !mindmap.data.nodes[nodeId]) return undefined;

    const updatedNode = { ...mindmap.data.nodes[nodeId], x, y };
    const updatedNodes = { ...mindmap.data.nodes, [nodeId]: updatedNode };
    return updateMindmap(mindmapId, { data: { ...mindmap.data, nodes: updatedNodes }});
  }, [getMindmapById, updateMindmap]);


  const deleteNodeRecursive = (nodes: NodesObject, nodeId: string): NodesObject => {
    const nodeToDelete = nodes[nodeId];
    if (!nodeToDelete) return nodes;

    let newNodes = { ...nodes };
    const childrenToDelete = [...(Array.isArray(nodeToDelete.childIds) ? nodeToDelete.childIds : [])];
    childrenToDelete.forEach(childId => {
      newNodes = deleteNodeRecursive(newNodes, childId);
    });

    delete newNodes[nodeId];

    if (nodeToDelete.parentId && newNodes[nodeToDelete.parentId]) {
      const parentNode = newNodes[nodeToDelete.parentId];
      const parentChildIds = Array.isArray(parentNode.childIds) ? parentNode.childIds : [];
      newNodes[nodeToDelete.parentId] = {
        ...parentNode,
        childIds: parentChildIds.filter(id => id !== nodeId),
      };
    }
    return newNodes;
  };

  const deleteNode = useCallback((mindmapId: string, nodeId: string) => {
    const mindmap = getMindmapById(mindmapId);
    if (!mindmap || !mindmap.data.nodes[nodeId]) return;

    const nodeToDelete = mindmap.data.nodes[nodeId];
    const newNodes = deleteNodeRecursive(mindmap.data.nodes, nodeId);

    let newRootNodeIds = Array.isArray(mindmap.data.rootNodeIds) ? mindmap.data.rootNodeIds : [];
    if (!nodeToDelete.parentId) { 
      newRootNodeIds = newRootNodeIds.filter(id => id !== nodeId);
    }

    updateMindmap(mindmapId, { data: { nodes: newNodes, rootNodeIds: newRootNodeIds } });
  }, [getMindmapById, updateMindmap]);


  return {
    mindmaps,
    isLoading,
    createMindmap,
    getMindmapById,
    updateMindmap,
    deleteMindmap,
    addNode,
    updateNode,
    updateNodePosition,
    deleteNode,
    getApproxNodeHeight,
    NODE_CARD_WIDTH
  };
}
