
"use client";

import type { PaletteColorKey } from '@/types/mindmap';
import { useState, useEffect, useCallback } from 'react';
import type { Mindmap, CreateMindmapInput, NodeData, NodesObject, EditNodeInput } from '@/types/mindmap';
import { getMindmapsFromStorage, saveMindmapsToStorage } from '@/lib/localStorage';
import { v4 as uuidv4 } from 'uuid';

export function useMindmaps() {
  // Constants for node placement logic
  const NODE_CARD_WIDTH = 300;
  const ROOT_X_SPACING = NODE_CARD_WIDTH + 50;
  const CHILD_X_OFFSET = 0; 
  const CHILD_Y_OFFSET = 180; // Approximate height of NodeCard + spacing
  
  // Constants for the first root node placement
  const LOGICAL_CANVAS_WIDTH_FOR_FIRST_ROOT = 5000; // Should match MindmapEditor's canvas width
  const Y_OFFSET_FOR_FIRST_ROOT = 100;


  const [mindmaps, setMindmaps] = useState<Mindmap[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const getApproxNodeHeight = useCallback((node: Partial<NodeData> | null): number => {
    if (!node) return 100; // Default approximate height
    let height = 60; // Base height for header/footer padding
    if (node.title) { // Add some height for title
      height += 20;
    }
    if (node.description && node.description.trim() !== "") {
      const charWidth = 7; 
      const charsPerLine = Math.max(1, NODE_CARD_WIDTH / charWidth); // Ensure charsPerLine is at least 1
      const linesFromDesc = Math.ceil((node.description.length / charsPerLine)) + (node.description.split('\n').length -1) ;
      height += Math.max(20, linesFromDesc * 18); 
    } else {
      height += 20; // Min height for empty description box
    }
    return Math.max(100, height); // Ensure a minimum height
  }, []);


  useEffect(() => {
    const loadedMindmaps = getMindmapsFromStorage();
    setMindmaps(loadedMindmaps.map(m => {
      const migratedNodes: NodesObject = {};
      let currentX = 0; // Start X for root nodes if migrating
      let currentY = Y_OFFSET_FOR_FIRST_ROOT; // Start Y for root nodes if migrating

      const rootsToProcess = Array.isArray(m.data.rootNodeIds) ? [...m.data.rootNodeIds] : [];
      const processedRoots: string[] = [];

      // Function to recursively assign positions
      const assignPositions = (nodeId: string, parentX?: number, parentY?: number, siblingIndex: number = 0, parentNodeHeight: number = 0) => {
        const node = m.data.nodes[nodeId];
        if (!node) return;

        let x, y;
        if (node.x === undefined || node.y === undefined) { // Only assign if not already set
          if (parentX !== undefined && parentY !== undefined) { // Child node
            x = parentX + CHILD_X_OFFSET + (siblingIndex * (NODE_CARD_WIDTH + 30)); // Spread children horizontally slightly
            y = parentY + parentNodeHeight + CHILD_Y_OFFSET;
          } else { // Root node
            if (processedRoots.length === 0) { // First root node in this mindmap
                x = (LOGICAL_CANVAS_WIDTH_FOR_FIRST_ROOT / 2) - (NODE_CARD_WIDTH / 2);
                y = Y_OFFSET_FOR_FIRST_ROOT;
            } else {
                x = currentX;
                y = currentY; // Use the Y of the first root for subsequent roots initially
            }
            currentX += ROOT_X_SPACING; // Prepare X for next root
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

      // Assign positions for any nodes not caught by tree traversal (e.g. orphaned)
      Object.keys(m.data.nodes).forEach(nodeId => {
        if (!migratedNodes[nodeId]) {
          migratedNodes[nodeId] = { ...m.data.nodes[nodeId], x: currentX, y: currentY };
          currentX += ROOT_X_SPACING;
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
  }, [getApproxNodeHeight]);

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
                const parentNodeX = parentNode.x ?? 0; // Default if parent has no X
                const parentNodeY = parentNode.y ?? Y_OFFSET_FOR_FIRST_ROOT; // Default if parent has no Y
                const parentNodeHeight = getApproxNodeHeight(parentNode);
                const siblingCount = (parentNode.childIds || []).length;
                
                x = parentNodeX + CHILD_X_OFFSET; 
                y = parentNodeY + parentNodeHeight + CHILD_Y_OFFSET;

                // Simple horizontal spread for siblings
                if (siblingCount > 0) {
                    const lastSiblingId = parentNode.childIds[siblingCount - 1];
                    const lastSiblingNode = currentNodes[lastSiblingId];
                    if (lastSiblingNode && lastSiblingNode.x !== undefined && lastSiblingNode.y !== undefined) {
                        x = lastSiblingNode.x + NODE_CARD_WIDTH + 30; // Place to the right of last sibling
                        y = lastSiblingNode.y; // Align Y with last sibling
                    }
                }
            } else { // ParentId provided but parent not found, treat as new root (should be rare)
                parentId = null; // Clear invalid parentId
                 const existingRootNodes = currentRootNodeIds.map(id => currentNodes[id]).filter(Boolean);
                if (existingRootNodes.length > 0) {
                    const lastRootNode = existingRootNodes.reduce((latest, node) => (node.x > (latest.x ?? -Infinity)) ? node : latest, existingRootNodes[0]!);
                    x = (lastRootNode.x ?? ((LOGICAL_CANVAS_WIDTH_FOR_FIRST_ROOT / 2) - (NODE_CARD_WIDTH / 2))) + ROOT_X_SPACING;
                    y = lastRootNode.y ?? Y_OFFSET_FOR_FIRST_ROOT;
                } else {
                    x = (LOGICAL_CANVAS_WIDTH_FOR_FIRST_ROOT / 2) - (NODE_CARD_WIDTH / 2);
                    y = Y_OFFSET_FOR_FIRST_ROOT;
                }
            }
        } else { // No parentId, new root node
            const existingRootNodes = currentRootNodeIds.map(id => currentNodes[id]).filter(Boolean);
            if (existingRootNodes.length > 0) {
                // Find the rightmost root node
                const lastRootNode = existingRootNodes.reduce((latest, node) => {
                    return (node.x !== undefined && (latest.x === undefined || node.x > latest.x)) ? node : latest;
                }, existingRootNodes[0]!);
                
                x = (lastRootNode.x ?? ((LOGICAL_CANVAS_WIDTH_FOR_FIRST_ROOT / 2) - (NODE_CARD_WIDTH / 2))) + ROOT_X_SPACING;
                y = lastRootNode.y ?? Y_OFFSET_FOR_FIRST_ROOT; // Keep same Y as other roots
            } else {
                // This is the VERY FIRST root node in an empty mindmap
                x = (LOGICAL_CANVAS_WIDTH_FOR_FIRST_ROOT / 2) - (NODE_CARD_WIDTH / 2);
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
      customBackgroundColor: nodeDetails.customBackgroundColor === 'no-custom-color' || nodeDetails.customBackgroundColor === '' ? undefined : nodeDetails.customBackgroundColor,
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
      customBackgroundColor: updates.customBackgroundColor === 'no-custom-color' || updates.customBackgroundColor === '' ? undefined : updates.customBackgroundColor,
      // x and y are updated by updateNodePosition
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
  };
}


    