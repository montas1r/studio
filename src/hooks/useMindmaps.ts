
"use client";

import { useState, useEffect, useCallback } from 'react';
import type { Mindmap, CreateMindmapInput, NodeData, NodesObject, MindmapData, EditNodeInput } from '@/types/mindmap';
import { getMindmapsFromStorage, saveMindmapsToStorage } from '@/lib/localStorage';
import { v4 as uuidv4 } from 'uuid'; // Needs: npm install uuid && npm install --save-dev @types/uuid

export function useMindmaps() {
  const [mindmaps, setMindmaps] = useState<Mindmap[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadedMindmaps = getMindmapsFromStorage();
    setMindmaps(loadedMindmaps);
    setIsLoading(false);
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

  const addNode = useCallback((mindmapId: string, parentId: string | null = null, nodeDetails: { title: string; description: string; emoji?: string }) => {
    const mindmap = getMindmapById(mindmapId);
    if (!mindmap) return;

    const newNodeId = uuidv4();
    const newNode: NodeData = {
      id: newNodeId,
      title: nodeDetails.title,
      description: nodeDetails.description,
      emoji: nodeDetails.emoji,
      parentId,
      childIds: [],
    };

    const updatedNodes = { ...mindmap.data.nodes, [newNodeId]: newNode };
    let updatedRootNodeIds = [...mindmap.data.rootNodeIds];

    if (parentId) {
      const parentNode = updatedNodes[parentId];
      if (parentNode) {
        updatedNodes[parentId] = { ...parentNode, childIds: [...parentNode.childIds, newNodeId] };
      }
    } else {
      updatedRootNodeIds.push(newNodeId);
    }
    
    updateMindmap(mindmapId, { data: { nodes: updatedNodes, rootNodeIds: updatedRootNodeIds } });
    return newNode;
  }, [getMindmapById, updateMindmap]);

  const updateNode = useCallback((mindmapId: string, nodeId: string, updates: EditNodeInput) => { // Changed updates type to EditNodeInput
    const mindmap = getMindmapById(mindmapId);
    if (!mindmap || !mindmap.data.nodes[nodeId]) return;

    const updatedNode = { ...mindmap.data.nodes[nodeId], ...updates };
    const updatedNodes = { ...mindmap.data.nodes, [nodeId]: updatedNode };
    updateMindmap(mindmapId, { data: { ...mindmap.data, nodes: updatedNodes }});
  }, [getMindmapById, updateMindmap]);

  const deleteNodeRecursive = (nodes: NodesObject, nodeId: string): NodesObject => {
    const nodeToDelete = nodes[nodeId];
    if (!nodeToDelete) return nodes;

    let newNodes = { ...nodes };
    delete newNodes[nodeId];

    // Remove from parent's childIds
    if (nodeToDelete.parentId && newNodes[nodeToDelete.parentId]) {
      newNodes[nodeToDelete.parentId] = {
        ...newNodes[nodeToDelete.parentId],
        childIds: newNodes[nodeToDelete.parentId].childIds.filter(id => id !== nodeId),
      };
    }
    
    // Recursively delete children
    nodeToDelete.childIds.forEach(childId => {
      newNodes = deleteNodeRecursive(newNodes, childId);
    });
    
    return newNodes;
  };

  const deleteNode = useCallback((mindmapId: string, nodeId: string) => {
    const mindmap = getMindmapById(mindmapId);
    if (!mindmap || !mindmap.data.nodes[nodeId]) return;

    const nodeToDelete = mindmap.data.nodes[nodeId];
    const newNodes = deleteNodeRecursive(mindmap.data.nodes, nodeId);
    
    let newRootNodeIds = mindmap.data.rootNodeIds;
    if (!nodeToDelete.parentId) { // If it was a root node
      newRootNodeIds = mindmap.data.rootNodeIds.filter(id => id !== nodeId);
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
    deleteNode,
  };
}
