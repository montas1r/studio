
"use client";

import React, { useState, useCallback } from 'react';
import type { Mindmap, NodeData, NodesObject, EditNodeInput } from '@/types/mindmap';
import { useMindmaps } from '@/hooks/useMindmaps';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NodeCard } from './NodeCard';
import { EditNodeDialog } from './EditNodeDialog';
import { PlusCircle, Download, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface MindmapEditorProps {
  mindmapId: string;
}

export function MindmapEditor({ mindmapId }: MindmapEditorProps) {
  const { getMindmapById, addNode, updateNode, deleteNode, updateMindmap } = useMindmaps();
  const mindmap = getMindmapById(mindmapId);
  
  const [editingNode, setEditingNode] = useState<NodeData | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  
  const [newRootNodeTitle, setNewRootNodeTitle] = useState('');
  const [newRootNodeDescription, setNewRootNodeDescription] = useState('');

  const { toast } = useToast();

  const handleAddRootNode = () => {
    if (!mindmap || !newRootNodeTitle.trim()) return;
    addNode(mindmap.id, null, { title: newRootNodeTitle, description: newRootNodeDescription });
    setNewRootNodeTitle('');
    setNewRootNodeDescription('');
    toast({ title: "Root Node Added", description: `Node "${newRootNodeTitle}" created.` });
  };

  const handleAddChildNode = (parentId: string) => {
    // For simplicity, new child nodes are created with default title/description
    // and then user can edit them.
    if (!mindmap) return;
    const childNode = addNode(mindmap.id, parentId, { title: "New Child Node", description: "" });
    if (childNode) {
        setEditingNode(childNode);
        setIsEditDialogOpen(true);
        toast({ title: "Child Node Added", description: "Edit the new child node's details." });
    }
  };

  const handleEditNode = (node: NodeData) => {
    setEditingNode(node);
    setIsEditDialogOpen(true);
  };

  const handleSaveNode = (nodeId: string, data: EditNodeInput) => {
    if (!mindmap) return;
    updateNode(mindmap.id, nodeId, data);
    toast({ title: "Node Updated", description: `Node "${data.title}" saved.` });
  };

  const handleDeleteNode = (nodeId: string) => {
    if (!mindmap) return;
    const nodeToDelete = mindmap.data.nodes[nodeId];
    if (window.confirm(`Are you sure you want to delete node "${nodeToDelete?.title}" and all its children?`)) {
      deleteNode(mindmap.id, nodeId);
      toast({ title: "Node Deleted", description: `Node "${nodeToDelete?.title}" and its children removed.`, variant: "destructive" });
    }
  };

  const renderNodeTree = useCallback((parentId: string | null): React.ReactNode => {
    if (!mindmap) return null;
    const { nodes, rootNodeIds } = mindmap.data;
    
    const childrenIds = parentId === null 
      ? rootNodeIds 
      : (nodes[parentId]?.childIds || []);

    return childrenIds.map(nodeId => {
      const node = nodes[nodeId];
      if (!node) return null;
      return (
        <NodeCard
          key={node.id}
          node={node}
          onEdit={handleEditNode}
          onDelete={handleDeleteNode}
          onAddChild={handleAddChildNode}
          renderChildren={() => renderNodeTree(node.id)}
          hasChildren={node.childIds && node.childIds.length > 0}
          isRoot={!node.parentId}
        />
      );
    });
  }, [mindmap, handleAddChildNode, handleEditNode, handleDeleteNode]);


  const handleExportJson = () => {
    if (!mindmap) return;
    const jsonString = JSON.stringify(mindmap, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${mindmap.name.replace(/\s+/g, '_')}_export.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: "Export Successful", description: "Mindmap exported as JSON." });
  };

  if (!mindmap) {
    return <div className="text-center py-10">Mindmap not found. It might have been deleted.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 p-4 border rounded-lg bg-card shadow">
        <h2 className="text-2xl font-bold">{mindmap.name}</h2>
        <div className="flex gap-2">
          <Button onClick={handleExportJson} variant="outline">
            <Download className="mr-2 h-4 w-4" /> Export JSON
          </Button>
        </div>
      </div>
      
      <div className="p-4 border rounded-lg bg-card shadow">
        <h3 className="text-lg font-semibold mb-2">Add New Root Node</h3>
        <div className="space-y-2">
          <Input 
            placeholder="New Root Node Title" 
            value={newRootNodeTitle} 
            onChange={(e) => setNewRootNodeTitle(e.target.value)} 
          />
          <Textarea 
            placeholder="Description (optional)" 
            value={newRootNodeDescription}
            onChange={(e) => setNewRootNodeDescription(e.target.value)}
            rows={2}
          />
          <Button onClick={handleAddRootNode} disabled={!newRootNodeTitle.trim()}>
            <PlusCircle className="mr-2 h-4 w-4" /> Add Root Node
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {mindmap.data.rootNodeIds.length === 0 && Object.keys(mindmap.data.nodes).length === 0 && (
          <p className="text-muted-foreground text-center py-6">This mindmap is empty. Add a root node to begin.</p>
        )}
        {renderNodeTree(null)}
      </div>

      {editingNode && (
        <EditNodeDialog
          isOpen={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          node={editingNode}
          onSave={handleSaveNode}
        />
      )}
    </div>
  );
}
