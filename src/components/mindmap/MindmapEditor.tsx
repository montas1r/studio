
"use client";

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { Mindmap, NodeData, EditNodeInput, PaletteColorKey } from '@/types/mindmap';
import { useMindmaps } from '@/hooks/useMindmaps';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NodeCard } from './NodeCard';
import { EditNodeDialog } from './EditNodeDialog';
import { PlusCircle, Download, ArrowLeft, Layers, Hand, ZoomIn, ZoomOut, LocateFixed } from 'lucide-react';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

const NODE_CARD_WIDTH = 300; 
const APPROX_NODE_MIN_HEIGHT_NO_DESC = 70;
const APPROX_NODE_MIN_HEIGHT_WITH_DESC_BOX = 100;

// Fixed Viewport Dimensions for the container that centers the canvas
const FIXED_VIEWPORT_WIDTH = 1200;
const FIXED_VIEWPORT_HEIGHT = 800;

// Large Logical Canvas Dimensions (content area)
const CANVAS_CONTENT_WIDTH_STR = '3000px'; // Updated
const CANVAS_CONTENT_HEIGHT_STR = '3000px'; // Updated


interface MindmapEditorProps {
  mindmapId: string;
}

export function MindmapEditor({ mindmapId }: MindmapEditorProps) {
  const { getMindmapById, addNode, updateNode, deleteNode: deleteNodeFromHook, updateNodePosition, getApproxNodeHeight } = useMindmaps();
  const mindmap = getMindmapById(mindmapId);

  const [editingNode, setEditingNode] = useState<NodeData | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [newRootNodeTitle, setNewRootNodeTitle] = useState('');
  const [newRootNodeDescription, setNewRootNodeDescription] = useState('');
  
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [nodeToDelete, setNodeToDelete] = useState<{ id: string; title: string | undefined } | null>(null);

  const { toast } = useToast();

  // State for pan and zoom
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [activeTool, setActiveTool] = useState<'select' | 'pan'>('select');
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [initialViewCentered, setInitialViewCentered] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });


  // Refs for DOM elements
  const viewportContainerRef = useRef<HTMLDivElement>(null); // The 1200x800 fixed viewport
  const canvasContentRef = useRef<HTMLDivElement>(null); // The large, transformable content area

  const canvasNumericWidth = useMemo(() => parseInt(CANVAS_CONTENT_WIDTH_STR, 10), []);
  const canvasNumericHeight = useMemo(() => parseInt(CANVAS_CONTENT_HEIGHT_STR, 10), []);

  const clampPan = useCallback((newPanX: number, newPanY: number, currentScale: number, viewportW: number, viewportH: number) => {
    const scaledContentWidth = canvasNumericWidth * currentScale;
    const scaledContentHeight = canvasNumericHeight * currentScale;

    let clampedX = newPanX;
    let clampedY = newPanY;

    if (scaledContentWidth > viewportW) {
      clampedX = Math.min(0, Math.max(newPanX, viewportW - scaledContentWidth));
    } else { 
      clampedX = Math.max(0, Math.min(newPanX, viewportW - scaledContentWidth));
    }

    if (scaledContentHeight > viewportH) {
      clampedY = Math.min(0, Math.max(newPanY, viewportH - scaledContentHeight));
    } else {
      clampedY = Math.max(0, Math.min(newPanY, viewportH - scaledContentHeight));
    }
    return { x: clampedX, y: clampedY };
  }, [canvasNumericWidth, canvasNumericHeight]);

  const adjustZoom = useCallback((newScaleAttempt: number, clientX?: number, clientY?: number) => {
    if (!viewportContainerRef.current) return;
    const viewportRect = viewportContainerRef.current.getBoundingClientRect();
    const newScale = Math.min(2.0, Math.max(0.25, newScaleAttempt));

    const targetX = clientX !== undefined ? clientX - viewportRect.left : viewportRect.width / 2;
    const targetY = clientY !== undefined ? clientY - viewportRect.top : viewportRect.height / 2;

    const newPanX = targetX - (targetX - pan.x) * (newScale / scale);
    const newPanY = targetY - (targetY - pan.y) * (newScale / scale);
    
    const clamped = clampPan(newPanX, newPanY, newScale, viewportRect.width, viewportRect.height);

    setScale(newScale);
    setPan(clamped);
  }, [scale, pan, clampPan]);
  
  const handleButtonZoomIn = useCallback(() => {
    adjustZoom(scale * 1.2);
  }, [adjustZoom, scale]);

  const handleButtonZoomOut = useCallback(() => {
    adjustZoom(scale / 1.2);
  }, [adjustZoom, scale]);

  const handlePanMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (activeTool !== 'pan' || !viewportContainerRef.current) return;
     if ((event.target as HTMLElement).closest('.node-card-draggable')) {
      return;
    }
    event.preventDefault();
    setIsPanning(true);
    panStartRef.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
    viewportContainerRef.current.style.cursor = 'grabbing';
  }, [activeTool, pan]);

  const handlePanMouseMove = useCallback((event: MouseEvent) => {
    if (!isPanning || !panStartRef.current || !viewportContainerRef.current) return;
    event.preventDefault();
    const dx = event.clientX - panStartRef.current.x;
    const dy = event.clientY - panStartRef.current.y;
    const newPanX = panStartRef.current.panX + dx;
    const newPanY = panStartRef.current.panY + dy;

    const viewportRect = viewportContainerRef.current.getBoundingClientRect();
    const clamped = clampPan(newPanX, newPanY, scale, viewportRect.width, viewportRect.height);
    setPan(clamped);
  }, [isPanning, scale, clampPan]);

  const handlePanMouseUpOrLeave = useCallback(() => {
    if (isPanning) {
      setIsPanning(false);
      if (viewportContainerRef.current) {
        viewportContainerRef.current.style.cursor = activeTool === 'pan' ? 'grab' : 'default';
      }
    }
    panStartRef.current = null;
  }, [isPanning, activeTool]);

  // Touch Panning & Zooming (Basic Implementation)
  const touchStartRef = useRef<{
    dist: number;
    centerX: number;
    centerY: number;
    panX: number;
    panY: number;
    isPinching: boolean;
    lastTouchX?: number;
    lastTouchY?: number;
  } | null>(null);

  const handleTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (!viewportContainerRef.current) return;
    const touches = event.touches;
    if (touches.length === 1 && activeTool === 'pan') {
      if ((event.target as HTMLElement).closest('.node-card-draggable')) return;
      // event.preventDefault(); // Can cause issues with text selection etc. if not careful
      setIsPanning(true);
      touchStartRef.current = { 
        dist: 0, centerX: 0, centerY: 0, isPinching: false,
        panX: pan.x, panY: pan.y,
        lastTouchX: touches[0].clientX,
        lastTouchY: touches[0].clientY,
      };
      viewportContainerRef.current.style.cursor = 'grabbing';
    } else if (touches.length === 2) {
      // event.preventDefault(); // Can cause issues
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const centerX = (touches[0].clientX + touches[1].clientX) / 2;
      const centerY = (touches[0].clientY + touches[1].clientY) / 2;
      touchStartRef.current = { dist, centerX, centerY, panX: pan.x, panY: pan.y, isPinching: true };
    }
  }, [activeTool, pan]);

  const handleTouchMove = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (!touchStartRef.current || !viewportContainerRef.current) return;
    // event.preventDefault(); // Can cause issues
    const touches = event.touches;
    const viewportRect = viewportContainerRef.current.getBoundingClientRect();

    if (touches.length === 1 && isPanning && touchStartRef.current && !touchStartRef.current.isPinching && touchStartRef.current.lastTouchX !== undefined && touchStartRef.current.lastTouchY !== undefined) {
        const dx = touches[0].clientX - touchStartRef.current.lastTouchX;
        const dy = touches[0].clientY - touchStartRef.current.lastTouchY;
        const newPanX = pan.x + dx; // Directly use current pan state
        const newPanY = pan.y + dy; // Directly use current pan state
        const clamped = clampPan(newPanX, newPanY, scale, viewportRect.width, viewportRect.height);
        setPan(clamped); // Update pan state
        touchStartRef.current.lastTouchX = touches[0].clientX;
        touchStartRef.current.lastTouchY = touches[0].clientY;
    } else if (touches.length === 2 && touchStartRef.current.isPinching) {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      const newDist = Math.sqrt(dx * dx + dy * dy);
      
      const newScaleAttempt = scale * (newDist / touchStartRef.current.dist);
      adjustZoom(newScaleAttempt, touchStartRef.current.centerX, touchStartRef.current.centerY);
      
      touchStartRef.current.dist = newDist; 
    }
  }, [isPanning, scale, pan, clampPan, adjustZoom]);

  const handleTouchEnd = useCallback(() => {
    if (isPanning) {
      setIsPanning(false);
      if (viewportContainerRef.current) {
        viewportContainerRef.current.style.cursor = activeTool === 'pan' ? 'grab' : 'default';
      }
    }
    touchStartRef.current = null;
  }, [isPanning, activeTool]);
  
  useEffect(() => {
    if (isPanning) {
      window.addEventListener('mousemove', handlePanMouseMove);
      window.addEventListener('mouseup', handlePanMouseUpOrLeave);
      window.addEventListener('mouseleave', handlePanMouseUpOrLeave);
      return () => {
        window.removeEventListener('mousemove', handlePanMouseMove);
        window.removeEventListener('mouseup', handlePanMouseUpOrLeave);
        window.removeEventListener('mouseleave', handlePanMouseUpOrLeave);
      };
    }
  }, [isPanning, handlePanMouseMove, handlePanMouseUpOrLeave]);


  const handleRecenterView = useCallback(() => {
    if (!viewportContainerRef.current || !mindmap) return;
    const viewportRect = viewportContainerRef.current.getBoundingClientRect();
    const allNodesArray = Object.values(mindmap.data.nodes);

    if (allNodesArray.length === 0) {
        const targetScale = 1;
        const newPanX = (viewportRect.width - canvasNumericWidth * targetScale) / 2;
        const newPanY = (viewportRect.height - canvasNumericHeight * targetScale) / 2;
        const clamped = clampPan(newPanX, newPanY, targetScale, viewportRect.width, viewportRect.height);
        setScale(targetScale);
        setPan(clamped);
        return;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    allNodesArray.forEach(node => {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + NODE_CARD_WIDTH); // Assuming fixed width for bounding box calculation
      maxY = Math.max(maxY, node.y + getApproxNodeHeight(node));
    });

    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;

    if (contentWidth <= 0 || contentHeight <= 0) { 
        const targetScale = 1;
        const node = allNodesArray[0];
        const nodeCenterX = node.x + NODE_CARD_WIDTH / 2;
        const nodeCenterY = node.y + getApproxNodeHeight(node) / 2;

        const newPanX = viewportRect.width / 2 - nodeCenterX * targetScale;
        const newPanY = viewportRect.height / 2 - nodeCenterY * targetScale;
        const clamped = clampPan(newPanX, newPanY, targetScale, viewportRect.width, viewportRect.height);
        setScale(targetScale);
        setPan(clamped);
        return;
    }
    
    const padding = 50; 
    const scaleX = (viewportRect.width - 2 * padding) / contentWidth;
    const scaleY = (viewportRect.height - 2 * padding) / contentHeight;
    const newScale = Math.min(2.0, Math.max(0.25, Math.min(scaleX, scaleY)));

    const contentCenterX = minX + contentWidth / 2;
    const contentCenterY = minY + contentHeight / 2;

    const newPanX = viewportRect.width / 2 - contentCenterX * newScale;
    const newPanY = viewportRect.height / 2 - contentCenterY * newScale;
    const clamped = clampPan(newPanX, newPanY, newScale, viewportRect.width, viewportRect.height);

    setScale(newScale);
    setPan(clamped);

  }, [mindmap, getApproxNodeHeight, clampPan, canvasNumericWidth, canvasNumericHeight]);


  useEffect(() => {
    if (mindmap && !initialViewCentered) {
      handleRecenterView();
      setInitialViewCentered(true);
    }
  }, [mindmap, initialViewCentered, handleRecenterView]);


  const handleAddRootNode = useCallback(async () => {
    if (newRootNodeTitle.trim() === '') {
      toast({ title: "Title Required", description: "Please enter a title for the new root node.", variant: "destructive" });
      return;
    }
    if (!mindmap || !viewportContainerRef.current) return;

    const defaultEmoji = '💡';
    const newNodeDetails: EditNodeInput = {
      title: newRootNodeTitle,
      description: newRootNodeDescription,
      emoji: defaultEmoji,
      customBackgroundColor: undefined,
    };
    
    // Center new root node in the current view
    const viewportRect = viewportContainerRef.current.getBoundingClientRect();
    const initialX_logical = (viewportRect.width / 2 - pan.x) / scale - NODE_CARD_WIDTH / 2;
    const initialY_logical = (viewportRect.height / 2 - pan.y) / scale - APPROX_NODE_MIN_HEIGHT_NO_DESC / 2;


    const newRootNode = addNode(mindmap.id, null, newNodeDetails, initialX_logical, initialY_logical);
    if (newRootNode) {
      setNewRootNodeTitle('');
      setNewRootNodeDescription('');
      toast({ title: "Root Node Added", description: `"${newRootNode.title}" added.` });
      
      // Pan view to the new node
      const nodeCenterX = newRootNode.x + NODE_CARD_WIDTH / 2;
      const nodeCenterY = newRootNode.y + getApproxNodeHeight(newRootNode) / 2;
      const newPanX = viewportRect.width / 2 - nodeCenterX * scale;
      const newPanY = viewportRect.height / 2 - nodeCenterY * scale;
      const clamped = clampPan(newPanX, newPanY, scale, viewportRect.width, viewportRect.height);
      setPan(clamped);
    }
  }, [newRootNodeTitle, newRootNodeDescription, mindmap, addNode, toast, getApproxNodeHeight, pan, scale, clampPan]);

  const handleAddChildNode = useCallback((parentId: string) => {
    if (!mindmap) return;
    const parentNode = mindmap.data.nodes[parentId];
    if (!parentNode) return;

    const parentHeight = getApproxNodeHeight(parentNode);
    const initialX = (parentNode.x ?? 0); 
    const initialY = (parentNode.y ?? 0) + parentHeight + 50; 

    const tempNewNode: NodeData = {
      id: `temp-${uuidv4()}`,
      title: '',
      description: "",
      emoji: "➕",
      parentId: parentId,
      childIds: [],
      x: initialX, 
      y: initialY, 
      customBackgroundColor: parentNode.customBackgroundColor,
    };
    setEditingNode(tempNewNode);
    setIsEditDialogOpen(true);
  }, [mindmap, getApproxNodeHeight]);

  const handleEditNode = useCallback((node: NodeData) => {
    setEditingNode(node);
    setIsEditDialogOpen(true);
  }, []);

  const handleSaveNode = useCallback((nodeId: string, data: EditNodeInput) => {
    if (!mindmap || !editingNode) return;

    const finalData: EditNodeInput = {
      title: data.title,
      description: data.description,
      emoji: data.emoji,
      customBackgroundColor: data.customBackgroundColor === 'no-custom-color' ? undefined : data.customBackgroundColor,
    };

    let finalX = editingNode.x ?? 0;
    let finalY = editingNode.y ?? 0;

    if (editingNode.id.startsWith('temp-')) {
      const permanentNode = addNode(mindmap.id, editingNode.parentId, finalData, finalX, finalY); 
      if (permanentNode) {
        toast({ title: "Node Created", description: `Node "${permanentNode.title}" added.` });
      }
    } else {
      updateNode(mindmap.id, editingNode.id, finalData);
      updateNodePosition(mindmap.id, editingNode.id, finalX, finalY); 
      toast({ title: "Node Updated", description: `Node "${data.title}" saved.` });
    }
    setEditingNode(null);
    setIsEditDialogOpen(false);
  }, [mindmap, editingNode, addNode, updateNode, updateNodePosition, toast]);

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
    if (activeTool === 'pan') {
      event.preventDefault();
      return;
    }
    const nodeElement = event.currentTarget;
    const nodeRect = nodeElement.getBoundingClientRect();
    
    const logicalDragOffsetX = (event.clientX - nodeRect.left) / scale;
    const logicalDragOffsetY = (event.clientY - nodeRect.top) / scale;
    
    event.dataTransfer.setData('application/json', JSON.stringify({
      nodeId,
      logicalDragOffsetX, 
      logicalDragOffsetY,
    }));
    event.dataTransfer.effectAllowed = "move";
  }, [activeTool, scale]);


  const handleDragOverCanvas = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const handleDropOnCanvas = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!viewportContainerRef.current || !mindmap) return;

    let dragData;
    try {
      const jsonData = event.dataTransfer.getData('application/json');
      if (!jsonData) return;
      dragData = JSON.parse(jsonData);
    } catch (e) {
      console.error("Could not parse drag data:", e); return;
    }

    const { nodeId, logicalDragOffsetX, logicalDragOffsetY } = dragData;
    if (!nodeId || logicalDragOffsetX === undefined || logicalDragOffsetY === undefined) {
      console.error("Invalid drag data received:", dragData); return;
    }

    const viewportRect = viewportContainerRef.current.getBoundingClientRect();
    
    let newX_logical = (event.clientX - viewportRect.left - pan.x) / scale - logicalDragOffsetX;
    let newY_logical = (event.clientY - viewportRect.top - pan.y) / scale - logicalDragOffsetY;

    const nodeHeight = getApproxNodeHeight(mindmap.data.nodes[nodeId]);
    newX_logical = Math.max(0, Math.min(newX_logical, canvasNumericWidth - NODE_CARD_WIDTH));
    newY_logical = Math.max(0, Math.min(newY_logical, canvasNumericHeight - nodeHeight));


    updateNodePosition(mindmap.id, nodeId, newX_logical, newY_logical);
  }, [mindmap, updateNodePosition, pan, scale, canvasNumericWidth, canvasNumericHeight, getApproxNodeHeight]);


  const handleExportJson = useCallback(() => {
    if (!mindmap) return;
    const jsonString = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(mindmap, null, 2));
    const link = document.createElement("a");
    link.href = jsonString;
    link.download = `${mindmap.name.replace(/\s+/g, '_').toLowerCase()}_mindmap.json`;
    link.click();
    toast({ title: "Exported", description: "Mindmap data exported as JSON." });
  }, [mindmap, toast]);

  useEffect(() => {
    const vp = viewportContainerRef.current;
    // Mouse wheel zoom is removed
    return () => {
      // No wheel listener to remove
    };
  }, []);

  if (!mindmap) {
    return (
      <div className="flex flex-col items-center justify-center h-full flex-grow space-y-4 text-center py-10">
        <Layers className="w-16 h-16 text-destructive" />
        <h2 className="text-2xl font-bold">Mindmap Not Found</h2>
        <p className="text-muted-foreground">The mindmap you are looking for does not exist or has been deleted.</p>
        <Button asChild variant="outline" size="sm">
          <Link href="/"><ArrowLeft className="mr-1.5 h-4 w-4" /> Library</Link>
        </Button>
      </div>
    );
  }

  const allNodes = Object.values(mindmap.data.nodes);
  const svgKey = allNodes.map(n => `${n.id}-${n.x}-${n.y}-${n.parentId}-${(n.childIds || []).join(',')}-${scale}-${pan.x}-${pan.y}`).join('|');

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full flex-grow w-full">
        {/* Top Control Bar */}
        <div className="p-2 border-b bg-background/90 backdrop-blur-sm space-y-2 flex-shrink-0 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <div className="flex items-center gap-2 flex-shrink-0 min-w-0">
                    <Tooltip>
                        <TooltipTrigger asChild>
                        <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                            <Link href="/">
                            <ArrowLeft className="h-4 w-4" />
                            <span className="sr-only">Library</span>
                            </Link>
                        </Button>
                        </TooltipTrigger>
                        <TooltipContent><p>Library</p></TooltipContent>
                    </Tooltip>
                    <h1 className="text-lg font-semibold text-foreground truncate leading-none" title={mindmap.name}>
                        {mindmap.name}
                    </h1>
                    {mindmap.category && (
                        <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full flex items-center gap-1 whitespace-nowrap leading-none">
                        <Layers className="h-3 w-3" /> {mindmap.category}
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Tools */}
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={() => setActiveTool(prev => prev === 'pan' ? 'select' : 'pan')} 
                                    className={cn("h-8 w-8", activeTool === 'pan' && "bg-accent text-accent-foreground hover:bg-accent/90")}>
                                <Hand className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent><p>Pan Tool (Spacebar to toggle)</p></TooltipContent>
                    </Tooltip>
                     <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={handleButtonZoomIn} className="h-8 w-8">
                                <ZoomIn className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent><p>Zoom In</p></TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                             <Button variant="ghost" size="icon" onClick={handleButtonZoomOut} className="h-8 w-8">
                                <ZoomOut className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent><p>Zoom Out</p></TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={handleRecenterView} className="h-8 w-8">
                                <LocateFixed className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent><p>Recenter View</p></TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" onClick={handleExportJson} className="h-8 w-8">
                            <Download className="h-4 w-4" />
                        </Button>
                        </TooltipTrigger>
                        <TooltipContent><p>Export JSON</p></TooltipContent>
                    </Tooltip>
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
                  className="flex-grow text-sm min-h-[36px] h-9 resize-y max-h-24"
                />
                <Button onClick={handleAddRootNode} size="sm" className="h-9 text-sm whitespace-nowrap px-3">
                  <PlusCircle className="mr-1.5 h-4 w-4" /> Add Root Idea
                </Button>
            </div>
        </div>

        {/* Centering Wrapper for the Fixed Viewport */}
        <div className="flex-grow flex items-center justify-center p-4 bg-muted/20">
          <div
            ref={viewportContainerRef}
            className="relative shadow-2xl rounded-lg bg-card" 
            style={{
              width: `${FIXED_VIEWPORT_WIDTH}px`,
              height: `${FIXED_VIEWPORT_HEIGHT}px`,
              overflow: 'hidden',
              cursor: activeTool === 'pan' ? (isPanning ? 'grabbing' : 'grab') : 'default',
            }}
            onMouseDown={handlePanMouseDown}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div
              ref={canvasContentRef} 
              style={{
                width: CANVAS_CONTENT_WIDTH_STR,
                height: CANVAS_CONTENT_HEIGHT_STR,
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                transformOrigin: '0 0',
                pointerEvents: 'auto', 
              }}
              onDragOver={handleDragOverCanvas}
              onDrop={handleDropOnCanvas}
            >
              <svg
                className="absolute top-0 left-0 pointer-events-none"
                style={{
                  width: CANVAS_CONTENT_WIDTH_STR, 
                  height: CANVAS_CONTENT_HEIGHT_STR,
                  overflow: 'visible', 
                }}
                key={svgKey} 
              >
                {allNodes.map(node => {
                  if (!node.parentId) return null;
                  const parentNode = mindmap.data.nodes[node.parentId];
                  if (!parentNode) return null;

                  const parentCardCenterX = (parentNode.x ?? 0) + NODE_CARD_WIDTH / 2;
                  const parentCardBottomY = (parentNode.y ?? 0) + getApproxNodeHeight(parentNode) -10; // Approx bottom of header
                  
                  const childCardCenterX = (node.x ?? 0) + NODE_CARD_WIDTH / 2;
                  const childCardTopY = (node.y ?? 0) + 10; // Approx top of header

                  const c1x = parentCardCenterX;
                  const c1y = parentCardBottomY + Math.max(30, Math.abs(childCardTopY - parentCardBottomY) / 2);
                  const c2x = childCardCenterX;
                  const c2y = childCardTopY - Math.max(30, Math.abs(childCardTopY - parentCardBottomY) / 2);

                  const pathData = `M ${parentCardCenterX} ${parentCardBottomY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${childCardCenterX} ${childCardTopY}`;
                  
                  let strokeColor = "hsl(var(--muted-foreground))"; 
                  if (parentNode.customBackgroundColor) {
                      strokeColor = `hsl(var(--${parentNode.customBackgroundColor}))`;
                  } else if (!parentNode.parentId) { 
                      strokeColor = "hsl(var(--primary))";
                  } else { 
                      strokeColor = "hsl(var(--accent))";
                  }

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

              {allNodes.map((node) => (
                <NodeCard
                  key={node.id}
                  node={node}
                  isRoot={!node.parentId}
                  onEdit={handleEditNode}
                  onDelete={requestDeleteNode}
                  onAddChild={handleAddChildNode}
                  onDragStart={handleNodeDragStart}
                  className="node-card-draggable" 
                />
              ))}

              {allNodes.length === 0 && (
                 <div
                  className="absolute inset-0 flex items-center justify-center pointer-events-none text-center"
                  style={{ 
                    top: '50%', 
                    left: '50%', 
                    transform: `translate(-50%, -50%) scale(${1 / scale})`, // Counter-scale the message
                    transformOrigin: 'center center',
                  }}
                >
                  <div className="text-muted-foreground text-lg bg-background/80 p-6 rounded-md shadow-lg">
                    This mindmap is empty. Add a root idea to get started!
                  </div>
                </div>
              )}
            </div> 
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
                <AlertDialogCancel onClick={() => { setIsDeleteDialogOpen(false); setNodeToDelete(null);}}>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={confirmDeleteNode} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </TooltipProvider>
  );
}
