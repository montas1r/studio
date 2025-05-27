
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

        if (mindmap.data.rootNodeIds.length > 0 && mindmap.data.nodes[mindmap.data.rootNodeIds[0]]) {
          const firstRootNode = mindmap.data.nodes[mindmap.data.rootNodeIds[0]];
          targetContentX = firstRootNode.x + NODE_CARD_WIDTH / 2;
          targetContentY = firstRootNode.y + NODE_HEADER_HEIGHT / 2;
        } else if (allNodes.length > 0) { // Fallback to first node if no roots (should not happen)
            const firstNode = allNodes[0];
            targetContentX = firstNode.x + NODE_CARD_WIDTH / 2;
            targetContentY = firstNode.y + NODE_HEADER_HEIGHT / 2;
        }


        const newPanX = (viewportWidth / 2) - (targetContentX * scale);
        const newPanY = (viewportHeight / 2) - (targetContentY * scale);
        
        setPan({ x: newPanX, y: newPanY });
        setInitialViewCentered(true);
      }
    }
  }, [mindmap, scale]); // Removed allNodes from deps to avoid re-triggering if only node content changes

  useEffect(() => {
    if (mindmap && !initialViewCentered) {
      centerView();
    }
  }, [mindmap, initialViewCentered, centerView]);

  useEffect(() => {
    // Reset centering flag when mindmap ID changes, to allow recentering on new map
    setInitialViewCentered(false);
  }, [mindmapId]);


  const handleAddRootNode = () => {
    if (!mindmap || !newRootNodeTitle.trim()) return;
    const newNode = addNode(mindmap.id, null, {
      title: newRootNodeTitle,
      description: newRootNodeDescription,
      emoji: ''
    });
    if (newNode) {
      setNewRootNodeTitle('');
      setNewRootNodeDescription('');
      toast({ title: "Root Node Added", description: `Node "${newNode.title}" created.` });
       if (mindmap.data.rootNodeIds.length === 0) { // Only recenter if it's the very first node
        setInitialViewCentered(false); // Trigger recentering
      }
    }
  };

  const handleAddChildNode = (parentId: string) => {
    if (!mindmap) return;
    const parentNode = mindmap.data.nodes[parentId];
    if (!parentNode) return;

    // Create a temporary node object to pass to the dialog
    // The actual node creation will happen in handleSaveNode if the user confirms
    const tempNewNode: NodeData = {
      id: `temp-${uuidv4()}`, // Temporary ID
      title: '', // Default title, to be filled in dialog
      description: "",
      emoji: "",
      parentId: parentId,
      childIds: [], // Will be empty for a new node
      // Position relative to parent, actual addNode will refine this
      x: parentNode.x + NODE_CARD_WIDTH + 50,
      y: parentNode.y,
    };

    setEditingNode(tempNewNode);
    setIsEditDialogOpen(true);
  };


  const handleEditNode = (node: NodeData) => {
    setEditingNode(node);
    setIsEditDialogOpen(true);
  };

  const handleSaveNode = (nodeId: string, data: EditNodeInput) => {
    if (!mindmap || !editingNode) return;

    if (editingNode.id.startsWith('temp-')) { 
      // This is a new node being created
      const permanentNode = addNode(mindmap.id, editingNode.parentId, data); // ParentId from temp node
      if (permanentNode) {
        toast({ title: "Node Created", description: `Node "${permanentNode.title}" added.` });
      }
    } else { 
      // This is an existing node being edited
      updateNode(mindmap.id, nodeId, data);
      toast({ title: "Node Updated", description: `Node "${data.title}" saved.` });
    }
    setEditingNode(null); // Clear editing node
    setIsEditDialogOpen(false);
  };
  
  const requestDeleteNode = (nodeId: string) => {
    if (!mindmap) return;
    const node = mindmap.data.nodes[nodeId];
    if (node) {
      setNodeToDelete({ id: nodeId, title: node.title });
      setIsDeleteDialogOpen(true);
    }
  };

  const confirmDeleteNode = () => {
    if (!mindmap || !nodeToDelete) return;
    deleteNodeFromHook(mindmap.id, nodeToDelete.id);
    toast({ title: "Node Deleted", description: `Node "${nodeToDelete.title || 'Untitled'}" and its children removed.`, variant: "destructive" });
    setIsDeleteDialogOpen(false);
    setNodeToDelete(null);
  };

 const handleDragStart = useCallback((event: React.DragEvent<HTMLDivElement>, nodeId: string) => {
    setDraggedNodeId(nodeId);
    const nodeElement = document.getElementById(`node-${nodeId}`);

    if (nodeElement && canvasContentRef.current) {
        const canvasRect = canvasContentRef.current.getBoundingClientRect(); // This rect is ALREADY scaled and panned
        const clientX = event.clientX;
        const clientY = event.clientY;
        
        // The node's visual top-left on the screen
        const nodeRect = nodeElement.getBoundingClientRect();
        
        setDragOffset({
            x: (clientX - nodeRect.left) / scale, // Offset relative to node's visual top-left, scaled back
            y: (clientY - nodeRect.top) / scale,
        });
    }
    event.dataTransfer.effectAllowed = "move";
    // It's good practice to set some data, even if not strictly used by this component
    event.dataTransfer.setData("text/plain", nodeId); 
    // Optionally, set a custom drag image (though default is usually fine)
    // const dragImage = new Image();
    // dragImage.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"; // Transparent pixel
    // event.dataTransfer.setDragImage(dragImage, 0, 0);
}, [scale]); // pan is not needed here as getBoundingClientRect accounts for it


const handleDragEnter = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
},[]);

const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault(); // Necessary to allow dropping
    event.dataTransfer.dropEffect = "move"; // Visual feedback to the user
}, []);

const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!draggedNodeId || !mindmap || !canvasContentRef.current || !canvasContainerRef.current) return;
    
    // canvasContentRef.current is the direct parent div that is scaled and panned.
    // Its getBoundingClientRect() gives its position and size on the screen.
    const contentRect = canvasContentRef.current.getBoundingClientRect();

    // Mouse position relative to the viewport
    const mouseXInViewport = event.clientX;
    const mouseYInViewport = event.clientY;

    // Mouse position relative to the scaled and panned content div's origin (top-left)
    const mouseXInContent = mouseXInViewport - contentRect.left;
    const mouseYInContent = mouseYInViewport - contentRect.top;
    
    // Convert mouse position in content to logical canvas coordinates (unscaled)
    const logicalX = mouseXInContent / scale;
    const logicalY = mouseYInContent / scale;

    let newX = logicalX - dragOffset.x;
    let newY = logicalY - dragOffset.y;
    
    updateNodePosition(mindmap.id, draggedNodeId, newX, newY);
    setDraggedNodeId(null);
}, [draggedNodeId, mindmap, scale, dragOffset, updateNodePosition]); // Removed pan from here


  const handleExportJson = () => {
    if (!mindmap) return;
    const jsonString = JSON.stringify(mindmap, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${mindmap.name.replace(/\s+/g, '_')}_export.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: "Export Successful", description: "Mindmap exported as JSON." });
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
    
    newScale = Math.max(0.2, Math.min(newScale, 3)); 
    if (newScale === oldScale) return;

    let newPanX = pan.x;
    let newPanY = pan.y;

    // If a pointer is provided (e.g., mouse cursor), zoom towards that point.
    // Otherwise, zoom towards the center of the viewport.
    if (pointer && canvasContainerRef.current) {
        const scrollAreaViewportEl = canvasContainerRef.current.querySelector('div[data-radix-scroll-area-viewport]') || canvasContainerRef.current;
        // pointer.x and pointer.y are mouse coordinates relative to the scrollAreaViewportEl
        const mouseXInViewport = pointer.x; 
        const mouseYInViewport = pointer.y;
        
        // Point on the logical canvas under the mouse
        const mouseOnContentX = (mouseXInViewport - pan.x) / oldScale;
        const mouseOnContentY = (mouseYInViewport - pan.y) / oldScale;
        
        // New pan to keep the point under the mouse stationary
        newPanX = mouseXInViewport - mouseOnContentX * newScale;
        newPanY = mouseYInViewport - mouseOnContentY * newScale;

    } else { 
        // Zoom to center of viewport if no pointer
        if (canvasContainerRef.current) {
            const scrollAreaViewportEl = canvasContainerRef.current.querySelector('div[data-radix-scroll-area-viewport]') || canvasContainerRef.current;
            const viewportCenterX = scrollAreaViewportEl.clientWidth / 2;
            const viewportCenterY = scrollAreaViewportEl.clientHeight / 2;
            
            // Logical center of the viewport on the unscaled canvas
            const logicalCenterX = (viewportCenterX - pan.x) / oldScale;
            const logicalCenterY = (viewportCenterY - pan.y) / oldScale;

            // New pan to keep this logical center at the viewport center
            newPanX = viewportCenterX - logicalCenterX * newScale;
            newPanY = viewportCenterY - logicalCenterY * newScale;
        }
    }
    
    setScale(newScale);
    setPan({ x: newPanX, y: newPanY });
  }, [scale, pan]); // Dependencies: scale and pan

  const handleWheelZoom = useCallback((event: WheelEvent) => {
    event.preventDefault(); // Prevent page scroll
    const scrollAreaViewportEl = event.currentTarget as HTMLDivElement; // The element the listener is attached to
    if (!scrollAreaViewportEl) return;

    // Mouse position relative to the scrollAreaViewportEl's top-left corner
    const viewportRect = scrollAreaViewportEl.getBoundingClientRect();
    const mouseXInViewport = event.clientX - viewportRect.left;
    const mouseYInViewport = event.clientY - viewportRect.top;

    handleZoom(event.deltaY < 0, undefined, { x: mouseXInViewport, y: mouseYInViewport });
  }, [handleZoom]); // Dependency: handleZoom
  
  const handlePanMouseDown = useCallback((event: MouseEvent) => {
    // Prevent panning if clicking on a node card or its interactive elements
    const target = event.target as HTMLElement;
    if (target.closest('.node-card-draggable') || target.closest('button') || target.closest('input') || target.closest('textarea')) {
      return; 
    }

    // Ensure panning only starts if the mousedown is directly on the scroll area viewport 
    // or the canvasContentRef (if it's not obscured by nodes)
    if (event.currentTarget && (target === event.currentTarget || (canvasContentRef.current && target === canvasContentRef.current)) ) {
      setIsPanning(true);
      panStartRef.current = {
        x: event.clientX - pan.x, // Store initial mouse position relative to current pan
        y: event.clientY - pan.y,
      };
      (event.currentTarget as HTMLElement).style.cursor = 'grabbing';
    }
  }, [pan]); // Dependency: pan

  const handlePanMouseMove = useCallback((event: MouseEvent) => {
    if (!isPanning || !panStartRef.current) return;
    // Calculate new pan based on mouse movement from the start point
    setPan({
      x: event.clientX - panStartRef.current.x,
      y: event.clientY - panStartRef.current.y,
    });
  }, [isPanning]); // Dependency: isPanning (panStartRef.current doesn't need to be a dep)

  const handlePanMouseUpOrLeave = useCallback((event: MouseEvent) => {
    if (isPanning) {
        setIsPanning(false);
        panStartRef.current = null;
        // Reset cursor on the viewport element
        if (canvasContainerRef.current) {
            const scrollAreaViewportEl = canvasContainerRef.current.querySelector('div[data-radix-scroll-area-viewport]');
            if (scrollAreaViewportEl) {
                (scrollAreaViewportEl as HTMLElement).style.cursor = 'grab';
            }
        }
    }
  }, [isPanning]); // Dependency: isPanning
  
  const handleResetZoomPan = useCallback(() => {
    setScale(1);
    setInitialViewCentered(false); // This will trigger the centering useEffect
  }, []); // No dependencies needed if it only sets state

  useEffect(() => {
    const scrollAreaViewportEl = canvasContainerRef.current?.querySelector('div[data-radix-scroll-area-viewport]');
    if (scrollAreaViewportEl) {
      const currentViewport = scrollAreaViewportEl as HTMLDivElement;

      // Add event listeners
      currentViewport.addEventListener('wheel', handleWheelZoom, { passive: false });
      currentViewport.addEventListener('mousedown', handlePanMouseDown);
      window.addEventListener('mousemove', handlePanMouseMove); // Listen on window for mousemove
      window.addEventListener('mouseup', handlePanMouseUpOrLeave);   // Listen on window for mouseup
      currentViewport.style.cursor = 'grab'; // Initial cursor style

      // Cleanup function
      return () => {
        currentViewport.removeEventListener('wheel', handleWheelZoom);
        currentViewport.removeEventListener('mousedown', handlePanMouseDown);
        window.removeEventListener('mousemove', handlePanMouseMove);
        window.removeEventListener('mouseup', handlePanMouseUpOrLeave);
        // Reset cursor if needed, though it might be handled by component unmount
        // currentViewport.style.cursor = 'default'; 
      };
    }
  }, [handleWheelZoom, handlePanMouseDown, handlePanMouseMove, handlePanMouseUpOrLeave]); // Add all handlers as dependencies


  if (!mindmap) {
    return (
      <div className="flex flex-col h-full flex-grow items-center justify-center space-y-4 text-center py-10">
        <AlertTriangle className="w-16 h-16 text-destructive" />
        <h2 className="text-2xl font-bold">Mindmap Not Found</h2>
        <p className="text-muted-foreground">This mindmap may have been deleted or the ID is incorrect.</p>
        <Button asChild variant="outline">
          <Link href="/">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Library
          </Link>
        </Button>
      </div>
    );
  }

  const allNodes = Object.values(mindmap.data.nodes);

  return (
    <div className="flex flex-col h-full flex-grow space-y-1"> {/* Reduced space-y */}
      {/* Top Controls Section */}
      <div className="p-2 border-b rounded-t-lg bg-card shadow-sm space-y-1 flex-shrink-0"> {/* Reduced p, space-y */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1"> {/* Reduced gap */}
          <div>
            <h2 className="text-lg font-semibold truncate" title={mindmap.name}>{mindmap.name}</h2> {/* Reduced font size */}
            <Button asChild variant="outline" size="sm" className="mt-1">
              <Link href="/">
                <span className="flex items-center"> {/* Wrap Link children in a single element */}
                  <ArrowLeft className="mr-2 h-4 w-4" /> Library
                </span>
              </Link>
            </Button>
          </div>
          <div className="flex gap-1"> {/* Reduced gap */}
            <Button onClick={handleExportJson} variant="outline" size="sm">
              <Download className="mr-2 h-4 w-4" /> Export
            </Button>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-medium mb-0.5">Add New Root Idea</h3> {/* Reduced font size and mb */}
          <div className="grid sm:grid-cols-2 gap-1"> {/* Reduced gap */}
            <Input
              placeholder="Title for root idea"
              value={newRootNodeTitle}
              onChange={(e) => setNewRootNodeTitle(e.target.value)}
              className="h-8 text-xs" /* Reduced height, text-xs */
            />
            <Textarea
              placeholder="Optional description..."
              value={newRootNodeDescription}
              onChange={(e) => setNewRootNodeDescription(e.target.value)}
              rows={1}
              className="min-h-[32px] resize-none text-xs" /* Reduced height, text-xs */
            />
          </div>
          <Button onClick={handleAddRootNode} disabled={!newRootNodeTitle.trim()} className="mt-1" size="sm"> {/* Reduced mt */}
            <PlusCircle className="mr-2 h-4 w-4" /> Add Root
          </Button>
        </div>
      </div>

      {/* Main Canvas Area */}
      <ScrollArea 
        ref={canvasContainerRef}
        className="w-full whitespace-nowrap rounded-b-lg border bg-background shadow-inner flex-grow min-h-[calc(100vh-200px)] sm:min-h-[calc(100vh-180px)] relative overflow-hidden" // Adjusted min-height, removed padding
      >
        <div 
          ref={canvasContentRef}
          className="relative border-2 border-dashed border-border" // Added border for visual cue
          style={{ 
            width: CANVAS_CONTENT_WIDTH, 
            height: CANVAS_CONTENT_HEIGHT,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            transformOrigin: '0 0', // Important for scaling and panning relative to top-left
            // backgroundColor: 'hsl(var(--muted)/0.1)', // Optional: slight background tint for canvas
          }}
          onDragEnter={handleDragEnter} // Added handler
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
              className="node-card-draggable" // Class to identify draggable nodes vs canvas
            />
          ))}

          <svg 
            key={`lines-${allNodes.length}-${scale}-${pan.x}-${pan.y}`} // More robust key for re-rendering
            className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-visible"
            // No z-index needed if it's a direct child and nodes are positioned
          >
            {allNodes.map(node => {
              if (!node.parentId) return null; 

              const parentNode = mindmap.data.nodes[node.parentId];
              if (!parentNode) return null; 

              // Start point: center-bottom of parent's header-ish area
              const startX = parentNode.x + NODE_CARD_WIDTH / 2;
              const startY = parentNode.y + NODE_HEADER_HEIGHT; // Connect from bottom of header

              // End point: center-top of child node
              const endX = node.x + NODE_CARD_WIDTH / 2;
              const endY = node.y; // Connect to top of child

              const strokeColor = parentNode.parentId === null ? "hsl(var(--primary))" : "hsl(var(--accent))";
              
              // S-curve control points calculation
              // Adjust sCurveOffset based on vertical distance to prevent overly tight curves
              const sCurveOffset = Math.max(20, Math.min(80, Math.abs(endY - startY) / 2));
              const pathData = `M ${startX} ${startY} C ${startX} ${startY + sCurveOffset}, ${endX} ${endY - sCurveOffset}, ${endX} ${endY}`;


              return (
                <path
                  key={`${parentNode.id}-${node.id}`}
                  d={pathData}
                  stroke={strokeColor}
                  strokeWidth={2 / scale} // Make lines appear thicker when zoomed out
                  fill="none"
                />
              );
            })}
          </svg>

          {allNodes.length === 0 && !draggedNodeId && ( 
            <div 
              className="absolute inset-0 flex items-center justify-center pointer-events-none" 
              style={{ 
                // Adjust position to be relative to the viewport, not the scaled canvas
                transform: `translate(${-pan.x / scale}px, ${-pan.y / scale}px)`, 
                width: `${100 / scale}%`, // Cover the scaled viewport
                height: `${100 / scale}%`,
               }}
            >
              <div className="text-muted-foreground text-center py-10 text-lg bg-background/80 p-6 rounded-md">
                This mindmap is empty. Add a root idea to begin!
              </div>
            </div>
          )}
        </div>
        <ScrollBar orientation="horizontal" />
        <ScrollBar orientation="vertical" />
      </ScrollArea>
      
      <div className="fixed bottom-4 right-4 z-20 flex flex-col gap-2">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button onClick={() => handleZoom(true)} size="icon" variant="outline" aria-label="Zoom In" className="bg-background/80 hover:bg-muted">
              <ZoomIn />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Zoom In</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button onClick={() => handleZoom(false)} size="icon" variant="outline" aria-label="Zoom Out" className="bg-background/80 hover:bg-muted">
              <ZoomOut />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Zoom Out</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button onClick={handleResetZoomPan} size="icon" variant="outline" aria-label="Reset Zoom and Pan" className="bg-background/80 hover:bg-muted">
              <RefreshCcw />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Reset View</p>
          </TooltipContent>
        </Tooltip>
        </TooltipProvider>
      </div>


      {isEditDialogOpen && editingNode && (
        <EditNodeDialog
          isOpen={isEditDialogOpen}
          onOpenChange={(open) => {
            setIsEditDialogOpen(open);
            if (!open) setEditingNode(null); // Clear editing node if dialog is closed
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

