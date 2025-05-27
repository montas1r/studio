
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
// NODE_CARD_HEIGHT is an approximation for initial placement and S-curve start.
// The actual height of NodeCard can vary based on description content.
const NODE_CARD_HEIGHT = 100; 
const NODE_HEADER_HEIGHT = 50; // Approximate height of the card's header, for connection points.


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

  const [lineRenderKey, setLineRenderKey] = useState(0);

  useEffect(() => {
    if (mindmap) {
      setLineRenderKey(prev => prev + 1);
    }
  }, [mindmap?.data.nodes]);


  const handleAddRootNode = () => {
    if (!mindmap || !newRootNodeTitle.trim()) return;
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

    const tempNewNode: NodeData = {
      id: `temp-${uuidv4()}`, 
      title: `Child of ${parentNode.title}`, 
      description: "",
      emoji: "",
      parentId: parentId,
      childIds: [],
      // Initial position will be set by addNode if saved
      x: parentNode.x + 50, 
      y: parentNode.y + NODE_CARD_HEIGHT + 50, 
    };
    
    setEditingNode(tempNewNode);
    setIsEditDialogOpen(true);
  };

  const handleEditNode = (node: NodeData) => {
    setEditingNode(node);
    setIsEditDialogOpen(true);
  };

  const handleSaveNode = (nodeId: string, data: EditNodeInput) => {
    if (!mindmap || !editingNode) return;

    if (editingNode.id.startsWith('temp-')) { 
      const permanentNode = addNode(mindmap.id, editingNode.parentId, data);
      if (permanentNode) {
        toast({ title: "Node Created", description: `Node "${permanentNode.title}" added.` });
      }
    } else { 
      updateNode(mindmap.id, nodeId, data);
      toast({ title: "Node Updated", description: `Node "${data.title}" saved.` });
    }
    setEditingNode(null); 
    setIsEditDialogOpen(false); 
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
        setDragOffset({
            x: event.clientX - nodeRect.left,
            y: event.clientY - nodeRect.top,
        });
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", nodeId); 
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault(); 
    event.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!draggedNodeId || !mindmap || !canvasRef.current) return;

    const canvasRect = canvasRef.current.getBoundingClientRect();
    const scrollViewport = canvasRef.current.closest('div[data-radix-scroll-area-viewport]');
    const scrollTop = scrollViewport?.scrollTop || 0;
    const scrollLeft = scrollViewport?.scrollLeft || 0;
    
    let newX = event.clientX - canvasRect.left + scrollLeft - dragOffset.x;
    let newY = event.clientY - canvasRect.top + scrollTop - dragOffset.y;

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
      
      <ScrollArea className="w-full whitespace-nowrap rounded-lg border bg-background shadow-inner flex-grow min-h-[calc(100vh-350px)] sm:min-h-[calc(100vh-300px)]">
        <div 
          ref={canvasRef}
          className="relative p-4 min-w-max min-h-full" 
          style={{ width: '200vw', height: '200vh' }}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
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
          
          <svg key={lineRenderKey} className="absolute top-0 left-0 w-full h-full pointer-events-none">
            {allNodes.map(node => {
              if (!node.parentId) return null; 
              
              const parentNode = mindmap.data.nodes[node.parentId];
              if (!parentNode) return null; 

              const startX = parentNode.x + NODE_CARD_WIDTH / 2;
              // Connect from bottom of parent's header area
              const startY = parentNode.y + NODE_HEADER_HEIGHT; 
              
              const endX = node.x + NODE_CARD_WIDTH / 2;
              // Connect to top of child node
              const endY = node.y; 

              const strokeColor = parentNode.parentId === null ? "hsl(var(--primary))" : "hsl(var(--accent))"; 
              
              // Calculate offset for S-curve control points
              // Makes the vertical "stem" of the S-curve proportional to vertical distance, with min/max
              const sCurveOffset = Math.max(20, Math.min(60, Math.abs(endY - startY) / 2.5));

              // Control points for the cubic Bezier "S" curve
              const cp1X = startX;
              const cp1Y = startY + sCurveOffset;
              const cp2X = endX;
              const cp2Y = endY - sCurveOffset;
              
              const pathData = `M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${endY}`;

              return (
                <path
                  key={`${parentNode.id}-${node.id}`}
                  d={pathData}
                  stroke={strokeColor}
                  strokeWidth="2"
                  fill="none"
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

      {isEditDialogOpen && editingNode && (
        <EditNodeDialog
          isOpen={isEditDialogOpen}
          onOpenChange={(open) => {
            setIsEditDialogOpen(open);
            if (!open) setEditingNode(null); 
          }}
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
