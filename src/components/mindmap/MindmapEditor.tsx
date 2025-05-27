
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
import { v4 as uuidv4 } from 'uuid';

interface MindmapEditorProps {
  mindmapId: string;
}

const NODE_CARD_WIDTH = 300;
const NODE_CARD_HEIGHT = 100; // Approximate height for line connection logic. Use a more specific value if card height varies significantly.
const NODE_CARD_HEADER_HEIGHT = 50; // Approximate, for root node connection points.


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

  const [lineRenderKey, setLineRenderKey] = useState(0); // Used to force re-render of SVG lines

  useEffect(() => {
    if (mindmap) {
      // Force re-render of lines when nodes data changes (e.g., position, add, delete)
      setLineRenderKey(prev => prev + 1);
    }
  }, [mindmap?.data.nodes]);


  const handleAddRootNode = () => {
    if (!mindmap || !newRootNodeTitle.trim()) return;
    // addNode from useMindmaps now handles initial positioning
    const newNode = addNode(mindmap.id, null, { 
      title: newRootNodeTitle, 
      description: newRootNodeDescription, 
      emoji: '' 
    });
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

    // Create a temporary node object. It won't be saved until the dialog confirms.
    const tempNewNode: NodeData = {
      id: `temp-${uuidv4()}`, // Temporary ID
      title: `Child of ${parentNode.title}`, // Default title
      description: "",
      emoji: "",
      parentId: parentId,
      childIds: [],
      x: parentNode.x + 50, // Basic offset from parent
      y: parentNode.y + NODE_CARD_HEIGHT + 50, 
    };
    
    setEditingNode(tempNewNode);
    setIsEditDialogOpen(true);
    // No toast yet, node is not confirmed
  };

  const handleEditNode = (node: NodeData) => {
    setEditingNode(node);
    setIsEditDialogOpen(true);
  };

  const handleSaveNode = (nodeId: string, data: EditNodeInput) => {
    if (!mindmap || !editingNode) return;

    if (editingNode.id.startsWith('temp-')) { // This is a new node being created
      const permanentNode = addNode(mindmap.id, editingNode.parentId, data);
      if (permanentNode) {
        toast({ title: "Node Created", description: `Node "${permanentNode.title}" added.` });
      }
    } else { // This is an existing node being edited
      updateNode(mindmap.id, nodeId, data);
      toast({ title: "Node Updated", description: `Node "${data.title}" saved.` });
    }
    setEditingNode(null); // Clear editing state
    setIsEditDialogOpen(false); // Close dialog
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
    toast({ title: "Node Deleted", description: `Node "${nodeToDelete.title || 'Untitled'}" and its children removed.`, variant: "destructive" });
    setIsDeleteDialogOpen(false);
    setNodeToDelete(null);
  };

  const handleDragStart = (event: React.DragEvent<HTMLDivElement>, nodeId: string) => {
    setDraggedNodeId(nodeId);
    const nodeElement = document.getElementById(`node-${nodeId}`);
    if (nodeElement && canvasRef.current) {
        const nodeRect = nodeElement.getBoundingClientRect();
        const canvasRect = canvasRef.current.getBoundingClientRect(); // Needed if canvas itself is transformed/offset
        setDragOffset({
            x: event.clientX - nodeRect.left,
            y: event.clientY - nodeRect.top,
        });
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", nodeId); // Necessary for Firefox
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault(); 
    event.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!draggedNodeId || !mindmap || !canvasRef.current) return;

    const canvasRect = canvasRef.current.getBoundingClientRect();
    // Account for scrolling within the ScrollArea
    const scrollViewport = canvasRef.current.closest('div[data-radix-scroll-area-viewport]');
    const scrollTop = scrollViewport?.scrollTop || 0;
    const scrollLeft = scrollViewport?.scrollLeft || 0;
    
    let newX = event.clientX - canvasRect.left + scrollLeft - dragOffset.x;
    let newY = event.clientY - canvasRect.top + scrollTop - dragOffset.y;

    // Constrain to canvas boundaries (0,0 minimum)
    newX = Math.max(0, newX);
    newY = Math.max(0, newY);
    // TODO: Consider max boundaries based on canvas size if needed

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
  const rootNodes = allNodes.filter(node => !node.parentId);

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
          className="relative p-4 min-w-max min-h-full" 
          style={{ width: '200vw', height: '200vh' }} // Large canvas for node placement
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {/* Render Nodes */}
          {allNodes.map((node) => (
            <NodeCard
              key={node.id}
              node={node}
              isRoot={!node.parentId}
              onEdit={handleEditNode}
              onDelete={requestDeleteNode}
              onAddChild={handleAddChildNode}
              onDragStart={handleDragStart}
            />
          ))}
          
          {/* Render SVG Lines - Rendered on top of nodes if z-index isn't carefully managed, or below if z-index is negative. Pointer-events-none is good. */}
          <svg key={lineRenderKey} className="absolute top-0 left-0 w-full h-full pointer-events-none">
            <defs>
                <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="hsl(var(--border))" />
                </marker>
            </defs>
            {allNodes.map(node => {
              if (!node.parentId) return null; // Node is a root, no incoming line
              
              const parentNode = mindmap.data.nodes[node.parentId];
              if (!parentNode) return null; // Parent not found

              // Only draw line if the parentNode is a root node
              if (parentNode.parentId !== null) {
                return null;
              }

              // Calculate connection points
              // For parent (root), connect from bottom-center-ish
              const startX = parentNode.x + NODE_CARD_WIDTH / 2;
              const startY = parentNode.y + NODE_CARD_HEADER_HEIGHT; // Use header height for root, or full height if more accurate
              
              // For child, connect to top-center
              const endX = node.x + NODE_CARD_WIDTH / 2;
              const endY = node.y; 

              const strokeColor = "hsl(var(--primary))"; 

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

      {isEditDialogOpen && editingNode && ( // Ensure editingNode is not null before rendering dialog
        <EditNodeDialog
          isOpen={isEditDialogOpen}
          onOpenChange={(open) => {
            setIsEditDialogOpen(open);
            if (!open) setEditingNode(null); // Clear editingNode when dialog closes
          }}
          node={editingNode} // Pass the node being edited or the temporary new node
          onSave={handleSaveNode}
        />
      )}

      {nodeToDelete && (
        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete the node "{nodeToDelete.title || 'Untitled'}" and all its children? This action cannot be undone.
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
