
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
      if (!node) return null;
      return (
        <NodeCard
          key={node.id}
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
  // A mindmap has a single root flow if it has one root node and that root node has no children yet.
  const isSingleRootNoChildren = mindmap.data.rootNodeIds.length === 1 && 
                                 mindmap.data.nodes[mindmap.data.rootNodeIds[0]]?.childIds.length === 0;


  return (
    <div className="flex flex-col h-full flex-grow space-y-4">
      {/* Top Controls Section */}
      <div className="p-4 border rounded-lg bg-card shadow-md space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
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

        <div>
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
      </div>
      
      {/* Mindmap Canvas Section */}
      <ScrollArea className="w-full whitespace-nowrap rounded-lg border bg-background shadow-inner flex-grow min-h-[calc(100vh-300px)] sm:min-h-[calc(100vh-250px)]"> {/* Adjusted min-height */}
        <div className={cn(
          "p-6 min-w-max flex", 
          isSingleRootNoChildren && Object.keys(mindmap.data.nodes).length === 1 // Check if it's truly just ONE node total
            ? "items-center justify-center h-full" 
            : "items-start" 
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
                "flex flex-row gap-8 pb-4", // Ensure consistent gap for root columns
                isSingleRootNoChildren && Object.keys(mindmap.data.nodes).length === 1 ? "" : "items-start" 
              )}>
              {/* Ensure each root node and its children form a distinct column */}
              {mindmap.data.rootNodeIds.map((rootId) => {
                const nodeComponent = rootNodeElements.find(el => el?.key === rootId);
                if (!nodeComponent) return null;
                return (
                  <div key={rootId} className="flex flex-col items-center"> {/* Column for each root */}
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

