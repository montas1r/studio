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

  const [lineRenderKey, setLineRenderKey] = useState(0); // Used to force re-render of SVG lines

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

        const firstRootId = mindmap.data.rootNodeIds[0];
        if (firstRootId && mindmap.data.nodes[firstRootId]) {
          const firstRootNode = mindmap.data.nodes[firstRootId];
          targetContentX = firstRootNode.x + NODE_CARD_WIDTH / 2;
          targetContentY = firstRootNode.y + NODE_HEADER_HEIGHT / 2; 
        }
        
        const newPanX = (viewportWidth / 2) - (targetContentX * scale);
        const newPanY = (viewportHeight / 2) - (targetContentY * scale);
        
        setPan({ x: newPanX, y: newPanY });
        setInitialViewCentered(true);
      }
    }
  }, [mindmap, initialViewCentered, mindmapId]); // Removed scale dependency

  useEffect(() => {
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
      if (Object.keys(mindmap.data.nodes).length === 0 || (Object.keys(mindmap.data.nodes).length === 1 && mindmap.data.rootNodeIds.includes(newNode.id))) { 
        setInitialViewCentered(false); 
      }
    }
  };

  const handleAddChildNode = (parentId: string) => {
    if (!mindmap) return;
    const parentNode = mindmap.data.nodes[parentId];
    if (!parentNode) return;

    const tempNewNode: NodeData = {
      id: `temp-${uuidv4()}`, 
      title: '', 
      description: "",
      emoji: "",
      parentId: parentId,
      childIds: [],
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

 const handleDragStart = useCallback((event: React.DragEvent<HTMLDivElement>, nodeId: string) => {
    setDraggedNodeId(nodeId);
    const nodeElement = document.getElementById(`node-${nodeId}`);

    if (nodeElement && canvasContentRef.current) {
        const canvasRect = canvasContentRef.current.getBoundingClientRect();
        const clientX = event.clientX;
        const clientY = event.clientY;
        const node = mindmap?.data.nodes[nodeId];

        if(node) {
          // Position of node's top-left on the screen (considering canvas pan and scale)
          const nodeScreenX = node.x * scale + pan.x + canvasRect.left;
          const nodeScreenY = node.y * scale + pan.y + canvasRect.top;
          
          setDragOffset({
              x: (clientX - nodeScreenX) / scale, // Mouse relative to node's logical origin (top-left of node element)
              y: (clientY - nodeScreenY) / scale,
          });
        } else { // Fallback, less accurate if node data isn't immediately available
           const nodeRect = nodeElement.getBoundingClientRect();
           setDragOffset({
            x: (clientX - nodeRect.left) / scale, 
            y: (clientY - nodeRect.top) / scale,
           });
        }
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", nodeId); 
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
    const viewportRect = scrollAreaViewportEl.getBoundingClientRect(); // This is the viewport of the ScrollArea

    // Mouse position relative to the ScrollArea's viewport
    const mouseXInViewport = event.clientX - viewportRect.left;
    const mouseYInViewport = event.clientY - viewportRect.top;
    
    // Convert mouse position to logical canvas coordinates
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
        const mouseXInViewport = pointer.x; 
        const mouseYInViewport = pointer.y;
        
        const mouseOnContentX = (mouseXInViewport - pan.x) / oldScale;
        const mouseOnContentY = (mouseYInViewport - pan.y) / oldScale;
        
        newPanX = mouseXInViewport - mouseOnContentX * newScale;
        newPanY = mouseYInViewport - mouseOnContentY * newScale;

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
  }, [scale, pan]);

  const handleWheelZoom = useCallback((event: WheelEvent) => {
    event.preventDefault();
    const scrollAreaViewportEl = event.currentTarget as HTMLDivElement; 
    if (!scrollAreaViewportEl) return;

    const viewportRect = scrollAreaViewportEl.getBoundingClientRect();
    const mouseXInViewport = event.clientX - viewportRect.left;
    const mouseYInViewport = event.clientY - viewportRect.top;

    handleZoom(event.deltaY < 0, undefined, { x: mouseXInViewport, y: mouseYInViewport });
  }, [handleZoom]);
  
  const handlePanMouseDown = useCallback((event: MouseEvent) => {
    const target = event.target as HTMLElement;
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
    setInitialViewCentered(false); 
  }, []);

  useEffect(() => {
    const scrollAreaViewportEl = canvasContainerRef.current?.querySelector('div[data-radix-scroll-area-viewport]');
    if (scrollAreaViewportEl) {
      const currentViewport = scrollAreaViewportEl as HTMLDivElement;

      currentViewport.addEventListener('wheel', handleWheelZoom, { passive: false });
      currentViewport.addEventListener('mousedown', handlePanMouseDown);
      window.addEventListener('mousemove', handlePanMouseMove);
      window.addEventListener('mouseup', handlePanMouseUpOrLeave);
      currentViewport.style.cursor = 'grab';

      return () => {
        currentViewport.removeEventListener('wheel', handleWheelZoom);
        currentViewport.removeEventListener('mousedown', handlePanMouseDown);
        window.removeEventListener('mousemove', handlePanMouseMove);
        window.removeEventListener('mouseup', handlePanMouseUpOrLeave);
      };
    }
  }, [handleWheelZoom, handlePanMouseDown, handlePanMouseMove, handlePanMouseUpOrLeave]); 


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
    <div className="flex flex-col h-full flex-grow space-y-2"> {/* Reduced space-y */}
      {/* Top Controls Section */}
      <div className="p-2 border-b rounded-t-lg bg-card shadow-sm space-y-2 flex-shrink-0"> {/* Reduced p, space-y, removed shadow-md, border only bottom */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2"> {/* Reduced gap */}
          <div>
            <h2 className="text-xl font-semibold truncate" title={mindmap.name}>{mindmap.name}</h2> {/* Reduced font size and weight */}
            <Button asChild variant="outline" size="sm" className="mt-1"> {/* Reduced mt */}
              <Link href="/">
                <ArrowLeft className="mr-2 h-4 w-4" /> Library
              </Link>
            </Button>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleExportJson} variant="outline" size="sm"> {/* Made button sm */}
              <Download className="mr-2 h-4 w-4" /> Export
            </Button>
          </div>
        </div>

        <div>
          <h3 className="text-base font-medium mb-1">Add New Root Idea</h3> {/* Reduced font size and mb */}
          <div className="grid sm:grid-cols-2 gap-2"> {/* Reduced gap */}
            <Input
              placeholder="Title for root idea"
              value={newRootNodeTitle}
              onChange={(e) => setNewRootNodeTitle(e.target.value)}
              className="h-9 text-sm" /* Reduced height, text-sm */
            />
            <Textarea
              placeholder="Optional description..."
              value={newRootNodeDescription}
              onChange={(e) => setNewRootNodeDescription(e.target.value)}
              rows={1}
              className="min-h-[36px] resize-none text-sm" /* Reduced height, text-sm */
            />
          </div>
          <Button onClick={handleAddRootNode} disabled={!newRootNodeTitle.trim()} className="mt-2" size="sm"> {/* Reduced mt, size sm */}
            <PlusCircle className="mr-2 h-4 w-4" /> Add Root
          </Button>
        </div>
      </div>

      {/* Main Canvas Area */}
      <ScrollArea 
        ref={canvasContainerRef}
        className="w-full whitespace-nowrap rounded-b-lg border bg-background shadow-inner flex-grow min-h-[400px] sm:min-h-[500px] relative overflow-hidden" /* Removed p-4, rounded-b-lg */
      >
        <div 
          ref={canvasContentRef}
          className="relative border-2 border-dashed border-border" 
          style={{ 
            width: '400vw', height: '400vh',
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
              className="node-card-draggable" 
            />
          ))}

          <svg key={lineRenderKey} className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-visible">
            {allNodes.map(node => {
              if (!node.parentId) return null; 

              const parentNode = mindmap.data.nodes[node.parentId];
              if (!parentNode) return null; 

              const startX = parentNode.x + NODE_CARD_WIDTH / 2;
              const startY = parentNode.y + NODE_HEADER_HEIGHT; 

              const endX = node.x + NODE_CARD_WIDTH / 2;
              const endY = node.y; 

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
              style={{ 
                transform: `translate(${-pan.x / scale}px, ${-pan.y / scale}px)`, 
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

