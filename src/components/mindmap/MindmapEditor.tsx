
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
const NODE_HEADER_HEIGHT = 50; // Approximate height of the card's header, for connection points. Also used for Y connection point.

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

  const [lineRenderKey, setLineRenderKey] = useState(0); // To force re-render of lines

  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number } | null>(null);
  const [initialViewCentered, setInitialViewCentered] = useState(false);


  useEffect(() => {
    if (mindmap) {
      setLineRenderKey(prev => prev + 1);
    }
  }, [mindmap?.data.nodes, scale, pan]);

  // Effect to center the view when the mindmap loads
  useEffect(() => {
    if (mindmap && canvasContainerRef.current && !initialViewCentered && Object.keys(mindmap.data.nodes).length > 0) {
      const scrollAreaViewportEl = canvasContainerRef.current.querySelector('div[data-radix-scroll-area-viewport]') || canvasContainerRef.current;
      if (scrollAreaViewportEl) {
        const viewportWidth = scrollAreaViewportEl.clientWidth;
        const viewportHeight = scrollAreaViewportEl.clientHeight;

        let targetContentX = NODE_CARD_WIDTH / 2; // Default to center of a node at (0,0)
        let targetContentY = NODE_HEADER_HEIGHT;   // Default to center of a node at (0,0)

        // If there are root nodes, target the first one's center
        const firstRootId = mindmap.data.rootNodeIds[0];
        if (firstRootId && mindmap.data.nodes[firstRootId]) {
          const firstRootNode = mindmap.data.nodes[firstRootId];
          targetContentX = firstRootNode.x + NODE_CARD_WIDTH / 2;
          targetContentY = firstRootNode.y + NODE_HEADER_HEIGHT / 2; // More accurate center
        }
        
        // Calculate pan to bring targetContentX,Y (at current scale) to viewport center
        // pan.x + targetContentX * currentScale = viewportCenterX
        // pan.y + targetContentY * currentScale = viewportCenterY
        const newPanX = (viewportWidth / 2) - (targetContentX * scale);
        const newPanY = (viewportHeight / 2) - (targetContentY * scale);
        
        setPan({ x: newPanX, y: newPanY });
        setInitialViewCentered(true);
      }
    }
  }, [mindmap, scale, initialViewCentered, mindmapId]); // mindmapId in deps to re-trigger if switching maps

  // Reset initialViewCentered when mindmapId changes, so centering can happen for new map
  useEffect(() => {
    setInitialViewCentered(false);
    // Also reset scale and pan for a fresh view of the new mindmap
    // setScale(1); 
    // setPan({x:0, y:0}); // Decided against auto-resetting pan/scale on map switch, as user might want to keep their view. Centering will still apply.
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
      // If this is the first node, recenter view
      if (Object.keys(mindmap.data.nodes).length === 0) { // Check if it *was* empty before adding
        setInitialViewCentered(false); // Trigger recentering
      }
    }
  };

  const handleAddChildNode = (parentId: string) => {
    if (!mindmap) return;
    const parentNode = mindmap.data.nodes[parentId];
    if (!parentNode) return;

    const tempNewNode: NodeData = {
      id: `temp-${uuidv4()}`,
      title: `Child of ${parentNode.title}`,
      description: "",
      emoji: "",
      parentId: parentId,
      childIds: [],
      // Placeholder positions, actual positions determined by addNode hook or user drag
      x: parentNode.x + NODE_CARD_WIDTH + 50, // Default to the right of parent
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

    if (nodeElement && canvasContentRef.current) {
        const nodeRect = nodeElement.getBoundingClientRect();
        const canvasRect = canvasContentRef.current.getBoundingClientRect(); // This rect is already scaled and panned on screen

        // Calculate mouse position relative to the un-transformed top-left of the node.
        // event.clientX/Y is mouse position on screen.
        // nodeRect.left/top is node's top-left position on screen.
        setDragOffset({
            x: (event.clientX - nodeRect.left) / scale, // Scale the offset back
            y: (event.clientY - nodeRect.top) / scale,
        });
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", nodeId);
};


const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault(); // Necessary to allow dropping
    event.dataTransfer.dropEffect = "move";
};

const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!draggedNodeId || !mindmap || !canvasContentRef.current) return;

    const canvasRect = canvasContentRef.current.getBoundingClientRect();

    // Mouse position relative to the panned and scaled canvas's on-screen top-left
    const mouseXOnScreenCanvas = event.clientX - canvasRect.left;
    const mouseYOnScreenCanvas = event.clientY - canvasRect.top;
    
    // Convert to logical canvas coordinates (unscaled, unpanned)
    const logicalX = mouseXOnScreenCanvas / scale;
    const logicalY = mouseYOnScreenCanvas / scale;

    // New top-left for the node based on where the mouse is, minus the drag offset
    let newX = logicalX - dragOffset.x;
    let newY = logicalY - dragOffset.y;

    // No longer restrict to positive coordinates
    // newX = Math.max(0, newX);
    // newY = Math.max(0, newY);
    
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

  const handleZoom = (zoomIn: boolean, customScale?: number, pointer?: {x: number, y: number}) => {
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
        // pointer.x/y are coords relative to the VISIBLE PART of the SCROLL VIEWPORT
        const scrollAreaViewportEl = canvasContainerRef.current.querySelector('div[data-radix-scroll-area-viewport]') || canvasContainerRef.current;
        
        // The logical point on the content that the pointer is over
        // (pointer.x - pan.x) / oldScale gives the logical X before current pan & scale
        // Corrected: pointer.x is already relative to viewport.
        // Mouse position on the full pannable/scalable content:
        const mouseOnContentX = (pointer.x - pan.x) / oldScale;
        const mouseOnContentY = (pointer.y - pan.y) / oldScale;
        
        // We want this logical point (mouseOnContentX, mouseOnContentY) to remain under the pointer (pointer.x, pointer.y) after scaling.
        // newPan.x + mouseOnContentX * newScale = pointer.x
        // newPan.y + mouseOnContentY * newScale = pointer.y
        newPanX = pointer.x - mouseOnContentX * newScale;
        newPanY = pointer.y - mouseOnContentY * newScale;

    } else { 
        if (canvasContainerRef.current) {
            const scrollAreaViewportEl = canvasContainerRef.current.querySelector('div[data-radix-scroll-area-viewport]') || canvasContainerRef.current;
            const viewportCenterX = scrollAreaViewportEl.clientWidth / 2;
            const viewportCenterY = scrollAreaViewportEl.clientHeight / 2;
            
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
    const scrollAreaViewportEl = event.currentTarget as HTMLDivElement; // The viewport itself
    const viewportRect = scrollAreaViewportEl.getBoundingClientRect();
    
    const mouseXInViewport = event.clientX - viewportRect.left;
    const mouseYInViewport = event.clientY - viewportRect.top;

    handleZoom(event.deltaY < 0, undefined, { x: mouseXInViewport, y: mouseYInViewport });
  };
  
  const handlePanMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget || (canvasContentRef.current && event.target === canvasContentRef.current) ) {
      setIsPanning(true);
      panStartRef.current = {
        x: event.clientX - pan.x,
        y: event.clientY - pan.y,
      };
      (event.currentTarget as HTMLElement).style.cursor = 'grabbing';
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
        const scrollAreaViewportEl = canvasContainerRef.current?.querySelector('div[data-radix-scroll-area-viewport]');
        if (scrollAreaViewportEl) {
            (scrollAreaViewportEl as HTMLElement).style.cursor = 'grab';
        }
    }
  };
  
  const handleResetZoomPan = () => {
    setScale(1);
    // setPan({ x: 0, y: 0 }); // This would reset to top-left
    setInitialViewCentered(false); // Trigger recentering logic
  };

  useEffect(() => {
    const scrollAreaViewportEl = canvasContainerRef.current?.querySelector('div[data-radix-scroll-area-viewport]');
    if (scrollAreaViewportEl) {
      const currentViewport = scrollAreaViewportEl as HTMLDivElement; // To satisfy addEventListener/removeEventListener types

      currentViewport.addEventListener('wheel', handleWheelZoom as any, { passive: false });
      currentViewport.addEventListener('mousedown', handlePanMouseDown as any);
      
      // Attach move and up to window to allow dragging outside and releasing
      window.addEventListener('mousemove', handlePanMouseMove as any);
      window.addEventListener('mouseup', handlePanMouseUpOrLeave as any);
      
      currentViewport.style.cursor = 'grab';

      return () => {
        currentViewport.removeEventListener('wheel', handleWheelZoom as any);
        currentViewport.removeEventListener('mousedown', handlePanMouseDown as any);
        window.removeEventListener('mousemove', handlePanMouseMove as any);
        window.removeEventListener('mouseup', handlePanMouseUpOrLeave as any);
      };
    }
  }, [isPanning, pan, scale, handleZoom]); // Re-attach if these handlers change (they shouldn't often, but good practice)


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
      <div className="p-4 border rounded-lg bg-card shadow-md space-y-4 flex-shrink-0">
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
        className="w-full whitespace-nowrap rounded-lg border bg-background shadow-inner flex-grow min-h-[300px] sm:min-h-[400px] relative overflow-hidden" 
      >
        <div 
          ref={canvasContentRef}
          className="relative p-4" // Removed min-w-max, min-h-full. Let content define size
          style={{ 
            width: '400vw', height: '400vh', // Keep large logical canvas for node placement
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            transformOrigin: '0 0', 
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

          <svg key={lineRenderKey} className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-visible">
            {allNodes.map(node => {
              if (!node.parentId) return null;

              const parentNode = mindmap.data.nodes[node.parentId];
              if (!parentNode) return null;

              const startX = parentNode.x + NODE_CARD_WIDTH / 2;
              const startY = parentNode.y + NODE_HEADER_HEIGHT; // Connect from bottom of parent header

              const endX = node.x + NODE_CARD_WIDTH / 2;
              const endY = node.y; // Connect to top of child

              const strokeColor = parentNode.parentId === null ? "hsl(var(--primary))" : "hsl(var(--accent))";
              const sCurveOffset = Math.max(20, Math.min(80, Math.abs(endY - startY) / 2));


              const pathData = `M ${startX} ${startY} C ${startX} ${startY + sCurveOffset}, ${endX} ${endY - sCurveOffset}, ${endX} ${endY}`;

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
              // Style to make this message appear in the center of the *viewport* regardless of pan/scale
              style={{ 
                transform: `translate(${-pan.x}px, ${-pan.y}px) scale(${1/scale})`,
                width: '100%', // Ensure it uses viewport width for centering
                height: '100%', // Ensure it uses viewport height for centering
               }}
            >
              <div 
                className="text-muted-foreground text-center py-10 text-lg bg-background/80 p-6 rounded-md"
                style={{transform: `translate(${(pan.x)*(1/scale-1)}px, ${(pan.y)*(1/scale-1)}px)`}} // Counteract parent's pan slightly
              >
                This mindmap is empty. Add a root idea to begin!
              </div>
            </div>
          )}
        </div>
        <ScrollBar orientation="horizontal" />
        <ScrollBar orientation="vertical" />
      </ScrollArea>
      
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
