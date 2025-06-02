
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
    const safeCurrentWidth = currentWidth > 0 ? currentWidth : (getNodeDimensionsForSize(nodeSize).width || 1);
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
    
    height += 12; 
    if (nodeContent.description && nodeContent.description.trim() !== "") {
      const descCharsPerLine = Math.max(1, (safeCurrentWidth - (2 * 16)) / 8); 
      const explicitNewlines = (nodeContent.description.match(/\n/g) || []).length;
      const numDescLines = Math.ceil(nodeContent.description.length / descCharsPerLine) + explicitNewlines;
      height += Math.max(24, numDescLines * 20); 
    } else {
      height += 24; 
    }
    
    height += 4; 
    
    return Math.max(MIN_NODE_HEIGHT, Math.min(Math.max(defaultHeightForSize, Math.round(height)), MAX_NODE_HEIGHT));
  }, [getNodeDimensionsForSize, MIN_NODE_HEIGHT, MAX_NODE_HEIGHT]);


  useEffect(() => {
    const loadedMindmaps = getMindmapsFromStorage();
    setMindmaps(loadedMindmaps.map(m => {
      const migratedNodes: NodesObject = {};
      let nextRootX = (LOGICAL_CANVAS_WIDTH_FOR_FIRST_ROOT / 2) - (STANDARD_NODE_WIDTH / 2); // Initial estimate for first root

      // First pass: determine correct width and height for all nodes
      const tempProcessedNodes: NodesObject = {};
      for (const nodeId in m.data.nodes) {
        const node = m.data.nodes[nodeId];
        if (!node) continue;

        const nodeSize = node.size || 'standard';
        const { width: expectedWidthForSize, defaultHeight: defaultHeightForSize } = getNodeDimensionsForSize(nodeSize);

        let currentWidth = expectedWidthForSize;
        // If node.width is stored and matches its size's expected width, use it. Otherwise, size dictates width.
        if (typeof node.width === 'number' && node.width > 0 && node.width === expectedWidthForSize) {
            currentWidth = node.width;
        } // else currentWidth remains expectedWidthForSize

        let finalHeight;
        // Trust stored height IF: it's valid AND node.width (from storage) matches the currentWidth we've determined.
        // This means the stored height was for the correct width.
        if (
            typeof node.height === 'number' && node.height >= MIN_NODE_HEIGHT && node.height <= MAX_NODE_HEIGHT &&
            typeof node.width === 'number' && node.width === currentWidth
        ) {
            finalHeight = node.height;
        } else {
            // Stored height is missing, invalid, or its associated stored width differs from currentWidth. Recalculate.
            const calculatedContentHeight = getApproxNodeHeight(
                { title: node.title, description: node.description, emoji: node.emoji, size: nodeSize },
                currentWidth
            );
            finalHeight = Math.max(defaultHeightForSize, calculatedContentHeight);
            finalHeight = Math.max(MIN_NODE_HEIGHT, Math.min(finalHeight, MAX_NODE_HEIGHT)); // Clamp
        }
        
        tempProcessedNodes[nodeId] = {
            ...node,
            width: currentWidth,
            height: finalHeight,
            size: nodeSize,
            x: node.x, // Keep original x, y for now
            y: node.y,
        };
      }

      // Second pass: assign positions (x, y) using the processed nodes with correct dimensions
      const rootsToProcess = Array.isArray(m.data.rootNodeIds) ? [...m.data.rootNodeIds] : [];
      
      // Calculate initial nextRootX based on actual root nodes that might have positions
      let maxFoundRootX = -Infinity;
      rootsToProcess.forEach(rootId => {
          const rNode = tempProcessedNodes[rootId];
          if (rNode && rNode.x !== undefined && rNode.width !== undefined) {
              if ((rNode.x + rNode.width) > maxFoundRootX) {
                  maxFoundRootX = rNode.x + rNode.width;
              }
          }
      });
      if (maxFoundRootX > -Infinity) {
          nextRootX = maxFoundRootX + 50; // Start after the rightmost positioned root + spacing
      }


      const assignPositionsAndFinalize = (nodeId: string, parentNodeData?: NodeData, siblingIndex: number = 0, isFirstRootInCurrentMap: boolean = false) => {
        const processedNode = tempProcessedNodes[nodeId];
        if (!processedNode || migratedNodes[nodeId]) return; // Already finalized or not processed

        let x = processedNode.x;
        let y = processedNode.y;
        const nodeWidth = processedNode.width!;
        const nodeHeight = processedNode.height!;

        if (x === undefined || y === undefined) { 
          const CHILD_X_OFFSET = 0;
          const CHILD_Y_OFFSET = 180;
          const ROOT_SPACING = 50; // Gap between root nodes

          if (parentNodeData) {
            const parentX = parentNodeData.x!;
            const parentY = parentNodeData.y!;
            const parentNodeHeightValue = parentNodeData.height!;
            const parentNodeWidthValue = parentNodeData.width!;

            y = parentY + parentNodeHeightValue + CHILD_Y_OFFSET;

            const childrenCount = parentNodeData.childIds?.length || 0;
            if (childrenCount > 1) {
                const totalWidthOfChildren = childrenCount * nodeWidth + (childrenCount -1) * 30; // 30px gap between siblings
                const startX = parentX + (parentNodeWidthValue / 2) - (totalWidthOfChildren / 2);
                x = startX + siblingIndex * (nodeWidth + 30);
            } else {
                x = parentX + (parentNodeWidthValue / 2) - (nodeWidth / 2) + CHILD_X_OFFSET;
            }
          } else { // Root node without position
            if (isFirstRootInCurrentMap && rootsToProcess.filter(rid => tempProcessedNodes[rid]?.x === undefined).length === 1 && rootsToProcess.length === 1) {
                // If it's the *only* root node AND it has no position, center it.
                x = (LOGICAL_CANVAS_WIDTH_FOR_FIRST_ROOT / 2) - (nodeWidth / 2);
            } else {
                x = nextRootX;
            }
            y = Y_OFFSET_FOR_FIRST_ROOT;
            if (x === nextRootX) { // Only advance nextRootX if we just used it
                nextRootX += nodeWidth + ROOT_SPACING;
            }
          }
        }
        migratedNodes[nodeId] = { ...processedNode, x, y };
        
        if (Array.isArray(processedNode.childIds)) {
          processedNode.childIds.forEach((childId, index) => {
            assignPositionsAndFinalize(childId, migratedNodes[nodeId], index, false);
          });
        }
      };
      
      let firstRootProcessed = false;
      rootsToProcess.forEach(rootId => {
          assignPositionsAndFinalize(rootId, undefined, 0, !firstRootProcessed);
          if(tempProcessedNodes[rootId]?.x === undefined) firstRootProcessed = true; // Mark if we positioned a root node that needed it
      });
      
      // Ensure all nodes (even orphans if any) are in migratedNodes with their (possibly original) positions
      Object.keys(tempProcessedNodes).forEach(nodeId => {
        if (!migratedNodes[nodeId]) {
           const orphanNode = tempProcessedNodes[nodeId];
           // If orphan still needs position, place it using nextRootX
           const orphanX = orphanNode.x === undefined ? nextRootX : orphanNode.x;
           const orphanY = orphanNode.y === undefined ? Y_OFFSET_FOR_FIRST_ROOT : orphanNode.y;
           migratedNodes[nodeId] = { ...orphanNode, x: orphanX, y: orphanY };
           if (orphanNode.x === undefined && !orphanNode.parentId) {
             nextRootX += orphanNode.width! + 50; // 50 is ROOT_SPACING
           }
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
  }, [getMindmapsFromStorage, getNodeDimensionsForSize, getApproxNodeHeight]); 

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
      const ROOT_SPACING = 50;

    if (parentId) {
      const parentNode = currentNodes[parentId];
      if (parentNode) {
        const parentNodeX = parentNode.x ?? (LOGICAL_CANVAS_WIDTH_FOR_FIRST_ROOT / 2) - (parentNode.width ?? STANDARD_NODE_WIDTH / 2);
        const parentNodeY = parentNode.y ?? Y_OFFSET_FOR_FIRST_ROOT;
        const parentNodeWidthValue = parentNode.width ?? STANDARD_NODE_WIDTH;
        const parentNodeHeightValue = parentNode.height ?? getApproxNodeHeight(parentNode, parentNodeWidthValue);
        
        const siblingCount = (parentNode.childIds || []).length;
        y = parentNodeY + parentNodeHeightValue + CHILD_Y_OFFSET;

        if (siblingCount > 0) {
           const totalWidthOfChildrenAndGaps = (siblingCount + 1) * initialWidth + siblingCount * 30; 
           const startX = parentNodeX + (parentNodeWidthValue / 2) - (totalWidthOfChildrenAndGaps / 2);
           x = startX + siblingCount * (initialWidth + 30); // New node is at the end
        } else { // First child
           x = parentNodeX + (parentNodeWidthValue / 2) - (initialWidth / 2) + CHILD_X_OFFSET;
        }
      } else { // ParentId provided but parent not found, treat as new root
        parentId = null; 
        let lastRootNodeX = (LOGICAL_CANVAS_WIDTH_FOR_FIRST_ROOT / 2) - (initialWidth / 2) - (initialWidth + ROOT_SPACING); // Default if no roots
        let lastRootNodeWidth = 0;
        if(existingRootNodes.length > 0) {
            const lastRootNode = existingRootNodes.sort((a,b) => (a.x ?? 0) - (b.x ?? 0))[existingRootNodes.length - 1];
            lastRootNodeX = lastRootNode.x ?? lastRootNodeX;
            lastRootNodeWidth = lastRootNode.width ?? initialWidth;
        }
        x = lastRootNodeX + lastRootNodeWidth + ROOT_SPACING;
        y = Y_OFFSET_FOR_FIRST_ROOT;
      }
    } else { // New root node
      if (existingRootNodes.length === 0) {
        x = (LOGICAL_CANVAS_WIDTH_FOR_FIRST_ROOT / 2) - (initialWidth / 2);
      } else {
         const lastRootNode = existingRootNodes.sort((a,b) => (a.x ?? 0) - (b.x ?? 0))[existingRootNodes.length - 1];
         x = (lastRootNode.x ?? 0) + (lastRootNode.width ?? initialWidth) + ROOT_SPACING;
      }
      y = Y_OFFSET_FOR_FIRST_ROOT;
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
          
          const intendedSize = updatedNodePartialData.size || existingNode.size || 'standard';
          const { width: widthForIntendedSize, defaultHeight: defaultHeightForIntendedSize } = getNodeDimensionsForSize(intendedSize);

          // Determine finalWidth: if width is in partial data use it, else use width derived from size.
          const finalWidth = updatedNodePartialData.width !== undefined ? updatedNodePartialData.width : widthForIntendedSize;
          
          let finalHeight;

          // If height is explicitly provided in updatedNodePartialData, use it (clamped).
          if (updatedNodePartialData.height !== undefined) {
            finalHeight = Math.max(MIN_NODE_HEIGHT, Math.min(updatedNodePartialData.height, MAX_NODE_HEIGHT));
          } else {
            // Height not explicitly provided. Calculate based on other potentially changed properties.
            // Create a temporary merged state for accurate height calculation.
            const tempNodeStateForHeightCalc = {
                title: updatedNodePartialData.title !== undefined ? updatedNodePartialData.title : existingNode.title,
                description: updatedNodePartialData.description !== undefined ? updatedNodePartialData.description : existingNode.description,
                emoji: updatedNodePartialData.emoji !== undefined ? updatedNodePartialData.emoji : existingNode.emoji,
                size: intendedSize, // Use the determined intendedSize
            };
            const calculatedHeight = getApproxNodeHeight(tempNodeStateForHeightCalc, finalWidth);
            finalHeight = Math.max(defaultHeightForIntendedSize, calculatedHeight);
            finalHeight = Math.max(MIN_NODE_HEIGHT, Math.min(finalHeight, MAX_NODE_HEIGHT)); 
          }
          
          const updatedNode: NodeData = {
            ...existingNode,
            ...updatedNodePartialData, // Apply all partial data
            size: intendedSize,       // Ensure size is correctly set
            width: finalWidth,        // Ensure width is correctly set
            height: finalHeight,      // Ensure height is correctly set and clamped
          };

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

          // Only update if the height has meaningfully changed (by at least 1px)
          if (Math.abs((existingNode.height ?? MIN_NODE_HEIGHT) - newHeight) < 1) {
            return m; 
          }

          const updatedNodeData: NodeData = { ...existingNode, height: newHeight };
          const updatedNodes: NodesObject = { ...mindmapNodes, [nodeId]: updatedNodeData };
          return { ...m, data: { ...m.data, nodes: updatedNodes }, updatedAt: new Date().toISOString() };
        }
        return m;
      })
    );
  }, [MIN_NODE_HEIGHT, MAX_NODE_HEIGHT]);


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
      const mindmap = getMindmapById(mindmapId);
      if (!mindmap || !mindmap.data.nodes[nodeId]) return;
      const existingNode = mindmap.data.nodes[nodeId];
      // Call updateNode, which now handles size changes and recalculates width/height appropriately
      updateNode(nodeId, { ...existingNode, size: newSize, width: undefined, height: undefined });
  }, [getMindmapById, updateNode]);


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

    