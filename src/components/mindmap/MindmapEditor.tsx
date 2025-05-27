
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
const NODE_HEADER_HEIGHT = 50; // Approximate height of the card header for line connection

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

  const [lineRenderKey, setLineRenderKey] = useState(0);

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

  useEffect(() => {
    if (mindmap && canvasContainerRef.current && !initialViewCentered) {
      const scrollAreaViewportEl = canvasContainerRef.current.querySelector('div[data-radix-scroll-area-viewport]') || canvasContainerRef.current;
      if (scrollAreaViewportEl) {
        const viewportWidth = scrollAreaViewportEl.clientWidth;
        const viewportHeight = scrollAreaViewportEl.clientHeight;

        let targetContentX = 0;
        let targetContentY = 0;

        // Try to center on the first root node if available, otherwise center on logical (0,0)
        const firstRootId = mindmap.data.rootNodeIds[0];
        if (firstRootId && mindmap.data.nodes[firstRootId]) {
          const firstRootNode = mindmap.data.nodes[firstRootId];
          // Center based on the node's center, not its top-left
          targetContentX = firstRootNode.x + NODE_CARD_WIDTH / 2;
          targetContentY = firstRootNode.y + NODE_HEADER_HEIGHT / 2; // Approx. center for initial centering
        }
        
        const newPanX = (viewportWidth / 2) - (targetContentX * scale);
        const newPanY = (viewportHeight / 2) - (targetContentY * scale);
        
        setPan({ x: newPanX, y: newPanY });
        setInitialViewCentered(true);
      }
    }
  }, [mindmap, initialViewCentered, mindmapId]); // Removed scale from dependencies

  useEffect(() => {
    setInitialViewCentered(false); // Reset centering flag when mindmapId changes
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
      if (Object.keys(mindmap.data.nodes).length === 0 || (Object.keys(mindmap.data.nodes).length === 1 && mindmap.data.rootNodeIds.includes(newNode.id))) { 
        setInitialViewCentered(false); // Re-trigger centering if it's the first node or becomes the first
      }
    }
  };

  const handleAddChildNode = (parentId: string) => {
    if (!mindmap) return;
    const parentNode = mindmap.data.nodes[parentId];
    if (!parentNode) return;

    // Create a temporary node object for the dialog
    const tempNewNode: NodeData = {
      id: `temp-${uuidv4()}`, // Temporary ID
      title: '', // Let user fill this in the dialog
      description: "",
      emoji: "",
      parentId: parentId,
      childIds: [],
      // Position will be finalized by useMindmaps or can be temporary here
      x: parentNode.x + NODE_CARD_WIDTH + 50, // Suggest a position
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

    if (editingNode.id.startsWith('temp-')) { // This is a new node being created
      const permanentNode = addNode(mindmap.id, editingNode.parentId, data);
      if (permanentNode) {
        toast({ title: "Node Created", description: `Node "${permanentNode.title}" added.` });
      }
    } else { // This is an existing node being edited
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

 const handleDragStart = useCallback((event: React.DragEvent<HTMLDivElement>, nodeId: string) => {
    setDraggedNodeId(nodeId);
    const nodeElement = document.getElementById(`node-${nodeId}`);

    if (nodeElement && canvasContentRef.current) {
        const nodeRect = nodeElement.getBoundingClientRect();
        // Calculate offset based on the scaled and panned canvas
        const canvasRect = canvasContentRef.current.getBoundingClientRect();
        
        // Mouse position relative to the viewport
        const clientX = event.clientX;
        const clientY = event.clientY;

        // Node's top-left position relative to the viewport
        // This is tricky because nodeRect.left/top are already scaled by CSS transform on canvasContentRef
        // A simpler way is to get the node's logical position and convert
        const node = mindmap?.data.nodes[nodeId];
        if(node) {
          const nodeScreenX = node.x * scale + pan.x;
          const nodeScreenY = node.y * scale + pan.y;
          
          setDragOffset({
              x: (clientX - (canvasRect.left + nodeScreenX)) / scale, // Mouse relative to node's logical origin, then scaled
              y: (clientY - (canvasRect.top + nodeScreenY)) / scale,
          });
        } else {
           setDragOffset({
            x: (clientX - nodeRect.left) / scale, 
            y: (clientY - nodeRect.top) / scale,
        });
        }
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", nodeId); // Necessary for Firefox and some browsers
}, [scale, pan, mindmap?.data.nodes]);


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
    
    const scrollAreaViewportEl = canvasContainerRef.current.querySelector('div[data-radix-scroll-area-viewport]') || canvasContainerRef.current;
    const viewportRect = scrollAreaViewportEl.getBoundingClientRect();

    // Mouse position relative to the viewport (ScrollArea's content window)
    const mouseXInViewport = event.clientX - viewportRect.left;
    const mouseYInViewport = event.clientY - viewportRect.top;
    
    // Convert mouse position to logical canvas coordinates
    // (mouseXInViewport - pan.x) gives mouse position on the unscaled canvasContent at (0,0) of viewport
    // Then divide by scale to get the logical coordinate on canvasContent
    const logicalX = (mouseXInViewport - pan.x) / scale;
    const logicalY = (mouseYInViewport - pan.y) / scale;

    let newX = logicalX - dragOffset.x;
    let newY = logicalY - dragOffset.y;
    
    updateNodePosition(mindmap.id, draggedNodeId, newX, newY);
    setDraggedNodeId(null);
}, [draggedNodeId, mindmap, scale, pan, dragOffset, updateNodePosition]);


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

    if (pointer && canvasContainerRef.current) {
        const scrollAreaViewportEl = canvasContainerRef.current.querySelector('div[data-radix-scroll-area-viewport]') || canvasContainerRef.current;
        const viewportRect = scrollAreaViewportEl.getBoundingClientRect(); // Get viewport rect for accurate mouse position
        
        // mouse position relative to the viewport's top-left. `pointer` is already this.
        const mouseXInViewport = pointer.x; 
        const mouseYInViewport = pointer.y;
        
        // Convert mouse position on viewport to logical point on unscaled, unpanned content
        const mouseOnContentX = (mouseXInViewport - pan.x) / oldScale;
        const mouseOnContentY = (mouseYInViewport - pan.y) / oldScale;
        
        // New pan to keep that logical point under the mouse after scaling
        newPanX = mouseXInViewport - mouseOnContentX * newScale;
        newPanY = mouseYInViewport - mouseOnContentY * newScale;

    } else { 
        if (canvasContainerRef.current) {
            const scrollAreaViewportEl = canvasContainerRef.current.querySelector('div[data-radix-scroll-area-viewport]') || canvasContainerRef.current;
            const viewportCenterX = scrollAreaViewportEl.clientWidth / 2;
            const viewportCenterY = scrollAreaViewportEl.clientHeight / 2;
            
            // Logical center of the viewport on the unscaled, unpanned content
            const logicalCenterX = (viewportCenterX - pan.x) / oldScale;
            const logicalCenterY = (viewportCenterY - pan.y) / oldScale;

            // New pan to keep that logical center in the viewport center after scaling
            newPanX = viewportCenterX - logicalCenterX * newScale;
            newPanY = viewportCenterY - logicalCenterY * newScale;
        }
    }
    
    setScale(newScale);
    setPan({ x: newPanX, y: newPanY });
  }, [scale, pan]);

  const handleWheelZoom = useCallback((event: WheelEvent) => {
    event.preventDefault();
    const scrollAreaViewportEl = event.currentTarget as HTMLDivElement; 
    if (!scrollAreaViewportEl) return;

    const viewportRect = scrollAreaViewportEl.getBoundingClientRect();
    
    // Mouse position relative to the viewport's top-left
    const mouseXInViewport = event.clientX - viewportRect.left;
    const mouseYInViewport = event.clientY - viewportRect.top;

    handleZoom(event.deltaY < 0, undefined, { x: mouseXInViewport, y: mouseYInViewport });
  }, [handleZoom]);
  
  const handlePanMouseDown = useCallback((event: MouseEvent) => {
    const target = event.target as HTMLElement;
    // Check if the click is directly on the viewport or the canvas content background, not on a node or interactive element within a node.
    if (target.closest('.node-card-draggable') || target.closest('button') || target.closest('input') || target.closest('textarea')) {
      return; 
    }

    if (event.currentTarget && (target === event.currentTarget || (canvasContentRef.current && target === canvasContentRef.current)) ) {
      setIsPanning(true);
      panStartRef.current = {
        x: event.clientX - pan.x,
        y: event.clientY - pan.y,
      };
      (event.currentTarget as HTMLElement).style.cursor = 'grabbing';
    }
  }, [pan]);

  const handlePanMouseMove = useCallback((event: MouseEvent) => {
    if (!isPanning || !panStartRef.current) return;
    setPan({
      x: event.clientX - panStartRef.current.x,
      y: event.clientY - panStartRef.current.y,
    });
  }, [isPanning]); 

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
  }, [isPanning]);
  
  const handleResetZoomPan = useCallback(() => {
    setScale(1);
    setInitialViewCentered(false); // This will trigger the recentering useEffect
  }, []);

  useEffect(() => {
    const scrollAreaViewportEl = canvasContainerRef.current?.querySelector('div[data-radix-scroll-area-viewport]');
    if (scrollAreaViewportEl) {
      const currentViewport = scrollAreaViewportEl as HTMLDivElement;

      // Add event listeners with { passive: false } for wheel to allow preventDefault
      currentViewport.addEventListener('wheel', handleWheelZoom, { passive: false });
      currentViewport.addEventListener('mousedown', handlePanMouseDown);
      
      // Mousemove and mouseup are on window to allow dragging/panning outside the viewport
      window.addEventListener('mousemove', handlePanMouseMove);
      window.addEventListener('mouseup', handlePanMouseUpOrLeave);
      
      currentViewport.style.cursor = 'grab'; // Initial cursor for panning

      return () => {
        currentViewport.removeEventListener('wheel', handleWheelZoom);
        currentViewport.removeEventListener('mousedown', handlePanMouseDown);
        window.removeEventListener('mousemove', handlePanMouseMove);
        window.removeEventListener('mouseup', handlePanMouseUpOrLeave);
      };
    }
  }, [handleWheelZoom, handlePanMouseDown, handlePanMouseMove, handlePanMouseUpOrLeave]); // Dependencies ensure listeners are updated if handlers change


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
    <div className="flex flex-col h-full flex-grow space-y-4">
      {/* Top Controls Section */}
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
              className="min-h-[40px] resize-none" // Ensure Textarea has a manageable default height
            />
          </div>
          <Button onClick={handleAddRootNode} disabled={!newRootNodeTitle.trim()} className="mt-3">
            <PlusCircle className="mr-2 h-4 w-4" /> Add Root Idea
          </Button>
        </div>
      </div>

      {/* Main Canvas Area */}
      <ScrollArea 
        ref={canvasContainerRef}
        className="w-full whitespace-nowrap rounded-lg border bg-background shadow-inner flex-grow min-h-[400px] sm:min-h-[500px] relative overflow-hidden p-4" 
      >
        <div 
          ref={canvasContentRef}
          className="relative border-2 border-dashed border-border" 
          style={{ 
            width: '400vw', height: '400vh', // Large logical canvas size
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            transformOrigin: '0 0', // Scale from top-left for easier coordinate math
            // cursor: isPanning ? 'grabbing' : 'grab', // Cursor handled by event listeners on viewport
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

          {/* SVG for drawing lines between nodes */}
          <svg key={lineRenderKey} className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-visible">
            {allNodes.map(node => {
              if (!node.parentId) return null; // Only draw lines for child nodes

              const parentNode = mindmap.data.nodes[node.parentId];
              if (!parentNode) return null; // Parent must exist

              // Define connection points (e.g., center of nodes)
              // For simplicity, connect center of parent to center of child
              const startX = parentNode.x + NODE_CARD_WIDTH / 2;
              const startY = parentNode.y + NODE_HEADER_HEIGHT; // bottom-center of parent header

              const endX = node.x + NODE_CARD_WIDTH / 2;
              const endY = node.y; // top-center of child

              // Use primary color for root-to-child, accent for child-to-child
              const strokeColor = parentNode.parentId === null ? "hsl(var(--primary))" : "hsl(var(--accent))";
              
              // S-curve path
              // Control points for the S-curve. Adjust offset for more/less curviness
              const sCurveOffset = Math.max(20, Math.min(80, Math.abs(endY - startY) / 2));
              // M = moveto, C = curveto (x1 y1, x2 y2, x y)
              const pathData = `M ${startX} ${startY} C ${startX} ${startY + sCurveOffset}, ${endX} ${endY - sCurveOffset}, ${endX} ${endY}`;


              return (
                <path
                  key={`${parentNode.id}-${node.id}`}
                  d={pathData}
                  stroke={strokeColor}
                  strokeWidth={2 / scale} // Make lines appear consistent thickness when zooming
                  fill="none"
                />
              );
            })}
          </svg>

          {/* Message for empty mindmap, styled to be more centered */}
          {allNodes.length === 0 && !draggedNodeId && ( 
            <div 
              className="absolute inset-0 flex items-center justify-center pointer-events-none" 
              style={{ 
                // Adjust transform to counter parent's pan/scale to keep it visually centered in viewport
                transform: `translate(${-pan.x / scale}px, ${-pan.y / scale}px)`, 
                // Adjust size to effectively cover the viewport at current scale
                width: `${100 / scale}%`, 
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
      
      {/* Zoom Controls - Fixed position */}
      <div className="fixed bottom-4 right-4 z-20 flex flex-col gap-2">
        <Button onClick={() => handleZoom(true)} size="icon" variant="outline" aria-label="Zoom In" className="bg-background/80 hover:bg-muted">
          <ZoomIn />
        </Button>
        <Button onClick={() => handleZoom(false)} size="icon" variant="outline" aria-label="Zoom Out" className="bg-background/80 hover:bg-muted">
          <ZoomOut />
        </Button>
        <Button onClick={handleResetZoomPan} size="icon" variant="outline" aria-label="Reset Zoom and Pan" className="bg-background/80 hover:bg-muted">
          <RefreshCcw />
        </Button>
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

