
"use client";

import type { Mindmap, CreateMindmapInput, NodeData, NodesObject, EditNodeInput, NodeSize } from '@/types/mindmap';
import { useState, useEffect, useCallback }
from 'react';
import { getMindmapsFromStorage, saveMindmapsToStorage } from '@/lib/localStorage';
import { v4 as uuidv4 } from 'uuid';

const LOGICAL_CANVAS_WIDTH_FOR_FIRST_ROOT = 2000;
const Y_OFFSET_FOR_FIRST_ROOT = 100;

// Node Size Definitions (Exported)
export const MINI_NODE_WIDTH = 160;
export const MINI_NODE_DEFAULT_HEIGHT = 60;
export const STANDARD_NODE_WIDTH = 240; 
export const STANDARD_NODE_DEFAULT_HEIGHT = 90;
export const MASSIVE_NODE_WIDTH = 360;
export const MASSIVE_NODE_DEFAULT_HEIGHT = 150;

// Absolute min/max constraints
export const MIN_NODE_HEIGHT = 80; 
export const MAX_NODE_HEIGHT = 800;


export function useMindmaps() {
  const [mindmaps, setMindmaps] = useState<Mindmap[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const getNodeDimensionsForSize = useCallback((size: NodeSize | undefined): { width: number, defaultHeight: number } => {
    switch (size) {
      case 'mini':
        return { width: MINI_NODE_WIDTH, defaultHeight: MINI_NODE_DEFAULT_HEIGHT };
      case 'massive':
        return { width: MASSIVE_NODE_WIDTH, defaultHeight: MASSIVE_NODE_DEFAULT_HEIGHT };
      case 'standard':
      default:
        return { width: STANDARD_NODE_WIDTH, defaultHeight: STANDARD_NODE_DEFAULT_HEIGHT };
    }
  }, []);

  const getApproxNodeHeight = useCallback((nodeContent: Partial<Pick<NodeData, 'title' | 'description' | 'emoji' | 'size'>>, currentWidth: number): number => {
    if (!nodeContent) return MIN_NODE_HEIGHT;
    
    const nodeSize = nodeContent.size || 'standard';
    const safeCurrentWidth = currentWidth > 0 ? currentWidth : getNodeDimensionsForSize(nodeSize).width; // Fallback to size default if currentWidth is bad
    const { defaultHeight: defaultHeightForSize } = getNodeDimensionsForSize(nodeSize);

    let height = 0;
    height += (16 + 28); 

    if (nodeContent.title) {
      const titleCharsPerLine = Math.max(1, (safeCurrentWidth - (2 * 16) - (nodeContent.emoji ? 32 : 0) - 70) / 10); 
      const numTitleLines = Math.ceil((nodeContent.title.length / titleCharsPerLine)) + (nodeContent.title.split('\n').length -1);
      if (numTitleLines > 1) {
        height += (numTitleLines - 1) * 28; 
      }
    }
    
    height += 24; 
    if (nodeContent.description && nodeContent.description.trim() !== "") {
      const descCharsPerLine = Math.max(1, (safeCurrentWidth - (2 * 16)) / 8); 
      const numDescLines = Math.ceil((nodeContent.description.length / descCharsPerLine)) + (nodeContent.description.split('\n').length -1);
      height += Math.max(24, numDescLines * 20); 
    } else {
      height += 24; 
    }
    
    height += 4; 
    
    // Clamp here before returning the approximation
    return Math.max(MIN_NODE_HEIGHT, Math.min(Math.max(defaultHeightForSize, Math.round(height)), MAX_NODE_HEIGHT));
  }, [getNodeDimensionsForSize]);


  useEffect(() => {
    const loadedMindmaps = getMindmapsFromStorage();
    setMindmaps(loadedMindmaps.map(m => {
      const migratedNodes: NodesObject = {};
      let nextRootX = (LOGICAL_CANVAS_WIDTH_FOR_FIRST_ROOT / 2) - (STANDARD_NODE_WIDTH / 2);
      const rootsToProcess = Array.isArray(m.data.rootNodeIds) ? [...m.data.rootNodeIds] : [];

      const assignPositionsAndSizes = (nodeId: string, parentNodeData?: NodeData, siblingIndex: number = 0, isFirstRootInMap: boolean = false) => {
        const node = m.data.nodes[nodeId];
        if (!node) return;

        const nodeSize = node.size || 'standard';
        
        let currentWidth: number;
        if (typeof node.width === 'number' && node.width > 0) {
            currentWidth = node.width;
            // Ensure stored width matches the width for its 'size' property; if not, recalculate.
            // This handles cases where 'size' might have changed but 'width' wasn't updated.
            const expectedWidthForSize = getNodeDimensionsForSize(nodeSize).width;
            if (currentWidth !== expectedWidthForSize) {
                currentWidth = expectedWidthForSize;
            }
        } else {
            currentWidth = getNodeDimensionsForSize(nodeSize).width;
        }

        let finalHeight: number;
        if (typeof node.height === 'number' && node.height >= MIN_NODE_HEIGHT) {
            finalHeight = node.height;
        } else {
            const defaultHeightForSizeFallback = getNodeDimensionsForSize(nodeSize).defaultHeight;
            const calculatedContentHeight = getApproxNodeHeight({title: node.title, description: node.description, emoji: node.emoji, size: nodeSize}, currentWidth);
            finalHeight = Math.max(defaultHeightForSizeFallback, calculatedContentHeight);
        }
        finalHeight = Math.max(MIN_NODE_HEIGHT, Math.min(finalHeight, MAX_NODE_HEIGHT));


        let x, y;
        if (node.x === undefined || node.y === undefined) {
          const CHILD_X_OFFSET = 0;
          const CHILD_Y_OFFSET = 180;
          const ROOT_X_SPACING = STANDARD_NODE_WIDTH + 50;

          if (parentNodeData) {
            const parentX = parentNodeData.x ?? nextRootX;
            const parentY = parentNodeData.y ?? Y_OFFSET_FOR_FIRST_ROOT;
            const parentNodeHeightValue = parentNodeData.height ?? getApproxNodeHeight(parentNodeData, parentNodeData.width ?? STANDARD_NODE_WIDTH);
            const parentNodeWidthValue = parentNodeData.width ?? STANDARD_NODE_WIDTH;

            y = parentY + parentNodeHeightValue + CHILD_Y_OFFSET;

            const childrenCount = parentNodeData.childIds?.length || 0;
            if (childrenCount > 1) { // If current node is one of multiple children
                const totalWidthOfChildren = childrenCount * currentWidth + (childrenCount -1) * 30;
                const startX = parentX + (parentNodeWidthValue / 2) - (totalWidthOfChildren / 2);
                x = startX + siblingIndex * (currentWidth + 30);
            } else { // Single child or first child being laid out
                x = parentX + (parentNodeWidthValue / 2) - (currentWidth / 2) + CHILD_X_OFFSET;
            }
          } else { // Root node
            if (isFirstRootInMap && rootsToProcess.length === 1 && node.x === undefined && node.y === undefined) {
                x = (LOGICAL_CANVAS_WIDTH_FOR_FIRST_ROOT / 2) - (currentWidth / 2);
                y = Y_OFFSET_FOR_FIRST_ROOT;
            } else if (node.x !== undefined && node.y !== undefined) { // If it has position, use it
                x = node.x;
                y = node.y;
            }
            else {
                x = nextRootX;
                y = Y_OFFSET_FOR_FIRST_ROOT;
                nextRootX += currentWidth + (ROOT_X_SPACING - STANDARD_NODE_WIDTH) ;
            }
          }
           migratedNodes[nodeId] = { ...node, x, y, width: currentWidth, height: finalHeight, size: nodeSize };
        } else { // Node already has x,y coordinates
           migratedNodes[nodeId] = { ...node, x: node.x, y: node.y, width: currentWidth, height: finalHeight, size: nodeSize };
          if (!parentNodeData && node.x !== undefined && (node.x + currentWidth + (STANDARD_NODE_WIDTH + 50 - STANDARD_NODE_WIDTH)) > nextRootX) {
            nextRootX = node.x + currentWidth + (STANDARD_NODE_WIDTH + 50 - STANDARD_NODE_WIDTH);
          }
        }

        if (Array.isArray(node.childIds)) {
          node.childIds.forEach((childId, index) => {
            assignPositionsAndSizes(childId, migratedNodes[nodeId], index, false);
          });
        }
      };
      rootsToProcess.forEach((rootId, index) => assignPositionsAndSizes(rootId, undefined, index, index === 0));
      
      Object.keys(m.data.nodes).forEach(nodeId => {
        if (!migratedNodes[nodeId]) { 
          const node = m.data.nodes[nodeId];
          const nodeSize = node.size || 'standard';
          
          let currentWidth: number;
          if (typeof node.width === 'number' && node.width > 0) {
              currentWidth = node.width;
              const expectedWidthForSize = getNodeDimensionsForSize(nodeSize).width;
              if (currentWidth !== expectedWidthForSize) {
                  currentWidth = expectedWidthForSize;
              }
          } else {
              currentWidth = getNodeDimensionsForSize(nodeSize).width;
          }

          let finalHeight: number;
          if (typeof node.height === 'number' && node.height >= MIN_NODE_HEIGHT) {
              finalHeight = node.height;
          } else {
              const defaultHeightForSizeFallback = getNodeDimensionsForSize(nodeSize).defaultHeight;
              const calculatedHeight = getApproxNodeHeight({title: node.title, description: node.description, emoji: node.emoji, size: nodeSize}, currentWidth);
              finalHeight = Math.max(defaultHeightForSizeFallback, calculatedHeight);
          }
          finalHeight = Math.max(MIN_NODE_HEIGHT, Math.min(finalHeight, MAX_NODE_HEIGHT));

           migratedNodes[nodeId] = {
            ...node,
            x: node.x === undefined ? nextRootX : node.x,
            y: node.y === undefined ? Y_OFFSET_FOR_FIRST_ROOT : node.y,
            width: currentWidth,
            height: finalHeight,
            size: nodeSize,
          };
          if (node.x === undefined && !node.parentId) nextRootX += (currentWidth + (STANDARD_NODE_WIDTH + 50 - STANDARD_NODE_WIDTH));
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
  }, [getApproxNodeHeight, getNodeDimensionsForSize]); // Added relevant constants to dependency array

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
          const newMapData: MindmapData = {
            ...m.data, 
            ...(updatedData.data || {}), 
          };
          changedMindmap = { 
            ...m, 
            ...updatedData, 
            data: newMapData, 
            updatedAt: new Date().toISOString() 
          };
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
    
    const initialNodeSize: NodeSize = 'standard'; 
    const { width: initialWidth, defaultHeight: defaultHeightForInitialSize } = getNodeDimensionsForSize(initialNodeSize);
    const initialContentHeight = getApproxNodeHeight(
        { title: nodeDetails.title, description: nodeDetails.description, emoji: nodeDetails.emoji, size: initialNodeSize }, 
        initialWidth
    );
    const finalInitialHeight = Math.max(MIN_NODE_HEIGHT, Math.min(Math.max(defaultHeightForInitialSize, initialContentHeight), MAX_NODE_HEIGHT));


      const CHILD_X_OFFSET = 0;
      const CHILD_Y_OFFSET = 180;
      const ROOT_X_SPACING = STANDARD_NODE_WIDTH + 50;

    if (parentId) {
      const parentNode = currentNodes[parentId];
      if (parentNode) {
        const parentNodeX = parentNode.x ?? (LOGICAL_CANVAS_WIDTH_FOR_FIRST_ROOT / 2) - (STANDARD_NODE_WIDTH / 2);
        const parentNodeY = parentNode.y ?? Y_OFFSET_FOR_FIRST_ROOT;
        const parentNodeWidthValue = parentNode.width ?? STANDARD_NODE_WIDTH;
        const parentCalculatedHeight = getApproxNodeHeight(parentNode, parentNode.width ?? STANDARD_NODE_WIDTH);
        const parentNodeHeightValue = parentNode.height ?? parentCalculatedHeight;
        const siblingCount = (parentNode.childIds || []).length;
        y = parentNodeY + parentNodeHeightValue + CHILD_Y_OFFSET;
        if (siblingCount > 0) {
           const totalWidthOfChildren = (siblingCount + 1) * initialWidth + siblingCount * 30; 
           const startX = parentNodeX + (parentNodeWidthValue / 2) - (totalWidthOfChildren / 2);
           x = startX + siblingCount * (initialWidth + 30);
        } else {
           x = parentNodeX + (parentNodeWidthValue / 2) - (initialWidth / 2) + CHILD_X_OFFSET;
        }
      } else {
        parentId = null; 
        const lastRootNode = existingRootNodes.length > 0 ? existingRootNodes.sort((a,b) => (a.x ?? 0) - (b.x ?? 0))[existingRootNodes.length - 1] : null;
        const lastRootWidth = lastRootNode?.width ?? STANDARD_NODE_WIDTH;
        x = (lastRootNode?.x ?? ((LOGICAL_CANVAS_WIDTH_FOR_FIRST_ROOT / 2) - (STANDARD_NODE_WIDTH / 2) - (lastRootWidth + (ROOT_X_SPACING - STANDARD_NODE_WIDTH))) ) + lastRootWidth + (ROOT_X_SPACING - STANDARD_NODE_WIDTH);
        y = Y_OFFSET_FOR_FIRST_ROOT;
      }
    } else { 
      if (existingRootNodes.length === 0) {
        x = (LOGICAL_CANVAS_WIDTH_FOR_FIRST_ROOT / 2) - (initialWidth / 2);
        y = Y_OFFSET_FOR_FIRST_ROOT;
      } else {
         const lastRootNode = existingRootNodes.sort((a,b) => (a.x ?? 0) - (b.x ?? 0))[existingRootNodes.length - 1];
         const lastRootNodeWidthValue = lastRootNode.width ?? STANDARD_NODE_WIDTH;
         x = (lastRootNode.x ?? 0) + lastRootNodeWidthValue + (ROOT_X_SPACING - STANDARD_NODE_WIDTH);
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
      size: initialNodeSize,
      width: initialWidth, 
      height: finalInitialHeight,
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
    const updatedMindmapData = updateMindmap(mindmapId, { data: { nodes: updatedNodes, rootNodeIds: updatedRootNodeIds } });
    return updatedMindmapData ? updatedMindmapData.data.nodes[newNodeId] : undefined;
  }, [getMindmapById, updateMindmap, getApproxNodeHeight, getNodeDimensionsForSize]);


  const updateNode = useCallback((nodeId: string, updatedNodePartialData: Partial<NodeData>) => {
    setMindmaps(prevMindmaps =>
      prevMindmaps.map(m => {
        if (m.data.nodes && m.data.nodes[nodeId]) {
          const existingNode = m.data.nodes[nodeId];
          
          const updatedNode: NodeData = {
            ...existingNode,
            ...updatedNodePartialData,
          };
  
          if (
            (updatedNodePartialData.size && updatedNodePartialData.size !== existingNode.size) ||
            (updatedNodePartialData.width && updatedNodePartialData.width !== existingNode.width) ||
            (updatedNodePartialData.title && updatedNodePartialData.title !== existingNode.title) ||
            (updatedNodePartialData.description && updatedNodePartialData.description !== existingNode.description) ||
            (updatedNodePartialData.emoji && updatedNodePartialData.emoji !== existingNode.emoji)
          ) {
            if(updatedNodePartialData.height === undefined) { 
                 const newApproxHeight = getApproxNodeHeight(
                    { title: updatedNode.title, description: updatedNode.description, emoji: updatedNode.emoji, size: updatedNode.size },
                    updatedNode.width ?? getNodeDimensionsForSize(updatedNode.size).width
                 );
                 // Use the newApproxHeight which already considers default height and clamps
                 updatedNode.height = newApproxHeight;
            } else {
                 // If height is explicitly provided, ensure it's clamped
                 updatedNode.height = Math.max(MIN_NODE_HEIGHT, Math.min(updatedNodePartialData.height, MAX_NODE_HEIGHT));
            }
          } else if (updatedNodePartialData.height !== undefined) {
             // If only height is provided, ensure it's clamped
             updatedNode.height = Math.max(MIN_NODE_HEIGHT, Math.min(updatedNodePartialData.height, MAX_NODE_HEIGHT));
          }


          const updatedNodes = {
            ...m.data.nodes,
            [nodeId]: updatedNode,
          };
  
          return {
            ...m,
            data: { ...m.data, nodes: updatedNodes },
            updatedAt: new Date().toISOString(),
          };
        }
        return m;
      })
    );
  }, [getNodeDimensionsForSize, getApproxNodeHeight]);
  
  const updateNodePosition = useCallback((mindmapId: string, nodeId: string, x: number, y: number): Mindmap | undefined => {
    const mindmap = getMindmapById(mindmapId);
    if (!mindmap || !mindmap.data.nodes[nodeId]) return undefined;

    const updatedNode = { ...mindmap.data.nodes[nodeId], x, y };
    const updatedNodes = { ...mindmap.data.nodes, [nodeId]: updatedNode };
    return updateMindmap(mindmapId, { data: { ...mindmap.data, nodes: updatedNodes }});
  }, [getMindmapById, updateMindmap]);

  const updateNodeHeightFromObserver = useCallback((mindmapId: string, nodeId: string, measuredHeight: number) => {
    setMindmaps(prevMindmaps =>
      prevMindmaps.map(m => {
        if (m.id === mindmapId) {
          const mindmapNodes = m.data.nodes;
          const existingNode = mindmapNodes[nodeId];
          if (!existingNode) return m;
          
          let newHeight = Math.max(MIN_NODE_HEIGHT, Math.min(Math.round(measuredHeight), MAX_NODE_HEIGHT));

          if (Math.abs((existingNode.height ?? 0) - newHeight) < 1) {
            return m; 
          }

          const updatedNodeData: NodeData = { ...existingNode, height: newHeight };
          const updatedNodes: NodesObject = { ...mindmapNodes, [nodeId]: updatedNodeData };
          return { ...m, data: { ...m.data, nodes: updatedNodes }, updatedAt: new Date().toISOString() };
        }
        return m;
      })
    );
  }, []);


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

  const updateNodeSize = useCallback((mindmapId: string, nodeId: string, newSize: NodeSize) => {
      setMindmaps(prevMindmaps =>
        prevMindmaps.map(m => {
          if (m.id === mindmapId && m.data.nodes[nodeId]) {
            const existingNode = m.data.nodes[nodeId];
            const { width: newWidth, defaultHeight: newDefaultHeight } = getNodeDimensionsForSize(newSize);
            
            const newApproxHeight = getApproxNodeHeight(
              { title: existingNode.title, description: existingNode.description, emoji: existingNode.emoji, size: newSize },
              newWidth 
            );
            // newApproxHeight already considers defaultHeight and clamps
            const finalNewHeight = newApproxHeight; 

            const updatedNode = {
              ...existingNode,
              size: newSize,
              width: newWidth,
              height: finalNewHeight,
            };
            const updatedNodes = { ...m.data.nodes, [nodeId]: updatedNode };
            return { ...m, data: { ...m.data, nodes: updatedNodes }, updatedAt: new Date().toISOString() };
          }
          return m;
        })
      );
  }, [getNodeDimensionsForSize, getApproxNodeHeight]);


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
    updateNodeHeightFromObserver, 
    deleteNode,
    getApproxNodeHeight,
    getNodeDimensionsForSize,
    updateNodeSize, 
    MINI_NODE_WIDTH,
    MINI_NODE_DEFAULT_HEIGHT,
    STANDARD_NODE_WIDTH,
    STANDARD_NODE_DEFAULT_HEIGHT,
    MASSIVE_NODE_WIDTH,
    MASSIVE_NODE_DEFAULT_HEIGHT,
    MIN_NODE_HEIGHT,
    MAX_NODE_HEIGHT,
  };
}


    