
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
  }, [mindmap, scale]);

  useEffect(() => {
    if (mindmap && !initialViewCentered) {
      centerView();
    }
  }, [mindmap, initialViewCentered, centerView]);

  useEffect(() => {
    // Reset centering flag when mindmapId changes, to allow re-centering on new map
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

    // Create a temporary node object to pass to the dialog
    // It won't be added to the useMindmaps state until saved
    const tempNewNode: NodeData = {
      id: `temp-${uuidv4()}`, // Temporary ID
      title: '', // To be filled in dialog
      description: "",
      emoji: "➕",
      parentId: parentId,
      childIds: [], // Will be empty for a new node
      // Position relative to parent for initial dialog view, if needed, but actual position set on save
      x: parentNode.x + NODE_CARD_WIDTH + 50, // Default, might not be used directly if not saved
      y: parentNode.y,
    };

    setEditingNode(tempNewNode); // Pass temporary node to dialog
    setIsEditDialogOpen(true);
  }, [mindmap]);


  const handleEditNode = useCallback((node: NodeData) => {
    setEditingNode(node);
    setIsEditDialogOpen(true);
  }, []);

  const handleSaveNode = useCallback((nodeId: string, data: EditNodeInput) => {
    if (!mindmap || !editingNode) return; // editingNode should hold the node being edited or created

    if (editingNode.id.startsWith('temp-')) { // Check if it's a new node (using our temporary ID prefix)
      // This is a new node, so call addNode from useMindmaps
      const permanentNode = addNode(mindmap.id, editingNode.parentId, data); // Pass parentId from temporary node
      if (permanentNode) {
        toast({ title: "Node Created", description: `Node "${permanentNode.title}" added.` });
      }
    } else {
      // This is an existing node, so call updateNode
      updateNode(mindmap.id, nodeId, data);
      toast({ title: "Node Updated", description: `Node "${data.title}" saved.` });
    }
    setEditingNode(null); // Clear editingNode
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
        
        // const contentRect = canvasContentRef.current.getBoundingClientRect(); // Not needed for offset calc like this
        const nodeRect = nodeElement.getBoundingClientRect();

        // Mouse position relative to the viewport
        const mouseXInViewport = clientX;
        const mouseYInViewport = clientY;
        
        // Node's top-left corner relative to the viewport
        const nodeLeftInViewport = nodeRect.left;
        const nodeTopInViewport = nodeRect.top;

        setDragOffset({
            x: (mouseXInViewport - nodeLeftInViewport) / scale, // Scale the offset
            y: (mouseYInViewport - nodeTopInViewport) / scale,  // Scale the offset
        });
    }
    event.dataTransfer.effectAllowed = "move";
    // Set some dummy data to enable dragging in Firefox
    event.dataTransfer.setData("text/plain", nodeId); 
  }, [scale]);


  const handleDragEnter = useCallback((event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
  },[]);

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move"; // Necessary to allow dropping
  }, []);

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (!draggedNodeId || !mindmap || !canvasContentRef.current || !canvasContainerRef.current) return;

      const scrollAreaViewportEl = canvasContainerRef.current.querySelector('div[data-radix-scroll-area-viewport]') || canvasContainerRef.current;
      const viewportRect = scrollAreaViewportEl.getBoundingClientRect();
      
      // Mouse position relative to the viewport
      const mouseXInViewport = event.clientX;
      const mouseYInViewport = event.clientY;

      // Calculate mouse position relative to the scrollable viewport's content area (top-left)
      // This accounts for the browser window's own scroll, if any, affecting viewportRect.left/top
      const mouseXInScrollArea = mouseXInViewport - viewportRect.left;
      const mouseYInScrollArea = mouseYInViewport - viewportRect.top;
      
      // Convert mouse position in scroll area to logical canvas coordinates
      // Must account for current pan and scale
      const logicalX = (mouseXInScrollArea - pan.x) / scale;
      const logicalY = (mouseYInScrollArea - pan.y) / scale;
      
      let newX = logicalX - dragOffset.x;
      let newY = logicalY - dragOffset.y;

      // No Math.max(0, ...) to allow negative coordinates
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

    newScale = Math.max(0.2, Math.min(newScale, 3));
    if (newScale === oldScale) return;

    let newPanX = pan.x;
    let newPanY = pan.y;

    if (pointer && canvasContainerRef.current) {
        const scrollAreaViewportEl = canvasContainerRef.current.querySelector('div[data-radix-scroll-area-viewport]') || canvasContainerRef.current;
        const viewportRect = scrollAreaViewportEl.getBoundingClientRect();
        
        // Mouse X/Y relative to scroll area viewport's top-left corner
        const mouseXInContentDiv = pointer.x - viewportRect.left; 
        const mouseYInContentDiv = pointer.y - viewportRect.top; 

        // Logical position of the mouse pointer on the unscaled, unpanned canvas content
        const mouseOnContentX = (mouseXInContentDiv - pan.x) / oldScale;
        const mouseOnContentY = (mouseYInContentDiv - pan.y) / oldScale;
        
        // Calculate new pan to keep mouseOnContentX/Y at the same screen position (mouseXInContentDiv/Y)
        newPanX = mouseXInContentDiv - mouseOnContentX * newScale;
        newPanY = mouseYInContentDiv - mouseOnContentY * newScale;

    } else { // Zoom to center of viewport if no pointer
        if (canvasContainerRef.current) {
            const scrollAreaViewportEl = canvasContainerRef.current.querySelector('div[data-radix-scroll-area-viewport]') || canvasContainerRef.current;
            const viewportCenterX = scrollAreaViewportEl.clientWidth / 2;
            const viewportCenterY = scrollAreaViewportEl.clientHeight / 2;
            
            // Logical center of the viewport on the unscaled, unpanned canvas content
            const logicalCenterX = (viewportCenterX - pan.x) / oldScale;
            const logicalCenterY = (viewportCenterY - pan.y) / oldScale;
            
            // Calculate new pan to keep logicalCenterX/Y at the same screen position (viewportCenterX/Y)
            newPanX = viewportCenterX - logicalCenterX * newScale;
            newPanY = viewportCenterY - logicalCenterY * newScale;
        }
    }

    setScale(newScale);
    setPan({ x: newPanX, y: newPanY });
  }, [scale, pan]); // Keep scale and pan as dependencies

  const handleWheelZoom = useCallback((event: WheelEvent) => {
    event.preventDefault();
    const scrollAreaViewportEl = event.currentTarget as HTMLDivElement;
    if (!scrollAreaViewportEl) return;
    
    // Use event.clientX and event.clientY (viewport-relative) for the pointer
    handleZoom(event.deltaY < 0, undefined, { x: event.clientX, y: event.clientY });
  }, [handleZoom]); // handleZoom is now memoized

  const handlePanMouseDown = useCallback((event: MouseEvent) => {
    const target = event.target as HTMLElement;
    const scrollAreaViewportEl = canvasContainerRef.current?.querySelector('div[data-radix-scroll-area-viewport]');
    
    // Ensure not clicking on a node card or its interactive elements
    if (target.closest('.node-card-draggable') || target.closest('button') || target.closest('input') || target.closest('textarea') || target.closest('[role="dialog"]')) {
      return;
    }
    // Check if the mousedown is directly on the scroll area viewport or the canvas content background
    if (scrollAreaViewportEl && (target === scrollAreaViewportEl || (canvasContentRef.current && target === canvasContentRef.current)) ) {
      setIsPanning(true);
      panStartRef.current = {
        x: event.clientX - pan.x,
        y: event.clientY - pan.y,
      };
      (scrollAreaViewportEl as HTMLElement).style.cursor = 'grabbing';
    }
  }, [pan]); // pan is a dependency

  const handlePanMouseMove = useCallback((event: MouseEvent) => {
    if (!isPanning || !panStartRef.current) return;
    event.preventDefault(); // Prevent text selection during pan
    setPan({
      x: event.clientX - panStartRef.current.x,
      y: event.clientY - panStartRef.current.y,
    });
  }, [isPanning, pan]); // pan is not strictly needed here, but isPanning covers it

  const handlePanMouseUpOrLeave = useCallback((event: MouseEvent) => {
    if (isPanning) {
        setIsPanning(false);
        panStartRef.current = null;
        if (canvasContainerRef.current) {
            const scrollAreaViewportEl = canvasContainerRef.current.querySelector('div[data-radix-scroll-area-viewport]');
            if (scrollAreaViewportEl) {
                (scrollAreaViewportEl as HTMLElement).style.cursor = 'grab';
            }
        }
    }
  }, [isPanning]); // isPanning is the dependency

  const handleResetZoomPan = useCallback(() => {
    setScale(1);
    setInitialViewCentered(false); // This will trigger re-centering effect
  }, []); // No dependencies needed as it resets to fixed values

  useEffect(() => {
    const scrollAreaViewportEl = canvasContainerRef.current?.querySelector('div[data-radix-scroll-area-viewport]');
    if (scrollAreaViewportEl) {
      const currentViewport = scrollAreaViewportEl as HTMLDivElement;
      currentViewport.addEventListener('wheel', handleWheelZoom, { passive: false });
      currentViewport.addEventListener('mousedown', handlePanMouseDown);
      // Attach mousemove and mouseup to window to allow dragging outside the viewport
      window.addEventListener('mousemove', handlePanMouseMove);
      window.addEventListener('mouseup', handlePanMouseUpOrLeave);
      // Add mouseleave from window as well, in case mouse is released outside window
      window.addEventListener('mouseleave', handlePanMouseUpOrLeave); 
      currentViewport.style.cursor = 'grab'; // Initial cursor state
      
      return () => {
        currentViewport.removeEventListener('wheel', handleWheelZoom);
        currentViewport.removeEventListener('mousedown', handlePanMouseDown);
        window.removeEventListener('mousemove', handlePanMouseMove);
        window.removeEventListener('mouseup', handlePanMouseUpOrLeave);
        window.removeEventListener('mouseleave', handlePanMouseUpOrLeave);
      };
    }
  }, [handleWheelZoom, handlePanMouseDown, handlePanMouseMove, handlePanMouseUpOrLeave]); // Dependencies are the memoized handlers


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
    <div className="flex flex-col h-full flex-grow w-full space-y-1">
      {/* Top Control Section */}
      <div className="p-2 border-b bg-background/80 backdrop-blur-sm rounded-t-lg sticky top-0 z-10">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-1 mb-1">
          <h1 className="text-base sm:text-lg font-semibold text-foreground truncate" title={mindmap.name}>
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
        className="w-full whitespace-nowrap rounded-b-lg border bg-background shadow-inner flex-grow min-h-[calc(100vh-200px)] sm:min-h-[calc(100vh-180px)] relative overflow-hidden"
      >
        <div
          ref={canvasContentRef}
          className="relative border-2 border-dashed border-destructive"
          style={{
            width: CANVAS_CONTENT_WIDTH,
            height: CANVAS_CONTENT_HEIGHT,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            transformOrigin: '0 0',
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
              className="node-card-draggable" // Added for easier identification in pan logic
            />
          ))}

          <svg
            key={`lines-${allNodes.length}-${scale}-${pan.x}-${pan.y}`}
            className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-visible"
            // Style ensures SVG itself is behind nodes if needed, but paths are drawn "on top" of canvasContentRef's background
          >
            {allNodes.map(node => {
              if (!node.parentId) return null;

              const parentNode = mindmap.data.nodes[node.parentId];
              if (!parentNode) return null;

              const startX = parentNode.x + NODE_CARD_WIDTH / 2;
              const startY = parentNode.y + NODE_HEADER_HEIGHT;
              const endX = node.x + NODE_CARD_WIDTH / 2;
              const endY = node.y;

              const strokeColor = parentNode.parentId === null ? "hsl(var(--primary))" : "hsl(var(--accent))";
              
              const sCurveOffsetY = Math.max(20, Math.min(80, Math.abs(endY - startY) / 2));
              const pathData = `M ${startX} ${startY} C ${startX} ${startY + sCurveOffsetY}, ${endX} ${endY - sCurveOffsetY}, ${endX} ${endY}`;

              return (
                <path
                  key={`${parentNode.id}-${node.id}`}
                  d={pathData}
                  stroke={strokeColor}
                  strokeWidth={2 / scale} 
                  fill="none"
                />
              );
            })}
          </svg>

          {allNodes.length === 0 && !draggedNodeId && (
            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
              style={{
                // Center message within the visible part of the scaled canvas
                transform: `translate(${-pan.x / scale}px, ${-pan.y / scale}px)`,
                width: `${100 / scale}%`, 
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
                <span><ZoomIn /></span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Zoom In</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button onClick={() => handleZoom(false)} variant="outline" size="icon" className="shadow-lg bg-background/80 hover:bg-muted">
                <span><ZoomOut /></span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Zoom Out</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
               <Button onClick={handleResetZoomPan} variant="outline" size="icon" className="shadow-lg bg-background/80 hover:bg-muted">
                <span><RefreshCcw /></span>
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
  );
}

