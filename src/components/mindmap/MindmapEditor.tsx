
"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Mindmap, NodeData, EditNodeInput } from '@/types/mindmap';
import { useMindmaps } from '@/hooks/useMindmaps';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NodeCard } from './NodeCard';
import { EditNodeDialog } from './EditNodeDialog';
import { PlusCircle, Download, ArrowLeft, AlertTriangle, ZoomIn, ZoomOut, Hand, LocateFixed, RedoDot } from 'lucide-react';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";


interface MindmapEditorProps {
  mindmapId: string;
}

const NODE_CARD_WIDTH = 300;
const NODE_HEADER_HEIGHT = 50;
const CANVAS_CONTENT_WIDTH = '800vw'; // Even larger logical canvas
const CANVAS_CONTENT_HEIGHT = '800vh';

const MIN_SCALE = 0.2;
const MAX_SCALE = 3;
const ZOOM_SENSITIVITY = 0.001;


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
  const scrollAreaViewportRef = useRef<HTMLDivElement>(null);

  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const [activeTool, setActiveTool] = useState<'select' | 'pan'>('select');
  const [initialViewCentered, setInitialViewCentered] = useState(false);

  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });


  const handleRecenterView = useCallback(() => {
    if (!scrollAreaViewportRef.current || !mindmap) return;

    const viewport = scrollAreaViewportRef.current;
    const { clientWidth: viewportWidth, clientHeight: viewportHeight } = viewport;

    let targetX = 0; // Logical canvas coordinates
    let targetY = 0;

    if (mindmap.data.rootNodeIds.length > 0) {
      const firstRootNodeId = mindmap.data.rootNodeIds[0];
      const firstRootNode = mindmap.data.nodes[firstRootNodeId];
      if (firstRootNode) {
        targetX = firstRootNode.x + NODE_CARD_WIDTH / 2;
        targetY = firstRootNode.y + NODE_HEADER_HEIGHT / 2;
      }
    }
    
    const newScale = 1;
    setScale(newScale);

    // Calculate pan needed to center targetX, targetY in the viewport at the new scale
    const newPanX = (viewportWidth / 2) - (targetX * newScale);
    const newPanY = (viewportHeight / 2) - (targetY * newScale);
    
    setPan({ x: newPanX, y: newPanY });
    setInitialViewCentered(true); // Mark as centered
  }, [mindmap]);


  useEffect(() => {
    if (mindmap && !initialViewCentered && scrollAreaViewportRef.current) {
      handleRecenterView();
    }
  }, [mindmap, initialViewCentered, handleRecenterView]);


  const handleZoom = useCallback((zoomIn: boolean, customScale?: number, pointer?: { x: number; y: number }) => {
    if (!scrollAreaViewportRef.current || !canvasContentRef.current) return;

    const viewport = scrollAreaViewportRef.current;
    const newScale = customScale !== undefined ? customScale :
                     zoomIn ? Math.min(MAX_SCALE, scale * 1.2) : Math.max(MIN_SCALE, scale / 1.2);

    if (newScale === scale) return;

    const viewportRect = viewport.getBoundingClientRect();
    
    let focusX, focusY; // Point on the viewport to zoom towards

    if (pointer) { // Zoom towards mouse pointer
      focusX = pointer.x - viewportRect.left;
      focusY = pointer.y - viewportRect.top;
    } else { // Zoom towards center of viewport
      focusX = viewportRect.width / 2;
      focusY = viewportRect.height / 2;
    }

    // Convert focus point from viewport coordinates to logical canvas coordinates (before zoom)
    const logicalFocusX = (focusX - pan.x) / scale;
    const logicalFocusY = (focusY - pan.y) / scale;

    // Calculate new pan to keep the logical focus point at the same viewport position after zoom
    const newPanX = focusX - logicalFocusX * newScale;
    const newPanY = focusY - logicalFocusY * newScale;

    setScale(newScale);
    setPan({ x: newPanX, y: newPanY });
  }, [scale, pan.x, pan.y]);

  const handleWheelZoom = useCallback((event: WheelEvent) => {
    event.preventDefault();
    const delta = -event.deltaY * ZOOM_SENSITIVITY;
    const newScaleTarget = scale * (1 + delta);
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScaleTarget));
    handleZoom(delta > 0, newScale, { x: event.clientX, y: event.clientY });
  }, [scale, handleZoom]);


  const handlePanMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (activeTool !== 'pan' || event.button !== 0) return; // Only pan with left click and hand tool
    
    // Check if the click was on a node card or one of its interactive elements
    const target = event.target as HTMLElement;
    if (target.closest('.node-card-draggable') || target.closest('button') || target.closest('input') || target.closest('textarea')) {
      return; 
    }

    setIsPanning(true);
    panStartRef.current = { x: event.clientX - pan.x, y: event.clientY - pan.y };
    if (scrollAreaViewportRef.current) {
      scrollAreaViewportRef.current.style.cursor = 'grabbing';
    }
  }, [activeTool, pan.x, pan.y]);

  const handlePanMouseMove = useCallback((event: MouseEvent) => {
    if (!isPanning) return;
    setPan({
      x: event.clientX - panStartRef.current.x,
      y: event.clientY - panStartRef.current.y,
    });
  }, [isPanning]);

  const handlePanMouseUpOrLeave = useCallback((event: MouseEvent) => {
    if (!isPanning) return;
    setIsPanning(false);
    if (scrollAreaViewportRef.current && activeTool === 'pan') {
      scrollAreaViewportRef.current.style.cursor = 'grab';
    } else if (scrollAreaViewportRef.current) {
      scrollAreaViewportRef.current.style.cursor = 'default';
    }
  }, [isPanning, activeTool]);


  useEffect(() => {
    const viewport = scrollAreaViewportRef.current;
    if (viewport) {
      viewport.addEventListener('wheel', handleWheelZoom, { passive: false });
      // Mouse down for pan is handled by React on the viewport div
      window.addEventListener('mousemove', handlePanMouseMove);
      window.addEventListener('mouseup', handlePanMouseUpOrLeave);
      window.addEventListener('mouseleave', handlePanMouseUpOrLeave); // Handle if mouse leaves window while panning

      if (activeTool === 'pan') {
        viewport.style.cursor = 'grab';
      } else {
        viewport.style.cursor = 'default';
      }

      return () => {
        viewport.removeEventListener('wheel', handleWheelZoom);
        window.removeEventListener('mousemove', handlePanMouseMove);
        window.removeEventListener('mouseup', handlePanMouseUpOrLeave);
        window.removeEventListener('mouseleave', handlePanMouseUpOrLeave);
      };
    }
  }, [handleWheelZoom, handlePanMouseMove, handlePanMouseUpOrLeave, activeTool]);


  const handleAddRootNode = useCallback(() => {
    if (newRootNodeTitle.trim() === '') {
      toast({ title: "Title Required", description: "Please enter a title for the new root node.", variant: "destructive" });
      return;
    }
    if (!mindmap || !scrollAreaViewportRef.current) return;

    // Place new root node relative to the current view if possible, or spread from origin
    const viewport = scrollAreaViewportRef.current;
    const initialX = (-pan.x + viewport.clientWidth / 2) / scale;
    const initialY = (-pan.y + viewport.clientHeight / 4) / scale; // Place a bit higher in view

    let newX = initialX;
    let newY = initialY;

    if (mindmap.data.rootNodeIds.length > 0) {
        const lastRootNodeId = mindmap.data.rootNodeIds[mindmap.data.rootNodeIds.length -1];
        const lastRootNode = mindmap.data.nodes[lastRootNodeId];
        if(lastRootNode) {
            newX = lastRootNode.x + NODE_CARD_WIDTH + 50;
            newY = lastRootNode.y;
        } else { 
             newX = mindmap.data.rootNodeIds.length * (NODE_CARD_WIDTH + 50); // Fallback spread
        }
    }

    addNode(mindmap.id, null, { title: newRootNodeTitle, description: newRootNodeDescription, emoji: '💡' }, newX, newY);
    setNewRootNodeTitle('');
    setNewRootNodeDescription('');
    toast({ title: "Root Node Added", description: `"${newRootNodeTitle}" added to the mindmap.` });
  }, [newRootNodeTitle, newRootNodeDescription, mindmap, addNode, toast, pan, scale]);

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
    setDraggedNodeId(nodeId);
    const nodeElement = document.getElementById(`node-${nodeId}`);
    
    if (nodeElement && canvasContentRef.current) {
      const clientX = event.clientX;
      const clientY = event.clientY;
      
      // Node's current position relative to viewport (accounting for scale and pan)
      const nodeRect = nodeElement.getBoundingClientRect();

      setDragOffset({
        x: (clientX - nodeRect.left) / scale, // Convert offset to logical units
        y: (clientY - nodeRect.top) / scale,
      });
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", nodeId); 
  }, [scale]);

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);
  
  const handleDragEnter = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const handleNodeDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!draggedNodeId || !mindmap || !scrollAreaViewportRef.current || !canvasContentRef.current) return;

    const viewportRect = scrollAreaViewportRef.current.getBoundingClientRect();
    
    // Mouse position relative to the viewport's top-left corner
    const mouseXInViewport = event.clientX - viewportRect.left;
    const mouseYInViewport = event.clientY - viewportRect.top;

    // Convert mouse position from viewport coordinates to logical canvas coordinates
    const logicalMouseX = (mouseXInViewport - pan.x) / scale;
    const logicalMouseY = (mouseYInViewport - pan.y) / scale;
    
    // Calculate node's new top-left in logical canvas coordinates
    let newX = logicalMouseX - dragOffset.x;
    let newY = logicalMouseY - dragOffset.y;
    
    updateNodePosition(mindmap.id, draggedNodeId, newX, newY);
    setDraggedNodeId(null);
  }, [draggedNodeId, mindmap, pan, scale, dragOffset, updateNodePosition]);


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
        <Button asChild variant="outline" size="sm" className="text-xs h-7 px-2">
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
        <div className="flex flex-col sm:flex-row justify-between items-center gap-1 mb-1">
          <h1 className="text-xs sm:text-sm font-semibold text-foreground truncate px-1" title={mindmap.name}>
            {mindmap.name}
          </h1>
          <div className="flex items-center gap-1">
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
        <div className="flex flex-col sm:flex-row items-stretch gap-1 px-1">
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
          <Button onClick={handleAddRootNode} size="sm" className="text-xs h-7 px-2">
            <PlusCircle className="mr-1 h-3 w-3" /> Add Root
          </Button>
        </div>
      </div>

      {/* Main Canvas Area with ScrollArea */}
       <ScrollAreaPrimitive.Root 
        className="flex-grow min-h-[calc(100vh-220px)] sm:min-h-[calc(100vh-200px)] relative overflow-hidden"
       >
        <ScrollAreaPrimitive.Viewport 
          ref={scrollAreaViewportRef} 
          className="w-full h-full"
          onMouseDown={handlePanMouseDown} // For panning
        >
            <div
            ref={canvasContentRef}
            className="relative border-2 border-dashed border-destructive"
            style={{
                width: CANVAS_CONTENT_WIDTH,
                height: CANVAS_CONTENT_HEIGHT,
                transform: `scale(${scale}) translate(${pan.x}px, ${pan.y}px)`,
                transformOrigin: '0 0',
            }}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDrop={handleNodeDrop}
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
                key={`lines-${allNodes.length}-${scale}-${pan.x}-${pan.y}`} 
                className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-visible" 
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
                    strokeWidth={Math.max(0.5, 2 / scale)} // Adjusted stroke width for zoom
                    fill="none"
                    />
                );
                })}
            </svg>

            {allNodes.length === 0 && !draggedNodeId && (
                <div
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
                style={{ 
                    width: `calc(100% / ${scale})`, // Adjust size based on scale
                    height: `calc(100% / ${scale})`,
                    // Center message within the logical canvas, not the scaled one
                    transform: `translate(-${pan.x / scale}px, -${pan.y / scale}px)` 
                }}
                >
                <div className="text-muted-foreground text-center py-10 text-lg bg-background/80 p-6 rounded-md">
                    This mindmap is empty. Add a root idea to get started!
                </div>
                </div>
            )}
            </div>
        </ScrollAreaPrimitive.Viewport>
        <ScrollAreaPrimitive.Scrollbar orientation="vertical">
          <ScrollAreaPrimitive.Thumb />
        </ScrollAreaPrimitive.Scrollbar>
        <ScrollAreaPrimitive.Scrollbar orientation="horizontal">
          <ScrollAreaPrimitive.Thumb />
        </ScrollAreaPrimitive.Scrollbar>
        <ScrollAreaPrimitive.Corner />
      </ScrollAreaPrimitive.Root>

      {/* Canvas Controls */}
      <div className="fixed bottom-4 right-4 z-20 flex flex-col gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              onClick={() => setActiveTool(prev => prev === 'pan' ? 'select' : 'pan')} 
              variant="outline" 
              size="icon" 
              className={cn(
                "shadow-lg bg-background/80 hover:bg-muted",
                activeTool === 'pan' && "bg-primary text-primary-foreground hover:bg-primary/90"
              )}
              aria-label="Toggle Pan Tool"
            >
              <Hand />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left"><p>Pan Tool (P)</p></TooltipContent>
        </Tooltip>
         <Tooltip>
          <TooltipTrigger asChild>
            <Button onClick={() => handleZoom(true)} variant="outline" size="icon" className="shadow-lg bg-background/80 hover:bg-muted" aria-label="Zoom In">
               <span><ZoomIn /></span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left"><p>Zoom In (+)</p></TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button onClick={() => handleZoom(false)} variant="outline" size="icon" className="shadow-lg bg-background/80 hover:bg-muted" aria-label="Zoom Out">
               <span><ZoomOut /></span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left"><p>Zoom Out (-)</p></TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button onClick={handleRecenterView} variant="outline" size="icon" className="shadow-lg bg-background/80 hover:bg-muted" aria-label="Recenter View">
               <span><LocateFixed /></span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left"><p>Recenter View (R)</p></TooltipContent>
        </Tooltip>
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
    

    