
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
const NODE_HEADER_HEIGHT = 50;
const CANVAS_CONTENT_WIDTH = '800vw';
const CANVAS_CONTENT_HEIGHT = '800vh';
const MIN_SCALE = 0.2;
const MAX_SCALE = 3;
const ZOOM_SENSITIVITY = 0.002;


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

  const zoomPanContainerRef = useRef<HTMLDivElement>(null);
  const canvasContentRef = useRef<HTMLDivElement>(null); // For the transformed content
  const scrollAreaViewportRef = useRef<React.ElementRef<typeof ScrollAreaPrimitive.Viewport>>(null);


  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const [initialViewCentered, setInitialViewCentered] = useState(false);

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
    const newPanX = (zoomPanContainerRef.current.clientWidth / 2) - (targetX * newScale);
    const newPanY = (zoomPanContainerRef.current.clientHeight / 2) - (targetY * newScale);
    
    setScale(newScale);
    setPan({ x: newPanX, y: newPanY });
    setInitialViewCentered(true);
  }, [mindmap]);

  useEffect(() => {
    if (mindmap && !initialViewCentered && zoomPanContainerRef.current) {
      handleRecenterView();
    }
  }, [mindmap, initialViewCentered, handleRecenterView]);


  const handleZoom = useCallback((zoomIn: boolean, customFactor?: number, pointerX?: number, pointerY?: number) => {
    if (!zoomPanContainerRef.current) return;

    const factor = customFactor !== undefined ? (zoomIn ? 1 + customFactor : 1 - customFactor) : (zoomIn ? 1.2 : 1 / 1.2);
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
  }, [scale, pan.x, pan.y]);

  const handleWheelZoom = useCallback((event: WheelEvent) => {
    event.preventDefault();
    const delta = event.deltaY * ZOOM_SENSITIVITY * -1; // Invert for natural scroll, adjust sensitivity
    const zoomIn = delta > 0;
    handleZoom(zoomIn, Math.abs(delta), event.clientX, event.clientY);
  }, [handleZoom]);


  const handlePanMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    // Allow panning only if clicking on the background of the zoomPanContainer
    if (event.target !== zoomPanContainerRef.current && event.target !== canvasContentRef.current?.parentElement) { // canvasContentRef.current?.parentElement should be the viewport
      return;
    }
    event.preventDefault();
    setIsPanning(true);
    panStartRef.current = { x: event.clientX - pan.x, y: event.clientY - pan.y };
    if (zoomPanContainerRef.current) {
      zoomPanContainerRef.current.style.cursor = 'grabbing';
    }
  }, [pan.x, pan.y]);

  const handlePanMouseMove = useCallback((event: MouseEvent) => {
    if (!isPanning) return;
    event.preventDefault();
    setPan({
      x: event.clientX - panStartRef.current.x,
      y: event.clientY - panStartRef.current.y,
    });
  }, [isPanning]);

  const handlePanMouseUpOrLeave = useCallback(() => {
    if (!isPanning) return;
    setIsPanning(false);
    if (zoomPanContainerRef.current) {
      zoomPanContainerRef.current.style.cursor = 'grab';
    }
  }, [isPanning]);

  useEffect(() => {
    const currentZoomPanContainer = zoomPanContainerRef.current;
    if (currentZoomPanContainer) {
      currentZoomPanContainer.addEventListener('wheel', handleWheelZoom, { passive: false });
      // Mouse move and up for panning are global
      window.addEventListener('mousemove', handlePanMouseMove);
      window.addEventListener('mouseup', handlePanMouseUpOrLeave);
      window.addEventListener('mouseleave', handlePanMouseUpOrLeave);
      
      return () => {
        currentZoomPanContainer.removeEventListener('wheel', handleWheelZoom);
        window.removeEventListener('mousemove', handlePanMouseMove);
        window.removeEventListener('mouseup', handlePanMouseUpOrLeave);
        window.removeEventListener('mouseleave', handlePanMouseUpOrLeave);
      };
    }
  }, [handleWheelZoom, handlePanMouseMove, handlePanMouseUpOrLeave]);


  const handleAddRootNode = useCallback(() => {
    if (newRootNodeTitle.trim() === '') {
      toast({ title: "Title Required", description: "Please enter a title for the new root node.", variant: "destructive" });
      return;
    }
    if (!mindmap || !canvasContentRef.current) return;
    
    const newNode = addNode(mindmap.id, null, { title: newRootNodeTitle, description: newRootNodeDescription, emoji: '💡' });
    if (newNode) {
        setNewRootNodeTitle('');
        setNewRootNodeDescription('');
        toast({ title: "Root Node Added", description: `"${newNode.title}" added to the mindmap.` });
    }
  }, [newRootNodeTitle, newRootNodeDescription, mindmap, addNode, toast]);

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
      x: parentNode.x, 
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
      const permanentNode = addNode(mindmap.id, editingNode.parentId, data, editingNode.x, editingNode.y);
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

  const handleNodeDragStart = useCallback((event: React.DragEvent<HTMLDivElement>, nodeId: string) => {
    if (!canvasContentRef.current) return;
    setDraggedNodeId(nodeId);
    const nodeElement = event.currentTarget;
    const nodeRect = nodeElement.getBoundingClientRect();
    
    // Calculate offset relative to the unscaled node
    setDragOffset({
      x: (event.clientX - nodeRect.left) / scale,
      y: (event.clientY - nodeRect.top) / scale,
    });
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", nodeId); 
  }, [scale]);
  
  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault(); 
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
    
    // Convert screen drop point to logical canvas coordinates
    const clientX = event.clientX;
    const clientY = event.clientY;

    const logicalX = (clientX - containerRect.left - pan.x) / scale;
    const logicalY = (clientY - containerRect.top - pan.y) / scale;

    let newX = logicalX - dragOffset.x;
    let newY = logicalY - dragOffset.y;
    
    updateNodePosition(mindmap.id, draggedNodeId, newX, newY);
    setDraggedNodeId(null);
  }, [draggedNodeId, mindmap, dragOffset, updateNodePosition, pan, scale]);


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
      <div className="p-2 border-b bg-background/90 backdrop-blur-sm rounded-t-lg sticky top-0 z-20 space-y-2">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div className="flex-grow">
            <h1 className="text-lg font-semibold text-foreground truncate" title={mindmap.name}>
              {mindmap.name}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
               <Link href="/">
                 <span className="flex items-center"><ArrowLeft className="mr-2 h-4 w-4" /> Library</span>
               </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportJson}>
              <Download className="mr-2 h-4 w-4" /> Export
            </Button>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch gap-2">
          <Input
            type="text"
            value={newRootNodeTitle}
            onChange={(e) => setNewRootNodeTitle(e.target.value)}
            placeholder="New Root Idea Title"
            className="flex-grow h-9 text-sm"
          />
          <Textarea
            value={newRootNodeDescription}
            onChange={(e) => setNewRootNodeDescription(e.target.value)}
            placeholder="Description (Optional)"
            rows={1}
            className="flex-grow text-sm min-h-[36px] h-9 resize-none"
          />
          <Button onClick={handleAddRootNode} size="sm" className="h-9 whitespace-nowrap">
            <PlusCircle className="mr-2 h-4 w-4" /> Add Root Idea
          </Button>
        </div>
      </div>

      {/* Main Editing Canvas Area */}
      <ScrollAreaPrimitive.Root className="flex-grow relative overflow-hidden bg-muted/20">
        <div 
          ref={zoomPanContainerRef}
          className="w-full h-full relative overflow-hidden cursor-grab" // Zoom/Pan events attached here
          onMouseDown={handlePanMouseDown}
        >
          <ScrollAreaPrimitive.Viewport ref={scrollAreaViewportRef} className="w-full h-full rounded-lg">
            <div 
                ref={canvasContentRef}
                className="relative border-2 border-dashed border-destructive pointer-events-auto"
                style={{
                    position: 'absolute', // As per user spec
                    top: 0, // As per user spec
                    left: 0, // As per user spec
                    width: CANVAS_CONTENT_WIDTH,
                    height: CANVAS_CONTENT_HEIGHT,
                    transform: `scale(${scale}) translate(${pan.x}px, ${pan.y}px)`,
                    transformOrigin: '0 0', // As per user spec
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
                    style={{ width: CANVAS_CONTENT_WIDTH, height: CANVAS_CONTENT_HEIGHT }}
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
                        strokeWidth={Math.max(1, 2 / scale)} // Ensure stroke is visible when zoomed out
                        fill="none"
                        />
                    );
                    })}
                </svg>

                {allNodes.length === 0 && !draggedNodeId && (
                    <div
                      className="absolute flex items-center justify-center pointer-events-none text-center"
                      style={{
                        top: `50%`, 
                        left: `50%`,
                        transform: `translate(-50%, -50%) scale(${1/scale})`, // Counter-scale the message
                        width: '300px' // Give it some width
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

      {/* Fixed UI Controls for Zoom */}
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
