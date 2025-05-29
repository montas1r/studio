
"use client";

import type { Mindmap, CreateMindmapInput, NodeData, NodesObject, EditNodeInput } from '@/types/mindmap';
import { useState, useEffect, useCallback } from 'react';
import { getMindmapsFromStorage, saveMindmapsToStorage } from '@/lib/localStorage';
import { v4 as uuidv4 } from 'uuid';

const NODE_CARD_WIDTH = 300; // Must be declared before use

export function useMindmaps() {
  // Moved dependent constants inside the hook
  const INITIAL_ROOT_X_OFFSET_FROM_CENTER = -(NODE_CARD_WIDTH / 2);
  const Y_OFFSET_FOR_FIRST_ROOT = 100;
  const LOGICAL_CANVAS_WIDTH_FOR_FIRST_ROOT = 2000; // Used to initially center the very first node
  
  const ROOT_X_SPACING = NODE_CARD_WIDTH + 50;
  const CHILD_X_OFFSET = 0; 
  const CHILD_Y_OFFSET = 180;


  const [mindmaps, setMindmaps] = useState<Mindmap[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const getApproxNodeHeight = useCallback((node: Partial<NodeData> | null): number => {
    if (!node) return 100; // Default/minimum height
    let height = 50; // Base padding and header
    if (node.title) {
      height += 20; // Approx height for title
    }
    if (node.description && node.description.trim() !== "") {
      const charWidth = 7; // Approximate character width
      const charsPerLine = Math.max(1, (NODE_CARD_WIDTH - 24) / charWidth); // card width minus padding
      const linesFromDesc = Math.ceil((node.description.length / charsPerLine)) + (node.description.split('\n').length -1); // Add lines for explicit newlines
      height += Math.max(20, linesFromDesc * 18); // Min height for desc box, plus lines
    } else {
      height += 20; // Min height for empty desc box
    }
    return Math.max(100, height); // Ensure a minimum node height
  }, []);


  useEffect(() => {
    const loadedMindmaps = getMindmapsFromStorage();
    setMindmaps(loadedMindmaps.map(m => {
      const migratedNodes: NodesObject = {};
      
      // Initial placement logic for first root node
      let nextRootX = (LOGICAL_CANVAS_WIDTH_FOR_FIRST_ROOT / 2) + INITIAL_ROOT_X_OFFSET_FROM_CENTER;
      let nextRootY = Y_OFFSET_FOR_FIRST_ROOT;

      const rootsToProcess = Array.isArray(m.data.rootNodeIds) ? [...m.data.rootNodeIds] : [];
      const processedRoots: string[] = [];

      const assignPositions = (nodeId: string, parentX?: number, parentY?: number, siblingIndex: number = 0, parentNodeHeight: number = 0) => {
        const node = m.data.nodes[nodeId];
        if (!node) return;

        let x, y;
        if (node.x === undefined || node.y === undefined) {
          if (parentX !== undefined && parentY !== undefined) { // Is a child node
            x = parentX + CHILD_X_OFFSET; // Children start aligned with parent X
            y = parentY + parentNodeHeight + CHILD_Y_OFFSET;
            // Spread children horizontally if multiple
            if (siblingIndex > 0) {
                const parentNode = m.data.nodes[node.parentId!];
                if (parentNode && parentNode.childIds && parentNode.childIds.length > 1) {
                    const totalWidthOfChildren = parentNode.childIds.length * NODE_CARD_WIDTH + (parentNode.childIds.length -1) * 30;
                    const startX = parentX + (NODE_CARD_WIDTH / 2) - (totalWidthOfChildren / 2);
                    x = startX + siblingIndex * (NODE_CARD_WIDTH + 30);
                }
            }

          } else { // Is a root node
            x = nextRootX;
            y = nextRootY;
            nextRootX += ROOT_X_SPACING; // Next root node to the right
            processedRoots.push(nodeId);
          }
          migratedNodes[nodeId] = { ...node, x, y };
        } else {
          migratedNodes[nodeId] = { ...node };
        }
        
        const thisNodeHeight = getApproxNodeHeight(migratedNodes[nodeId]);
        if (Array.isArray(node.childIds)) {
          node.childIds.forEach((childId, index) => {
            assignPositions(childId, migratedNodes[nodeId].x, migratedNodes[nodeId].y, index, thisNodeHeight);
          });
        }
      };

      rootsToProcess.forEach(rootId => assignPositions(rootId));

      // Ensure all nodes get processed if some weren't in rootNodeIds or had missing coords
      Object.keys(m.data.nodes).forEach(nodeId => {
        if (!migratedNodes[nodeId]) {
          migratedNodes[nodeId] = { ...m.data.nodes[nodeId], x: nextRootX, y: nextRootY };
          nextRootX += ROOT_X_SPACING;
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
  }, []);

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
    let x = initialX;
    let y = initialY;

    const currentNodes = mindmap.data.nodes;
    const currentRootNodeIds = Array.isArray(mindmap.data.rootNodeIds) ? mindmap.data.rootNodeIds : [];

    if (x === undefined || y === undefined) {
      if (parentId) {
        const parentNode = currentNodes[parentId];
        if (parentNode) {
          const parentNodeX = parentNode.x ?? 0;
          const parentNodeY = parentNode.y ?? Y_OFFSET_FOR_FIRST_ROOT;
          const parentNodeHeight = getApproxNodeHeight(parentNode);
          const siblingCount = (parentNode.childIds || []).length;

          x = parentNodeX + CHILD_X_OFFSET; // Default x for child (aligns with parent)
          y = parentNodeY + parentNodeHeight + CHILD_Y_OFFSET; // y below parent

          // Spread children horizontally if multiple
          if (siblingCount > 0) {
             const totalWidthOfChildren = (siblingCount + 1) * NODE_CARD_WIDTH + siblingCount * 30; // +1 for the new node
             const startX = parentNodeX + (NODE_CARD_WIDTH / 2) - (totalWidthOfChildren / 2);
             x = startX + siblingCount * (NODE_CARD_WIDTH + 30); // position for the new node (last one)
          } else if (parentNode.childIds && parentNode.childIds.length === 0){ // first child
             x = parentNodeX + (NODE_CARD_WIDTH / 2) - (NODE_CARD_WIDTH / 2); // center first child under parent
          }


        } else { // Parent not found, treat as new root
          parentId = null; 
          const existingRootNodes = currentRootNodeIds.map(id => currentNodes[id]).filter(Boolean);
          if (existingRootNodes.length > 0) {
            const lastRootNode = existingRootNodes.reduce((latest, node) => (node.x !== undefined && (latest.x === undefined || node.x > latest.x)) ? node : latest, existingRootNodes[0]!);
            x = (lastRootNode.x ?? ((LOGICAL_CANVAS_WIDTH_FOR_FIRST_ROOT / 2) + INITIAL_ROOT_X_OFFSET_FROM_CENTER)) + ROOT_X_SPACING;
            y = lastRootNode.y ?? Y_OFFSET_FOR_FIRST_ROOT;
          } else {
            x = (LOGICAL_CANVAS_WIDTH_FOR_FIRST_ROOT / 2) + INITIAL_ROOT_X_OFFSET_FROM_CENTER;
            y = Y_OFFSET_FOR_FIRST_ROOT;
          }
        }
      } else { // No parentId, creating a new root node
        const existingRootNodes = currentRootNodeIds.map(id => currentNodes[id]).filter(Boolean);
        if (existingRootNodes.length > 0) {
           const lastRootNode = existingRootNodes.reduce((latest, node) => {
                // Find the root node with the largest x-coordinate
                return (node.x !== undefined && (latest.x === undefined || node.x > latest.x)) ? node : latest;
           }, existingRootNodes[0]!);
           x = (lastRootNode.x ?? ((LOGICAL_CANVAS_WIDTH_FOR_FIRST_ROOT / 2) + INITIAL_ROOT_X_OFFSET_FROM_CENTER)) + ROOT_X_SPACING;
           y = lastRootNode.y ?? Y_OFFSET_FOR_FIRST_ROOT; // Keep same Y level for roots
        } else { // This is the very first root node
          x = (LOGICAL_CANVAS_WIDTH_FOR_FIRST_ROOT / 2) + INITIAL_ROOT_X_OFFSET_FROM_CENTER;
          y = Y_OFFSET_FOR_FIRST_ROOT;
        }
      }
    }

    const newNode: NodeData = {
      id: newNodeId,
      title: nodeDetails.title,
      description: nodeDetails.description,
      emoji: nodeDetails.emoji,
      parentId,
      childIds: [],
      x: x as number,
      y: y as number,
    };

    const updatedNodes = { ...currentNodes, [newNodeId]: newNode };
    let updatedRootNodeIds = [...currentRootNodeIds];

    if (parentId && updatedNodes[parentId]) {
      const parentNodeFromMap = updatedNodes[parentId];
      updatedNodes[parentId] = {
        ...parentNodeFromMap,
        childIds: [...(Array.isArray(parentNodeFromMap.childIds) ? parentNodeFromMap.childIds : []), newNodeId]
      };
    } else if (!parentId) { // Is a root node
      if (!updatedRootNodeIds.includes(newNodeId)) {
        updatedRootNodeIds.push(newNodeId);
      }
    }

    updateMindmap(mindmapId, { data: { nodes: updatedNodes, rootNodeIds: updatedRootNodeIds } });
    return newNode;
  }, [getMindmapById, updateMindmap, getApproxNodeHeight, INITIAL_ROOT_X_OFFSET_FROM_CENTER, Y_OFFSET_FOR_FIRST_ROOT, LOGICAL_CANVAS_WIDTH_FOR_FIRST_ROOT, ROOT_X_SPACING, CHILD_X_OFFSET, CHILD_Y_OFFSET]);


  const updateNode = useCallback((mindmapId: string, nodeId: string, updates: EditNodeInput) => {
    const mindmap = getMindmapById(mindmapId);
    if (!mindmap || !mindmap.data.nodes[nodeId]) return;

    const existingNode = mindmap.data.nodes[nodeId];
    const updatedNodeData: NodeData = {
      ...existingNode,
      title: updates.title,
      description: updates.description,
      emoji: updates.emoji || undefined,
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
    if (!nodeToDelete.parentId) { // if it's a root node
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
  };
}
