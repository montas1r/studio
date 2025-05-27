
"use client";

import React, { useState, useRef, useEffect } from 'react';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface MindmapEditorProps {
  mindmapId: string;
}

// Define approximate dimensions for line connection points
const NODE_CARD_WIDTH = 300; // Should match NodeCard's fixed width
const NODE_CARD_HEADER_HEIGHT = 50; // Approximate height of the card header

export function MindmapEditor({ mindmapId }: MindmapEditorProps) {
  const { getMindmapById, addNode, updateNode, deleteNode: deleteNodeFromHook, updateNodePosition } = useMindmaps();
  const mindmap = getMindmapById(mindmapId);
  
  const [editingNode, setEditingNode] = useState<NodeData | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  
  const [newRootNodeTitle, setNewRootNodeTitle] = useState('');
  const [newRootNodeDescription, setNewRootNodeDescription] = useState('');

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [nodeToDelete, setNodeToDelete] = useState<{ id: string; title: string | undefined } | null>(null);

  const { toast } = useToast();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // State to force re-render of SVG lines after node positions update
  const [lineRenderKey, setLineRenderKey] = useState(0);

  useEffect(() => {
    // When mindmap data changes (e.g., node position), force re-render of lines
    if (mindmap) {
      setLineRenderKey(prev => prev + 1);
    }
  }, [mindmap?.data.nodes]);


  const handleAddRootNode = () => {
    if (!mindmap || !newRootNodeTitle.trim()) return;
    const newNode = addNode(mindmap.id, null, { title: newRootNodeTitle, description: newRootNodeDescription });
    if (newNode) {
        setNewRootNodeTitle('');
        setNewRootNodeDescription('');
        toast({ title: "Root Node Added", description: `Node "${newNode.title}" created.` });
    }
  };

  const handleAddChildNode = (parentId: string) => {
    if (!mindmap) return;
    const parentNode = mindmap.data.nodes[parentId];
    if (!parentNode) return;
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

  const requestDeleteNode = (nodeId: string) => {
    if (!mindmap) return;
    const node = mindmap.data.nodes[nodeId];
    if (node) {
      setNodeToDelete({ id: nodeId, title: node.title });
      setIsDeleteDialogOpen(true);
    }
  };

  const confirmDeleteNode = () => {
    if (!mindmap || !nodeToDelete) return;
    deleteNodeFromHook(mindmap.id, nodeToDelete.id);
    toast({ title: "Node Deleted", description: `Node "${nodeToDelete.title}" and its children removed.`, variant: "destructive" });
    setIsDeleteDialogOpen(false);
    setNodeToDelete(null);
  };

  const handleDragStart = (event: React.DragEvent<HTMLDivElement>, nodeId: string) => {
    setDraggedNodeId(nodeId);
    // Calculate offset from mouse position to top-left of node
    const nodeElement = document.getElementById(`node-${nodeId}`);
    if (nodeElement && canvasRef.current) {
        const nodeRect = nodeElement.getBoundingClientRect();
        const canvasRect = canvasRef.current.getBoundingClientRect();
        
        // Adjust for scroll position of the ScrollArea's viewport
        const scrollViewport = canvasRef.current.querySelector('div[data-radix-scroll-area-viewport]');
        const scrollTop = scrollViewport?.scrollTop || 0;
        const scrollLeft = scrollViewport?.scrollLeft || 0;

        setDragOffset({
            x: event.clientX - nodeRect.left,
            y: event.clientY - nodeRect.top,
        });
    }
    event.dataTransfer.effectAllowed = "move";
    // Set dummy data for Firefox drag to work
    event.dataTransfer.setData("text/plain", nodeId); 
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault(); // Necessary to allow dropping
    event.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!draggedNodeId || !mindmap || !canvasRef.current) return;

    const canvasRect = canvasRef.current.getBoundingClientRect();
    
    // Adjust for scroll position of the ScrollArea's viewport
    const scrollViewport = canvasRef.current.querySelector('div[data-radix-scroll-area-viewport]');
    const scrollTop = scrollViewport?.scrollTop || 0;
    const scrollLeft = scrollViewport?.scrollLeft || 0;
    
    let newX = event.clientX - canvasRect.left + scrollLeft - dragOffset.x;
    let newY = event.clientY - canvasRect.top + scrollTop - dragOffset.y;

    // Ensure node stays within some bounds (e.g., not negative)
    newX = Math.max(0, newX);
    newY = Math.max(0, newY);

    updateNodePosition(mindmap.id, draggedNodeId, newX, newY);
    setDraggedNodeId(null);
  };

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
  
  const allNodes = Object.values(mindmap.data.nodes);

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
      <ScrollArea className="w-full whitespace-nowrap rounded-lg border bg-background shadow-inner flex-grow min-h-[calc(100vh-350px)] sm:min-h-[calc(100vh-300px)]">
        <div 
          ref={canvasRef}
          className="relative p-4 min-w-max min-h-full" // Ensure canvas is large enough
          style={{ width: '200vw', height: '200vh' }} // Make canvas very large to allow nodes to be placed far
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {/* Render Nodes */}
          {allNodes.map((node) => (
            <NodeCard
              key={node.id}
              node={node}
              onEdit={handleEditNode}
              onDelete={requestDeleteNode}
              onAddChild={handleAddChildNode}
              onDragStart={handleDragStart}
            />
          ))}
          
          {/* Render SVG Lines - key change forces re-render */}
          <svg key={lineRenderKey} className="absolute top-0 left-0 w-full h-full pointer-events-none z-[-1]">
            <defs>
                <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="hsl(var(--border))" />
                </marker>
            </defs>
            {allNodes.map(node => {
              if (!node.parentId) return null;
              const parentNode = mindmap.data.nodes[node.parentId];
              if (!parentNode) return null;

              // Calculate connection points (e.g., center of card or specific anchor points)
              // Simple center-to-center for now
              const startX = parentNode.x + NODE_CARD_WIDTH / 2;
              const startY = parentNode.y + NODE_CARD_HEADER_HEIGHT / 2; // Connect from middle of header
              const endX = node.x + NODE_CARD_WIDTH / 2;
              const endY = node.y; // Connect to top-middle of child

              const strokeColor = parentNode.parentId === null ? "hsl(var(--primary))" : "hsl(var(--accent))";

              return (
                <line
                  key={`${parentNode.id}-${node.id}`}
                  x1={startX}
                  y1={startY}
                  x2={endX}
                  y2={endY}
                  stroke={strokeColor}
                  strokeWidth="2"
                  // markerEnd="url(#arrowhead)" // Optional: add arrowheads
                />
              );
            })}
          </svg>

          {allNodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <p className="text-muted-foreground text-center py-10 text-lg">
                This mindmap is empty. Add a root idea to begin!
              </p>
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

      {nodeToDelete && (
        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete the node "{nodeToDelete.title}" and all its children? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setNodeToDelete(null)}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDeleteNode} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
