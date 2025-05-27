
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

interface MindmapEditorProps {
  mindmapId: string;
}

const NODE_CARD_WIDTH = 300;
const NODE_HEADER_HEIGHT = 50; // Approximate height of the card's header, for connection points.

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
  const canvasContainerRef = useRef<HTMLDivElement>(null); // For the scrollable viewport
  const canvasContentRef = useRef<HTMLDivElement>(null); // For the transformed content
  
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const [lineRenderKey, setLineRenderKey] = useState(0);

  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number } | null>(null);


  useEffect(() => {
    if (mindmap) {
      setLineRenderKey(prev => prev + 1);
    }
  }, [mindmap?.data.nodes, scale, pan]); // Re-render lines on scale/pan too

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
    }
  };

  const handleAddChildNode = (parentId: string) => {
    if (!mindmap) return;
    const parentNode = mindmap.data.nodes[parentId];
    if (!parentNode) return;

    // Create a temporary node object for the dialog
    // Actual node creation happens in handleSaveNode if confirmed
    const tempNewNode: NodeData = {
      id: `temp-${uuidv4()}`, // Temporary ID
      title: `Child of ${parentNode.title}`,
      description: "",
      emoji: "",
      parentId: parentId,
      childIds: [],
      x: parentNode.x + 50, // Initial placeholder, will be refined
      y: parentNode.y + NODE_HEADER_HEIGHT + 50,
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

    if (editingNode.id.startsWith('temp-')) { // This is a new node being created
      const permanentNode = addNode(mindmap.id, editingNode.parentId, data);
      if (permanentNode) {
        toast({ title: "Node Created", description: `Node "${permanentNode.title}" added.` });
      }
    } else { // This is an existing node being updated
      updateNode(mindmap.id, nodeId, data);
      toast({ title: "Node Updated", description: `Node "${data.title}" saved.` });
    }
    setEditingNode(null);
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

  const handleDragStart = (event: React.DragEvent<HTMLDivElement>, nodeId: string) => {
    setDraggedNodeId(nodeId);
    const nodeElement = document.getElementById(`node-${nodeId}`);

    if (nodeElement) {
      const nodeRect = nodeElement.getBoundingClientRect();
      // dragOffset is the mouse position relative to the node's top-left corner, in screen pixels
      setDragOffset({
        x: event.clientX - nodeRect.left,
        y: event.clientY - nodeRect.top,
      });
    }
    event.dataTransfer.effectAllowed = "move";
    // It's good practice to set some data, even if not strictly used by this component
    event.dataTransfer.setData("text/plain", nodeId);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!draggedNodeId || !mindmap || !canvasContainerRef.current) return;

    const scrollAreaViewportEl = canvasContainerRef.current.querySelector('div[data-radix-scroll-area-viewport]') || canvasContainerRef.current;
    const viewportRect = scrollAreaViewportEl.getBoundingClientRect();
    
    const scrollLeft = scrollAreaViewportEl.scrollLeft || 0;
    const scrollTop = scrollAreaViewportEl.scrollTop || 0;

    // Mouse position relative to the scroll area's viewport content (potentially scrolled)
    const mouseXOnScrolledCanvas = (event.clientX - viewportRect.left) + scrollLeft;
    const mouseYOnScrolledCanvas = (event.clientY - viewportRect.top) + scrollTop;

    // Convert to logical canvas coordinates (accounting for pan and scale)
    const targetCanvasX = (mouseXOnScrolledCanvas - pan.x) / scale;
    const targetCanvasY = (mouseYOnScrolledCanvas - pan.y) / scale;

    // Apply the scaled drag offset
    // dragOffset is in screen pixels, so divide by scale to apply to logical coordinates
    let newX = targetCanvasX - (dragOffset.x / scale);
    let newY = targetCanvasY - (dragOffset.y / scale);
    
    // Ensure nodes don't get placed at negative coordinates (optional, adjust as needed)
    newX = Math.max(0, newX);
    newY = Math.max(0, newY);

    updateNodePosition(mindmap.id, draggedNodeId, newX, newY);
    setDraggedNodeId(null);
  };

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

  // Zoom and Pan Handlers
  const handleZoom = (zoomIn: boolean, customScale?: number, pointer?: {x: number, y: number}) => {
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
        const scrollAreaViewportEl = canvasContainerRef.current.querySelector('div[data-radix-scroll-area-viewport]') || canvasContainerRef.current;
        
        const scrollLeft = scrollAreaViewportEl.scrollLeft || 0;
        const scrollTop = scrollAreaViewportEl.scrollTop || 0;
        
        // Pointer coords relative to the full scrollable content area
        const pointerXOnFullCanvas = pointer.x + scrollLeft;
        const pointerYOnFullCanvas = pointer.y + scrollTop;

        const logicalPointX = (pointerXOnFullCanvas - pan.x) / oldScale;
        const logicalPointY = (pointerYOnFullCanvas - pan.y) / oldScale;

        newPanX = pointerXOnFullCanvas - logicalPointX * newScale;
        newPanY = pointerYOnFullCanvas - logicalPointY * newScale;
    } else { // Zoom to center if no pointer (e.g. button click)
        if (canvasContainerRef.current) {
            const scrollAreaViewportEl = canvasContainerRef.current.querySelector('div[data-radix-scroll-area-viewport]') || canvasContainerRef.current;
            const viewportCenterX = (scrollAreaViewportEl.clientWidth / 2) + scrollAreaViewportEl.scrollLeft;
            const viewportCenterY = (scrollAreaViewportEl.clientHeight / 2) + scrollAreaViewportEl.scrollTop;
            
            const logicalCenterX = (viewportCenterX - pan.x) / oldScale;
            const logicalCenterY = (viewportCenterY - pan.y) / oldScale;

            newPanX = viewportCenterX - logicalCenterX * newScale;
            newPanY = viewportCenterY - logicalCenterY * newScale;
        }
    }
    
    setScale(newScale);
    setPan({ x: newPanX, y: newPanY });
  };

  const handleWheelZoom = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const scrollAreaViewportEl = event.currentTarget as HTMLDivElement;
    const viewportRect = scrollAreaViewportEl.getBoundingClientRect();
    
    // Mouse position relative to the visible part of the scroll area viewport
    const mouseXInViewport = event.clientX - viewportRect.left;
    const mouseYInViewport = event.clientY - viewportRect.top;

    handleZoom(event.deltaY < 0, undefined, { x: mouseXInViewport, y: mouseYInViewport });
  };
  
  const handlePanMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    // Only pan if clicking directly on the canvas background
    if (event.target === canvasContentRef.current?.parentElement || event.target === canvasContentRef.current) {
      setIsPanning(true);
      panStartRef.current = {
        x: event.clientX - pan.x,
        y: event.clientY - pan.y,
      };
      (event.target as HTMLElement).style.cursor = 'grabbing';
    }
  };

  const handlePanMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isPanning || !panStartRef.current) return;
    setPan({
      x: event.clientX - panStartRef.current.x,
      y: event.clientY - panStartRef.current.y,
    });
  };

  const handlePanMouseUpOrLeave = (event: React.MouseEvent<HTMLDivElement>) => {
    if (isPanning) {
        setIsPanning(false);
        panStartRef.current = null;
        (event.target as HTMLElement).style.cursor = 'grab';
         if (event.target === canvasContentRef.current?.parentElement) {
            (event.target as HTMLElement).style.cursor = 'grab';
         } else if (canvasContentRef.current?.parentElement) {
            (canvasContentRef.current.parentElement as HTMLElement).style.cursor = 'grab';
         }
    }
  };
  
  const handleResetZoomPan = () => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  };

  useEffect(() => {
    const scrollAreaViewportEl = canvasContainerRef.current?.querySelector('div[data-radix-scroll-area-viewport]');
    if (scrollAreaViewportEl) {
      scrollAreaViewportEl.addEventListener('wheel', handleWheelZoom as any, { passive: false });
      scrollAreaViewportEl.addEventListener('mousedown', handlePanMouseDown as any);
      window.addEventListener('mousemove', handlePanMouseMove as any); // Listen on window for mousemove
      window.addEventListener('mouseup', handlePanMouseUpOrLeave as any); // Listen on window for mouseup
      
      // Set initial cursor style
      (scrollAreaViewportEl as HTMLElement).style.cursor = 'grab';

      return () => {
        scrollAreaViewportEl.removeEventListener('wheel', handleWheelZoom as any);
        scrollAreaViewportEl.removeEventListener('mousedown', handlePanMouseDown as any);
        window.removeEventListener('mousemove', handlePanMouseMove as any);
        window.removeEventListener('mouseup', handlePanMouseUpOrLeave as any);
      };
    }
  }, [isPanning, pan, scale, handleZoom]); // Add dependencies


  if (!mindmap) {
    return (
      <div className="text-center py-10 flex flex-col items-center gap-4">
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
    <div className="flex flex-col h-full flex-grow space-y-4">
      {/* Top Control Panel */}
      <div className="p-4 border rounded-lg bg-card shadow-md space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold truncate" title={mindmap.name}>{mindmap.name}</h2>
            <Button asChild variant="outline" size="sm" className="mt-2">
              <Link href="/">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Library
              </Link>
            </Button>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleExportJson} variant="outline">
              <Download className="mr-2 h-4 w-4" /> Export JSON
            </Button>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-3">Add New Root Idea</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <Input
              placeholder="Title for the new root idea"
              value={newRootNodeTitle}
              onChange={(e) => setNewRootNodeTitle(e.target.value)}
              className="h-10"
            />
            <Textarea
              placeholder="Optional description..."
              value={newRootNodeDescription}
              onChange={(e) => setNewRootNodeDescription(e.target.value)}
              rows={1}
              className="min-h-[40px] resize-none"
            />
          </div>
          <Button onClick={handleAddRootNode} disabled={!newRootNodeTitle.trim()} className="mt-3">
            <PlusCircle className="mr-2 h-4 w-4" /> Add Root Idea
          </Button>
        </div>
      </div>

      {/* Mindmap Canvas Area */}
      <ScrollArea 
        ref={canvasContainerRef}
        className="w-full whitespace-nowrap rounded-lg border bg-background shadow-inner flex-grow min-h-[calc(100vh-350px)] sm:min-h-[calc(100vh-300px)] relative overflow-hidden"
        
      >
        <div // This is the content that will be transformed
          ref={canvasContentRef}
          className="relative p-4 min-w-max min-h-full"
          style={{ 
            width: '400vw', height: '400vh', // Make canvas very large for panning
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            transformOrigin: '0 0', // Zoom from top-left for simplicity with pan
          }}
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
              onDragStart={handleDragStart}
            />
          ))}

          <svg key={lineRenderKey} className="absolute top-0 left-0 w-full h-full pointer-events-none">
            {allNodes.map(node => {
              if (!node.parentId) return null;

              const parentNode = mindmap.data.nodes[node.parentId];
              if (!parentNode) return null;

              const startX = parentNode.x + NODE_CARD_WIDTH / 2;
              const startY = parentNode.y + NODE_HEADER_HEIGHT;

              const endX = node.x + NODE_CARD_WIDTH / 2;
              const endY = node.y;

              const strokeColor = parentNode.parentId === null ? "hsl(var(--primary))" : "hsl(var(--accent))";
              const sCurveOffset = Math.max(20, Math.min(60, Math.abs(endY - startY) / 2.5));

              const cp1X = startX;
              const cp1Y = startY + sCurveOffset;
              const cp2X = endX;
              const cp2Y = endY - sCurveOffset;

              const pathData = `M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${endY}`;

              return (
                <path
                  key={`${parentNode.id}-${node.id}`}
                  d={pathData}
                  stroke={strokeColor}
                  strokeWidth={2 / scale} // Make stroke width scale inversely with zoom
                  fill="none"
                />
              );
            })}
          </svg>

          {allNodes.length === 0 && !draggedNodeId && ( // Hide if dragging to prevent flickering
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ transform: `scale(${1/scale}) translate(${-pan.x/scale}px, ${-pan.y/scale}px)`}}>
              <p className="text-muted-foreground text-center py-10 text-lg">
                This mindmap is empty. Add a root idea to begin!
              </p>
            </div>
          )}
        </div>
        <ScrollBar orientation="horizontal" />
        <ScrollBar orientation="vertical" />
      </ScrollArea>
      
      {/* Zoom Controls */}
      <div className="fixed bottom-4 right-4 z-20 flex flex-col gap-2">
        <Button onClick={() => handleZoom(true)} size="icon" aria-label="Zoom In">
          <ZoomIn />
        </Button>
        <Button onClick={() => handleZoom(false)} size="icon" aria-label="Zoom Out">
          <ZoomOut />
        </Button>
        <Button onClick={handleResetZoomPan} size="icon" aria-label="Reset Zoom and Pan">
          <RefreshCcw />
        </Button>
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
