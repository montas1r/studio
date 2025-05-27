
"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Mindmap, NodeData, EditNodeInput } from '@/types/mindmap';
import { useMindmaps } from '@/hooks/useMindmaps';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NodeCard } from './NodeCard';
import { EditNodeDialog } from './EditNodeDialog';
import { PlusCircle, Download, ArrowLeft, Hand, LocateFixed, ZoomIn, ZoomOut, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
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
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface MindmapEditorProps {
  mindmapId: string;
}

const NODE_CARD_WIDTH = 300;
const NODE_HEADER_HEIGHT = 50; // Approximate, includes padding
const CANVAS_CONTENT_WIDTH = '1200px'; // Default canvas logical width
const CANVAS_CONTENT_HEIGHT = '1200px'; // Default canvas logical height

const MIN_ZOOM_FACTOR = 0.2;
const MAX_ZOOM_FACTOR = 2.5;
const ZOOM_STEP_SENSITIVITY = 0.1;

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

  const viewportContainerRef = useRef<HTMLDivElement>(null);
  const canvasContentRef = useRef<HTMLDivElement>(null);

  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const [activeTool, setActiveTool] = useState<'select' | 'pan'>('select');
  const [initialViewCentered, setInitialViewCentered] = useState(false);

  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const getNodesBoundingBox = useCallback(() => {
    if (!mindmap || Object.keys(mindmap.data.nodes).length === 0) {
      return null;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    Object.values(mindmap.data.nodes).forEach(node => {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + NODE_CARD_WIDTH);
      const approxNodeHeight = NODE_HEADER_HEIGHT + (node.description ? 50 : 0) + (node.description?.split('\n').length || 1) * 15;
      maxY = Math.max(maxY, node.y + approxNodeHeight);
    });
    if (minX === Infinity) return null;
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }, [mindmap]);

  const calculateOptimalFit = useCallback((forInitialCentering = false) => {
    if (!viewportContainerRef.current) return { scale: 1, pan: { x: 0, y: 0 } };

    const viewportWidth = viewportContainerRef.current.clientWidth;
    const viewportHeight = viewportContainerRef.current.clientHeight;
    const padding = 50;

    const nodesBoundingBox = getNodesBoundingBox();

    if (!nodesBoundingBox || nodesBoundingBox.width <= 0 || nodesBoundingBox.height <= 0) {
      return {
        scale: forInitialCentering ? 1 : scale,
        pan: {
          x: viewportWidth / 2 - (0 * (forInitialCentering ? 1 : scale)),
          y: viewportHeight / 2 - (0 * (forInitialCentering ? 1 : scale)),
        }
      };
    }

    const scaleX = (viewportWidth - 2 * padding) / nodesBoundingBox.width;
    const scaleY = (viewportHeight - 2 * padding) / nodesBoundingBox.height;
    let newScale = Math.min(scaleX, scaleY);
    newScale = Math.max(MIN_ZOOM_FACTOR, Math.min(MAX_ZOOM_FACTOR, newScale));

    const bbCenterX = nodesBoundingBox.minX + nodesBoundingBox.width / 2;
    const bbCenterY = nodesBoundingBox.minY + nodesBoundingBox.height / 2;

    const newPanX = (viewportWidth / 2) - (bbCenterX * newScale);
    const newPanY = (viewportHeight / 2) - (bbCenterY * newScale);

    return { scale: newScale, pan: { x: newPanX, y: newPanY } };
  }, [getNodesBoundingBox, scale]);

  const handleRecenterView = useCallback((isInitial = false) => {
    const { scale: newScale, pan: newPan } = calculateOptimalFit(isInitial);
    setScale(newScale);
    setPan(newPan);
  }, [calculateOptimalFit]);

  useEffect(() => {
    if (mindmap && viewportContainerRef.current && !initialViewCentered) {
      handleRecenterView(true);
      setInitialViewCentered(true);
    }
  }, [mindmap, initialViewCentered, handleRecenterView]);

  const handleZoom = useCallback((zoomIncrement: number, clientX?: number, clientY?: number) => {
    if (!viewportContainerRef.current) return;

    const viewportRect = viewportContainerRef.current.getBoundingClientRect();
    const pointerX = clientX === undefined ? viewportRect.width / 2 : clientX - viewportRect.left;
    const pointerY = clientY === undefined ? viewportRect.height / 2 : clientY - viewportRect.top;

    const currentScale = scale;
    let newScale = currentScale + zoomIncrement * currentScale * ZOOM_STEP_SENSITIVITY; // Make zoom sensitivity relative
    newScale = Math.max(MIN_ZOOM_FACTOR, Math.min(MAX_ZOOM_FACTOR, newScale));

    if (newScale === currentScale) return;

    const panX = pan.x - (pointerX - pan.x) * (newScale / currentScale - 1);
    const panY = pan.y - (pointerY - pan.y) * (newScale / currentScale - 1);

    setScale(newScale);
    setPan({ x: panX, y: panY });
  }, [scale, pan]);

  const handlePanMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (activeTool !== 'pan' || !viewportContainerRef.current) return;
    if ((event.target as HTMLElement).closest('.node-card-draggable') || (event.target as HTMLElement).closest('button')) {
      return;
    }
    event.preventDefault();
    setIsPanning(true);
    panStartRef.current = { x: event.clientX - pan.x, y: event.clientY - pan.y };
  }, [activeTool, pan]);

  const handlePanMouseMove = useCallback((event: MouseEvent) => {
    if (!isPanning || activeTool !== 'pan') return;
    event.preventDefault();
    setPan({
      x: event.clientX - panStartRef.current.x,
      y: event.clientY - panStartRef.current.y,
    });
  }, [isPanning, activeTool]);

  const handlePanMouseUpOrLeave = useCallback(() => {
    if (isPanning) {
      setIsPanning(false);
    }
  }, [isPanning]);

  useEffect(() => {
    window.addEventListener('mousemove', handlePanMouseMove);
    window.addEventListener('mouseup', handlePanMouseUpOrLeave);
    window.addEventListener('mouseleave', handlePanMouseUpOrLeave);

    return () => {
      window.removeEventListener('mousemove', handlePanMouseMove);
      window.removeEventListener('mouseup', handlePanMouseUpOrLeave);
      window.removeEventListener('mouseleave', handlePanMouseUpOrLeave);
    };
  }, [handlePanMouseMove, handlePanMouseUpOrLeave]);

  useEffect(() => {
    if (viewportContainerRef.current) {
      if (activeTool === 'pan') {
        viewportContainerRef.current.style.cursor = isPanning ? 'grabbing' : 'grab';
      } else {
        viewportContainerRef.current.style.cursor = 'default';
      }
    }
  }, [activeTool, isPanning]);

  const handleAddRootNode = useCallback(async () => {
    if (newRootNodeTitle.trim() === '') {
      toast({ title: "Title Required", description: "Please enter a title for the new root node.", variant: "destructive" });
      return;
    }
    if (!mindmap || !viewportContainerRef.current) return;

    const newNode = addNode(mindmap.id, null, { title: newRootNodeTitle, description: newRootNodeDescription, emoji: '💡' });

    if (newNode) {
      setNewRootNodeTitle('');
      setNewRootNodeDescription('');
      toast({ title: "Root Node Added", description: `"${newNode.title}" added to the mindmap.` });
      
      setTimeout(() => {
        if (viewportContainerRef.current) {
          const viewportWidth = viewportContainerRef.current.clientWidth;
          const viewportHeight = viewportContainerRef.current.clientHeight;
          const newPanX = (viewportWidth / 2) - (newNode.x + NODE_CARD_WIDTH / 2) * scale;
          const newPanY = (viewportHeight / 2) - (newNode.y + NODE_HEADER_HEIGHT / 2) * scale;
          setPan({x: newPanX, y: newPanY});
        }
      }, 100);
    }
  }, [newRootNodeTitle, newRootNodeDescription, mindmap, addNode, toast, scale, setPan]);

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
      x: parentNode.x + NODE_CARD_WIDTH / 4,
      y: parentNode.y + NODE_HEADER_HEIGHT + 80,
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
        setTimeout(() => {
            if (viewportContainerRef.current) {
                const viewportWidth = viewportContainerRef.current.clientWidth;
                const viewportHeight = viewportContainerRef.current.clientHeight;
                const newPanX = (viewportWidth / 2) - (permanentNode.x + NODE_CARD_WIDTH / 2) * scale;
                const newPanY = (viewportHeight / 2) - (permanentNode.y + NODE_HEADER_HEIGHT / 2) * scale;
                setPan({x: newPanX, y: newPanY});
            }
        }, 100);
      }
    } else {
      updateNode(mindmap.id, nodeId, data);
      toast({ title: "Node Updated", description: `Node "${data.title}" saved.` });
    }
    setEditingNode(null);
    setIsEditDialogOpen(false);
  }, [mindmap, editingNode, addNode, updateNode, toast, scale, setPan]);

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
    setTimeout(() => handleRecenterView(false), 100); 
  }, [mindmap, nodeToDelete, deleteNodeFromHook, toast, handleRecenterView]);

  const handleNodeDragStart = useCallback((event: React.DragEvent<HTMLDivElement>, nodeId: string) => {
    if (activeTool === 'pan' || !mindmap || !viewportContainerRef.current) {
      event.preventDefault();
      return;
    }

    const draggedNodeData = mindmap.data.nodes[nodeId];
    if (!draggedNodeData) return;

    const viewportContainerRect = viewportContainerRef.current.getBoundingClientRect();
    
    const nodeScreenX = draggedNodeData.x * scale + pan.x;
    const nodeScreenY = draggedNodeData.y * scale + pan.y;

    const mouseXInContainer = event.clientX - viewportContainerRect.left;
    const mouseYInContainer = event.clientY - viewportContainerRect.top;
    
    setDragOffset({
      x: (mouseXInContainer - nodeScreenX) / scale,
      y: (mouseYInContainer - nodeScreenY) / scale,
    });
    
    setDraggedNodeId(nodeId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", nodeId); 
  }, [mindmap, pan, scale, activeTool]);

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (draggedNodeId) {
      event.dataTransfer.dropEffect = "move";
    }
  }, [draggedNodeId]);

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!draggedNodeId || !mindmap || !viewportContainerRef.current) return;

    const viewportRect = viewportContainerRef.current.getBoundingClientRect();
    
    const mouseXInViewportContainer = event.clientX - viewportRect.left;
    const mouseYInViewportContainer = event.clientY - viewportRect.top;

    let newX = (mouseXInViewportContainer - pan.x) / scale - dragOffset.x;
    let newY = (mouseYInViewportContainer - pan.y) / scale - dragOffset.y;
    
    // newX = Math.max(0, newX); // Removed based on request to allow negative coords
    // newY = Math.max(0, newY); // Removed based on request to allow negative coords

    updateNodePosition(mindmap.id, draggedNodeId, newX, newY);
    setDraggedNodeId(null);
  }, [draggedNodeId, mindmap, pan, scale, dragOffset, updateNodePosition]);

  const handleExportJson = useCallback(() => {
    if (!mindmap) return;
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(mindmap, null, 2)
    )}`;
    const link = document.createElement("a");
    link.href = jsonString;
    link.download = `${mindmap.name.replace(/\s+/g, '_').toLowerCase()}_mindmap.json`;
    link.click();
    toast({ title: "Exported", description: "Mindmap data exported as JSON." });
  }, [mindmap, toast]);

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
      <div className="p-1 border-b bg-background/80 backdrop-blur-sm rounded-t-lg sticky top-0 z-20 space-y-1.5 shadow">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-1">
          <div className="flex items-center gap-1.5 flex-shrink-0">
             <Tooltip>
                <TooltipTrigger asChild>
                     <Button asChild variant="ghost" size="icon" className="h-7 w-7">
                        <Link href="/">
                            <ArrowLeft className="h-3.5 w-3.5" />
                        </Link>
                     </Button>
                </TooltipTrigger>
                <TooltipContent><p>Back to Library</p></TooltipContent>
            </Tooltip>
            <h1 className="text-md font-semibold text-foreground truncate" title={mindmap.name}>
              {mindmap.name}
            </h1>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
             <Tooltip>
                <TooltipTrigger asChild>
                    <Button 
                        variant={activeTool === 'pan' ? "secondary" : "ghost"} 
                        size="icon" 
                        onClick={() => setActiveTool(prev => prev === 'pan' ? 'select' : 'pan')} 
                        className="h-7 w-7"
                    >
                        <Hand className="h-3.5 w-3.5" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent><p>Hand Tool (Pan Canvas)</p></TooltipContent>
            </Tooltip>
             <Tooltip>
                <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={() => handleZoom(1)} className="h-7 w-7">
                        <ZoomIn className="h-3.5 w-3.5" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent><p>Zoom In</p></TooltipContent>
            </Tooltip>
            <Tooltip>
                <TooltipTrigger asChild>
                     <Button variant="ghost" size="icon" onClick={() => handleZoom(-1)} className="h-7 w-7">
                        <ZoomOut className="h-3.5 w-3.5" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent><p>Zoom Out</p></TooltipContent>
            </Tooltip>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={() => handleRecenterView(false)} className="h-7 w-7">
                        <LocateFixed className="h-3.5 w-3.5" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent><p>Recenter View</p></TooltipContent>
            </Tooltip>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={handleExportJson} className="h-7 w-7">
                        <Download className="h-3.5 w-3.5" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent><p>Export JSON</p></TooltipContent>
            </Tooltip>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch gap-1.5 px-1">
          <Input
            type="text"
            value={newRootNodeTitle}
            onChange={(e) => setNewRootNodeTitle(e.target.value)}
            placeholder="New Root Idea Title"
            className="flex-grow h-8 text-xs"
          />
          <Textarea
            value={newRootNodeDescription}
            onChange={(e) => setNewRootNodeDescription(e.target.value)}
            placeholder="Description (Optional)"
            rows={1}
            className="flex-grow text-xs min-h-[32px] h-8 resize-y max-h-20" 
          />
          <Button onClick={handleAddRootNode} size="sm" className="h-8 text-xs whitespace-nowrap px-3">
            <PlusCircle className="mr-1 h-3.5 w-3.5" /> Add Root Idea
          </Button>
        </div>
      </div>

      {/* Main Canvas Area: This is the viewport that clips the content */}
      <div
        ref={viewportContainerRef}
        className={cn(
          "flex-grow relative overflow-hidden bg-muted/30",
          "min-h-[calc(100vh-220px)] sm:min-h-[calc(100vh-200px)]"
        )}
        onMouseDown={handlePanMouseDown} 
        onDragOver={handleDragOver} 
        onDrop={handleDrop}      
      >
        {/* This div is transformed for pan/zoom and holds all nodes and SVG lines */}
        <div
            ref={canvasContentRef}
            className="relative" 
            style={{
                width: CANVAS_CONTENT_WIDTH,
                height: CANVAS_CONTENT_HEIGHT,
                transformOrigin: '0 0',
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                pointerEvents: 'auto', 
            }}
        >
            {/* Render Nodes */}
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

            {/* Render Connecting Lines */}
            <svg
                className="absolute top-0 left-0 pointer-events-none" 
                style={{
                  width: CANVAS_CONTENT_WIDTH,
                  height: CANVAS_CONTENT_HEIGHT,
                  overflow: 'visible', 
                }}
                key={`lines-svg-${allNodes.length}-${scale}-${pan.x}-${pan.y}`}
            >
                {allNodes.map(node => {
                  if (!node.parentId) return null;
                  const parentNode = mindmap.data.nodes[node.parentId];
                  if (!parentNode) return null;

                  const startX = parentNode.x + NODE_CARD_WIDTH / 2;
                  const startY = parentNode.y + NODE_HEADER_HEIGHT + (parentNode.description ? 10 : 0);

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
                      strokeWidth={Math.max(0.5, 2 / scale)}
                      fill="none"
                    />
                  );
                })}
            </svg>

            {allNodes.length === 0 && (
                <div
                  className="absolute flex items-center justify-center pointer-events-none text-center"
                  style={{
                    top: `50%`, 
                    left: `50%`,
                    transform: `translate(calc(-50% - ${pan.x / scale}px), calc(-50% - ${pan.y / scale}px)) scale(${1/scale})`, 
                    width: '300px'
                   }}
                >
                  <div className="text-muted-foreground text-lg bg-background/80 p-6 rounded-md shadow-lg">
                      This mindmap is empty. Add a root idea to get started!
                  </div>
                </div>
            )}
        </div>
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
