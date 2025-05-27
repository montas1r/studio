
"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Mindmap, NodeData, EditNodeInput } from '@/types/mindmap';
import { useMindmaps } from '@/hooks/useMindmaps';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NodeCard } from './NodeCard';
import { EditNodeDialog } from './EditNodeDialog';
import { PlusCircle, Download, ArrowLeft, AlertTriangle, ZoomIn, ZoomOut, LocateFixed } from 'lucide-react';
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
const NODE_HEADER_HEIGHT = 50; // Approximate height of the node card header/title area
const CANVAS_CONTENT_WIDTH = '800vw'; // Large logical width
const CANVAS_CONTENT_HEIGHT = '800vh'; // Large logical height
const MIN_SCALE = 0.2;
const MAX_SCALE = 3;
const SCALE_STEP = 0.1;


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

  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [initialViewCentered, setInitialViewCentered] = useState(false);

  // Effect to center the initial view
   const centerInitialView = useCallback(() => {
    if (mindmap && scrollAreaViewportRef.current && canvasContentRef.current) {
      const viewport = scrollAreaViewportRef.current;
      let targetX = 0; 
      let targetY = 0;

      if (mindmap.data.rootNodeIds.length > 0) {
        const firstRootNodeId = mindmap.data.rootNodeIds[0];
        const firstRootNode = mindmap.data.nodes[firstRootNodeId];
        if (firstRootNode) {
          targetX = firstRootNode.x + NODE_CARD_WIDTH / 2;
          targetY = firstRootNode.y + NODE_HEADER_HEIGHT / 2;
        }
      }
      
      const newPanX = (viewport.clientWidth / 2) - (targetX * scale);
      const newPanY = (viewport.clientHeight / 2) - (targetY * scale);

      setPan({ x: newPanX, y: newPanY });
      setInitialViewCentered(true);
    }
  }, [mindmap, scale]);


  useEffect(() => {
    if (mindmap && !initialViewCentered) {
        centerInitialView();
    }
  }, [mindmap, initialViewCentered, centerInitialView]);


  const handleAddRootNode = useCallback(() => {
    if (newRootNodeTitle.trim() === '') {
      toast({ title: "Title Required", description: "Please enter a title for the new root node.", variant: "destructive" });
      return;
    }
    if (!mindmap || !canvasContentRef.current || !scrollAreaViewportRef.current) return;

    const viewport = scrollAreaViewportRef.current;
    
    // Calculate initial position in logical canvas coordinates
    // Attempt to place near the current viewport center if no nodes, or to the right of existing nodes
    let initialX = (viewport.clientWidth / 2 - pan.x) / scale - NODE_CARD_WIDTH / 2;
    let initialY = (viewport.clientHeight / 4 - pan.y) / scale - NODE_HEADER_HEIGHT / 2;
    
    if (mindmap.data.rootNodeIds.length > 0) {
        const lastRootNodeId = mindmap.data.rootNodeIds[mindmap.data.rootNodeIds.length -1];
        const lastRootNode = mindmap.data.nodes[lastRootNodeId];
        if(lastRootNode) {
            initialX = lastRootNode.x + NODE_CARD_WIDTH + 50; // Add 50px spacing
            initialY = lastRootNode.y;
        } else { 
             // Fallback if last root node somehow doesn't exist
            initialX = (mindmap.data.rootNodeIds.length * (NODE_CARD_WIDTH + 50));
        }
    } else {
      initialX = 0;
      initialY = 0;
    }
    
    const newNode = addNode(mindmap.id, null, { title: newRootNodeTitle, description: newRootNodeDescription, emoji: '💡' }, initialX, initialY);
    if (newNode) {
        setNewRootNodeTitle('');
        setNewRootNodeDescription('');
        toast({ title: "Root Node Added", description: `"${newNode.title}" added to the mindmap.` });
         if (mindmap.data.rootNodeIds.length === 0) { // If this was the first node
            setInitialViewCentered(false); // Trigger recentering
        }
    }
  }, [newRootNodeTitle, newRootNodeDescription, mindmap, addNode, toast, pan, scale]);

  const handleAddChildNode = useCallback((parentId: string) => {
    if (!mindmap) return;
    const parentNode = mindmap.data.nodes[parentId];
    if (!parentNode) return;

    // Position child node below the parent
    const initialX = parentNode.x;
    const initialY = parentNode.y + NODE_HEADER_HEIGHT + 60; // 60px spacing below parent

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
    const nodeElement = event.currentTarget; // The element being dragged
    
    if (nodeElement && canvasContentRef.current) {
      const clientX = event.clientX;
      const clientY = event.clientY;
      
      // Get node's current position *on the screen* (accounts for its own transform and parent transforms)
      const nodeRect = nodeElement.getBoundingClientRect();
      
      // dragOffset is mouse position relative to the node's top-left, scaled
      setDragOffset({
        x: (clientX - nodeRect.left) / scale, // Unscale offset
        y: (clientY - nodeRect.top) / scale,  // Unscale offset
      });
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", nodeId); 
  }, [scale]);
  
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
    if (!draggedNodeId || !mindmap || !scrollAreaViewportRef.current) return;

    const viewport = scrollAreaViewportRef.current;
    const viewportRect = viewport.getBoundingClientRect();
    
    // Mouse position relative to the viewport's top-left corner
    const mouseXInViewport = event.clientX - viewportRect.left;
    const mouseYInViewport = event.clientY - viewportRect.top;
    
    // Convert mouse position from viewport space to logical canvas space
    const logicalMouseX = (mouseXInViewport - pan.x) / scale;
    const logicalMouseY = (mouseYInViewport - pan.y) / scale;
    
    let newX = logicalMouseX - dragOffset.x;
    let newY = logicalMouseY - dragOffset.y;
    
    // Keep nodes within the canvas origin (0,0) - optional, remove if not needed
    // newX = Math.max(0, newX); 
    // newY = Math.max(0, newY);

    updateNodePosition(mindmap.id, draggedNodeId, newX, newY);
    setDraggedNodeId(null);
  }, [draggedNodeId, mindmap, dragOffset, updateNodePosition, pan, scale]);


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

  const handleZoom = useCallback((zoomIn: boolean, customScaleStep?: number) => {
    if (!scrollAreaViewportRef.current || !canvasContentRef.current) return;

    const viewport = scrollAreaViewportRef.current;
    const rect = canvasContentRef.current.getBoundingClientRect(); // Get current screen position of canvas
    
    // Point to zoom towards (center of the viewport)
    const centerX = viewport.clientWidth / 2;
    const centerY = viewport.clientHeight / 2;

    // Convert center point from viewport space to logical canvas space
    const logicalCenterX = (centerX - pan.x) / scale;
    const logicalCenterY = (centerY - pan.y) / scale;
    
    const step = customScaleStep || SCALE_STEP;
    const newScale = zoomIn ? Math.min(MAX_SCALE, scale + step) : Math.max(MIN_SCALE, scale - step);

    // Calculate new pan to keep the logical center point at the same screen position
    const newPanX = centerX - logicalCenterX * newScale;
    const newPanY = centerY - logicalCenterY * newScale;

    setScale(newScale);
    setPan({ x: newPanX, y: newPanY });
  }, [scale, pan]);

  const handleWheelZoom = useCallback((event: WheelEvent) => {
    event.preventDefault();
    if (!scrollAreaViewportRef.current || !canvasContentRef.current) return;

    const viewport = scrollAreaViewportRef.current;
    const viewportRect = viewport.getBoundingClientRect();

    // Mouse position relative to the viewport's top-left corner
    const mouseXInViewport = event.clientX - viewportRect.left;
    const mouseYInViewport = event.clientY - viewportRect.top;

    // Convert mouse position from viewport space to logical canvas space before zoom
    const logicalMouseXBeforeZoom = (mouseXInViewport - pan.x) / scale;
    const logicalMouseYBeforeZoom = (mouseYInViewport - pan.y) / scale;

    const delta = event.deltaY > 0 ? -SCALE_STEP : SCALE_STEP; // Negative for zoom out, positive for zoom in
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale + delta));
    
    if (newScale === scale) return; // No change in scale

    // Calculate new pan to keep the point under the mouse cursor fixed
    const newPanX = mouseXInViewport - logicalMouseXBeforeZoom * newScale;
    const newPanY = mouseYInViewport - logicalMouseYBeforeZoom * newScale;
    
    setScale(newScale);
    setPan({ x: newPanX, y: newPanY });

  }, [scale, pan]);
  
  useEffect(() => {
    const currentViewport = scrollAreaViewportRef.current;
    if (currentViewport) {
      currentViewport.addEventListener('wheel', handleWheelZoom, { passive: false });
    }
    return () => {
      if (currentViewport) {
        currentViewport.removeEventListener('wheel', handleWheelZoom);
      }
    };
  }, [handleWheelZoom]);

  const handleRecenterView = useCallback(() => {
    setScale(1);
    setInitialViewCentered(false); // Trigger re-centering logic
    centerInitialView(); // Call directly to ensure it runs
  }, [centerInitialView]);


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
      <div className="p-1 border-b bg-background/80 backdrop-blur-sm sticky top-0 z-20">
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
                    variant="outline" 
                    size="icon" 
                    onClick={() => handleZoom(true)}
                    className="text-xs h-7 w-7"
                  >
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Zoom In</p></TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="icon" 
                    onClick={() => handleZoom(false)}
                    className="text-xs h-7 w-7"
                  >
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Zoom Out</p></TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="icon" 
                    onClick={handleRecenterView}
                    className="text-xs h-7 w-7"
                  >
                    <LocateFixed className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Recenter View</p></TooltipContent>
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
          onDragOver={handleDragOver} 
          onDrop={handleDrop}     
          onDragEnter={handleDragEnter}
        >
          <div
            ref={canvasContentRef}
            className="relative border-2 border-dashed border-destructive"
            style={{
                width: CANVAS_CONTENT_WIDTH,
                height: CANVAS_CONTENT_HEIGHT,
                transform: `translateX(${pan.x}px) translateY(${pan.y}px) scale(${scale})`,
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
                  className="node-card-draggable" // Added for pan vs drag differentiation
                />
            ))}

            <svg
                key={`lines-${allNodes.length}-${pan.x}-${pan.y}-${scale}`} // Re-render lines on pan/scale change
                className="absolute top-0 left-0 w-full h-full pointer-events-none" // Ensure SVG doesn't interfere with mouse events
                style={{ width: CANVAS_CONTENT_WIDTH, height: CANVAS_CONTENT_HEIGHT }} // Match canvasContentRef dimensions
            >
                {allNodes.map(node => {
                if (!node.parentId) return null;
                const parentNode = mindmap.data.nodes[node.parentId];
                if (!parentNode) return null;

                const startX = parentNode.x + NODE_CARD_WIDTH / 2;
                const startY = parentNode.y + NODE_HEADER_HEIGHT; // From bottom of parent header
                const endX = node.x + NODE_CARD_WIDTH / 2;
                const endY = node.y; // To top of child

                const sCurveOffsetY = Math.max(20, Math.min(80, Math.abs(endY - startY) / 2));
                const pathData = `M ${startX} ${startY} C ${startX} ${startY + sCurveOffsetY}, ${endX} ${endY - sCurveOffsetY}, ${endX} ${endY}`;
                
                const strokeColor = parentNode.parentId === null ? "hsl(var(--primary))" : "hsl(var(--accent))";

                return (
                    <path
                    key={`${parentNode.id}-${node.id}`}
                    d={pathData}
                    stroke={strokeColor}
                    strokeWidth={2 / scale} // Adjust stroke width with scale
                    fill="none"
                    />
                );
                })}
            </svg>

            {allNodes.length === 0 && !draggedNodeId && (
                <div
                  className="absolute inset-0 flex items-center justify-center pointer-events-none"
                  style={{
                    top: `${(scrollAreaViewportRef.current ? scrollAreaViewportRef.current.clientHeight / 2 - 50 : 0) / scale - pan.y / scale}px`, 
                    left: `${(scrollAreaViewportRef.current ? scrollAreaViewportRef.current.clientWidth / 2 - 150 : 0) / scale - pan.x / scale}px`,
                    transform: `scale(${1 / scale})`, // Counter-scale the message
                    transformOrigin: 'center center',
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
        <ScrollAreaPrimitive.Scrollbar orientation="vertical" className="bg-muted/50">
            <ScrollAreaPrimitive.Thumb className="relative flex-1 rounded-full bg-border" />
        </ScrollAreaPrimitive.Scrollbar>
        <ScrollAreaPrimitive.Scrollbar orientation="horizontal" className="bg-muted/50">
            <ScrollAreaPrimitive.Thumb className="relative flex-1 rounded-full bg-border" />
        </ScrollAreaPrimitive.Scrollbar>
        <ScrollAreaPrimitive.Corner className="bg-muted/50" />
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
    
    