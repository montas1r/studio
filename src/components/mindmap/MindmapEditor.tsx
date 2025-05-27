
"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Mindmap, NodeData, EditNodeInput } from '@/types/mindmap';
import { useMindmaps } from '@/hooks/useMindmaps';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NodeCard } from './NodeCard';
import { EditNodeDialog } from './EditNodeDialog';
import { PlusCircle, Download, ArrowLeft, AlertTriangle, Hand } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
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
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface MindmapEditorProps {
  mindmapId: string;
}

const NODE_CARD_WIDTH = 300;
const NODE_HEADER_HEIGHT = 50;
const CANVAS_CONTENT_WIDTH = '800vw';
const CANVAS_CONTENT_HEIGHT = '800vh';

type ActiveTool = 'select' | 'pan';

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

  const canvasContentRef = useRef<HTMLDivElement>(null);
  const scrollAreaViewportRef = useRef<React.ElementRef<typeof ScrollAreaPrimitive.Viewport>>(null);
  
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ startX: number; startY: number; initialPanX: number; initialPanY: number } | null>(null);
  const [activeTool, setActiveTool] = useState<ActiveTool>('select');
  const [initialViewCentered, setInitialViewCentered] = useState(false);

  // Effect to center the initial view
  useEffect(() => {
    if (mindmap && scrollAreaViewportRef.current && !initialViewCentered) {
      const viewport = scrollAreaViewportRef.current;
      let targetX = 0; // Logical 0,0 of canvasContentRef
      let targetY = 0;

      if (mindmap.data.rootNodeIds.length > 0) {
        const firstRootNodeId = mindmap.data.rootNodeIds[0];
        const firstRootNode = mindmap.data.nodes[firstRootNodeId];
        if (firstRootNode) {
          targetX = firstRootNode.x;
          targetY = firstRootNode.y;
        }
      }
      
      const newPanX = (viewport.clientWidth / 2) - targetX;
      const newPanY = (viewport.clientHeight / 2) - targetY;

      setPan({ x: newPanX, y: newPanY });
      setInitialViewCentered(true);
    }
  }, [mindmap, initialViewCentered]);


  const handleAddRootNode = useCallback(() => {
    if (newRootNodeTitle.trim() === '') {
      toast({ title: "Title Required", description: "Please enter a title for the new root node.", variant: "destructive" });
      return;
    }
    if (!mindmap || !canvasContentRef.current || !scrollAreaViewportRef.current) return;

    const viewport = scrollAreaViewportRef.current;
    const currentPan = pan;

    // Calculate position relative to the panned canvasContentRef's origin (0,0)
    // Aim for roughly the center of the *current* viewport, then adjust for pan
    let initialX = (viewport.clientWidth / 2) - currentPan.x - (NODE_CARD_WIDTH / 2);
    let initialY = (viewport.clientHeight / 4) - currentPan.y - (NODE_HEADER_HEIGHT / 2);
    
    if (mindmap.data.rootNodeIds.length > 0) {
        const lastRootNodeId = mindmap.data.rootNodeIds[mindmap.data.rootNodeIds.length -1];
        const lastRootNode = mindmap.data.nodes[lastRootNodeId];
        if(lastRootNode) {
            initialX = lastRootNode.x + NODE_CARD_WIDTH + 50;
            initialY = lastRootNode.y;
        } else { 
            initialX = mindmap.data.rootNodeIds.length * (NODE_CARD_WIDTH + 50) - currentPan.x;
        }
    } else {
      // For the very first node, try to place near logical 0,0 of canvasContentRef
      initialX = 0; 
      initialY = 0;
    }

    const newNode = addNode(mindmap.id, null, { title: newRootNodeTitle, description: newRootNodeDescription, emoji: '💡' }, initialX, initialY);
    if (newNode) {
        setNewRootNodeTitle('');
        setNewRootNodeDescription('');
        toast({ title: "Root Node Added", description: `"${newNode.title}" added to the mindmap.` });
    }
  }, [newRootNodeTitle, newRootNodeDescription, mindmap, addNode, toast, pan]);

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
      x: parentNode.x + NODE_CARD_WIDTH / 2 - NODE_CARD_WIDTH /2,
      y: parentNode.y + NODE_HEADER_HEIGHT + 60,
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
    if (activeTool === 'pan') {
      event.preventDefault();
      return;
    }
    setDraggedNodeId(nodeId);
    const nodeElement = document.getElementById(`node-${nodeId}`);
    
    if (nodeElement && canvasContentRef.current) {
      const clientX = event.clientX;
      const clientY = event.clientY;
      const nodeRect = nodeElement.getBoundingClientRect();
      // dragOffset is relative to the node's own top-left, unscaled
      setDragOffset({
        x: clientX - nodeRect.left,
        y: clientY - nodeRect.top,
      });
    }
    event.dataTransfer.effectAllowed = "move";
    // It's good practice to set some data, even if not strictly used by this component's drop
    event.dataTransfer.setData("text/plain", nodeId); 
  }, [activeTool]);
  
  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault(); // Necessary to allow dropping
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

  const handleNodeDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!draggedNodeId || !mindmap || !scrollAreaViewportRef.current) return;

    const viewportRect = scrollAreaViewportRef.current.getBoundingClientRect();
    
    const mouseXInViewport = event.clientX - viewportRect.left;
    const mouseYInViewport = event.clientY - viewportRect.top;
    
    const logicalMouseX = mouseXInViewport - pan.x;
    const logicalMouseY = mouseYInViewport - pan.y;
    
    let newX = logicalMouseX - dragOffset.x;
    let newY = logicalMouseY - dragOffset.y;
    
    // Keep nodes within the canvas origin (0,0)
    newX = Math.max(0, newX);
    newY = Math.max(0, newY);

    updateNodePosition(mindmap.id, draggedNodeId, newX, newY);
    setDraggedNodeId(null);
  }, [draggedNodeId, mindmap, dragOffset, updateNodePosition, pan]);

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

  const handlePanMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (activeTool !== 'pan' || !(event.target === scrollAreaViewportRef.current || event.target === canvasContentRef.current)) {
        return;
    }
    event.preventDefault();
    setIsPanning(true);
    panStartRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        initialPanX: pan.x,
        initialPanY: pan.y,
    };
    if (scrollAreaViewportRef.current) {
        scrollAreaViewportRef.current.style.cursor = 'grabbing';
    }
  }, [activeTool, pan]);

  const handlePanMouseMove = useCallback((event: MouseEvent) => { // Native MouseEvent
    if (!isPanning || !panStartRef.current) return;
    event.preventDefault();
    const dx = event.clientX - panStartRef.current.startX;
    const dy = event.clientY - panStartRef.current.startY;
    setPan({
        x: panStartRef.current.initialPanX + dx,
        y: panStartRef.current.initialPanY + dy,
    });
  }, [isPanning]);

  const handlePanMouseUpOrLeave = useCallback(() => {
    if (isPanning) {
        setIsPanning(false);
        if (scrollAreaViewportRef.current) {
            scrollAreaViewportRef.current.style.cursor = activeTool === 'pan' ? 'grab' : 'default';
        }
    }
  }, [isPanning, activeTool]);

  useEffect(() => {
    if (isPanning) {
        window.addEventListener('mousemove', handlePanMouseMove);
        window.addEventListener('mouseup', handlePanMouseUpOrLeave);
        window.addEventListener('mouseleave', handlePanMouseUpOrLeave);
    }
    return () => {
        window.removeEventListener('mousemove', handlePanMouseMove);
        window.removeEventListener('mouseup', handlePanMouseUpOrLeave);
        window.removeEventListener('mouseleave', handlePanMouseUpOrLeave);
    };
  }, [isPanning, handlePanMouseMove, handlePanMouseUpOrLeave]);
  
  useEffect(() => {
    if (scrollAreaViewportRef.current) {
      scrollAreaViewportRef.current.style.cursor = activeTool === 'pan' ? 'grab' : 'default';
    }
  }, [activeTool]);


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
      <div className="p-1 border-b bg-background/80 backdrop-blur-sm rounded-t-lg sticky top-0 z-20">
        <div className="flex flex-col sm:flex-row justify-between items-start gap-1 mb-1">
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
               <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant={activeTool === 'pan' ? "default" : "outline"} 
                    size="icon" 
                    onClick={() => setActiveTool(activeTool === 'pan' ? 'select' : 'pan')}
                    className="text-xs h-7 w-7"
                  >
                    <Hand className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{activeTool === 'pan' ? "Disable Pan Tool (Select Nodes)" : "Enable Pan Tool (Move Canvas)"}</p>
                </TooltipContent>
              </Tooltip>
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

      <ScrollAreaPrimitive.Root 
        className="flex-grow relative overflow-hidden w-full min-h-[calc(100vh-220px)] sm:min-h-[calc(100vh-200px)]"
      >
        <ScrollAreaPrimitive.Viewport 
          ref={scrollAreaViewportRef} 
          className="h-full w-full rounded-lg"
          onMouseDown={handlePanMouseDown}
          onDragOver={handleDragOver} // Keep this for node dragging
          onDrop={handleNodeDrop}     // Keep this for node dropping
          onDragEnter={handleDragEnter} // Keep this for node dragging
        >
          <div
            ref={canvasContentRef}
            className="relative border-2 border-dashed border-destructive"
            style={{
                width: CANVAS_CONTENT_WIDTH,
                height: CANVAS_CONTENT_HEIGHT,
                transform: `translateX(${pan.x}px) translateY(${pan.y}px)`,
                transformOrigin: '0 0',
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
                key={`lines-${allNodes.length}-${pan.x}-${pan.y}`}
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
                    strokeWidth={2}
                    fill="none"
                    />
                );
                })}
            </svg>

            {allNodes.length === 0 && !draggedNodeId && (
                <div
                  className="absolute inset-0 flex items-center justify-center pointer-events-none"
                  style={{
                    // Center this message within the *viewport*, accounting for pan
                    top: `${-pan.y + (scrollAreaViewportRef.current ? scrollAreaViewportRef.current.clientHeight / 2 - 50 : 0)}px`, 
                    left: `${-pan.x + (scrollAreaViewportRef.current ? scrollAreaViewportRef.current.clientWidth / 2 - 150 : 0)}px`,
                    textAlign: 'center'
                   }}
                >
                  <div className="text-muted-foreground text-lg bg-background/80 p-6 rounded-md">
                      This mindmap is empty. Add a root idea to get started!
                  </div>
                </div>
            )}
          </div>
        </ScrollAreaPrimitive.Viewport>
        <ScrollAreaPrimitive.Scrollbar orientation="vertical">
            <ScrollAreaPrimitive.Thumb className="relative flex-1 rounded-full bg-border" />
        </ScrollAreaPrimitive.Scrollbar>
        <ScrollAreaPrimitive.Scrollbar orientation="horizontal">
            <ScrollAreaPrimitive.Thumb className="relative flex-1 rounded-full bg-border" />
        </ScrollAreaPrimitive.Scrollbar>
        <ScrollAreaPrimitive.Corner />
      </ScrollAreaPrimitive.Root>

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
