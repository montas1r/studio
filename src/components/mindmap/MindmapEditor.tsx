
"use client";

import React, { useState, useCallback } from 'react';
import type { Mindmap, NodeData, EditNodeInput } from '@/types/mindmap';
import { useMindmaps } from '@/hooks/useMindmaps';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NodeCard } from './NodeCard';
import { EditNodeDialog } from './EditNodeDialog';
import { PlusCircle, Download, AlertTriangle, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"; 
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface MindmapEditorProps {
  mindmapId: string;
}

export function MindmapEditor({ mindmapId }: MindmapEditorProps) {
  const { getMindmapById, addNode, updateNode, deleteNode } = useMindmaps();
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
    if (!mindmap) return;
    const parentNode = mindmap.data.nodes[parentId];
    const childNode = addNode(mindmap.id, parentId, { title: `Child of ${parentNode.title}`, description: "" });
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
    if (window.confirm(`Are you sure you want to delete node "${nodeToDelete?.title}" and all its children? This action cannot be undone.`)) {
      deleteNode(mindmap.id, nodeId);
      toast({ title: "Node Deleted", description: `Node "${nodeToDelete?.title}" and its children removed.`, variant: "destructive" });
    }
  };

  const renderNodeTree = useCallback((parentId: string | null, parentIsRootForWireColorContext?: boolean): (React.ReactElement | null)[] => {
    if (!mindmap) return [];
    const { nodes, rootNodeIds } = mindmap.data;
    
    const currentLevelNodeIds = parentId === null 
      ? rootNodeIds 
      : (nodes[parentId]?.childIds || []);

    return currentLevelNodeIds.map(nodeId => {
      const node = nodes[nodeId];
      if (!node) return null; // Important check if a node was deleted but ID still lingers
      return (
        <NodeCard
          key={node.id} // Use node.id as key
          node={node}
          onEdit={handleEditNode}
          onDelete={handleDeleteNode}
          onAddChild={handleAddChildNode}
          renderChildren={(childNodeId, parentIsRoot) => renderNodeTree(childNodeId, parentIsRoot)}
          hasChildren={node.childIds && node.childIds.length > 0}
          isRoot={!node.parentId}
          parentIsRootForWireColor={parentIsRootForWireColorContext}
          className={cn(
            !node.parentId ? "min-w-[320px] md:min-w-[380px]" : "min-w-[300px] md:min-w-[350px]",
            "my-1"
          )}
        />
      );
    }).filter(Boolean) as (React.ReactElement | null)[]; 
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
    return (
      <div className="text-center py-10 flex flex-col items-center gap-4">
        <AlertTriangle className="w-16 h-16 text-destructive" />
        <h2 className="text-2xl font-bold">Mindmap Not Found</h2>
        <p className="text-muted-foreground">This mindmap may have been deleted or the ID is incorrect.</p>
        <Button asChild variant="outline">
          <Link href="/">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Library
          </Link>
        </Button>
      </div>
    );
  }

  const rootNodeElements = renderNodeTree(null, undefined);
  const isSingleRootFlow = mindmap.data.rootNodeIds.length === 1 && Object.values(mindmap.data.nodes).filter(n => !n.parentId).every(rootNode => (!rootNode.childIds || rootNode.childIds.length === 0));


  return (
    <div className="space-y-6 h-full flex flex-col flex-grow">
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4 p-4 border rounded-lg bg-card shadow-md">
        <div>
          <h2 className="text-2xl font-bold truncate" title={mindmap.name}>{mindmap.name}</h2>
          <Button asChild variant="outline" size="sm" className="mt-2">
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Library
            </Link>
          </Button>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleExportJson} variant="outline">
            <Download className="mr-2 h-4 w-4" /> Export JSON
          </Button>
        </div>
      </div>
      
      <div className="p-4 border rounded-lg bg-card shadow-md">
        <h3 className="text-lg font-semibold mb-3">Add New Root Idea</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <Input 
            placeholder="Title for the new root idea" 
            value={newRootNodeTitle} 
            onChange={(e) => setNewRootNodeTitle(e.target.value)} 
            className="h-10"
          />
          <Textarea 
            placeholder="Optional description..." 
            value={newRootNodeDescription}
            onChange={(e) => setNewRootNodeDescription(e.target.value)}
            rows={1}
            className="min-h-[40px] resize-none"
          />
        </div>
        <Button onClick={handleAddRootNode} disabled={!newRootNodeTitle.trim()} className="mt-3">
          <PlusCircle className="mr-2 h-4 w-4" /> Add Root Idea
        </Button>
      </div>

      <ScrollArea className="w-full whitespace-nowrap rounded-lg border bg-background shadow-inner flex-grow min-h-[50vh]">
        <div className={cn(
          "p-6 min-w-max flex", 
           // isSingleRootFlow will center if only one root node with no children.
           // Otherwise, default to items-start for multiple roots or roots with children.
          isSingleRootFlow ? "items-center justify-center h-full" : "items-start" 
        )}>
          {rootNodeElements.length === 0 && Object.keys(mindmap.data.nodes).length === 0 && (
            <div className="flex-grow flex items-center justify-center h-full">
              <p className="text-muted-foreground text-center py-10 text-lg">
                This mindmap is empty. Add a root idea to begin structuring your thoughts!
              </p>
            </div>
          )}
          {rootNodeElements.length > 0 && (
             <div className={cn(
                "flex flex-row gap-8 pb-4", 
                isSingleRootFlow ? "" : "items-start" 
              )}>
              {mindmap.data.rootNodeIds.map((rootNodeId) => {
                const node = mindmap.data.nodes[rootNodeId];
                if (!node) return null; // Should not happen if data is consistent
                // Find the React element corresponding to this rootNodeId from rootNodeElements
                const nodeComponent = rootNodeElements.find(el => el?.key === rootNodeId);
                return (
                  <div key={rootNodeId} className="flex flex-col items-center"> {/* Each root node and its children form a column */}
                    {nodeComponent}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <ScrollBar orientation="horizontal" />
        <ScrollBar orientation="vertical" />
      </ScrollArea>

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
