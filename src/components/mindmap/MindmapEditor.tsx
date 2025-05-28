
"use client";

import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { Mindmap, NodeData, EditNodeInput, PaletteColorKey } from '@/types/mindmap';
import { useMindmaps } from '@/hooks/useMindmaps';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NodeCard } from './NodeCard';
import { EditNodeDialog } from './EditNodeDialog';
import { PlusCircle, Download, ArrowLeft, Home, Palette } from 'lucide-react';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

// Constants for node and canvas dimensions, ensure these are consistent if used elsewhere
const NODE_CARD_WIDTH = 300; // Logical width, used for SVG calculations
const NODE_HEADER_HEIGHT = 50; // Approximate, used for SVG calculations
const CANVAS_CONTENT_WIDTH = '1200px'; // Default canvas logical size
const CANVAS_CONTENT_HEIGHT = '1200px';


interface MindmapEditorProps {
  mindmapId: string;
}

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
  const canvasContentRef = useRef<HTMLDivElement>(null); 

  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  // dragOffset state is kept for potential future use or if dataTransfer proves problematic in some edge cases
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });


  const handleAddRootNode = useCallback(async () => {
    if (newRootNodeTitle.trim() === '') {
      toast({ title: "Title Required", description: "Please enter a title for the new root node.", variant: "destructive" });
      return;
    }
    if (!mindmap) return;

    const defaultEmoji = '💡'; 
    const newNodeData: EditNodeInput = {
      title: newRootNodeTitle,
      description: newRootNodeDescription,
      emoji: defaultEmoji,
    };

    const newNode = addNode(mindmap.id, null, newNodeData);
    if (newNode) {
      setNewRootNodeTitle('');
      setNewRootNodeDescription('');
      toast({ title: "Root Node Added", description: `"${newNode.title}" added to the mindmap.` });
      
      setTimeout(() => {
        if (canvasRef.current && newNode.x !== undefined && newNode.y !== undefined) {
           const nodeElement = document.getElementById(`node-${newNode.id}`);
           if (nodeElement) {
             nodeElement.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
           }
        }
      }, 100);
    }
  }, [newRootNodeTitle, newRootNodeDescription, mindmap, addNode, toast]);

  const handleAddChildNode = useCallback((parentId: string) => {
    if (!mindmap) return;
    const parentNode = mindmap.data.nodes[parentId];
    if (!parentNode) return;

    const tempNewNode: NodeData = {
      id: `temp-${uuidv4()}`, 
      title: '', 
      description: "",
      emoji: "➕", 
      parentId: parentId,
      childIds: [],
      x: (parentNode.x ?? 0), 
      y: (parentNode.y ?? 0) + NODE_HEADER_HEIGHT + 100,
      // No customBackgroundColor or imageUrl for temp node
    };
    setEditingNode(tempNewNode);
    setIsEditDialogOpen(true);
  }, [mindmap]);


  const handleEditNode = useCallback((node: NodeData) => {
    setEditingNode(node);
    setIsEditDialogOpen(true);
  }, []);

  const handleSaveNode = useCallback((nodeId: string, data: EditNodeInput) => {
    if (!mindmap || !editingNode) return; // editingNode must exist here
    if (editingNode.id.startsWith('temp-')) { 
      const permanentNode = addNode(mindmap.id, editingNode.parentId, data);
      if (permanentNode) {
        toast({ title: "Node Created", description: `Node "${permanentNode.title}" added.` });
         setTimeout(() => {
            const nodeElement = document.getElementById(`node-${permanentNode.id}`);
            if (nodeElement) {
              nodeElement.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
            }
        }, 100);
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
    const nodeElement = event.currentTarget;
    if (!nodeElement || !canvasRef.current) return;

    const nodeRect = nodeElement.getBoundingClientRect();
    const currentDragOffset = {
      x: event.clientX - nodeRect.left,
      y: event.clientY - nodeRect.top,
    };
    setDragOffset(currentDragOffset); // Still set state for potential other uses or direct reading if preferred
    // Store offset in dataTransfer as a primary means for drop calculation
    event.dataTransfer.setData('application/json', JSON.stringify(currentDragOffset));

    setDraggedNodeId(nodeId);
    event.dataTransfer.effectAllowed = "move";
    // It's good practice to set some data, even if just for external drop targets or Firefox.
    event.dataTransfer.setData("text/plain", nodeId); 
  }, []);


  const handleDragOverCanvas = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault(); 
    if (draggedNodeId) {
      event.dataTransfer.dropEffect = "move";
    }
  }, [draggedNodeId]);

  const handleDropOnCanvas = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!draggedNodeId || !mindmap || !canvasRef.current) return;

    let offsetX = dragOffset.x; // Fallback to state
    let offsetY = dragOffset.y; // Fallback to state

    try {
      const data = event.dataTransfer.getData('application/json');
      if (data) {
        const parsedOffset = JSON.parse(data);
        offsetX = parsedOffset.x;
        offsetY = parsedOffset.y;
      }
    } catch (e) {
      console.error("Could not parse drag offset from dataTransfer, falling back to state:", e);
      // If parsing fails, offsetX and offsetY will retain values from state (dragOffset.x, dragOffset.y)
    }

    const canvasRect = canvasRef.current.getBoundingClientRect();
    const scrollLeft = canvasRef.current.scrollLeft;
    const scrollTop = canvasRef.current.scrollTop;
    
    let newX = event.clientX - canvasRect.left + scrollLeft - offsetX;
    let newY = event.clientY - canvasRect.top + scrollTop - offsetY;
    
    updateNodePosition(mindmap.id, draggedNodeId, newX, newY);
    setDraggedNodeId(null);
  }, [draggedNodeId, mindmap, dragOffset, updateNodePosition]);


  const handleExportJson = useCallback(() => {
    if (!mindmap) return;
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(mindmap, null, 2))}`;
    const link = document.createElement("a");
    link.href = jsonString;
    link.download = `${mindmap.name.replace(/\s+/g, '_').toLowerCase()}_mindmap.json`;
    link.click();
    toast({ title: "Exported", description: "Mindmap data exported as JSON." });
  }, [mindmap, toast]);


  if (!mindmap) {
    return (
      <div className="flex flex-col items-center justify-center h-full flex-grow space-y-4 text-center py-10">
        <Palette className="w-16 h-16 text-destructive" />
        <h2 className="text-2xl font-bold">Mindmap Not Found</h2>
        <p className="text-muted-foreground">The mindmap you are looking for does not exist or has been deleted.</p>
        <Button asChild variant="outline" size="sm">
          <Link href="/"><Home className="mr-1.5 h-4 w-4" /> Library</Link>
        </Button>
      </div>
    );
  }
  const allNodes = Object.values(mindmap.data.nodes);
  const svgKey = allNodes.map(n => `${n.id}-${n.x}-${n.y}-${(n.childIds || []).join(',')}-${n.customBackgroundColor}`).join('|');


  return (
    <TooltipProvider>
      <div className="flex flex-col h-full flex-grow w-full">
         <div className="p-2 border-b bg-background/95 backdrop-blur-sm sticky top-0 z-30 shadow-sm space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="flex items-center gap-2 flex-shrink-0 min-w-0">
               <Tooltip>
                <TooltipTrigger asChild>
                  <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                    <Link href="/">
                        <Home className="h-4 w-4" />
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Back to Library</p></TooltipContent>
              </Tooltip>
              <h1 className="text-xl font-semibold text-foreground truncate" title={mindmap.name}>
                {mindmap.name}
              </h1>
              {mindmap.category && (
                <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-full flex items-center gap-1 whitespace-nowrap">
                  <Layers className="h-3 w-3" /> {mindmap.category}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
               <Tooltip>
                <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={handleExportJson} className="h-8 w-8">
                        <Download className="h-4 w-4" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent><p>Export JSON</p></TooltipContent>
              </Tooltip>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch gap-2">
            <Input
              type="text"
              value={newRootNodeTitle}
              onChange={(e) => setNewRootNodeTitle(e.target.value)}
              placeholder="New Root Idea Title"
              className="flex-grow h-9 text-sm"
            />
            <Textarea
              value={newRootNodeDescription}
              onChange={(e) => setNewRootNodeDescription(e.target.value)}
              placeholder="Description (Optional)"
              rows={1}
              className="flex-grow text-sm min-h-[36px] h-9 resize-y max-h-24" 
            />
            <Button onClick={handleAddRootNode} size="sm" className="h-9 text-sm whitespace-nowrap px-3">
              <PlusCircle className="mr-1.5 h-4 w-4" /> Add Root Idea
            </Button>
          </div>
        </div>

        <div
          ref={canvasRef} 
          className="flex-grow relative overflow-auto bg-muted/20 min-h-[calc(100vh-180px)]"
          onDragOver={handleDragOverCanvas} 
          onDrop={handleDropOnCanvas} 
        >
            <div
                ref={canvasContentRef} 
                className="relative" 
                style={{
                    width: CANVAS_CONTENT_WIDTH, 
                    height: CANVAS_CONTENT_HEIGHT,
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
                />
                ))}

                <svg
                    className="absolute top-0 left-0 pointer-events-none"
                    style={{
                        width: CANVAS_CONTENT_WIDTH, 
                        height: CANVAS_CONTENT_HEIGHT,
                        overflow: 'visible', 
                    }}
                    key={svgKey} 
                >
                {allNodes.map(node => {
                    if (!node.parentId) return null;
                    const parentNode = mindmap.data.nodes[node.parentId];
                    if (!parentNode) return null;

                    // Define anchor points
                    const startX = (parentNode.x ?? 0) + NODE_CARD_WIDTH / 2;
                    let startY = (parentNode.y ?? 0) + NODE_HEADER_HEIGHT; 
                    // Adjust startY if parent has description, to emerge from bottom of card
                    // This requires knowing the rendered height of the parent card, which is complex.
                    // For simplicity, we'll use a fixed offset or emerge from header bottom.
                    // If parentNode.description, startY = (parentNode.y ?? 0) + approximated_card_height;

                    const endX = (node.x ?? 0) + NODE_CARD_WIDTH / 2;
                    const endY = (node.y ?? 0); 

                    // Control points for the Bezier curve
                    // c1y and c2y create the "S" shape vertically
                    const c1x = startX;
                    const c1y = startY + Math.max(20, Math.abs(endY - startY) / 2.5); // Adjust curviness
                    const c2x = endX;
                    const c2y = endY - Math.max(20, Math.abs(endY - startY) / 2.5); // Adjust curviness
                    
                    const pathData = `M ${startX} ${startY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${endX} ${endY}`;
                    
                    let strokeColor = "hsl(var(--accent))"; 
                    if (parentNode.customBackgroundColor) {
                       strokeColor = `hsl(var(--${parentNode.customBackgroundColor}-raw, var(--${parentNode.customBackgroundColor})))`;
                    } else if (!parentNode.parentId) { // Parent is a root node
                        strokeColor = "hsl(var(--primary))";
                    }

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
                  <div
                    className="absolute flex items-center justify-center pointer-events-none text-center inset-0"
                  >
                    <div className="text-muted-foreground text-lg bg-background/80 p-6 rounded-md shadow-lg">
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
