
"use client";

import type { Mindmap, CreateMindmapInput, NodeData, NodesObject, EditNodeInput, PaletteColorKey } from '@/types/mindmap';
import { useState, useEffect, useCallback }
from 'react';
import { getMindmapsFromStorage, saveMindmapsToStorage } from '@/lib/localStorage';
import { v4 as uuidv4 } from 'uuid';

// Renamed for clarity in this context
const LOGICAL_CANVAS_WIDTH_FOR_PLACEMENT = 5000; 
const Y_OFFSET_FOR_FIRST_ROOT_PLACEMENT = 100;


export function useMindmaps() {
  const NODE_CARD_WIDTH = 300;
  const INITIAL_ROOT_X = (LOGICAL_CANVAS_WIDTH_FOR_PLACEMENT / 2) - (NODE_CARD_WIDTH / 2);
  const INITIAL_ROOT_Y = Y_OFFSET_FOR_FIRST_ROOT_PLACEMENT;
  const ROOT_X_SPACING = NODE_CARD_WIDTH + 50;
  const CHILD_X_OFFSET = 0; 
  const CHILD_Y_OFFSET = 180;


  const getApproxNodeHeight = useCallback((node: Partial<NodeData> | null): number => {
    if (!node) return 120; // Default height for calculation if node is null
    let height = 70; // Base for padding, header, etc. (Increased due to larger text)
    
    if (node.title) {
      const titleCharsPerLine = Math.max(1, (NODE_CARD_WIDTH - 2 * 16 /* px-4 for header */ - (node.emoji ? 28 : 0)) / 10); // Approx 10px char width for text-lg (increased from 8)
      const titleLines = Math.ceil((node.title.length / titleCharsPerLine)) + (node.title.split('\\n').length -1);
      height += Math.max(28, titleLines * 28); // text-lg approx 28px line height
    } else {
      height += 28; // Approx height for empty title
    }

    if (node.description && node.description.trim() !== "") {
      const descCharsPerLine = Math.max(1, (NODE_CARD_WIDTH - 2 * 16 /* px-4 for desc box */) / 8); // Approx 8px char width for text-sm
      const descLines = Math.ceil((node.description.length / descCharsPerLine)) + (node.description.split('\\n').length -1);
      height += Math.max(20, descLines * 20); // text-sm approx 20px line height
    } else {
       height += 24; // Min height for empty description box (related to APPROX_MIN_DESC_BOX_HEIGHT + padding)
    }
    return Math.max(90, height); // Adjusted minimum height
  }, [NODE_CARD_WIDTH]);


  const [mindmaps, setMindmaps] = useState<Mindmap[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadedMindmaps = getMindmapsFromStorage();
    setMindmaps(loadedMindmaps.map(m => {
      const migratedNodes: NodesObject = {};
      let nextRootX = INITIAL_ROOT_X + ROOT_X_SPACING; 

      const rootsToProcess = Array.isArray(m.data.rootNodeIds) ? [...m.data.rootNodeIds] : [];
      
      const assignPositions = (nodeId: string, parentNode?: NodeData, siblingIndex: number = 0, isFirstRootOfMap: boolean = false) => {
        const node = m.data.nodes[nodeId];
        if (!node) return;

        let x, y;
        if (node.x === undefined || node.y === undefined) {
          if (parentNode) { 
            const parentX = parentNode.x ?? INITIAL_ROOT_X;
            const parentY = parentNode.y ?? INITIAL_ROOT_Y;
            const parentNodeHeight = getApproxNodeHeight(parentNode);
            
            x = parentX + CHILD_X_OFFSET; 
            y = parentY + parentNodeHeight + CHILD_Y_OFFSET;
            
            const childrenCount = parentNode.childIds?.length || 0;
            if (childrenCount > 1) {
                const totalWidthOfChildren = childrenCount * NODE_CARD_WIDTH + (childrenCount -1) * 30;
                const startX = parentX + (NODE_CARD_WIDTH / 2) - (totalWidthOfChildren / 2);
                x = startX + siblingIndex * (NODE_CARD_WIDTH + 30);
            } else if (childrenCount === 1){
                // For a single child, place it directly below the parent
                x = parentX; // Align with parent X
            }
          } else { 
            // Root node
            if (isFirstRootOfMap) {
                x = INITIAL_ROOT_X;
                y = INITIAL_ROOT_Y;
            } else {
                x = nextRootX;
                y = INITIAL_ROOT_Y; 
                nextRootX += ROOT_X_SPACING;
            }
          }
          migratedNodes[nodeId] = { ...node, x, y };
        } else {
          migratedNodes[nodeId] = { ...node };
          // Update nextRootX if this existing root node is further right
          if (!parentNode && node.x >= nextRootX && node.x !== INITIAL_ROOT_X) { 
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
      
      // Ensure all nodes get processed, especially if not in rootNodeIds (orphaned or data integrity)
      Object.keys(m.data.nodes).forEach(nodeId => {
        if (!migratedNodes[nodeId]) { 
          const node = m.data.nodes[nodeId];
           // Assign a default position if somehow missed, likely as a new root
           migratedNodes[nodeId] = { 
            ...node, 
            x: node.x === undefined ? nextRootX : node.x, 
            y: node.y === undefined ? INITIAL_ROOT_Y : node.y 
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Removed getApproxNodeHeight from deps as it's stable with NODE_CARD_WIDTH

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

  const updateMindmap = useCallback((id: string, updatedData: Partial<Omit<Mindmap, 'id' | 'createdAt'>>) => {
    setMindmaps(prev =>
      prev.map(m =>
        m.id === id ? { ...m, ...updatedData, updatedAt: new Date().toISOString() } : m
      )
    );
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
        const parentNodeX = parentNode.x ?? INITIAL_ROOT_X; // Fallback if parent has no X
        const parentNodeY = parentNode.y ?? INITIAL_ROOT_Y; // Fallback if parent has no Y
        const parentNodeHeight = getApproxNodeHeight(parentNode);
        const siblingCount = (parentNode.childIds || []).length;

        // Default: directly below parent
        x = parentNodeX + CHILD_X_OFFSET; 
        y = parentNodeY + parentNodeHeight + CHILD_Y_OFFSET;

        // If there are siblings, spread them out
        if (siblingCount > 0) { // This new node is the (siblingCount+1)-th child.
           // Total width for new set of children (including this one)
           const totalWidthOfChildren = (siblingCount + 1) * NODE_CARD_WIDTH + siblingCount * 30; // (siblingCount) gaps
           const startX = parentNodeX + (NODE_CARD_WIDTH / 2) - (totalWidthOfChildren / 2);
           x = startX + siblingCount * (NODE_CARD_WIDTH + 30); // Place this new node at the end
        } else { // This is the first child
           x = parentNodeX; // Center it under parent if CHILD_X_OFFSET is 0
        }
      } else { 
        // Parent ID provided but parent node not found; treat as new root
        parentId = null; 
        // Fallthrough to root node placement
        if (existingRootNodes.length > 0) {
          const lastRootNode = existingRootNodes.reduce((latest, node) => (node.x !== undefined && (latest.x === undefined || node.x > latest.x)) ? node : latest, existingRootNodes[0]!);
          x = (lastRootNode.x ?? INITIAL_ROOT_X) + ROOT_X_SPACING;
          y = lastRootNode.y ?? INITIAL_ROOT_Y; // Keep Y consistent for roots
        } else {
          x = INITIAL_ROOT_X;
          y = INITIAL_ROOT_Y;
        }
      }
    } else { // No parentId, so it's a new root node
      if (existingRootNodes.length > 0) {
         // Find the rightmost root node to place the new one next to it
         const lastRootNode = existingRootNodes.reduce((latest, node) => {
              // Ensure node and latest.x are defined before comparison
              return (node.x !== undefined && (latest.x === undefined || node.x > latest.x)) ? node : latest;
         }, existingRootNodes[0]!); // initialValue is important if existingRootNodes[0] is undefined
         x = (lastRootNode?.x ?? (INITIAL_ROOT_X - ROOT_X_SPACING) ) + ROOT_X_SPACING; // Handle case where lastRootNode might be undefined
         y = INITIAL_ROOT_Y; // All root nodes at the same Y level
      } else { // This is the very first node in the mindmap
        x = INITIAL_ROOT_X;
        y = INITIAL_ROOT_Y;
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
      customBackgroundColor: nodeDetails.customBackgroundColor && nodeDetails.customBackgroundColor !== 'no-custom-color' ? nodeDetails.customBackgroundColor as PaletteColorKey : undefined,
    };

    const updatedNodes = { ...currentNodes, [newNodeId]: newNode };
    let updatedRootNodeIds = [...currentRootNodeIds];

    if (parentId && updatedNodes[parentId]) {
      const parentNodeFromMap = updatedNodes[parentId];
      updatedNodes[parentId] = {
        ...parentNodeFromMap,
        childIds: [...(Array.isArray(parentNodeFromMap.childIds) ? parentNodeFromMap.childIds : []), newNodeId]
      };
    } else if (!parentId) { // It's a root node
      if (!updatedRootNodeIds.includes(newNodeId)) {
        updatedRootNodeIds.push(newNodeId);
      }
    }
    updateMindmap(mindmapId, { data: { nodes: updatedNodes, rootNodeIds: updatedRootNodeIds } });
    return newNode;
  }, [getMindmapById, updateMindmap, getApproxNodeHeight, NODE_CARD_WIDTH, INITIAL_ROOT_X, INITIAL_ROOT_Y, ROOT_X_SPACING, CHILD_X_OFFSET, CHILD_Y_OFFSET]);


  const updateNode = useCallback((mindmapId: string, nodeId: string, updates: EditNodeInput) => {
    const mindmap = getMindmapById(mindmapId);
    if (!mindmap || !mindmap.data.nodes[nodeId]) return;

    const existingNode = mindmap.data.nodes[nodeId];
    const updatedNodeData: NodeData = {
      ...existingNode,
      title: updates.title,
      description: updates.description,
      emoji: updates.emoji || undefined,
      customBackgroundColor: updates.customBackgroundColor && updates.customBackgroundColor !== 'no-custom-color' ? updates.customBackgroundColor as PaletteColorKey : undefined,
    };

    const updatedNodes = {
      ...mindmap.data.nodes,
      [nodeId]: updatedNodeData
    };
    updateMindmap(mindmapId, { data: { ...mindmap.data, nodes: updatedNodes }});
  }, [getMindmapById, updateMindmap]);

  const updateNodePosition = useCallback((mindmapId: string, nodeId: string, x: number, y: number) => {
    const mindmap = getMindmapById(mindmapId);
    if (!mindmap || !mindmap.data.nodes[nodeId]) return;

    const updatedNode = { ...mindmap.data.nodes[nodeId], x, y };
    const updatedNodes = { ...mindmap.data.nodes, [nodeId]: updatedNode };
    updateMindmap(mindmapId, { data: { ...mindmap.data, nodes: updatedNodes }});
  }, [getMindmapById, updateMindmap]);


  // Recursive helper to delete a node and all its descendants
  const deleteNodeRecursive = (nodes: NodesObject, nodeId: string): NodesObject => {
    const nodeToDelete = nodes[nodeId];
    if (!nodeToDelete) return nodes;

    let newNodes = { ...nodes };
    // Recursively delete children
    const childrenToDelete = [...(Array.isArray(nodeToDelete.childIds) ? nodeToDelete.childIds : [])];
    childrenToDelete.forEach(childId => {
      newNodes = deleteNodeRecursive(newNodes, childId);
    });

    // Delete the node itself
    delete newNodes[nodeId];

    // Remove from parent's childIds (if parent exists)
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

    // If the deleted node was a root node, remove it from rootNodeIds
    let newRootNodeIds = Array.isArray(mindmap.data.rootNodeIds) ? mindmap.data.rootNodeIds : [];
    if (!nodeToDelete.parentId) { // It's a root node
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

