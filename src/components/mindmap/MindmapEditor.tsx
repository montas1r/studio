
"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Mindmap, NodeData, EditNodeInput, NodesObject } from '@/types/mindmap';
import { useMindmaps } from '@/hooks/useMindmaps';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NodeCard } from './NodeCard';
import { EditNodeDialog } from './EditNodeDialog';
import { PlusCircle, Download, ArrowLeft, ZoomIn, ZoomOut, RefreshCcw, Hand, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ScrollBar } from "@/components/ui/scroll-area"; 
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
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface MindmapEditorProps {
  mindmapId: string;
}

const NODE_CARD_WIDTH = 300;
const NODE_HEADER_HEIGHT = 50;
const CANVAS_CONTENT_WIDTH = '400vw';
const CANVAS_CONTENT_HEIGHT = '400vh';

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
  const canvasContainerRef = useRef<React.ElementRef<typeof ScrollAreaPrimitive.Root>>(null);
  const scrollAreaViewportRef = useRef<React.ElementRef<typeof ScrollAreaPrimitive.Viewport>>(null);
  const canvasContentRef = useRef<HTMLDivElement>(null);

  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number } | null>(null);
  const [initialViewCentered, setInitialViewCentered] = useState(false);
  const [activeTool, setActiveTool] = useState<ActiveTool>('select');

  const centerView = useCallback(() => {
    if (scrollAreaViewportRef.current && canvasContentRef.current) {
      const viewportWidth = scrollAreaViewportRef.current.clientWidth;
      const viewportHeight = scrollAreaViewportRef.current.clientHeight;

      let targetContentX = 0;
      let targetContentY = 0;

      if (mindmap && mindmap.data.rootNodeIds.length > 0 && mindmap.data.nodes[mindmap.data.rootNodeIds[0]]) {
        const firstRootNode = mindmap.data.nodes[mindmap.data.rootNodeIds[0]];
        targetContentX = firstRootNode.x + NODE_CARD_WIDTH / 2;
        targetContentY = firstRootNode.y + NODE_HEADER_HEIGHT / 2;
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
      title: '', 
      description: "",
      emoji: "➕",
      parentId: parentId,
      childIds: [],
      x: parentNode.x + NODE_CARD_WIDTH / 2 - NODE_CARD_WIDTH /2, 
      y: parentNode.y + NODE_HEADER_HEIGHT + 60, 
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
    if (activeTool === 'pan') {
      event.preventDefault();
      return;
    }
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
    event.dataTransfer.setData("text/plain", nodeId);
  }, [scale, activeTool]);


  const handleDragEnter = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!draggedNodeId || !mindmap || !canvasContentRef.current || !scrollAreaViewportRef.current) return;

    const viewportRect = scrollAreaViewportRef.current.getBoundingClientRect();
    const mouseXInViewport = event.clientX - viewportRect.left;
    const mouseYInViewport = event.clientY - viewportRect.top;

    let newX = (mouseXInViewport - pan.x) / scale - dragOffset.x;
    let newY = (mouseYInViewport - pan.y) / scale - dragOffset.y;
    
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

  const handleZoom = useCallback((zoomIn: boolean, customScale?: number, pointer?: { x: number; y: number }) => {
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

    if (pointer && scrollAreaViewportRef.current) {
      const viewportRect = scrollAreaViewportRef.current.getBoundingClientRect();
      const mouseXInViewport = pointer.x - viewportRect.left;
      const mouseYInViewport = pointer.y - viewportRect.top;

      const mouseOnContentX = (mouseXInViewport - pan.x) / oldScale;
      const mouseOnContentY = (mouseYInViewport - pan.y) / oldScale;

      newPanX = mouseXInViewport - mouseOnContentX * newScale;
      newPanY = mouseYInViewport - mouseOnContentY * newScale;

    } else if (scrollAreaViewportRef.current) {
      const viewportCenterX = scrollAreaViewportRef.current.clientWidth / 2;
      const viewportCenterY = scrollAreaViewportRef.current.clientHeight / 2;
      const logicalCenterX = (viewportCenterX - pan.x) / oldScale;
      const logicalCenterY = (viewportCenterY - pan.y) / oldScale;
      newPanX = viewportCenterX - logicalCenterX * newScale;
      newPanY = viewportCenterY - logicalCenterY * newScale;
    }
    setScale(newScale);
    setPan({ x: newPanX, y: newPanY });
  }, [scale, pan]);

  const handleWheelZoom = useCallback((event: WheelEvent) => {
    if (!scrollAreaViewportRef.current || !scrollAreaViewportRef.current.contains(event.target as Node)) return;
    event.preventDefault();
    handleZoom(event.deltaY < 0, undefined, { x: event.clientX, y: event.clientY });
  }, [handleZoom]);

  const handlePanMouseDown = useCallback((event: MouseEvent) => {
    if (activeTool !== 'pan') return;
    const target = event.target as HTMLElement;
    const scrollViewport = scrollAreaViewportRef.current;
    if (!scrollViewport) return;
    
    if (target.closest('.node-card-draggable') || target.closest('button') || target.closest('input') || target.closest('textarea') || target.closest('[role="dialog"]')) {
      return;
    }
    
    if (target === scrollViewport || (canvasContentRef.current && target === canvasContentRef.current)) {
      setIsPanning(true);
      panStartRef.current = { x: event.clientX - pan.x, y: event.clientY - pan.y };
      scrollViewport.style.cursor = 'grabbing';
    }
  }, [activeTool, pan]);

  const handlePanMouseMove = useCallback((event: MouseEvent) => {
    if (!isPanning || !panStartRef.current || activeTool !== 'pan') return;
    event.preventDefault();
    setPan({ x: event.clientX - panStartRef.current.x, y: event.clientY - panStartRef.current.y });
  }, [isPanning, activeTool]);

  const handlePanMouseUpOrLeave = useCallback((event: MouseEvent) => {
    if (isPanning && activeTool === 'pan') {
      setIsPanning(false);
      panStartRef.current = null;
      if (scrollAreaViewportRef.current) {
        scrollAreaViewportRef.current.style.cursor = activeTool === 'pan' ? 'grab' : 'default';
      }
    }
  }, [isPanning, activeTool]);

  const handleResetZoomPan = useCallback(() => {
    setScale(1);
    setInitialViewCentered(false); 
  }, []);

  useEffect(() => {
    const currentViewport = scrollAreaViewportRef.current;
    if (currentViewport) {
      currentViewport.addEventListener('wheel', handleWheelZoom, { passive: false });
      currentViewport.addEventListener('mousedown', handlePanMouseDown); 
      window.addEventListener('mousemove', handlePanMouseMove);
      window.addEventListener('mouseup', handlePanMouseUpOrLeave);
      currentViewport.style.cursor = activeTool === 'pan' ? 'grab' : 'default';
      return () => {
        currentViewport.removeEventListener('wheel', handleWheelZoom);
        currentViewport.removeEventListener('mousedown', handlePanMouseDown);
        window.removeEventListener('mousemove', handlePanMouseMove);
        window.removeEventListener('mouseup', handlePanMouseUpOrLeave);
      };
    }
  }, [handleWheelZoom, handlePanMouseDown, handlePanMouseMove, handlePanMouseUpOrLeave, activeTool]);


  if (!mindmap) {
    return (
      <div className="flex flex-col items-center justify-center h-full flex-grow space-y-4 text-center py-10">
        <AlertTriangle className="w-16 h-16 text-destructive" />
        <h2 className="text-2xl font-bold">Mindmap Not Found</h2>
        <p className="text-muted-foreground">The mindmap you are looking for does not exist or has been deleted.</p>
        <Button asChild variant="outline" size="sm" className="mt-1 text-xs h-7 px-2">
          <Link href="/">
            <span className="flex items-center"><ArrowLeft className="mr-1 h-3 w-3" /> Library</span>
          </Link>
        </Button>
      </div>
    );
  }

  const allNodes = Object.values(mindmap.data.nodes);

  return (
    <div className="flex flex-col h-full flex-grow w-full space-y-1">
      <div className="p-1 border-b bg-background/80 backdrop-blur-sm rounded-t-lg sticky top-0 z-10">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-1 mb-1">
          <h1 className="text-xs sm:text-sm font-semibold text-foreground truncate px-1" title={mindmap.name}>
            {mindmap.name}
          </h1>
          <div className="flex items-center gap-1">
            <Button asChild variant="outline" size="sm" className="text-xs h-7 px-2">
              <Link href="/">
                <span className="flex items-center"><ArrowLeft className="mr-1 h-3 w-3" /> Library</span>
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportJson} className="text-xs h-7 px-2">
              <Download className="mr-1 h-3 w-3" /> Export
            </Button>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch gap-1 px-1">
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

      <ScrollAreaPrimitive.Root
        ref={canvasContainerRef}
        className={cn(
            "w-full bg-background flex-grow relative overflow-hidden",
            "border-2 border-dashed border-destructive", 
            "min-h-[calc(100vh-220px)] sm:min-h-[calc(100vh-200px)]"
        )}
      >
        <ScrollAreaPrimitive.Viewport ref={scrollAreaViewportRef} className="h-full w-full rounded-[inherit]">
            <div
              ref={canvasContentRef}
              className="relative" 
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
                  className="node-card-draggable" 
                />
            ))}

            <svg
                key={`lines-${allNodes.length}-${scale}-${pan.x}-${pan.y}`} 
                className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-visible" 
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
                      This mindmap is empty. Add a root idea to get started!
                  </div>
                </div>
            )}
            </div>
        </ScrollAreaPrimitive.Viewport>
        <ScrollBar orientation="horizontal" />
        <ScrollBar orientation="vertical" />
        <ScrollAreaPrimitive.Corner />
      </ScrollAreaPrimitive.Root>

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
            <TooltipContent><p>Toggle Pan Tool (P)</p></TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button onClick={() => handleZoom(true)} variant="outline" size="icon" className="shadow-lg bg-background/80 hover:bg-muted">
                <span><ZoomIn /></span>
              </Button>
            </TooltipTrigger>
            <TooltipContent><p>Zoom In</p></TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button onClick={() => handleZoom(false)} variant="outline" size="icon" className="shadow-lg bg-background/80 hover:bg-muted">
                <span><ZoomOut /></span>
              </Button>
            </TooltipTrigger>
            <TooltipContent><p>Zoom Out</p></TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
               <Button onClick={handleResetZoomPan} variant="outline" size="icon" className="shadow-lg bg-background/80 hover:bg-muted">
                <span><RefreshCcw /></span>
              </Button>
            </TooltipTrigger>
            <TooltipContent><p>Reset View</p></TooltipContent>
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

    