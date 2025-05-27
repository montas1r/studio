
"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Mindmap, NodeData, EditNodeInput } from '@/types/mindmap';
import { useMindmaps } from '@/hooks/useMindmaps';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NodeCard } from './NodeCard';
import { EditNodeDialog } from './EditNodeDialog';
import { PlusCircle, Download, AlertTriangle, ArrowLeft, ZoomIn, ZoomOut, RefreshCcw, Hand } from 'lucide-react';
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
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface MindmapEditorProps {
  mindmapId: string;
}

const NODE_CARD_WIDTH = 300;
const NODE_HEADER_HEIGHT = 50; // Approximate height of the card header for line connection
const CANVAS_CONTENT_WIDTH = '400vw'; // Increased for more draggable space
const CANVAS_CONTENT_HEIGHT = '400vh'; // Increased for more draggable space

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
  const canvasContainerRef = useRef<HTMLDivElement>(null); // Ref for ScrollArea
  const canvasContentRef = useRef<HTMLDivElement>(null); // Ref for the pannable/scalable content div

  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number } | null>(null);
  const [initialViewCentered, setInitialViewCentered] = useState(false);
  const [activeTool, setActiveTool] = useState<ActiveTool>('select');

  const centerView = useCallback(() => {
    if (canvasContainerRef.current && canvasContentRef.current) {
      const scrollAreaViewportEl = canvasContainerRef.current.querySelector('div[data-radix-scroll-area-viewport]') || canvasContainerRef.current;
      const viewportWidth = scrollAreaViewportEl.clientWidth;
      const viewportHeight = scrollAreaViewportEl.clientHeight;

      let targetContentX = (parseFloat(CANVAS_CONTENT_WIDTH) / 100 * viewportWidth) / 2; // Logical center of the large canvas
      let targetContentY = (parseFloat(CANVAS_CONTENT_HEIGHT) / 100 * viewportHeight) / 2;

      if (mindmap && mindmap.data.rootNodeIds.length > 0 && mindmap.data.nodes[mindmap.data.rootNodeIds[0]]) {
        const firstRootNode = mindmap.data.nodes[mindmap.data.rootNodeIds[0]];
        targetContentX = firstRootNode.x + NODE_CARD_WIDTH / 2;
        targetContentY = firstRootNode.y + NODE_HEADER_HEIGHT / 2; // Approx center of first node
      } else if (mindmap && Object.keys(mindmap.data.nodes).length > 0) {
        const firstNode = Object.values(mindmap.data.nodes)[0];
         targetContentX = firstNode.x + NODE_CARD_WIDTH / 2;
         targetContentY = firstNode.y + NODE_HEADER_HEIGHT / 2;
      }


      const newPanX = (viewportWidth / 2) - (targetContentX * scale);
      const newPanY = (viewportHeight / 2) - (targetContentY * scale);

      setPan({ x: newPanX, y: newPanY });
      setInitialViewCentered(true);
    }
  }, [mindmap, scale]);


  useEffect(() => {
    if (mindmap && !initialViewCentered) {
      centerView();
    }
  }, [mindmap, initialViewCentered, centerView]);

  useEffect(() => {
    setInitialViewCentered(false); // Reset centering flag when mindmapId changes
  }, [mindmapId]);


  const handleAddRootNode = () => {
    if (newRootNodeTitle.trim() === '') {
      toast({ title: "Title Required", description: "Please enter a title for the new root node.", variant: "destructive" });
      return;
    }
    if (!mindmap) return;
    addNode(mindmap.id, null, { title: newRootNodeTitle, description: newRootNodeDescription, emoji: '💡' });
    setNewRootNodeTitle('');
    setNewRootNodeDescription('');
    toast({ title: "Root Node Added", description: `"${newRootNodeTitle}" added to the mindmap.` });
  };

  const handleAddChildNode = useCallback((parentId: string) => {
    if (!mindmap) return;
    const parentNode = mindmap.data.nodes[parentId];
    if (!parentNode) return;

    // Create a temporary node object to pass to the dialog
    // The actual addNode will be called when the dialog saves
    const tempNewNode: NodeData = {
      id: `temp-${uuidv4()}`, // Temporary ID
      title: 'New Node', // Placeholder title
      description: "",
      emoji: "➕",
      parentId: parentId,
      childIds: [], // Will be empty for a new node
      x: parentNode.x + NODE_CARD_WIDTH + 50, // Initial position relative to parent
      y: parentNode.y,
    };

    setEditingNode(tempNewNode); // Pass the temporary node to the dialog
    setIsEditDialogOpen(true);
  }, [mindmap]);


  const handleEditNode = useCallback((node: NodeData) => {
    setEditingNode(node);
    setIsEditDialogOpen(true);
  }, []);

  const handleSaveNode = useCallback((nodeId: string, data: EditNodeInput) => {
    if (!mindmap || !editingNode) return;

    if (editingNode.id.startsWith('temp-')) { // Check if it's a new node (using the temporary ID)
      const permanentNode = addNode(mindmap.id, editingNode.parentId, data); // Now call addNode from useMindmaps
      if (permanentNode) {
        toast({ title: "Node Created", description: `Node "${permanentNode.title}" added.` });
      }
    } else { // It's an existing node being edited
      updateNode(mindmap.id, nodeId, data);
      toast({ title: "Node Updated", description: `Node "${data.title}" saved.` });
    }
    setEditingNode(null); // Clear editingNode after save/create
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

  const handleDragStart = useCallback((event: React.DragEvent<HTMLDivElement>, nodeId: string) => {
    if (activeTool === 'pan') {
        event.preventDefault();
        return;
    }
    setDraggedNodeId(nodeId);
    const nodeElement = document.getElementById(`node-${nodeId}`);

    if (nodeElement && canvasContentRef.current) {
        const clientX = event.clientX;
        const clientY = event.clientY;
        
        const nodeRect = nodeElement.getBoundingClientRect(); // Node's position in viewport
        
        // Mouse position relative to the node's top-left corner, scaled
        setDragOffset({
            x: (clientX - nodeRect.left) / scale,
            y: (clientY - nodeRect.top) / scale, 
        });
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", nodeId); // Necessary for Firefox
  }, [scale, activeTool]);

  const handleDragEnter = useCallback((event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
  },[]);

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move"; 
  }, []);

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (!draggedNodeId || !mindmap || !canvasContentRef.current || !canvasContainerRef.current) return;

      // Get ScrollArea's viewport element
      const scrollAreaViewportEl = canvasContainerRef.current.querySelector('div[data-radix-scroll-area-viewport]') || canvasContainerRef.current;
      const viewportRect = scrollAreaViewportEl.getBoundingClientRect();
      
      // Mouse position relative to the viewport's top-left
      const mouseXInViewport = event.clientX - viewportRect.left;
      const mouseYInViewport = event.clientY - viewportRect.top;
      
      // Convert mouse position to logical canvas coordinates
      let newX = (mouseXInViewport - pan.x) / scale - dragOffset.x;
      let newY = (mouseYInViewport - pan.y) / scale - dragOffset.y;

      // Lock nodes to canvas bounds (top/left)
      newX = Math.max(0, newX);
      newY = Math.max(0, newY);
      
      updateNodePosition(mindmap.id, draggedNodeId, newX, newY);
      setDraggedNodeId(null);
  }, [draggedNodeId, mindmap, scale, pan, dragOffset, updateNodePosition]);


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

  const handleZoom = useCallback((zoomIn: boolean, customScale?: number, pointer?: {x: number, y: number}) => {
    const oldScale = scale;
    let newScale: number;

    if (customScale !== undefined) {
        newScale = customScale;
    } else {
        const zoomFactor = 1.2;
        newScale = zoomIn ? oldScale * zoomFactor : oldScale / zoomFactor;
    }

    newScale = Math.max(0.2, Math.min(newScale, 3)); // Clamp scale
    if (newScale === oldScale) return;

    let newPanX = pan.x;
    let newPanY = pan.y;

    if (pointer && canvasContainerRef.current) {
        // Get ScrollArea's viewport element for accurate rect
        const scrollAreaViewportEl = canvasContainerRef.current.querySelector('div[data-radix-scroll-area-viewport]') || canvasContainerRef.current;
        const viewportRect = scrollAreaViewportEl.getBoundingClientRect();
        
        // Mouse position relative to the viewport's content area (where scrolling happens)
        const mouseXInContentDiv = pointer.x - viewportRect.left; 
        const mouseYInContentDiv = pointer.y - viewportRect.top; 

        // Logical position of the mouse on the pannable/scalable canvas
        const mouseOnContentX = (mouseXInContentDiv - pan.x) / oldScale;
        const mouseOnContentY = (mouseYInContentDiv - pan.y) / oldScale;
        
        // Calculate new pan to keep mouseOnContentX/Y at the same screen position
        newPanX = mouseXInContentDiv - mouseOnContentX * newScale;
        newPanY = mouseYInContentDiv - mouseOnContentY * newScale;

    } else { // Zoom to center of viewport if no pointer
        if (canvasContainerRef.current) {
            const scrollAreaViewportEl = canvasContainerRef.current.querySelector('div[data-radix-scroll-area-viewport]') || canvasContainerRef.current;
            const viewportCenterX = scrollAreaViewportEl.clientWidth / 2;
            const viewportCenterY = scrollAreaViewportEl.clientHeight / 2;
            
            const logicalCenterX = (viewportCenterX - pan.x) / oldScale; // Center of viewport in logical canvas coords
            const logicalCenterY = (viewportCenterY - pan.y) / oldScale;
            
            newPanX = viewportCenterX - logicalCenterX * newScale;
            newPanY = viewportCenterY - logicalCenterY * newScale;
        }
    }

    setScale(newScale);
    setPan({ x: newPanX, y: newPanY });
  }, [scale, pan]); 

  const handleWheelZoom = useCallback((event: WheelEvent) => {
    if (!canvasContainerRef.current) return;
    // Prevent default browser scroll/zoom on the canvas area
    event.preventDefault();
    handleZoom(event.deltaY < 0, undefined, { x: event.clientX, y: event.clientY });
  }, [handleZoom]); 

  const handlePanMouseDown = useCallback((event: MouseEvent) => {
    if(activeTool !== 'pan') return;

    const target = event.target as HTMLElement;
    const scrollAreaViewportEl = canvasContainerRef.current?.querySelector('div[data-radix-scroll-area-viewport]');
    
    // Prevent panning if clicking on a node card or its interactive elements
    if (target.closest('.node-card-draggable') || target.closest('button') || target.closest('input') || target.closest('textarea') || target.closest('[role="dialog"]')) {
      return;
    }

    // Ensure click is on the direct scroll area viewport or the canvas content background
    if (scrollAreaViewportEl && (target === scrollAreaViewportEl || (canvasContentRef.current && target === canvasContentRef.current)) ) {
      setIsPanning(true);
      panStartRef.current = {
        x: event.clientX - pan.x,
        y: event.clientY - pan.y,
      };
      (scrollAreaViewportEl as HTMLElement).style.cursor = 'grabbing';
    }
  }, [pan, activeTool]); 

  const handlePanMouseMove = useCallback((event: MouseEvent) => {
    if (!isPanning || !panStartRef.current || activeTool !== 'pan') return;
    event.preventDefault(); // Important to prevent text selection during pan
    setPan({
      x: event.clientX - panStartRef.current.x,
      y: event.clientY - panStartRef.current.y,
    });
  }, [isPanning, activeTool]); 

  const handlePanMouseUpOrLeave = useCallback((event: MouseEvent) => { // Use MouseEvent for window events
    if (isPanning && activeTool === 'pan') {
        setIsPanning(false);
        panStartRef.current = null;
        if (canvasContainerRef.current) {
            const scrollAreaViewportEl = canvasContainerRef.current.querySelector('div[data-radix-scroll-area-viewport]');
            if (scrollAreaViewportEl) {
                (scrollAreaViewportEl as HTMLElement).style.cursor = activeTool === 'pan' ? 'grab' : 'default';
            }
        }
    }
  }, [isPanning, activeTool]); 

  const handleResetZoomPan = useCallback(() => {
    setScale(1);
    setInitialViewCentered(false); // This will trigger centerView via useEffect
  }, []); 

  useEffect(() => {
    const scrollAreaViewportEl = canvasContainerRef.current?.querySelector('div[data-radix-scroll-area-viewport]');
    if (scrollAreaViewportEl) {
      const currentViewport = scrollAreaViewportEl as HTMLDivElement;
      // Add wheel event for zooming
      currentViewport.addEventListener('wheel', handleWheelZoom, { passive: false });
      // Add mousedown for panning start
      currentViewport.addEventListener('mousedown', handlePanMouseDown);
      // Add mousemove and mouseup to window for panning continuation/end
      window.addEventListener('mousemove', handlePanMouseMove);
      window.addEventListener('mouseup', handlePanMouseUpOrLeave);
      window.addEventListener('mouseleave', handlePanMouseUpOrLeave); // Handle if mouse leaves window while panning
      
      // Set initial cursor based on active tool
      currentViewport.style.cursor = activeTool === 'pan' ? 'grab' : 'default';
      
      return () => {
        currentViewport.removeEventListener('wheel', handleWheelZoom);
        currentViewport.removeEventListener('mousedown', handlePanMouseDown);
        window.removeEventListener('mousemove', handlePanMouseMove);
        window.removeEventListener('mouseup', handlePanMouseUpOrLeave);
        window.removeEventListener('mouseleave', handlePanMouseUpOrLeave);
      };
    }
  }, [handleWheelZoom, handlePanMouseDown, handlePanMouseMove, handlePanMouseUpOrLeave, activeTool]); // Re-run if activeTool changes to update cursor


  if (!mindmap) {
    return (
      <div className="flex flex-col items-center justify-center h-full flex-grow space-y-4 text-center py-10">
        <AlertTriangle className="w-16 h-16 text-destructive" />
        <h2 className="text-2xl font-bold">Mindmap Not Found</h2>
        <p className="text-muted-foreground">The mindmap you are looking for does not exist or has been deleted.</p>
        <Button asChild variant="secondary">
          <Link href="/">
            <span className="flex items-center"><ArrowLeft className="mr-2 h-4 w-4" /> Go Back to Library</span>
          </Link>
        </Button>
      </div>
    );
  }

  const allNodes = Object.values(mindmap.data.nodes);

  return (
    <div className="flex flex-col h-full flex-grow w-full space-y-1">
      {/* Top Control Section - Compacted */}
      <div className="p-2 border-b bg-background/80 backdrop-blur-sm rounded-t-lg sticky top-0 z-10">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-1 mb-1">
          <h1 className="text-xs sm:text-sm font-semibold text-foreground truncate" title={mindmap.name}>
            {mindmap.name}
          </h1>
          <div className="flex items-center gap-1">
            <Button asChild variant="outline" size="sm" className="text-xs h-7 px-2">
              <Link href="/">
                <span className="flex items-center">
                  <ArrowLeft className="mr-1 h-3 w-3" /> Library
                </span>
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportJson} className="text-xs h-7 px-2">
              <Download className="mr-1 h-3 w-3" /> Export
            </Button>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch gap-1">
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

      {/* Main Canvas Area */}
      <ScrollArea
        ref={canvasContainerRef}
        className={cn(
            "w-full whitespace-nowrap rounded-b-lg bg-background shadow-inner flex-grow relative overflow-hidden",
            "border-2 border-dashed border-destructive", // Red dotted border moved here
            "min-h-[calc(100vh-220px)] sm:min-h-[calc(100vh-200px)]" 
        )}
      >
        <div
          ref={canvasContentRef}
          className="relative" // Border removed from here
          style={{
            width: CANVAS_CONTENT_WIDTH,
            height: CANVAS_CONTENT_HEIGHT,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            transformOrigin: '0 0',
            // backgroundColor: 'transparent', // Ensure it doesn't obscure ScrollArea's bg if needed
          }}
          onDragEnter={handleDragEnter}
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
              onDragStart={(e, id) => handleDragStart(e, id)}
              className="node-card-draggable" 
            />
          ))}

          <svg
            key={`lines-${allNodes.length}-${scale}-${pan.x}-${pan.y}`} // Re-render SVG if these change
            className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-visible" // Ensure SVG is on top and doesn't block mouse for panning
          >
            {allNodes.map(node => {
              if (!node.parentId) return null; // Only draw for child nodes

              const parentNode = mindmap.data.nodes[node.parentId];
              if (!parentNode) return null; // Parent must exist

              // Connect from center-bottom of parent header to center-top of child card
              const startX = parentNode.x + NODE_CARD_WIDTH / 2;
              const startY = parentNode.y + NODE_HEADER_HEIGHT; // Below the parent header
              const endX = node.x + NODE_CARD_WIDTH / 2;
              const endY = node.y; // Top of the child card

              const strokeColor = parentNode.parentId === null ? "hsl(var(--primary))" : "hsl(var(--accent))";
              
              // Control points for the S-curve (cubic Bezier)
              // Adjust sCurveOffsetY for more/less pronounced curve based on vertical distance
              const sCurveOffsetY = Math.max(20, Math.min(80, Math.abs(endY - startY) / 2));
              const pathData = `M ${startX} ${startY} C ${startX} ${startY + sCurveOffsetY}, ${endX} ${endY - sCurveOffsetY}, ${endX} ${endY}`;

              return (
                <path
                  key={`${parentNode.id}-${node.id}`}
                  d={pathData}
                  stroke={strokeColor}
                  strokeWidth={2 / scale} // Make line thinner as you zoom in, thicker as you zoom out
                  fill="none"
                />
              );
            })}
          </svg>

          {allNodes.length === 0 && !draggedNodeId && (
            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
              style={{
                // Counter-transform to keep the message centered relative to viewport
                transform: `translate(${-pan.x / scale}px, ${-pan.y / scale}px)`, 
                width: `${100 / scale}%`, // Fill the viewport at current scale
                height: `${100 / scale}%`,
               }}
            >
              <div className="text-muted-foreground text-center py-10 text-lg bg-background/80 p-6 rounded-md">
                This mindmap is empty. Add a root idea to get started!
              </div>
            </div>
          )}
        </div>
        <ScrollBar orientation="horizontal" />
        <ScrollBar orientation="vertical" />
      </ScrollArea>

      {/* Zoom and Tool Controls */}
      <div className="fixed bottom-4 right-4 z-20 flex items-center gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                onClick={() => setActiveTool(activeTool === 'pan' ? 'select' : 'pan')} 
                variant="outline" 
                size="icon" 
                className={cn("shadow-lg bg-background/80 hover:bg-muted", activeTool === 'pan' && "ring-2 ring-primary text-primary")}
              >
                <Hand />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Toggle Pan Tool (P)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button onClick={() => handleZoom(true)} variant="outline" size="icon" className="shadow-lg bg-background/80 hover:bg-muted">
                <span className="flex items-center justify-center"><ZoomIn /></span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Zoom In</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button onClick={() => handleZoom(false)} variant="outline" size="icon" className="shadow-lg bg-background/80 hover:bg-muted">
                <span className="flex items-center justify-center"><ZoomOut /></span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Zoom Out</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
               <Button onClick={handleResetZoomPan} variant="outline" size="icon" className="shadow-lg bg-background/80 hover:bg-muted">
                <span className="flex items-center justify-center"><RefreshCcw /></span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reset View</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {isEditDialogOpen && editingNode && (
        <EditNodeDialog
          isOpen={isEditDialogOpen}
          onOpenChange={(open) => {
            setIsEditDialogOpen(open);
            if (!open) setEditingNode(null); // Clear editingNode when dialog closes
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

