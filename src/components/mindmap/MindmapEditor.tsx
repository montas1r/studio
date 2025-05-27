
"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Mindmap, NodeData, EditNodeInput } from '@/types/mindmap';
import { useMindmaps } from '@/hooks/useMindmaps';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NodeCard } from './NodeCard';
import { EditNodeDialog } from './EditNodeDialog';
import { PlusCircle, Download, ArrowLeft, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
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
import { TooltipProvider } from '@/components/ui/tooltip'; // Keep for NodeCard tooltips if any

interface MindmapEditorProps {
  mindmapId: string;
}

const NODE_CARD_WIDTH = 300;
const NODE_HEADER_HEIGHT = 50; // Approximate height of the node card header/title area
const CANVAS_CONTENT_WIDTH = '800vw'; // Large logical width for ample space
const CANVAS_CONTENT_HEIGHT = '800vh'; // Large logical height for ample space

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

  const canvasRef = useRef<HTMLDivElement>(null); // Renamed for clarity
  
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    // Center initial view if needed (simple scroll for basic canvas)
    if (mindmap && mindmap.data.rootNodeIds.length > 0 && canvasRef.current) {
      const firstRootNodeId = mindmap.data.rootNodeIds[0];
      const firstRootNode = mindmap.data.nodes[firstRootNodeId];
      if (firstRootNode) {
        // Scroll to bring the first node roughly into view
        // This is a simplified centering for a non-transformed canvas
        const targetX = firstRootNode.x + NODE_CARD_WIDTH / 2 - canvasRef.current.clientWidth / 2;
        const targetY = firstRootNode.y + NODE_HEADER_HEIGHT / 2 - canvasRef.current.clientHeight / 2;
        canvasRef.current.scrollTo({ left: Math.max(0, targetX), top: Math.max(0, targetY), behavior: 'smooth' });
      }
    }
  }, [mindmapId, mindmap]); // Re-center when mindmapId changes (navigating to a new map)


  const handleAddRootNode = useCallback(() => {
    if (newRootNodeTitle.trim() === '') {
      toast({ title: "Title Required", description: "Please enter a title for the new root node.", variant: "destructive" });
      return;
    }
    if (!mindmap || !canvasRef.current) return;

    // Calculate initial position for the new root node
    let initialX = 0;
    let initialY = 0;
    
    if (mindmap.data.rootNodeIds.length > 0) {
        const lastRootNodeId = mindmap.data.rootNodeIds[mindmap.data.rootNodeIds.length -1];
        const lastRootNode = mindmap.data.nodes[lastRootNodeId];
        if(lastRootNode) {
            initialX = lastRootNode.x + NODE_CARD_WIDTH + 50; // Add 50px spacing
            initialY = lastRootNode.y;
        } else { 
            initialX = (mindmap.data.rootNodeIds.length * (NODE_CARD_WIDTH + 50));
        }
    }
    // Consider current scroll position to place new node somewhat in view if possible
    initialX = Math.max(initialX, canvasRef.current.scrollLeft + 50);
    initialY = Math.max(initialY, canvasRef.current.scrollTop + 50);
    
    const newNode = addNode(mindmap.id, null, { title: newRootNodeTitle, description: newRootNodeDescription, emoji: '💡' }, initialX, initialY);
    if (newNode) {
        setNewRootNodeTitle('');
        setNewRootNodeDescription('');
        toast({ title: "Root Node Added", description: `"${newNode.title}" added to the mindmap.` });
    }
  }, [newRootNodeTitle, newRootNodeDescription, mindmap, addNode, toast]);

  const handleAddChildNode = useCallback((parentId: string) => {
    if (!mindmap) return;
    const parentNode = mindmap.data.nodes[parentId];
    if (!parentNode) return;

    const initialX = parentNode.x;
    const initialY = parentNode.y + NODE_HEADER_HEIGHT + 60;

    const tempNewNode: NodeData = {
      id: `temp-${uuidv4()}`,
      title: '',
      description: "",
      emoji: "➕",
      parentId: parentId,
      childIds: [],
      x: initialX, 
      y: initialY,
    };
    setEditingNode(tempNewNode);
    setIsEditDialogOpen(true);
  }, [mindmap]);


  const handleEditNode = useCallback((node: NodeData) => {
    setEditingNode(node);
    setIsEditDialogOpen(true);
  }, []);

  const handleSaveNode = useCallback((nodeId: string, data: EditNodeInput) => {
    if (!mindmap || !editingNode) return;

    if (editingNode.id.startsWith('temp-')) {
      const permanentNode = addNode(mindmap.id, editingNode.parentId, data, editingNode.x, editingNode.y);
      if (permanentNode) {
        toast({ title: "Node Created", description: `Node "${permanentNode.title}" added.` });
      }
    } else {
      updateNode(mindmap.id, nodeId, data);
      toast({ title: "Node Updated", description: `Node "${data.title}" saved.` });
    }
    setEditingNode(null);
    setIsEditDialogOpen(false);
  }, [mindmap, editingNode, addNode, updateNode, toast]);

  const requestDeleteNode = useCallback((nodeId: string) => {
    if (!mindmap) return;
    const node = mindmap.data.nodes[nodeId];
    if (node) {
      setNodeToDelete({ id: nodeId, title: node.title });
      setIsDeleteDialogOpen(true);
    }
  }, [mindmap]);

  const confirmDeleteNode = useCallback(() => {
    if (!mindmap || !nodeToDelete) return;
    deleteNodeFromHook(mindmap.id, nodeToDelete.id);
    toast({ title: "Node Deleted", description: `Node "${nodeToDelete.title || 'Untitled'}" and its children removed.`, variant: "destructive" });
    setIsDeleteDialogOpen(false);
    setNodeToDelete(null);
  }, [mindmap, nodeToDelete, deleteNodeFromHook, toast]);

  const handleNodeDragStart = useCallback((event: React.DragEvent<HTMLDivElement>, nodeId: string) => {
    setDraggedNodeId(nodeId);
    const nodeElement = event.currentTarget;
    const nodeRect = nodeElement.getBoundingClientRect();
    const canvasRect = canvasRef.current?.getBoundingClientRect();

    if (canvasRect) {
        setDragOffset({
            x: event.clientX - nodeRect.left,
            y: event.clientY - nodeRect.top,
        });
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", nodeId); 
  }, []);
  
  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault(); 
    if (draggedNodeId) {
      event.dataTransfer.dropEffect = "move";
    }
  }, [draggedNodeId]);

  const handleDragEnter = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (draggedNodeId) {
      event.dataTransfer.dropEffect = "move";
    }
  }, [draggedNodeId]);

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!draggedNodeId || !mindmap || !canvasRef.current) return;

    const canvasRect = canvasRef.current.getBoundingClientRect();
    
    let newX = event.clientX - canvasRect.left + canvasRef.current.scrollLeft - dragOffset.x;
    let newY = event.clientY - canvasRect.top + canvasRef.current.scrollTop - dragOffset.y;
    
    // Optionally, prevent dragging to negative coordinates if desired for this simple canvas
    // newX = Math.max(0, newX); 
    // newY = Math.max(0, newY);

    updateNodePosition(mindmap.id, draggedNodeId, newX, newY);
    setDraggedNodeId(null);
  }, [draggedNodeId, mindmap, dragOffset, updateNodePosition]);


  const handleExportJson = () => {
    if (!mindmap) return;
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(mindmap, null, 2)
    )}`;
    const link = document.createElement("a");
    link.href = jsonString;
    link.download = `${mindmap.name.replace(/\s+/g, '_').toLowerCase()}_mindmap.json`;
    link.click();
    toast({ title: "Exported", description: "Mindmap data exported as JSON." });
  };


  if (!mindmap) {
    return (
      <div className="flex flex-col items-center justify-center h-full flex-grow space-y-4 text-center py-10">
        <AlertTriangle className="w-16 h-16 text-destructive" />
        <h2 className="text-2xl font-bold">Mindmap Not Found</h2>
        <p className="text-muted-foreground">The mindmap you are looking for does not exist or has been deleted.</p>
        <Button asChild variant="outline" size="sm">
          <Link href="/">
            <span className="flex items-center"><ArrowLeft className="mr-1 h-3 w-3" /> Library</span>
          </Link>
        </Button>
      </div>
    );
  }

  const allNodes = Object.values(mindmap.data.nodes);

  return (
    <TooltipProvider>
    <div className="flex flex-col h-full flex-grow w-full space-y-1">
      {/* Top Control Bar */}
      <div className="p-1 border-b bg-background/80 backdrop-blur-sm rounded-t-lg sticky top-0 z-10">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1 mb-1">
          <div className="flex-grow">
            <h1 className="text-xs sm:text-sm font-semibold text-foreground truncate px-1" title={mindmap.name}>
              {mindmap.name}
            </h1>
            <div className="flex items-center gap-1 mt-0.5 px-1">
              <Button asChild variant="outline" size="sm" className="text-xs h-7 px-2">
                 <Link href="/">
                   <span className="flex items-center"><ArrowLeft className="mr-1 h-3 w-3" /> Library</span>
                 </Link>
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportJson} className="text-xs h-7 px-2">
                <Download className="mr-1 h-3 w-3" /> Export
              </Button>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch gap-1 px-1 w-full sm:w-auto mt-1 sm:mt-0 self-end sm:self-center">
            <Input
              type="text"
              value={newRootNodeTitle}
              onChange={(e) => setNewRootNodeTitle(e.target.value)}
              placeholder="New Root Idea"
              className="flex-grow text-xs h-7"
            />
            <Textarea
              value={newRootNodeDescription}
              onChange={(e) => setNewRootNodeDescription(e.target.value)}
              placeholder="Description (Optional)"
              rows={1}
              className="flex-grow text-xs min-h-[28px] h-7 resize-none"
            />
            <Button onClick={handleAddRootNode} size="sm" className="text-xs h-7 px-2 whitespace-nowrap">
              <PlusCircle className="mr-1 h-3 w-3" /> Add Root
            </Button>
          </div>
        </div>
      </div>

      {/* Main Editing Canvas */}
      <div 
        ref={canvasRef}
        className="relative border-2 border-dashed border-destructive flex-grow overflow-auto min-h-[calc(100vh-220px)] sm:min-h-[calc(100vh-200px)]" // Adjusted min-height
        style={{
            width: '100%', // Take full available width
            // height is managed by flex-grow and min-height
        }}
        onDragOver={handleDragOver} 
        onDrop={handleDrop}     
        onDragEnter={handleDragEnter}
      >
        {/* Inner container for absolutely positioned nodes & SVG lines */}
        <div 
            className="relative" // No border here
            style={{
                width: CANVAS_CONTENT_WIDTH, // Very large logical canvas
                height: CANVAS_CONTENT_HEIGHT,
                // No transform needed for this simple version
            }}
        >
            {allNodes.map((node) => (
                <NodeCard
                  key={node.id}
                  node={node}
                  isRoot={!node.parentId}
                  onEdit={handleEditNode}
                  onDelete={requestDeleteNode}
                  onAddChild={handleAddChildNode}
                  onDragStart={(e, id) => handleNodeDragStart(e, id)}
                  className="node-card-draggable" 
                />
            ))}

            <svg
                key={`lines-${allNodes.length}`} 
                className="absolute top-0 left-0 w-full h-full pointer-events-none"
                style={{ width: CANVAS_CONTENT_WIDTH, height: CANVAS_CONTENT_HEIGHT }}
            >
                {allNodes.map(node => {
                if (!node.parentId) return null;
                const parentNode = mindmap.data.nodes[node.parentId];
                if (!parentNode) return null;

                const startX = parentNode.x + NODE_CARD_WIDTH / 2;
                const startY = parentNode.y + NODE_HEADER_HEIGHT;
                const endX = node.x + NODE_CARD_WIDTH / 2;
                const endY = node.y;

                const sCurveOffsetY = Math.max(20, Math.min(80, Math.abs(endY - startY) / 2));
                const pathData = `M ${startX} ${startY} C ${startX} ${startY + sCurveOffsetY}, ${endX} ${endY - sCurveOffsetY}, ${endX} ${endY}`;
                
                const strokeColor = parentNode.parentId === null ? "hsl(var(--primary))" : "hsl(var(--accent))";

                return (
                    <path
                    key={`${parentNode.id}-${node.id}`}
                    d={pathData}
                    stroke={strokeColor}
                    strokeWidth={2} // Fixed stroke width
                    fill="none"
                    />
                );
                })}
            </svg>

            {allNodes.length === 0 && !draggedNodeId && (
                <div
                  className="absolute inset-0 flex items-center justify-center pointer-events-none"
                  style={{
                    // Center message within the visible viewport of canvasRef
                    top: `50%`, 
                    left: `50%`,
                    transform: `translate(-50%, -50%)`, 
                    textAlign: 'center'
                   }}
                >
                  <div className="text-muted-foreground text-lg bg-background/80 p-6 rounded-md">
                      This mindmap is empty. Add a root idea to get started!
                  </div>
                </div>
            )}
        </div>
      </div>

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
    </TooltipProvider>
  );
}
    
    
