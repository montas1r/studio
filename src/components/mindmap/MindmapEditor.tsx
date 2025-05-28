
"use client";

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { Mindmap, NodeData, EditNodeInput, PaletteColorKey } from '@/types/mindmap';
import { useMindmaps } from '@/hooks/useMindmaps';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NodeCard } from './NodeCard';
import { EditNodeDialog } from './EditNodeDialog';
import { PlusCircle, Download, ArrowLeft, Home, Layers } from 'lucide-react';
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

const NODE_CARD_WIDTH = 300;
const APPROX_NODE_MIN_HEIGHT_NO_DESC = 70;
const APPROX_LINE_HEIGHT = 18;

const FIXED_CANVAS_WIDTH = 1200;
const FIXED_CANVAS_HEIGHT = 800;

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
  const canvasRef = useRef<HTMLDivElement>(null); // For the fixed-size canvas

  const getNodeHeight = useCallback((node: NodeData | null): number => {
    if (!node) return APPROX_NODE_MIN_HEIGHT_NO_DESC;
    let height = APPROX_NODE_MIN_HEIGHT_NO_DESC - 20; // Base for title/header, remove padding initially
  
    if (node.description) {
      const charWidth = 7; // Approximate character width
      const charsPerLine = NODE_CARD_WIDTH / charWidth;
      const linesFromDesc = Math.ceil((node.description.length / charsPerLine)) + (node.description.split('\n').length -1) ;
      height += Math.max(1, linesFromDesc) * APPROX_LINE_HEIGHT;
    } else {
      height += APPROX_LINE_HEIGHT; // Min height for empty description box
    }
    height += 20; // Padding for description box
    
    return Math.max(APPROX_NODE_MIN_HEIGHT_NO_DESC, height);
  }, []);


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
      customBackgroundColor: undefined,
    };
    
    const allNodesArray = Object.values(mindmap.data.nodes);
    const rootNodes = allNodesArray.filter(n => !n.parentId);
    
    let newX = 50; // Initial X for first root, or if no roots
    let newY = 50; // Initial Y

    if (rootNodes.length > 0) {
      // Simple placement: find max X of existing roots and place new one to the right
      // This might still place it outside the fixed 1200x800 if many roots, user will need to drag.
      newX = Math.max(...rootNodes.map(n => (n.x ?? 0) + NODE_CARD_WIDTH + 50), 50);
      newY = rootNodes[0]?.y ?? 50;
      if (newX + NODE_CARD_WIDTH > FIXED_CANVAS_WIDTH) {
        newX = 50; // Reset X if it goes too far, start a new "row" (conceptually)
        newY = Math.max(...rootNodes.map(n => (n.y ?? 0) + getNodeHeight(n) + 50), 50);
      }
    }
    
    const newRootNode = addNode(mindmap.id, null, newNodeData, newX, newY);
    if (newRootNode) {
        setNewRootNodeTitle('');
        setNewRootNodeDescription('');
        toast({ title: "Root Node Added", description: `"${newRootNode.title}" added.` });
    }
  }, [newRootNodeTitle, newRootNodeDescription, mindmap, addNode, toast, getNodeHeight]);

  const handleAddChildNode = useCallback((parentId: string) => {
    if (!mindmap) return;
    const parentNode = mindmap.data.nodes[parentId];
    if (!parentNode) return;

    const existingChildren = parentNode.childIds.map(id => mindmap.data.nodes[id]).filter(Boolean);
    const parentHeight = getNodeHeight(parentNode);
    
    let newX = (parentNode.x ?? 0); 
    let newY = (parentNode.y ?? 0) + parentHeight + 50;

    if (existingChildren.length > 0) {
        newX = (existingChildren[existingChildren.length - 1]?.x ?? parentNode.x ?? 0) + NODE_CARD_WIDTH + 30;
        newY = existingChildren[existingChildren.length - 1]?.y ?? newY;
        if (newX + NODE_CARD_WIDTH > FIXED_CANVAS_WIDTH) {
          newX = (parentNode.x ?? 0);
          newY = (existingChildren[existingChildren.length - 1]?.y ?? newY) + (getNodeHeight(existingChildren[existingChildren.length - 1]) ?? APPROX_NODE_MIN_HEIGHT_NO_DESC) + 30;
        }
    }


    const tempNewNode: NodeData = {
      id: `temp-${uuidv4()}`,
      title: '',
      description: "",
      emoji: "➕",
      parentId: parentId,
      childIds: [],
      x: newX, 
      y: newY, 
      customBackgroundColor: parentNode.customBackgroundColor, // Inherit parent's color by default
    };
    setEditingNode(tempNewNode);
    setIsEditDialogOpen(true);
  }, [mindmap, getNodeHeight]);

  const handleEditNode = useCallback((node: NodeData) => {
    setEditingNode(node);
    setIsEditDialogOpen(true);
  }, []);

  const handleSaveNode = useCallback((nodeId: string, data: EditNodeInput) => {
    if (!mindmap || !editingNode) return;

    const finalData: EditNodeInput = {
      title: data.title,
      description: data.description,
      emoji: data.emoji,
      customBackgroundColor: data.customBackgroundColor === 'no-custom-color' ? undefined : data.customBackgroundColor,
    };

    const nodeToPlace = { ...editingNode, ...finalData };
    const nodeHeight = getNodeHeight(nodeToPlace as NodeData);

    let finalX = editingNode.x ?? 0;
    let finalY = editingNode.y ?? 0;

    finalX = Math.max(0, Math.min(finalX, FIXED_CANVAS_WIDTH - NODE_CARD_WIDTH));
    finalY = Math.max(0, Math.min(finalY, FIXED_CANVAS_HEIGHT - nodeHeight));


    if (editingNode.id.startsWith('temp-')) {
      const permanentNode = addNode(mindmap.id, editingNode.parentId, finalData, finalX, finalY); 
      if (permanentNode) {
        toast({ title: "Node Created", description: `Node "${permanentNode.title}" added.` });
      }
    } else {
      updateNode(mindmap.id, editingNode.id, finalData);
      // If an existing node is saved, its position is already set, but we ensure it respects bounds if it was somehow out.
      if(editingNode.x !== finalX || editingNode.y !== finalY) {
        updateNodePosition(mindmap.id, editingNode.id, finalX, finalY);
      }
      toast({ title: "Node Updated", description: `Node "${data.title}" saved.` });
    }
    setEditingNode(null);
    setIsEditDialogOpen(false);
  }, [mindmap, editingNode, addNode, updateNode, updateNodePosition, toast, getNodeHeight]);

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
    const nodeRect = nodeElement.getBoundingClientRect();
    const canvasRect = canvasRef.current?.getBoundingClientRect();

    if (!canvasRect) return;
    
    // Offset of mouse click relative to the node's top-left corner
    const dragOffsetX = event.clientX - nodeRect.left;
    const dragOffsetY = event.clientY - nodeRect.top;
    
    event.dataTransfer.setData('application/json', JSON.stringify({
      nodeId,
      dragOffsetX, 
      dragOffsetY,
    }));
    event.dataTransfer.effectAllowed = "move";
  }, []);


  const handleDragOverCanvas = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const handleDropOnCanvas = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!canvasRef.current || !mindmap) return;

    let dragData;
    try {
      const jsonData = event.dataTransfer.getData('application/json');
      if (!jsonData) return;
      dragData = JSON.parse(jsonData);
    } catch (e) {
      console.error("Could not parse drag data:", e);
      return;
    }

    const { nodeId, dragOffsetX, dragOffsetY } = dragData;
    if (!nodeId || dragOffsetX === undefined || dragOffsetY === undefined) {
      console.error("Invalid drag data received:", dragData);
      return;
    }

    const canvasRect = canvasRef.current.getBoundingClientRect();
    
    let newX_logical = event.clientX - canvasRect.left - dragOffsetX;
    let newY_logical = event.clientY - canvasRect.top - dragOffsetY;
    
    const nodeToUpdate = mindmap.data.nodes[nodeId];
    const nodeHeight = getNodeHeight(nodeToUpdate);

    // Clamp position to within the fixed canvas boundaries
    newX_logical = Math.max(0, Math.min(newX_logical, FIXED_CANVAS_WIDTH - NODE_CARD_WIDTH));
    newY_logical = Math.max(0, Math.min(newY_logical, FIXED_CANVAS_HEIGHT - nodeHeight));

    updateNodePosition(mindmap.id, nodeId, newX_logical, newY_logical);
  }, [mindmap, updateNodePosition, getNodeHeight]);


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
        <Layers className="w-16 h-16 text-destructive" />
        <h2 className="text-2xl font-bold">Mindmap Not Found</h2>
        <p className="text-muted-foreground">The mindmap you are looking for does not exist or has been deleted.</p>
        <Button asChild variant="outline" size="sm">
          <Link href="/"><Home className="mr-1.5 h-4 w-4" /> Library</Link>
        </Button>
      </div>
    );
  }

  const allNodes = Object.values(mindmap.data.nodes);
  const svgKey = allNodes.map(n => `${n.id}-${n.x}-${n.y}-${n.parentId}-${(n.childIds || []).join(',')}`).join('|');

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full flex-grow w-full bg-muted/20"> {/* Changed background */}
        {/* Top Control Bar */}
        <div className="p-2 border-b bg-background/90 backdrop-blur-sm space-y-2 flex-shrink-0 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <div className="flex items-center gap-2 flex-shrink-0 min-w-0">
                    <Tooltip>
                        <TooltipTrigger asChild>
                        <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                            <Link href="/">
                            <ArrowLeft className="h-4 w-4" />
                            <span className="sr-only">Library</span>
                            </Link>
                        </Button>
                        </TooltipTrigger>
                        <TooltipContent><p>Library</p></TooltipContent>
                    </Tooltip>
                    <h1 className="text-lg font-semibold text-foreground truncate leading-none" title={mindmap.name}>
                        {mindmap.name}
                    </h1>
                    {mindmap.category && (
                        <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full flex items-center gap-1 whitespace-nowrap leading-none">
                        <Layers className="h-3 w-3" /> {mindmap.category}
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                    <Tooltip>
                        <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" onClick={handleExportJson} className="h-8 w-8">
                            <Download className="h-4 w-4" />
                            <span className="sr-only">Export JSON</span>
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

        {/* Centering Wrapper for the Fixed Canvas */}
        <div className="flex-grow flex items-center justify-center p-4 bg-muted/10">
          <div
            ref={canvasRef}
            className="relative bg-slate-100 shadow-2xl rounded-lg" // Using Tailwind bg-slate-100
            style={{
              width: `${FIXED_CANVAS_WIDTH}px`,
              height: `${FIXED_CANVAS_HEIGHT}px`,
              overflow: 'hidden',
              userSelect: 'none',
            }}
            onDragOver={handleDragOverCanvas}
            onDrop={handleDropOnCanvas}
          >
            <svg
              className="absolute top-0 left-0 pointer-events-none"
              style={{
                width: `${FIXED_CANVAS_WIDTH}px`,
                height: `${FIXED_CANVAS_HEIGHT}px`,
                overflow: 'visible', 
              }}
              key={svgKey} 
            >
              {allNodes.map(node => {
                if (!node.parentId) return null;
                const parentNode = mindmap.data.nodes[node.parentId];
                if (!parentNode) return null;

                const parentHeight = getNodeHeight(parentNode);
                const nodeHeight = getNodeHeight(node);

                const startX = (parentNode.x ?? 0) + NODE_CARD_WIDTH / 2;
                const startY = (parentNode.y ?? 0) + parentHeight / 2;
                const endX = (node.x ?? 0) + NODE_CARD_WIDTH / 2;
                const endY = (node.y ?? 0) + nodeHeight / 2;
                
                const c1x = startX; 
                const c1y = startY + Math.max(30, Math.abs(endY - startY) / 2.5);
                const c2x = endX;
                const c2y = endY - Math.max(30, Math.abs(endY - startY) / 2.5);

                const pathData = `M ${startX} ${startY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${endX} ${endY}`;
                
                let strokeColor = "hsl(var(--muted-foreground))"; // Default
                if (parentNode.customBackgroundColor) {
                    strokeColor = `hsl(var(--${parentNode.customBackgroundColor}))`;
                } else if (!parentNode.parentId) { // Is root
                    strokeColor = "hsl(var(--primary))";
                } else { // Is child of another child
                    strokeColor = "hsl(var(--accent))";
                }

                return (
                  <path
                    key={`${parentNode.id}-${node.id}`}
                    d={pathData}
                    stroke={strokeColor}
                    strokeWidth={2} 
                    fill="none"
                  />
                );
              })}
            </svg>

            {allNodes.map((node) => (
              <NodeCard
                key={node.id}
                node={node}
                isRoot={!node.parentId}
                onEdit={handleEditNode}
                onDelete={requestDeleteNode}
                onAddChild={handleAddChildNode}
                onDragStart={handleNodeDragStart}
                className="node-card-draggable"
              />
            ))}

            {allNodes.length === 0 && (
               <div
                className="absolute inset-0 flex items-center justify-center pointer-events-none text-center"
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
