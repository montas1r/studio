
"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Mindmap, NodeData, EditNodeInput } from '@/types/mindmap';
import { useMindmaps } from '@/hooks/useMindmaps';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NodeCard } from './NodeCard';
import { EditNodeDialog } from './EditNodeDialog';
import { PlusCircle, Download, ArrowLeft, AlertTriangle, ZoomIn, ZoomOut, LocateFixed, Hand } from 'lucide-react';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface MindmapEditorProps {
  mindmapId: string;
}

const NODE_CARD_WIDTH = 300;
const NODE_HEADER_HEIGHT = 50; // Approx height of the card header/title area
const CANVAS_CONTENT_WIDTH = '800vw'; // Large logical canvas size
const CANVAS_CONTENT_HEIGHT = '800vh'; // Large logical canvas size
const MIN_SCALE = 0.1;
const MAX_SCALE = 3;
const ZOOM_SENSITIVITY = 0.0015;


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

  const scrollAreaViewportRef = useRef<React.ElementRef<typeof ScrollAreaPrimitive.Viewport>>(null);
  const zoomPanContainerRef = useRef<HTMLDivElement>(null); 
  const canvasContentRef = useRef<HTMLDivElement>(null);

  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const [initialViewCentered, setInitialViewCentered] = useState(false);
  const [isSpacebarPanningActive, setIsSpacebarPanningActive] = useState(false);

  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const handleRecenterView = useCallback(() => {
    if (!mindmap || !zoomPanContainerRef.current) return;

    let targetX = 0;
    let targetY = 0;

    if (mindmap.data.rootNodeIds.length > 0 && mindmap.data.nodes[mindmap.data.rootNodeIds[0]]) {
      const firstRootNode = mindmap.data.nodes[mindmap.data.rootNodeIds[0]];
      targetX = firstRootNode.x + NODE_CARD_WIDTH / 2;
      targetY = firstRootNode.y + NODE_HEADER_HEIGHT / 2;
    }

    const newScale = 1;
    const containerWidth = zoomPanContainerRef.current.clientWidth;
    const containerHeight = zoomPanContainerRef.current.clientHeight;

    const newPanX = (containerWidth / 2) - (targetX * newScale);
    const newPanY = (containerHeight / 2) - (targetY * newScale);
    
    setScale(newScale);
    setPan({ x: newPanX, y: newPanY });
    if (!initialViewCentered) setInitialViewCentered(true);
  }, [mindmap, initialViewCentered, setInitialViewCentered, setScale, setPan]);


  useEffect(() => {
    if (mindmap && !initialViewCentered && zoomPanContainerRef.current && canvasContentRef.current) {
      handleRecenterView();
    }
  }, [mindmap, initialViewCentered, handleRecenterView]);


  const handleZoom = useCallback((zoomIn: boolean, customFactor?: number, pointerX?: number, pointerY?: number) => {
    if (!zoomPanContainerRef.current) return;

    const factor = customFactor !== undefined ? (zoomIn ? 1 + customFactor : 1 / (1 + customFactor)) : (zoomIn ? 1.15 : 1 / 1.15);
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * factor));

    const containerRect = zoomPanContainerRef.current.getBoundingClientRect();
    const pX = pointerX !== undefined ? pointerX - containerRect.left : zoomPanContainerRef.current.clientWidth / 2;
    const pY = pointerY !== undefined ? pointerY - containerRect.top : zoomPanContainerRef.current.clientHeight / 2;
    
    const worldX = (pX - pan.x) / scale;
    const worldY = (pY - pan.y) / scale;

    const newPanX = pX - worldX * newScale;
    const newPanY = pY - worldY * newScale;

    setScale(newScale);
    setPan({ x: newPanX, y: newPanY });
  }, [scale, pan.x, pan.y, setScale, setPan]);


  const handleWheelZoom = useCallback((event: WheelEvent) => {
    if (!zoomPanContainerRef.current || event.ctrlKey) return; // Allow default ctrl+wheel for page zoom
    event.preventDefault();
    const delta = event.deltaY * ZOOM_SENSITIVITY * -1; // Invert deltaY for natural zoom direction
    const zoomIn = delta > 0;
    handleZoom(zoomIn, Math.abs(delta), event.clientX, event.clientY);
  }, [handleZoom]);

  const handlePanMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!isSpacebarPanningActive || event.button !== 0) return;

    const targetIsNode = (event.target as HTMLElement).closest('.node-card-draggable');
    const targetIsButton = (event.target as HTMLElement).closest('button'); // Also check for buttons inside NodeCard
    if (targetIsNode || targetIsButton) return;
    
    event.preventDefault();
    setIsPanning(true);
    panStartRef.current = { x: event.clientX - pan.x, y: event.clientY - pan.y };
  }, [isSpacebarPanningActive, pan.x, pan.y, setIsPanning, panStartRef]);

  const handlePanMouseMove = useCallback((event: MouseEvent) => {
    if (!isPanning || !isSpacebarPanningActive) return;
    event.preventDefault();
    setPan({
      x: event.clientX - panStartRef.current.x,
      y: event.clientY - panStartRef.current.y,
    });
  }, [isPanning, isSpacebarPanningActive, panStartRef, setPan]);

  const handlePanMouseUpOrLeave = useCallback(() => {
    if (isPanning) {
      setIsPanning(false);
    }
  }, [isPanning, setIsPanning]);

  useEffect(() => {
    const currentZoomPanContainer = zoomPanContainerRef.current;
    if (currentZoomPanContainer) {
      currentZoomPanContainer.addEventListener('wheel', handleWheelZoom, { passive: false });
      window.addEventListener('mousemove', handlePanMouseMove);
      window.addEventListener('mouseup', handlePanMouseUpOrLeave);
      // currentZoomPanContainer.addEventListener('mouseleave', handlePanMouseUpOrLeave); // Removing this to allow dragging outside

      return () => {
        currentZoomPanContainer.removeEventListener('wheel', handleWheelZoom);
        window.removeEventListener('mousemove', handlePanMouseMove);
        window.removeEventListener('mouseup', handlePanMouseUpOrLeave);
        // currentZoomPanContainer.removeEventListener('mouseleave', handlePanMouseUpOrLeave);
      };
    }
  }, [handleWheelZoom, handlePanMouseMove, handlePanMouseUpOrLeave]);

 useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === ' ' && !event.repeat) {
         const target = event.target as HTMLElement;
         // Check if focus is on an input, textarea, or contentEditable element
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
          return; 
        }
        event.preventDefault();
        setIsSpacebarPanningActive(true);
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === ' ') {
        setIsSpacebarPanningActive(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useEffect(() => {
    const viewport = zoomPanContainerRef.current;
    if (viewport) {
      if (isPanning) { 
        viewport.style.cursor = 'grabbing';
      } else if (isSpacebarPanningActive) { 
        viewport.style.cursor = 'grab';
      } else { 
        viewport.style.cursor = 'default';
      }
    }
  }, [isSpacebarPanningActive, isPanning]);


  const handleAddRootNode = useCallback(() => {
    if (newRootNodeTitle.trim() === '') {
      toast({ title: "Title Required", description: "Please enter a title for the new root node.", variant: "destructive" });
      return;
    }
    if (!mindmap || !zoomPanContainerRef.current) return;
    
    // Add node using default positioning from useMindmaps hook
    const newNode = addNode(mindmap.id, null, { title: newRootNodeTitle, description: newRootNodeDescription, emoji: '💡' });
    
    if (newNode) {
        setNewRootNodeTitle('');
        setNewRootNodeDescription('');
        toast({ title: "Root Node Added", description: `"${newNode.title}" added to the mindmap.` });

        // Pan to the new node to make it visible
        const containerWidth = zoomPanContainerRef.current.clientWidth;
        const containerHeight = zoomPanContainerRef.current.clientHeight;

        const nodeVisualCenterX = newNode.x + NODE_CARD_WIDTH / 2;
        const nodeVisualCenterY = newNode.y + NODE_HEADER_HEIGHT / 2; // Center of the node's header

        const newPanX = (containerWidth / 2) - (nodeVisualCenterX * scale);
        const newPanY = (containerHeight / 2) - (nodeVisualCenterY * scale);
        
        setPan({ x: newPanX, y: newPanY });
    }
  }, [newRootNodeTitle, newRootNodeDescription, mindmap, addNode, toast, scale, setPan]);

  const handleAddChildNode = useCallback((parentId: string) => {
    if (!mindmap || !zoomPanContainerRef.current) return;
    const parentNode = mindmap.data.nodes[parentId];
    if (!parentNode) return;

    // Calculate a preliminary position for the temporary node
    // This position should be relative to the parent, in logical canvas coordinates
    const tempNodeX = parentNode.x + NODE_CARD_WIDTH / 4; 
    const tempNodeY = parentNode.y + NODE_HEADER_HEIGHT + 80; // Below parent

    const tempNewNode: NodeData = {
      id: `temp-${uuidv4()}`,
      title: '', // Will be set in dialog
      description: "",
      emoji: "➕",
      parentId: parentId,
      childIds: [],
      x: tempNodeX, 
      y: tempNodeY,
    };
    setEditingNode(tempNewNode);
    setIsEditDialogOpen(true);
  }, [mindmap, setEditingNode, setIsEditDialogOpen, scale, pan]); // Removed zoomPanContainerRef as it's checked


  const handleEditNode = useCallback((node: NodeData) => {
    setEditingNode(node);
    setIsEditDialogOpen(true);
  }, [setEditingNode, setIsEditDialogOpen]);

  const handleSaveNode = useCallback((nodeId: string, data: EditNodeInput) => {
    if (!mindmap || !editingNode) return;

    if (editingNode.id.startsWith('temp-')) { // It's a new node
      // Use the x, y from the temporary editingNode, which were pre-calculated
      const permanentNode = addNode(mindmap.id, editingNode.parentId, data, editingNode.x, editingNode.y);
      if (permanentNode) {
        toast({ title: "Node Created", description: `Node "${permanentNode.title}" added.` });
      }
    } else { // It's an existing node
      updateNode(mindmap.id, nodeId, data);
      toast({ title: "Node Updated", description: `Node "${data.title}" saved.` });
    }
    setEditingNode(null);
    setIsEditDialogOpen(false);
  }, [mindmap, editingNode, addNode, updateNode, toast, setEditingNode, setIsEditDialogOpen]);

  const requestDeleteNode = useCallback((nodeId: string) => {
    if (!mindmap) return;
    const node = mindmap.data.nodes[nodeId];
    if (node) {
      setNodeToDelete({ id: nodeId, title: node.title });
      setIsDeleteDialogOpen(true);
    }
  }, [mindmap, setNodeToDelete, setIsDeleteDialogOpen]);

  const confirmDeleteNode = useCallback(() => {
    if (!mindmap || !nodeToDelete) return;
    deleteNodeFromHook(mindmap.id, nodeToDelete.id);
    toast({ title: "Node Deleted", description: `Node "${nodeToDelete.title || 'Untitled'}" and its children removed.`, variant: "destructive" });
    setIsDeleteDialogOpen(false);
    setNodeToDelete(null);
  }, [mindmap, nodeToDelete, deleteNodeFromHook, toast, setIsDeleteDialogOpen, setNodeToDelete]);

 const handleNodeDragStart = useCallback((event: React.DragEvent<HTMLDivElement>, nodeId: string) => {
    if (isSpacebarPanningActive) {
        event.preventDefault();
        return;
    }
    if (!canvasContentRef.current) return;
    setDraggedNodeId(nodeId);
    const nodeElement = event.currentTarget;
    const nodeRect = nodeElement.getBoundingClientRect(); // This is screen-space
    const canvasRect = zoomPanContainerRef.current?.getBoundingClientRect(); // Screen-space of the zoom container

    if (!canvasRect) return;

    // Mouse position in screen space: event.clientX, event.clientY
    // Node top-left in screen space: nodeRect.left, nodeRect.top
    
    // Offset of mouse from node's top-left, in screen space
    const screenOffsetX = event.clientX - nodeRect.left;
    const screenOffsetY = event.clientY - nodeRect.top;

    // Convert screen offset to logical (scaled) offset
    setDragOffset({
      x: screenOffsetX / scale,
      y: screenOffsetY / scale,
    });
    
    event.dataTransfer.effectAllowed = "move";
    // It's good practice to set some data, even if not strictly used by this component
    event.dataTransfer.setData("text/plain", nodeId); 
  }, [isSpacebarPanningActive, scale, setDraggedNodeId, setDragOffset]);
  
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

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!draggedNodeId || !mindmap || !zoomPanContainerRef.current || !canvasContentRef.current) return;

    const containerRect = zoomPanContainerRef.current.getBoundingClientRect();
    
    // Mouse position in screen coordinates where the drop occurred
    const clientX = event.clientX;
    const clientY = event.clientY;

    // Convert screen drop position to logical canvas coordinates
    // targetLogicalX = (screenDropX - containerScreenLeft - panX_component_of_transform) / scale
    const logicalX = (clientX - containerRect.left - pan.x) / scale;
    const logicalY = (clientY - containerRect.top - pan.y) / scale;
    
    // New top-left for the node in logical coordinates
    let newX = logicalX - dragOffset.x;
    let newY = logicalY - dragOffset.y;
        
    updateNodePosition(mindmap.id, draggedNodeId, newX, newY);
    setDraggedNodeId(null);
  }, [draggedNodeId, mindmap, dragOffset, updateNodePosition, pan, scale, zoomPanContainerRef, setDraggedNodeId]);


  const handleExportJson = useCallback(() => {
    if (!mindmap) return;
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(mindmap, null, 2)
    )}`;
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
          <Link href="/">
            <ArrowLeft className="mr-1 h-3 w-3" /> Library
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
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button asChild variant="outline" size="sm" className="mt-1">
              <Link href="/">
                <span className="flex items-center"><ArrowLeft className="mr-1 h-3.5 w-3.5" /> Library</span>
              </Link>
            </Button>
            <h1 className="text-base font-semibold text-foreground truncate mt-1" title={mindmap.name}>
              {mindmap.name}
            </h1>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 mt-1">
            <Button variant="outline" size="sm" onClick={handleExportJson}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> Export
            </Button>
          </div>
        </div>
        <div className="mt-1 flex flex-col sm:flex-row items-stretch gap-1">
          <Input
            type="text"
            value={newRootNodeTitle}
            onChange={(e) => setNewRootNodeTitle(e.target.value)}
            placeholder="New Root Idea Title"
            className="flex-grow h-8 text-xs sm:text-sm"
          />
          <Textarea
            value={newRootNodeDescription}
            onChange={(e) => setNewRootNodeDescription(e.target.value)}
            placeholder="Description (Optional)"
            rows={1}
            className="flex-grow text-xs sm:text-sm min-h-[32px] h-8 resize-none"
          />
          <Button onClick={handleAddRootNode} size="sm" className="h-8 text-xs sm:text-sm whitespace-nowrap">
            <PlusCircle className="mr-1.5 h-3.5 w-3.5" /> Add Root Idea
          </Button>
        </div>
      </div>

      {/* Main Zoom/Pan Container (ScrollArea's Viewport acts as this) */}
      <ScrollAreaPrimitive.Root 
        className="flex-grow relative overflow-hidden bg-muted/20 rounded-b-lg"
      >
        {/* This div is now the direct container for mouse events like pan mousedown and wheel zoom */}
        <div 
          ref={zoomPanContainerRef}
          className="w-full h-full relative overflow-hidden" 
          onMouseDown={handlePanMouseDown} // For spacebar panning
        >
          <ScrollAreaPrimitive.Viewport ref={scrollAreaViewportRef} className="w-full h-full"> {/* This handles actual scrolling if needed */}
            <div 
                ref={canvasContentRef}
                className="relative border-2 border-dashed border-destructive pointer-events-auto" 
                style={{
                    position: 'absolute', 
                    top: 0, 
                    left: 0, 
                    width: CANVAS_CONTENT_WIDTH,
                    height: CANVAS_CONTENT_HEIGHT,
                    transform: `scale(${scale}) translate(${pan.x / scale}px, ${pan.y / scale}px)`, // Pan is applied before scale
                    transformOrigin: '0 0',
                }}
                onDragOver={handleDragOver} 
                onDrop={handleDrop}         
                onDragEnter={handleDragEnter} 
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
                    className="absolute top-0 left-0 w-full h-full pointer-events-none" 
                    style={{ width: CANVAS_CONTENT_WIDTH, height: CANVAS_CONTENT_HEIGHT }} // Ensure SVG matches canvas content size
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
                          strokeWidth={Math.max(1, 2 / scale)} 
                          fill="none"
                        />
                      );
                    })}
                </svg>

                {allNodes.length === 0 && !draggedNodeId && (
                    <div
                      className="absolute flex items-center justify-center pointer-events-none text-center"
                      style={{
                        // Position this message in the center of the viewport, accounting for pan and scale
                        top: `${(-pan.y + (zoomPanContainerRef.current?.clientHeight || 0) / 2) / scale}px`, 
                        left: `${(-pan.x + (zoomPanContainerRef.current?.clientWidth || 0) / 2) / scale}px`,
                        transform: `translate(-50%, -50%) scale(${1/scale})`, // Center it and counteract canvas scale
                        width: '300px' 
                       }}
                    >
                      <div className="text-muted-foreground text-lg bg-background/80 p-6 rounded-md shadow-lg">
                          This mindmap is empty. Add a root idea to get started!
                      </div>
                    </div>
                )}
            </div>
          </ScrollAreaPrimitive.Viewport>
        </div>
        <ScrollAreaPrimitive.Scrollbar orientation="vertical" className="z-30" />
        <ScrollAreaPrimitive.Scrollbar orientation="horizontal" className="z-30" />
        <ScrollAreaPrimitive.Corner className="z-30" />
      </ScrollAreaPrimitive.Root>

      {/* Fixed UI Controls for Zoom and Tools */}
      <div className="fixed bottom-4 right-4 z-30 flex flex-col gap-2">
        <Tooltip>
            <TooltipTrigger asChild>
                <Button onClick={() => handleZoom(true)} variant="outline" size="icon" className="shadow-lg bg-background/80 hover:bg-muted">
                    <ZoomIn />
                </Button>
            </TooltipTrigger>
            <TooltipContent side="left"><p>Zoom In</p></TooltipContent>
        </Tooltip>
        <Tooltip>
            <TooltipTrigger asChild>
                <Button onClick={() => handleZoom(false)} variant="outline" size="icon" className="shadow-lg bg-background/80 hover:bg-muted">
                    <ZoomOut />
                </Button>
            </TooltipTrigger>
            <TooltipContent side="left"><p>Zoom Out</p></TooltipContent>
        </Tooltip>
        <Tooltip>
            <TooltipTrigger asChild>
                <Button onClick={handleRecenterView} variant="outline" size="icon" className="shadow-lg bg-background/80 hover:bg-muted">
                    <LocateFixed />
                </Button>
            </TooltipTrigger>
            <TooltipContent side="left"><p>Recenter View</p></TooltipContent>
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

