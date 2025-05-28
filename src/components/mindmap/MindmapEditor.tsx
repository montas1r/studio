
"use client";

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { Mindmap, NodeData, EditNodeInput, PaletteColorKey } from '@/types/mindmap';
import { useMindmaps } from '@/hooks/useMindmaps';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NodeCard } from './NodeCard';
import { EditNodeDialog } from './EditNodeDialog';
import { PlusCircle, Download, ArrowLeft, Home, Layers, ZoomIn, ZoomOut, LocateFixed, Hand } from 'lucide-react';
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
const APPROX_LINE_HEIGHT = 18;
const MIN_DESC_LINES_FOR_TALL_NODE = 2;
const APPROX_NODE_MIN_HEIGHT_WITH_DESC_SHORT = APPROX_NODE_MIN_HEIGHT_NO_DESC + APPROX_LINE_HEIGHT * 1 + 20;
const APPROX_NODE_MIN_HEIGHT_WITH_DESC_TALL = APPROX_NODE_MIN_HEIGHT_NO_DESC + APPROX_LINE_HEIGHT * MIN_DESC_LINES_FOR_TALL_NODE + 20;


const CANVAS_CONTENT_WIDTH_STR = '1200px';
const CANVAS_CONTENT_HEIGHT_STR = '1200px';

const MIN_SCALE = 0.25;
const MAX_SCALE = 2.0;
const ZOOM_SENSITIVITY = 0.1; // Determines how much each wheel tick/button click zooms

interface MindmapEditorProps {
  mindmapId: string;
}

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
  const canvasContentRef = useRef<HTMLDivElement>(null);
  
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ mouseX: number; mouseY: number; initialPanX: number; initialPanY: number } | null>(null);
  const pinchStateRef = useRef<{ initialDistance: number; initialScale: number; initialPan: {x: number; y: number}, midPoint: {x:number; y:number} } | null>(null);
  const [initialViewCentered, setInitialViewCentered] = useState(false);
  const [activeTool, setActiveTool] = useState<'select' | 'pan'>('select');


  const canvasNumericWidth = useMemo(() => parseInt(CANVAS_CONTENT_WIDTH_STR, 10), []);
  const canvasNumericHeight = useMemo(() => parseInt(CANVAS_CONTENT_HEIGHT_STR, 10), []);

  const getNodeHeight = useCallback((node: NodeData | null): number => {
    if (!node) return APPROX_NODE_MIN_HEIGHT_NO_DESC;
    if (!node.description) return APPROX_NODE_MIN_HEIGHT_NO_DESC;
    const lineCount = node.description.split('\n').length;
    if (lineCount >= MIN_DESC_LINES_FOR_TALL_NODE) {
      return APPROX_NODE_MIN_HEIGHT_WITH_DESC_TALL;
    }
    return APPROX_NODE_MIN_HEIGHT_WITH_DESC_SHORT;
  }, []);

  const clampPan = useCallback((newPanX: number, newPanY: number, currentScale: number, viewportWidth: number, viewportHeight: number) => {
    const scaledCanvasWidth = canvasNumericWidth * currentScale;
    const scaledCanvasHeight = canvasNumericHeight * currentScale;
    let finalPanX = newPanX;
    let finalPanY = newPanY;

    if (scaledCanvasWidth > viewportWidth) {
      finalPanX = Math.min(0, Math.max(newPanX, viewportWidth - scaledCanvasWidth));
    } else {
      finalPanX = Math.max(0, Math.min(newPanX, viewportWidth - scaledCanvasWidth));
    }

    if (scaledCanvasHeight > viewportHeight) {
      finalPanY = Math.min(0, Math.max(newPanY, viewportHeight - scaledCanvasHeight));
    } else {
      finalPanY = Math.max(0, Math.min(newPanY, viewportHeight - scaledCanvasHeight));
    }
    return { x: finalPanX, y: finalPanY };
  }, [canvasNumericWidth, canvasNumericHeight]);

  const adjustZoom = useCallback((zoomIncrement: number, focalX_viewport?: number, focalY_viewport?: number) => {
    if (!zoomPanContainerRef.current) return;
    
    const newScaleUnclamped = scale + zoomIncrement;
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScaleUnclamped));
    
    const viewportRect = zoomPanContainerRef.current.getBoundingClientRect();
    const targetX = focalX_viewport ?? viewportRect.width / 2;
    const targetY = focalY_viewport ?? viewportRect.height / 2;

    const logicalX_before = (targetX - pan.x) / scale;
    const logicalY_before = (targetY - pan.y) / scale;

    let newPanX = targetX - logicalX_before * newScale;
    let newPanY = targetY - logicalY_before * newScale;

    const clamped = clampPan(newPanX, newPanY, newScale, viewportRect.width, viewportRect.height);
    
    setScale(newScale);
    setPan(clamped);
  }, [pan, scale, clampPan]);

  const handleRecenterView = useCallback(() => {
    if (!mindmap || !zoomPanContainerRef.current) {
      setScale(1);
      setPan({ x: 0, y: 0 });
      return;
    }
    const allNodesArray = Object.values(mindmap.data.nodes);
    const viewportRect = zoomPanContainerRef.current.getBoundingClientRect();

    if (allNodesArray.length === 0) {
      const newScale = 1;
      const newPanX = (viewportRect.width - canvasNumericWidth * newScale) / 2;
      const newPanY = (viewportRect.height - canvasNumericHeight * newScale) / 2;
      const clamped = clampPan(newPanX, newPanY, newScale, viewportRect.width, viewportRect.height);
      setScale(newScale);
      setPan(clamped);
      return;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    allNodesArray.forEach(node => {
      const nodeHeight = getNodeHeight(node);
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + NODE_CARD_WIDTH);
      maxY = Math.max(maxY, node.y + nodeHeight);
    });

    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    
    if (contentWidth <= 0 || contentHeight <= 0) { // Handle single node or empty
        const newScale = 1;
        const contentCenterX = allNodesArray.length > 0 ? allNodesArray[0].x + NODE_CARD_WIDTH / 2 : canvasNumericWidth / 2;
        const contentCenterY = allNodesArray.length > 0 ? allNodesArray[0].y + getNodeHeight(allNodesArray[0]) / 2 : canvasNumericHeight / 2;
        
        let newPanX = (viewportRect.width / 2) - (contentCenterX * newScale);
        let newPanY = (viewportRect.height / 2) - (contentCenterY * newScale);
        
        const clamped = clampPan(newPanX, newPanY, newScale, viewportRect.width, viewportRect.height);
        setScale(newScale);
        setPan(clamped);
        return;
    }
    
    const padding = 50; 
    const newScaleX = (viewportRect.width - 2 * padding) / contentWidth;
    const newScaleY = (viewportRect.height - 2 * padding) / contentHeight;
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min(newScaleX, newScaleY)));
    
    const contentCenterX_logical = minX + contentWidth / 2;
    const contentCenterY_logical = minY + contentHeight / 2;

    let newPanX = (viewportRect.width / 2) - (contentCenterX_logical * newScale);
    let newPanY = (viewportRect.height / 2) - (contentCenterY_logical * newScale);
    
    const clamped = clampPan(newPanX, newPanY, newScale, viewportRect.width, viewportRect.height);
    setScale(newScale);
    setPan(clamped);
  }, [mindmap, getNodeHeight, canvasNumericWidth, canvasNumericHeight, clampPan]);

  const handleAddRootNode = useCallback(async () => {
    if (newRootNodeTitle.trim() === '') {
      toast({ title: "Title Required", description: "Please enter a title for the new root node.", variant: "destructive" });
      return;
    }
    if (!mindmap || !zoomPanContainerRef.current) return;

    const defaultEmoji = '💡';
    const newNodeData: EditNodeInput = {
      title: newRootNodeTitle,
      description: newRootNodeDescription,
      emoji: defaultEmoji,
    };

    const newNode = addNode(mindmap.id, null, newNodeData);
    if (newNode) {
      setNewRootNodeTitle('');
      setNewRootNodeDescription('');
      toast({ title: "Root Node Added", description: `"${newNode.title}" added to the mindmap.` });
      
      const viewportRect = zoomPanContainerRef.current.getBoundingClientRect();
      const nodeCenterX_logical = newNode.x + NODE_CARD_WIDTH / 2;
      const nodeCenterY_logical = newNode.y + getNodeHeight(newNode) / 2;
      
      let newPanX = (viewportRect.width / 2) - (nodeCenterX_logical * scale);
      let newPanY = (viewportRect.height / 2) - (nodeCenterY_logical * scale);
      
      const clamped = clampPan(newPanX, newPanY, scale, viewportRect.width, viewportRect.height);
      setPan(clamped);
    }
  }, [newRootNodeTitle, newRootNodeDescription, mindmap, addNode, toast, scale, getNodeHeight, clampPan]);


  useEffect(() => {
    if (mindmap && !initialViewCentered) {
      handleRecenterView();
      setInitialViewCentered(true);
    }
  }, [mindmapId, mindmap, initialViewCentered, handleRecenterView]);


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
      x: (parentNode.x ?? 0) + NODE_CARD_WIDTH + 30, 
      y: (parentNode.y ?? 0), 
      customBackgroundColor: undefined, // Added to satisfy NodeData type
      // imageUrl: undefined, // Removed as per V1.0.2
    };
    setEditingNode(tempNewNode);
    setIsEditDialogOpen(true);
  }, [mindmap]);

  const handleEditNode = useCallback((node: NodeData) => {
    setEditingNode(node);
    setIsEditDialogOpen(true);
  }, []);

  const handleSaveNode = useCallback((nodeId: string, data: EditNodeInput & { customBackgroundColor?: PaletteColorKey | '' }) => {
    if (!mindmap || !editingNode) return;

    const finalData = {
      title: data.title,
      description: data.description,
      emoji: data.emoji,
      customBackgroundColor: data.customBackgroundColor === '' ? undefined : data.customBackgroundColor,
      // imageUrl: data.imageUrl // Removed as per V1.0.2
    };

    if (editingNode.id.startsWith('temp-')) {
      const permanentNode = addNode(mindmap.id, editingNode.parentId, finalData, editingNode.x, editingNode.y); 
      if (permanentNode) {
        toast({ title: "Node Created", description: `Node "${permanentNode.title}" added.` });
      }
    } else {
      updateNode(mindmap.id, editingNode.id, finalData);
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
    if (activeTool === 'pan') {
      event.preventDefault();
      return;
    }
    if (!zoomPanContainerRef.current) return;
    const nodeElement = event.currentTarget;
    const nodeRect = nodeElement.getBoundingClientRect();
    
    const logicalOffsetX = (event.clientX - nodeRect.left) / scale;
    const logicalOffsetY = (event.clientY - nodeRect.top) / scale;
    
    event.dataTransfer.setData('application/json', JSON.stringify({
      nodeId,
      dragOffsetLogX: logicalOffsetX, 
      dragOffsetLogY: logicalOffsetY,
    }));
    event.dataTransfer.effectAllowed = "move";
  }, [scale, activeTool]);


  const handleDragOverCanvas = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const handleDropOnCanvas = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!zoomPanContainerRef.current || !mindmap) return;

    let dragData;
    try {
      dragData = JSON.parse(event.dataTransfer.getData('application/json'));
    } catch (e) {
      console.error("Could not parse drag data:", e);
      return;
    }

    const { nodeId, dragOffsetLogX, dragOffsetLogY } = dragData;
    if (!nodeId || dragOffsetLogX === undefined || dragOffsetLogY === undefined) {
      console.error("Invalid drag data received:", dragData);
      return;
    }

    const viewportRect = zoomPanContainerRef.current.getBoundingClientRect();
    const mouseXInViewport = event.clientX - viewportRect.left;
    const mouseYInViewport = event.clientY - viewportRect.top;

    let newX_logical = (mouseXInViewport - pan.x) / scale - dragOffsetLogX;
    let newY_logical = (mouseYInViewport - pan.y) / scale - dragOffsetLogY;
    
    const nodeToUpdate = mindmap.data.nodes[nodeId];
    const nodeHeight = getNodeHeight(nodeToUpdate);
    newX_logical = Math.max(0, Math.min(newX_logical, canvasNumericWidth - NODE_CARD_WIDTH));
    newY_logical = Math.max(0, Math.min(newY_logical, canvasNumericHeight - nodeHeight));

    updateNodePosition(mindmap.id, nodeId, newX_logical, newY_logical);
  }, [mindmap, updateNodePosition, pan, scale, canvasNumericWidth, canvasNumericHeight, getNodeHeight]);

  const handleExportJson = useCallback(() => {
    if (!mindmap) return;
    const jsonString = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(mindmap, null, 2));
    const link = document.createElement("a");
    link.href = jsonString;
    link.download = `${mindmap.name.replace(/\s+/g, '_').toLowerCase()}_mindmap.json`;
    link.click();
    toast({ title: "Exported", description: "Mindmap data exported as JSON." });
  }, [mindmap, toast]);

  const handleButtonZoomIn = useCallback(() => adjustZoom(ZOOM_SENSITIVITY * 2), [adjustZoom]);
  const handleButtonZoomOut = useCallback(() => adjustZoom(-ZOOM_SENSITIVITY * 2), [adjustZoom]);

  // Pan with Hand Tool
  const handlePanMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (activeTool !== 'pan' || (event.target as HTMLElement).closest('.node-card-draggable')) {
      return;
    }
    event.preventDefault();
    setIsPanning(true);
    panStartRef.current = {
      mouseX: event.clientX,
      mouseY: event.clientY,
      initialPanX: pan.x,
      initialPanY: pan.y,
    };
  }, [activeTool, pan]);

  const handlePanMouseMove = useCallback((event: MouseEvent) => {
    if (!isPanning || !panStartRef.current || !zoomPanContainerRef.current) return;
    event.preventDefault();

    const dx = event.clientX - panStartRef.current.mouseX;
    const dy = event.clientY - panStartRef.current.mouseY;
    
    const newPanX = panStartRef.current.initialPanX + dx;
    const newPanY = panStartRef.current.initialPanY + dy;
    
    const viewportRect = zoomPanContainerRef.current.getBoundingClientRect();
    const clamped = clampPan(newPanX, newPanY, scale, viewportRect.width, viewportRect.height);
    setPan(clamped);
  }, [isPanning, scale, clampPan]);

  const handlePanMouseUpOrLeave = useCallback(() => {
    if (isPanning) {
      setIsPanning(false);
      panStartRef.current = null;
    }
  }, [isPanning]);

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
  
  // Cursor style for panning
  useEffect(() => {
    const container = zoomPanContainerRef.current;
    if (container) {
      if (activeTool === 'pan') {
        container.style.cursor = isPanning ? 'grabbing' : 'grab';
      } else {
        container.style.cursor = 'default';
      }
    }
  }, [activeTool, isPanning]);


  // Pinch-to-zoom handlers (Desktop mouse wheel zoom removed as per focus on Hand tool first)
  const handleTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 2) {
      event.preventDefault();
      const t1 = event.touches[0];
      const t2 = event.touches[1];
      const distance = Math.sqrt(Math.pow(t2.clientX - t1.clientX, 2) + Math.pow(t2.clientY - t1.clientY, 2));
      const midPoint = {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2,
      };
      pinchStateRef.current = { initialDistance: distance, initialScale: scale, initialPan: { ...pan }, midPoint };
    } else if (event.touches.length === 1 && activeTool === 'pan' && zoomPanContainerRef.current) {
       // One-finger pan
       if ((event.target as HTMLElement).closest('.node-card-draggable')) return;
       event.preventDefault();
       setIsPanning(true);
       panStartRef.current = {
         mouseX: event.touches[0].clientX,
         mouseY: event.touches[0].clientY,
         initialPanX: pan.x,
         initialPanY: pan.y,
       };
    }
  }, [scale, pan, activeTool]);

  const handleTouchMove = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 2 && pinchStateRef.current && zoomPanContainerRef.current) {
      event.preventDefault();
      const t1 = event.touches[0];
      const t2 = event.touches[1];
      const currentDistance = Math.sqrt(Math.pow(t2.clientX - t1.clientX, 2) + Math.pow(t2.clientY - t1.clientY, 2));
      const scaleDelta = currentDistance / pinchStateRef.current.initialDistance;
      const newScaleUnclamped = pinchStateRef.current.initialScale * scaleDelta;
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScaleUnclamped));

      const viewportRect = zoomPanContainerRef.current.getBoundingClientRect();
      const pinchMidPointViewport = {
        x: pinchStateRef.current.midPoint.x - viewportRect.left,
        y: pinchStateRef.current.midPoint.y - viewportRect.top,
      };
      
      const logicalX = (pinchMidPointViewport.x - pinchStateRef.current.initialPan.x) / pinchStateRef.current.initialScale;
      const logicalY = (pinchMidPointViewport.y - pinchStateRef.current.initialPan.y) / pinchStateRef.current.initialScale;

      let newPanX = pinchMidPointViewport.x - logicalX * newScale;
      let newPanY = pinchMidPointViewport.y - logicalY * newScale;
      
      const clamped = clampPan(newPanX, newPanY, newScale, viewportRect.width, viewportRect.height);
      setScale(newScale);
      setPan(clamped);
    } else if (event.touches.length === 1 && isPanning && panStartRef.current && zoomPanContainerRef.current) {
        // One-finger pan
        event.preventDefault();
        const dx = event.touches[0].clientX - panStartRef.current.mouseX;
        const dy = event.touches[0].clientY - panStartRef.current.mouseY;
        
        const newPanX = panStartRef.current.initialPanX + dx;
        const newPanY = panStartRef.current.initialPanY + dy;
        
        const viewportRect = zoomPanContainerRef.current.getBoundingClientRect();
        const clamped = clampPan(newPanX, newPanY, scale, viewportRect.width, viewportRect.height);
        setPan(clamped);
    }
  }, [isPanning, scale, clampPan]);

  const handleTouchEnd = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length < 2) {
      pinchStateRef.current = null;
    }
    if (event.touches.length < 1 && isPanning) {
        setIsPanning(false);
        panStartRef.current = null;
    }
  }, [isPanning]);


  if (!mindmap) {
    return (
      <div className="flex flex-col items-center justify-center h-full flex-grow space-y-4 text-center py-10">
        <Layers className="w-16 h-16 text-destructive" />
        <h2 className="text-2xl font-bold">Mindmap Not Found</h2>
        <p className="text-muted-foreground">The mindmap you are looking for does not exist or has been deleted.</p>
        <Button asChild variant="outline" size="sm">
          <Link href="/"><Home className="mr-1.5 h-4 w-4" /> Library</Link>
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
        <div className="p-2 border-b bg-background/90 backdrop-blur-sm space-y-2 flex-shrink-0">
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
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            className={cn("h-8 w-8", activeTool === 'pan' && "bg-accent text-accent-foreground hover:bg-accent/90")}
                            onClick={() => setActiveTool(prev => prev === 'pan' ? 'select' : 'pan')}
                        >
                            <Hand className="h-4 w-4" />
                            <span className="sr-only">Toggle Pan Tool</span>
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent><p>Pan Tool (P)</p></TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" onClick={handleButtonZoomIn} className="h-8 w-8">
                            <ZoomIn className="h-4 w-4" />
                            <span className="sr-only">Zoom In</span>
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent><p>Zoom In</p></TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" onClick={handleButtonZoomOut} className="h-8 w-8">
                            <ZoomOut className="h-4 w-4" />
                            <span className="sr-only">Zoom Out</span>
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent><p>Zoom Out</p></TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" onClick={handleRecenterView} className="h-8 w-8">
                            <LocateFixed className="h-4 w-4" />
                            <span className="sr-only">Recenter View</span>
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent><p>Recenter View</p></TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={handleExportJson} className="h-8 w-8">
                        <Download className="h-4 w-4" />
                        <span className="sr-only">Export JSON</span>
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

        {/* Main Canvas Area */}
        <div
          ref={zoomPanContainerRef}
          className="flex-grow relative overflow-hidden bg-muted/20"
          onMouseDown={handlePanMouseDown}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{ touchAction: 'none' }} // Prevents browser default touch actions like scroll, especially for pinch/pan
        >
          <div
            ref={canvasContentRef}
            className="relative" // No border here, border is on zoomPanContainerRef or none
            onDragOver={handleDragOverCanvas}
            onDrop={handleDropOnCanvas}
            style={{
              width: CANVAS_CONTENT_WIDTH_STR,
              height: CANVAS_CONTENT_HEIGHT_STR,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
              transformOrigin: '0 0',
              pointerEvents: 'auto', // Ensure interactions on the content itself
            }}
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

                const startX = (parentNode.x ?? 0) + NODE_CARD_WIDTH / 2;
                const startY = (parentNode.y ?? 0) + getNodeHeight(parentNode) / 2;
                const endX = (node.x ?? 0) + NODE_CARD_WIDTH / 2;
                const endY = (node.y ?? 0) + getNodeHeight(node) / 2;

                const c1x = startX;
                const c1y = startY + Math.max(30, Math.abs(endY - startY) / 2.5);
                const c2x = endX;
                const c2y = endY - Math.max(30, Math.abs(endY - startY) / 2.5);
                const pathData = `M ${startX} ${startY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${endX} ${endY}`;

                let strokeColor = "hsl(var(--muted-foreground))";
                if (parentNode.customBackgroundColor) {
                    strokeColor = `hsl(var(--${parentNode.customBackgroundColor}-raw, var(--${parentNode.customBackgroundColor})))`;
                } else if (parentNode.parentId === null) { 
                    strokeColor = "hsl(var(--primary))";
                } else { 
                    strokeColor = "hsl(var(--accent))";
                }

                return (
                  <path
                    key={`${parentNode.id}-${node.id}`}
                    d={pathData}
                    stroke={strokeColor}
                    strokeWidth={Math.max(1, 2 / scale)} 
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
                className="absolute flex items-center justify-center pointer-events-none text-center"
                style={{
                  top: `calc(50% - ${pan.y / scale}px)`, // Adjust for pan and scale to keep centered in viewport
                  left: `calc(50% - ${pan.x / scale}px)`,
                  transform: `translate(-50%, -50%) scale(${1 / scale})`, // Counter-scale the message
                  width: 'max-content', 
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

