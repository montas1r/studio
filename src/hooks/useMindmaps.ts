
"use client";

import type { Mindmap, CreateMindmapInput, NodeData, NodesObject, EditNodeInput, PaletteColorKey } from '@/types/mindmap';
import { useState, useEffect, useCallback } from 'react';
import { getMindmapsFromStorage, saveMindmapsToStorage } from '@/lib/localStorage';
import { v4 as uuidv4 } from 'uuid';

// Logical canvas dimensions for initial placement logic (if no specific coords given)
// These are for the large logical canvas where nodes can be placed.
const LOGICAL_CANVAS_WIDTH_FOR_FIRST_ROOT = 2000; // Used for v0.0.5 "Half-Top-Centralized"
const Y_OFFSET_FOR_FIRST_ROOT = 100; 

export const NODE_CARD_WIDTH = 300;
const ROOT_X_SPACING = NODE_CARD_WIDTH + 50;
const CHILD_X_OFFSET = 0; 
const CHILD_Y_OFFSET = 180; // Approx vertical distance between parent bottom and child top


export function useMindmaps() {
  const [mindmaps, setMindmaps] = useState<Mindmap[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const getApproxNodeHeight = useCallback((node: Partial<NodeData> | null): number => {
    if (!node) return 90; // Default height if node is null

    let height = 0;

    // Header height: py-2 (16px) + text-lg (approx 28px for one line)
    height += (16 + 28); 

    if (node.title) {
      // Estimate title lines based on characters per line.
      const titleCharsPerLine = Math.max(1, (NODE_CARD_WIDTH - (2 * 16) /*px-4 h-padding*/ - (node.emoji ? 32 : 0) /*emoji*/ - 70 /*buttons approx*/) / 10 /*avg char width for text-lg*/);
      const numTitleLines = Math.ceil((node.title.length / titleCharsPerLine)) + (node.title.split('\n').length -1);
      if (numTitleLines > 1) {
        height += (numTitleLines - 1) * 28; // Add height for additional lines of title
      }
    }
    
    // Description box: py-3 (24px for vertical padding)
    height += 24; 
    if (node.description && node.description.trim() !== "") {
      const descCharsPerLine = Math.max(1, (NODE_CARD_WIDTH - (2 * 16)/*px-4 h-padding*/) / 8 /*avg char width for text-sm*/);
      const numDescLines = Math.ceil((node.description.length / descCharsPerLine)) + (node.description.split('\n').length -1);
      height += Math.max(20, numDescLines * 20); // text-sm line height is ~20px for description
    } else {
       // If no description, the NodeCard renders a div with min-h-[1.25rem] (20px) *inside* the py-3 padding.
       // The 24px padding is already accounted for. No extra height needed for an empty description content itself.
       // The previous `height += 20;` was an overestimation for an empty description section.
    }
    
    height += 4; // Account for top and bottom border of the card itself (2px + 2px)

    return Math.max(90, height); // Enforce a minimum functional height.
  }, [NODE_CARD_WIDTH]);


  useEffect(() => {
    const loadedMindmaps = getMindmapsFromStorage();
    setMindmaps(loadedMindmaps.map(m => {
      const migratedNodes: NodesObject = {};
      let nextRootX = (LOGICAL_CANVAS_WIDTH_FOR_FIRST_ROOT / 2) - (NODE_CARD_WIDTH / 2); 

      const rootsToProcess = Array.isArray(m.data.rootNodeIds) ? [...m.data.rootNodeIds] : [];
      
      const assignPositions = (nodeId: string, parentNodeData?: NodeData, siblingIndex: number = 0, isFirstRootInMap: boolean = false) => {
        const node = m.data.nodes[nodeId];
        if (!node) return;

        let x, y;
        if (node.x === undefined || node.y === undefined) {
          if (parentNodeData) { 
            const parentX = parentNodeData.x ?? nextRootX; 
            const parentY = parentNodeData.y ?? Y_OFFSET_FOR_FIRST_ROOT;
            const parentNodeHeight = getApproxNodeHeight(parentNodeData);
            
            y = parentY + parentNodeHeight + CHILD_Y_OFFSET;
            
            const childrenCount = parentNodeData.childIds?.length || 0;
            if (childrenCount > 1) {
                const totalWidthOfChildren = childrenCount * NODE_CARD_WIDTH + (childrenCount -1) * 30; // 30px spacing
                const startX = parentX + (NODE_CARD_WIDTH / 2) - (totalWidthOfChildren / 2);
                x = startX + siblingIndex * (NODE_CARD_WIDTH + 30);
            } else { 
                x = parentX + CHILD_X_OFFSET;
            }
          } else { // This is a root node
            if (isFirstRootInMap && rootsToProcess.length === 1) { // Only one root, specifically center it high
                x = (LOGICAL_CANVAS_WIDTH_FOR_FIRST_ROOT / 2) - (NODE_CARD_WIDTH / 2);
                y = Y_OFFSET_FOR_FIRST_ROOT;
            } else { // Multiple roots or not the first in a single-root map during migration
                x = nextRootX;
                y = Y_OFFSET_FOR_FIRST_ROOT; 
                nextRootX += ROOT_X_SPACING;
            }
          }
          migratedNodes[nodeId] = { ...node, x, y };
        } else { 
          migratedNodes[nodeId] = { ...node };
          if (!parentNodeData && node.x !== undefined && (node.x + ROOT_X_SPACING) > nextRootX) { 
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
      
      // Ensure all nodes are processed, especially if rootNodeIds was malformed or nodes were orphaned
      Object.keys(m.data.nodes).forEach(nodeId => {
        if (!migratedNodes[nodeId]) { 
          const node = m.data.nodes[nodeId];
           migratedNodes[nodeId] = { 
            ...node, 
            x: node.x === undefined ? nextRootX : node.x, 
            y: node.y === undefined ? Y_OFFSET_FOR_FIRST_ROOT : node.y,
          };
          if (node.x === undefined && !node.parentId) nextRootX += ROOT_X_SPACING;
        }
      });
      
      return {
        ...m,
        updatedAt: m.updatedAt || new Date().toISOString(),
        createdAt: m.createdAt || new Date().toISOString(),
        data: {
          ...m.data,
          nodes: migratedNodes,
          rootNodeIds: Array.isArray(m.data.rootNodeIds) ? m.data.rootNodeIds : []
        }
      };
    }));
    setIsLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Dependencies intentionally left empty for initial load effect, getApproxNodeHeight is stable

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

  const addNode = useCallback((mindmapId: string, parentId: string | null = null, nodeDetails: EditNodeInput): NodeData | undefined => {
    const mindmap = getMindmapById(mindmapId);
    if (!mindmap) return undefined;

    const newNodeId = uuidv4();
    let x, y;

    const currentNodes = mindmap.data.nodes;
    const currentRootNodeIds = Array.isArray(mindmap.data.rootNodeIds) ? mindmap.data.rootNodeIds : [];
    const existingRootNodes = currentRootNodeIds.map(id => currentNodes[id]).filter(Boolean) as NodeData[];


    if (parentId) {
      const parentNode = currentNodes[parentId];
      if (parentNode) {
        const parentNodeX = parentNode.x ?? (LOGICAL_CANVAS_WIDTH_FOR_FIRST_ROOT / 2) - (NODE_CARD_WIDTH / 2);
        const parentNodeY = parentNode.y ?? Y_OFFSET_FOR_FIRST_ROOT;
        const parentNodeHeight = getApproxNodeHeight(parentNode);
        const siblingCount = (parentNode.childIds || []).length;

        y = parentNodeY + parentNodeHeight + CHILD_Y_OFFSET;

        if (siblingCount > 0) { // This new node will be the (siblingCount)-th child (0-indexed)
           const totalWidthOfChildren = (siblingCount + 1) * NODE_CARD_WIDTH + siblingCount * 30; // +1 for the new node
           const startX = parentNodeX + (NODE_CARD_WIDTH / 2) - (totalWidthOfChildren / 2);
           x = startX + siblingCount * (NODE_CARD_WIDTH + 30);
        } else { // This is the first child
           x = parentNodeX + CHILD_X_OFFSET;
        }
      } else { 
        // Parent ID provided but parent not found, treat as new root (should be rare)
        parentId = null; 
        const lastRootNode = existingRootNodes.length > 0 ? existingRootNodes.sort((a,b) => (a.x ?? 0) - (b.x ?? 0))[existingRootNodes.length - 1] : null;
        x = (lastRootNode?.x ?? ((LOGICAL_CANVAS_WIDTH_FOR_FIRST_ROOT / 2) - (NODE_CARD_WIDTH / 2) - ROOT_X_SPACING) ) + ROOT_X_SPACING;
        y = Y_OFFSET_FOR_FIRST_ROOT;
      }
    } else { // Adding a new root node
      if (existingRootNodes.length === 0) { // This is the very first node in the mindmap
        x = (LOGICAL_CANVAS_WIDTH_FOR_FIRST_ROOT / 2) - (NODE_CARD_WIDTH / 2); // Half-Top-Centralized
        y = Y_OFFSET_FOR_FIRST_ROOT;
      } else {
         const lastRootNode = existingRootNodes.sort((a,b) => (a.x ?? 0) - (b.x ?? 0))[existingRootNodes.length - 1];
         x = (lastRootNode?.x ?? ((LOGICAL_CANVAS_WIDTH_FOR_FIRST_ROOT / 2) - (NODE_CARD_WIDTH / 2) - ROOT_X_SPACING) ) + ROOT_X_SPACING;
         y = Y_OFFSET_FOR_FIRST_ROOT;
      }
    }

    const newNode: NodeData = {
      id: newNodeId,
      title: nodeDetails.title,
      description: nodeDetails.description,
      emoji: nodeDetails.emoji,
      // customBackgroundColor: nodeDetails.customBackgroundColor === 'no-custom-color' ? undefined : nodeDetails.customBackgroundColor, // Not in v0.0.5
      parentId,
      childIds: [],
      x: x,
      y: y,
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
    const updatedMindmap = updateMindmap(mindmapId, { data: { nodes: updatedNodes, rootNodeIds: updatedRootNodeIds } });
    return updatedMindmap ? updatedMindmap.data.nodes[newNodeId] : undefined;
  }, [getMindmapById, updateMindmap, getApproxNodeHeight]);


  const updateNode = useCallback((mindmapId: string, nodeId: string, updates: EditNodeInput) => {
    const mindmap = getMindmapById(mindmapId);
    if (!mindmap || !mindmap.data.nodes[nodeId]) return;

    const existingNode = mindmap.data.nodes[nodeId];
    const updatedNodeData: NodeData = {
      ...existingNode,
      title: updates.title,
      description: updates.description,
      emoji: updates.emoji || undefined,
      // customBackgroundColor: updates.customBackgroundColor === 'no-custom-color' ? undefined : updates.customBackgroundColor, // Not in v0.0.5
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

    // Remove nodeId from its parent's childIds array
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
    if (!nodeToDelete.parentId) { // If it was a root node
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
    getApproxNodeHeight, // Exporting for MindmapEditor to use
    NODE_CARD_WIDTH      // Exporting for MindmapEditor to use
  };
}
