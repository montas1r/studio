
"use client";

import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { Mindmap, NodeData, EditNodeInput } from '@/types/mindmap';
import { useMindmaps } from '@/hooks/useMindmaps';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NodeCard } from './NodeCard';
import { EditNodeDialog } from './EditNodeDialog';
import { PlusCircle, Download, ArrowLeft, AlertTriangle, Layers, Home } from 'lucide-react';
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


interface MindmapEditorProps {
  mindmapId: string;
}

const NODE_CARD_WIDTH = 300;
const NODE_HEADER_HEIGHT = 50; 
const CANVAS_CONTENT_WIDTH = '1200px'; // Default canvas logical size
const CANVAS_CONTENT_HEIGHT = '1200px';


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
          // Simple scroll into view for the new node in a basic canvas
           const nodeElement = document.getElementById(`node-${newNode.id}`);
           nodeElement?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
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
      y: (parentNode.y ?? 0) + NODE_HEADER_HEIGHT + 100, // Approximate position
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
      const permanentNode = addNode(mindmap.id, editingNode.parentId, data);
      if (permanentNode) {
        toast({ title: "Node Created", description: `Node "${permanentNode.title}" added.` });
         setTimeout(() => {
            const nodeElement = document.getElementById(`node-${permanentNode.id}`);
            nodeElement?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
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
    if (!nodeElement || !canvasContentRef.current) return;

    const nodeRect = nodeElement.getBoundingClientRect();
    const canvasRect = canvasContentRef.current.getBoundingClientRect();

    // Offset from mouse to node's top-left corner
    setDragOffset({
      x: event.clientX - nodeRect.left,
      y: event.clientY - nodeRect.top,
    });

    setDraggedNodeId(nodeId);
    event.dataTransfer.effectAllowed = "move";
    // You can set some data if needed, though for internal drags it's often managed by state
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
    if (!draggedNodeId || !mindmap || !canvasContentRef.current || !canvasRef.current) return;

    const canvasContentRect = canvasContentRef.current.getBoundingClientRect();
    
    // Calculate position relative to the scrolled canvasContentRef
    // Mouse position relative to viewport - canvasContentRef's top-left relative to viewport + scroll offset of canvasRef
    let newX = event.clientX - canvasContentRect.left + canvasRef.current.scrollLeft - dragOffset.x;
    let newY = event.clientY - canvasContentRect.top + canvasRef.current.scrollTop - dragOffset.y;
    
    // Removed clamping to 0,0 to allow nodes to be placed anywhere on the logical canvas
    // newX = Math.max(0, newX);
    // newY = Math.max(0, newY);

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
        <AlertTriangle className="w-16 h-16 text-destructive" />
        <h2 className="text-2xl font-bold">Mindmap Not Found</h2>
        <p className="text-muted-foreground">The mindmap you are looking for does not exist or has been deleted.</p>
        <Button asChild variant="outline" size="sm">
          <Link href="/"><Home className="mr-1.5 h-4 w-4" /> Library</Link>
        </Button>
      </div>
    );
  }
  const allNodes = Object.values(mindmap.data.nodes);
  const svgKey = allNodes.map(n => `${n.id}-${n.x}-${n.y}-${(n.childIds || []).join(',')}`).join('|');


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
                      <span className="flex items-center justify-center">
                        <Home className="h-4 w-4" />
                      </span>
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

        {/* Main Canvas Area - Simple Scrollable Div */}
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
                    onDragStart={handleNodeDragStart}
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

                    const startX = (parentNode.x ?? 0) + NODE_CARD_WIDTH / 2;
                    let startY = (parentNode.y ?? 0) + NODE_HEADER_HEIGHT; 
                   
                    const endX = (node.x ?? 0) + NODE_CARD_WIDTH / 2;
                    const endY = (node.y ?? 0); 

                    const c1x = startX;
                    const c1y = startY + Math.max(20, Math.abs(endY - startY) / 2);
                    const c2x = endX;
                    const c2y = endY - Math.max(20, Math.abs(endY - startY) / 2);
                    
                    const pathData = `M ${startX} ${startY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${endX} ${endY}`;
                    
                    let strokeColor = "hsl(var(--accent))"; 
                    if (!parentNode.parentId) { 
                        strokeColor = "hsl(var(--primary))";
                    }
                    // V1.0.0: No custom palette wire coloring
                    // if (parentNode.customBackgroundColor) {
                    //    strokeColor = `hsl(var(--${parentNode.customBackgroundColor}))`;
                    // }


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
                    className="absolute flex items-center justify-center pointer-events-none text-center"
                    style={{
                      top: `calc(50% - 50px)`, 
                      left: `calc(50% - ${parseInt(CANVAS_CONTENT_WIDTH)/4}px)`, 
                      transform: `translate(-50%, -50%)`, 
                      width: 'auto',
                    }}
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
