
"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Mindmap, NodeData, EditNodeInput } from '@/types/mindmap';
import { useMindmaps } from '@/hooks/useMindmaps';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NodeCard } from './NodeCard';
import { EditNodeDialog } from './EditNodeDialog';
import { PlusCircle, Download, AlertTriangle, ArrowLeft, ZoomIn, ZoomOut, RefreshCcw } from 'lucide-react';
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

interface MindmapEditorProps {
  mindmapId: string;
}

const NODE_CARD_WIDTH = 300;
const NODE_HEADER_HEIGHT = 50; // Approximate height of the card header for line connection
const CANVAS_CONTENT_WIDTH = '400vw';
const CANVAS_CONTENT_HEIGHT = '400vh';

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
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const canvasContentRef = useRef<HTMLDivElement>(null);

  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number } | null>(null);
  const [initialViewCentered, setInitialViewCentered] = useState(false);

  useEffect(() => {
    if (mindmap) {
      // Force re-render of SVG lines if mindmap, scale or pan changes
    }
  }, [mindmap, scale, pan]);

  const centerView = useCallback(() => {
    if (mindmap && canvasContainerRef.current) {
      const scrollAreaViewportEl = canvasContainerRef.current.querySelector('div[data-radix-scroll-area-viewport]') || canvasContainerRef.current;
      if (scrollAreaViewportEl) {
        const viewportWidth = scrollAreaViewportEl.clientWidth;
        const viewportHeight = scrollAreaViewportEl.clientHeight;

        let targetContentX = 0;
        let targetContentY = 0;

        const allNodesList = Object.values(mindmap.data.nodes);
        if (mindmap.data.rootNodeIds.length > 0 && mindmap.data.nodes[mindmap.data.rootNodeIds[0]]) {
          const firstRootNode = mindmap.data.nodes[mindmap.data.rootNodeIds[0]];
          targetContentX = firstRootNode.x + NODE_CARD_WIDTH / 2;
          targetContentY = firstRootNode.y + NODE_HEADER_HEIGHT / 2;
        } else if (allNodesList.length > 0) {
            const firstNode = allNodesList[0];
            targetContentX = firstNode.x + NODE_CARD_WIDTH / 2;
            targetContentY = firstNode.y + NODE_HEADER_HEIGHT / 2;
        }


        const newPanX = (viewportWidth / 2) - (targetContentX * scale);
        const newPanY = (viewportHeight / 2) - (targetContentY * scale);
        
        setPan({ x: newPanX, y: newPanY });
        setInitialViewCentered(true);
      }
    }
  }, [mindmap, scale]); // Removed initialViewCentered from dependencies as it causes re-centering on zoom

  useEffect(() => {
    if (mindmap && !initialViewCentered) {
      centerView();
    }
  }, [mindmap, initialViewCentered, centerView]);

  useEffect(() => {
    // Reset centering flag when mindmapId changes (i.e., navigating to a new mindmap)
    setInitialViewCentered(false);
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

    const tempNewNode: NodeData = {
      id: `temp-${uuidv4()}`, 
      title: '', // Intentionally blank, to be filled by EditNodeDialog
      description: "",
      emoji: "➕", // Default emoji for a new child
      parentId: parentId,
      childIds: [], 
      x: parentNode.x + NODE_CARD_WIDTH + 50, // Default position, can be adjusted
      y: parentNode.y,
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

  const handleDragStart = useCallback((event: React.DragEvent<HTMLDivElement>, nodeId: string) => {
    setDraggedNodeId(nodeId);
    const nodeElement = document.getElementById(`node-${nodeId}`);

    if (nodeElement && canvasContentRef.current) {
        const clientX = event.clientX;
        const clientY = event.clientY;
        const nodeRect = nodeElement.getBoundingClientRect();
        
        setDragOffset({
            x: (clientX - nodeRect.left) / scale,
            y: (clientY - nodeRect.top) / scale,
        });
    }
    event.dataTransfer.effectAllowed = "move";
    // It's good practice to set some data, even if not strictly used by the drop logic itself,
    // for broader compatibility or if other drop targets were to be introduced.
    event.dataTransfer.setData("text/plain", nodeId); 
  }, [scale]); 


  const handleDragEnter = useCallback((event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move"; // Explicitly set drop effect
  },[]);

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault(); // This is crucial for onDrop to fire
      event.dataTransfer.dropEffect = "move"; // And this too
  }, []);

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (!draggedNodeId || !mindmap || !canvasContentRef.current || !canvasContainerRef.current) return;
      
      // Get the bounding rectangle of the canvas content area (the one that's scaled and panned)
      const contentRect = canvasContentRef.current.getBoundingClientRect();

      // Mouse position relative to the viewport
      const mouseXInViewport = event.clientX;
      const mouseYInViewport = event.clientY;

      // Calculate mouse position relative to the *unscaled, unpanned* content area's top-left
      const mouseXInContent = mouseXInViewport - contentRect.left;
      const mouseYInContent = mouseYInViewport - contentRect.top;
      
      // Convert mouse position to logical coordinates within the scaled content
      const logicalX = mouseXInContent / scale;
      const logicalY = mouseYInContent / scale;

      // Calculate new top-left for the node
      let newX = logicalX - dragOffset.x;
      let newY = logicalY - dragOffset.y;
      
      // Removed: No longer clamping to 0,0
      // newX = Math.max(0, newX);
      // newY = Math.max(0, newY);
      
      updateNodePosition(mindmap.id, draggedNodeId, newX, newY);
      setDraggedNodeId(null);
  }, [draggedNodeId, mindmap, scale, dragOffset, updateNodePosition]); // Removed pan from deps as contentRect accounts for it


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

    // If a pointer is provided (e.g., mouse cursor), zoom towards that point.
    // Otherwise, zoom towards the center of the viewport.
    if (pointer && canvasContainerRef.current) {
        const scrollAreaViewportEl = canvasContainerRef.current.querySelector('div[data-radix-scroll-area-viewport]') || canvasContainerRef.current;
        // Mouse position relative to the scroll area viewport's top-left
        const mouseXInViewport = pointer.x; 
        const mouseYInViewport = pointer.y;
        
        // Convert mouse viewport coordinates to logical coordinates on the *unscaled* content
        const mouseOnContentX = (mouseXInViewport - pan.x) / oldScale;
        const mouseOnContentY = (mouseYInViewport - pan.y) / oldScale;
        
        // Calculate new pan so the point under the mouse remains in the same viewport position
        newPanX = mouseXInViewport - mouseOnContentX * newScale;
        newPanY = mouseYInViewport - mouseOnContentY * newScale;

    } else { // Zoom to center of viewport if no pointer
        if (canvasContainerRef.current) {
            const scrollAreaViewportEl = canvasContainerRef.current.querySelector('div[data-radix-scroll-area-viewport]') || canvasContainerRef.current;
            const viewportCenterX = scrollAreaViewportEl.clientWidth / 2;
            const viewportCenterY = scrollAreaViewportEl.clientHeight / 2;
            
            // Logical center of the viewport on the unscaled content
            const logicalCenterX = (viewportCenterX - pan.x) / oldScale;
            const logicalCenterY = (viewportCenterY - pan.y) / oldScale;

            // Adjust pan to keep this logical center at the viewport center after scaling
            newPanX = viewportCenterX - logicalCenterX * newScale;
            newPanY = viewportCenterY - logicalCenterY * newScale;
        }
    }
    
    setScale(newScale);
    setPan({ x: newPanX, y: newPanY });
  }, [scale, pan]); // Added scale and pan to dependency array

  const handleWheelZoom = useCallback((event: WheelEvent) => {
    event.preventDefault(); // Prevent page scroll
    const scrollAreaViewportEl = event.currentTarget as HTMLDivElement; // The element the listener is attached to
    if (!scrollAreaViewportEl) return;

    // Mouse position relative to the scroll area viewport's top-left
    const viewportRect = scrollAreaViewportEl.getBoundingClientRect();
    const mouseXInViewport = event.clientX - viewportRect.left;
    const mouseYInViewport = event.clientY - viewportRect.top;

    handleZoom(event.deltaY < 0, undefined, { x: mouseXInViewport, y: mouseYInViewport });
  }, [handleZoom]); // Added handleZoom to dependency array
  
  const handlePanMouseDown = useCallback((event: MouseEvent) => {
    // Prevent panning if the click is on a node card or any interactive element within it
    const target = event.target as HTMLElement;
    if (target.closest('.node-card-draggable') || target.closest('button') || target.closest('input') || target.closest('textarea')) {
      return; // Don't initiate pan if a node or its button is clicked
    }

    // Ensure panning only starts if the mousedown is on the direct viewport or the canvasContentRef (background)
    if (event.currentTarget && (target === event.currentTarget || (canvasContentRef.current && target === canvasContentRef.current)) ) {
      setIsPanning(true);
      panStartRef.current = {
        x: event.clientX - pan.x, // Store initial mouse position relative to current pan
        y: event.clientY - pan.y,
      };
      (event.currentTarget as HTMLElement).style.cursor = 'grabbing';
    }
  }, [pan]); // Added pan to dependency array

  const handlePanMouseMove = useCallback((event: MouseEvent) => {
    if (!isPanning || !panStartRef.current) return;
    setPan({
      x: event.clientX - panStartRef.current.x,
      y: event.clientY - panStartRef.current.y,
    });
  }, [isPanning]); // Added isPanning to dependency array

  const handlePanMouseUpOrLeave = useCallback((event: MouseEvent) => {
    if (isPanning) {
        setIsPanning(false);
        panStartRef.current = null;
        if (canvasContainerRef.current) {
            const scrollAreaViewportEl = canvasContainerRef.current.querySelector('div[data-radix-scroll-area-viewport]');
            if (scrollAreaViewportEl) {
                (scrollAreaViewportEl as HTMLElement).style.cursor = 'grab'; // Reset cursor
            }
        }
    }
  }, [isPanning]); // Added isPanning to dependency array
  
  const handleResetZoomPan = useCallback(() => {
    setScale(1);
    // Recenter view instead of just setting pan to 0,0
    setInitialViewCentered(false); // This will trigger the centering useEffect
  }, []); // No dependencies needed as it calls other stable functions or resets state

  useEffect(() => {
    const scrollAreaViewportEl = canvasContainerRef.current?.querySelector('div[data-radix-scroll-area-viewport]');
    if (scrollAreaViewportEl) {
      // Cast to HTMLDivElement for addEventListener
      const currentViewport = scrollAreaViewportEl as HTMLDivElement;

      // Add wheel event for zooming
      currentViewport.addEventListener('wheel', handleWheelZoom, { passive: false }); // passive: false to allow preventDefault

      // Add mouse events for panning
      currentViewport.addEventListener('mousedown', handlePanMouseDown);
      // Attach mousemove and mouseup to window to allow dragging outside the viewport
      window.addEventListener('mousemove', handlePanMouseMove); 
      window.addEventListener('mouseup', handlePanMouseUpOrLeave);   // Catches mouseup even if outside viewport
      window.addEventListener('mouseleave', handlePanMouseUpOrLeave); // Catches if mouse leaves window

      // Set initial cursor style for panning
      currentViewport.style.cursor = 'grab'; 

      return () => {
        currentViewport.removeEventListener('wheel', handleWheelZoom);
        currentViewport.removeEventListener('mousedown', handlePanMouseDown);
        window.removeEventListener('mousemove', handlePanMouseMove);
        window.removeEventListener('mouseup', handlePanMouseUpOrLeave);
        window.removeEventListener('mouseleave', handlePanMouseUpOrLeave);
      };
    }
  }, [handleWheelZoom, handlePanMouseDown, handlePanMouseMove, handlePanMouseUpOrLeave]); // Added all memoized handlers


  if (!mindmap) {
    return (
      <div className="flex flex-col items-center justify-center h-full flex-grow space-y-4 text-center py-10">
        <AlertTriangle className="w-16 h-16 text-destructive" />
        <h2 className="text-2xl font-bold">Mindmap Not Found</h2>
        <p className="text-muted-foreground">The mindmap you are looking for does not exist or has been deleted.</p>
        <Button asChild variant="secondary">
          <Link href="/">
            <ArrowLeft className="mr-2 h-4 w-4" /> Go Back to Library
          </Link>
        </Button>
      </div>
    );
  }

  const allNodes = Object.values(mindmap.data.nodes);

  return (
    <div className="flex flex-col h-full flex-grow w-full space-y-2">
      {/* Top Control Section */}
      <div className="p-2 border-b bg-background/80 backdrop-blur-sm rounded-t-lg sticky top-0 z-10">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-1 mb-1">
          <h1 className="text-xl font-semibold text-foreground truncate" title={mindmap.name}>
            {mindmap.name}
          </h1>
          <div className="flex items-center gap-1">
            <Button asChild variant="outline" size="sm" className="mt-1 text-xs">
              {/* Ensure Link has a single child element if Button's Slot is to work correctly */}
              <Link href="/">
                <span>
                  <ArrowLeft className="mr-1 h-3 w-3" /> Library
                </span>
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportJson} className="mt-1 text-xs">
              <Download className="mr-1 h-3 w-3" /> Export JSON
            </Button>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch gap-1">
          <Input
            type="text"
            value={newRootNodeTitle}
            onChange={(e) => setNewRootNodeTitle(e.target.value)}
            placeholder="New Root Idea Title"
            className="flex-grow text-xs h-8"
          />
          <Textarea
            value={newRootNodeDescription}
            onChange={(e) => setNewRootNodeDescription(e.target.value)}
            placeholder="Description (Optional)"
            rows={1}
            className="flex-grow text-xs min-h-[32px] h-8 resize-none"
          />
          <Button onClick={handleAddRootNode} size="sm" className="text-xs h-8">
            <PlusCircle className="mr-1 h-3 w-3" /> Add Root
          </Button>
        </div>
      </div>

      {/* Main Canvas Area */}
      <ScrollArea 
        ref={canvasContainerRef}
        className="w-full whitespace-nowrap rounded-b-lg border bg-background shadow-inner flex-grow min-h-[400px] sm:min-h-[500px] relative overflow-hidden" 
      >
        <div 
          ref={canvasContentRef}
          className="relative border-2 border-dashed border-border" 
          style={{ 
            width: CANVAS_CONTENT_WIDTH, 
            height: CANVAS_CONTENT_HEIGHT,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            transformOrigin: '0 0', 
          }}
          onDragEnter={handleDragEnter} // Added for better drop target recognition
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
              className="node-card-draggable" // Class to identify nodes vs background for panning
            />
          ))}

          <svg 
            key={`lines-${allNodes.length}-${scale}-${pan.x}-${pan.y}`} // Re-render SVG if these change
            className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-visible"
            // No z-index here, should be fine as it's absolutely positioned within the same parent as nodes
          >
            {/* Removed marker definition as it's not used for curved paths yet */}
            {allNodes.map(node => {
              if (!node.parentId) return null; // Only draw for nodes with parents

              const parentNode = mindmap.data.nodes[node.parentId];
              if (!parentNode) return null; // Should not happen if data is consistent

              // Start from bottom-center of parent's header area
              const startX = parentNode.x + NODE_CARD_WIDTH / 2;
              const startY = parentNode.y + NODE_HEADER_HEIGHT; // Approx bottom of header

              // End at top-center of child node
              const endX = node.x + NODE_CARD_WIDTH / 2;
              const endY = node.y; // Top of child node card

              const strokeColor = parentNode.parentId === null ? "hsl(var(--primary))" : "hsl(var(--accent))";
              
              // S-curve control points
              // Adjust sCurveOffset based on vertical distance to make curves more or less pronounced
              const sCurveOffset = Math.max(20, Math.min(80, Math.abs(endY - startY) / 2));
              const pathData = `M ${startX} ${startY} C ${startX} ${startY + sCurveOffset}, ${endX} ${endY - sCurveOffset}, ${endX} ${endY}`;


              return (
                <path
                  key={`${parentNode.id}-${node.id}`}
                  d={pathData}
                  stroke={strokeColor}
                  strokeWidth={2 / scale} // Make lines appear consistent thickness or slightly thicker on zoom out
                  fill="none"
                  // markerEnd={parentNode.parentId === null ? "url(#arrowhead-primary)" : "url(#arrowhead-accent)"}
                />
              );
            })}
          </svg>

          {allNodes.length === 0 && !draggedNodeId && ( // Show message if canvas is empty and not dragging
            <div 
              className="absolute inset-0 flex items-center justify-center pointer-events-none" 
              // Apply inverse transform to keep the message centered in the viewport
              style={{ 
                transform: `translate(${-pan.x / scale}px, ${-pan.y / scale}px)`, 
                width: `${100 / scale}%`, // Ensure it covers the viewport equivalent area
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
      
      {/* Zoom Controls */}
      <div className="fixed bottom-4 right-4 z-20 flex items-center gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button onClick={() => handleZoom(true)} variant="outline" size="icon" className="shadow-lg bg-background/80 hover:bg-muted">
                <ZoomIn />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Zoom In</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button onClick={() => handleZoom(false)} variant="outline" size="icon" className="shadow-lg bg-background/80 hover:bg-muted">
                <ZoomOut />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Zoom Out</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
               <Button onClick={handleResetZoomPan} variant="outline" size="icon" className="shadow-lg bg-background/80 hover:bg-muted">
                <RefreshCcw />
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
            if (!open) setEditingNode(null); // Clear editing node on dialog close
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

