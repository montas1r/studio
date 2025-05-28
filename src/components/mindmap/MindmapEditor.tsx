
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

const CANVAS_CONTENT_WIDTH_STR = '10000px';
const CANVAS_CONTENT_HEIGHT_STR = '10000px';

const MIN_SCALE = 0.25;
const MAX_SCALE = 2.0;
const ZOOM_SENSITIVITY = 0.1;

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
    
    const charWidth = 7; // Approximate character width
    const charsPerLine = NODE_CARD_WIDTH / charWidth;
    const linesFromDesc = Math.ceil((node.description.length / charsPerLine)) + node.description.split('\n').length -1;

    let height = APPROX_NODE_MIN_HEIGHT_NO_DESC - 20; // Base height without padding
    height += Math.max(1, linesFromDesc) * APPROX_LINE_HEIGHT;
    height += 20; // Padding

    if (node.imageUrl) {
      height += (NODE_CARD_WIDTH * 9 / 16) + 8; // aspect-video + margin
    }
    
    return Math.max(APPROX_NODE_MIN_HEIGHT_NO_DESC, height);
  }, []);


  const clampPan = useCallback((newPanX: number, newPanY: number, currentScale: number) => {
    if (!zoomPanContainerRef.current) return { x: newPanX, y: newPanY };
    const viewportRect = zoomPanContainerRef.current.getBoundingClientRect();
    
    // Allow free panning, no specific clamping based on canvas edges for an "infinite" feel
    // The viewport will clip what's visible.
    return { x: newPanX, y: newPanY };

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
    
    const clamped = clampPan(newPanX, newPanY, newScale);
    
    setScale(newScale);
    setPan(clamped);
  }, [pan, scale, clampPan]);

  const handleRecenterView = useCallback(() => {
    if (!zoomPanContainerRef.current) {
        setScale(1);
        setPan({ x: 0, y: 0 }); 
        return;
    }
    const viewportRect = zoomPanContainerRef.current.getBoundingClientRect();

    if (!mindmap || Object.keys(mindmap.data.nodes).length === 0) {
        const newScale = 1;
        const newPanX = (viewportRect.width / 2) - (canvasNumericWidth / 2 * newScale) ; 
        const newPanY = (viewportRect.height / 2) - (canvasNumericHeight / 2 * newScale);
        setScale(newScale);
        setPan(clampPan(newPanX, newPanY, newScale));
        return;
    }

    const allNodesArray = Object.values(mindmap.data.nodes);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    allNodesArray.forEach(node => {
      const nodeHeight = getNodeHeight(node);
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + NODE_CARD_WIDTH);
      maxY = Math.max(maxY, node.y + nodeHeight);
    });

    if (minX === Infinity) { // Should be caught by the previous check
        const newScale = 1;
        const newPanX = (viewportRect.width / 2) - (canvasNumericWidth / 2 * newScale);
        const newPanY = (viewportRect.height / 2) - (canvasNumericHeight / 2 * newScale);
        setScale(newScale);
        setPan(clampPan(newPanX, newPanY, newScale));
        return;
    }

    const contentWidth = Math.max(NODE_CARD_WIDTH, maxX - minX);
    const contentHeight = Math.max(APPROX_NODE_MIN_HEIGHT_NO_DESC, maxY - minY);
    
    const padding = 50; 
    const newScaleX = (viewportRect.width - 2 * padding) / contentWidth;
    const newScaleY = (viewportRect.height - 2 * padding) / contentHeight;
    let newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min(newScaleX, newScaleY, 1))); // Ensure default is not > 1

    if (isNaN(newScale) || !isFinite(newScale)) {
        newScale = 1; 
    }
    
    const contentCenterX_logical = minX + contentWidth / 2;
    const contentCenterY_logical = minY + contentHeight / 2;

    let newPanX = (viewportRect.width / 2) - (contentCenterX_logical * newScale);
    let newPanY = (viewportRect.height / 2) - (contentCenterY_logical * newScale);
    
    setScale(newScale);
    setPan(clampPan(newPanX, newPanY, newScale));

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
      customBackgroundColor: undefined,
      imageUrl: undefined,
    };
    
    // Calculate position for the new root node
    const allNodesArray = Object.values(mindmap.data.nodes);
    const rootNodes = allNodesArray.filter(n => !n.parentId);
    let newX = canvasNumericWidth / 2 - NODE_CARD_WIDTH / 2; // Default to center if no roots
    let newY = canvasNumericHeight / 2 - getNodeHeight(null) / 2; // Default to center

    if (rootNodes.length > 0) {
        newX = Math.max(...rootNodes.map(n => n.x + NODE_CARD_WIDTH + 50), canvasNumericWidth / 2 - NODE_CARD_WIDTH / 2);
        // Keep Y somewhat consistent or find an open spot
        newY = rootNodes[0]?.y || newY; // Place near first root or center Y
    }
    
    const newRootNode = addNode(mindmap.id, null, newNodeData, newX, newY);
    if (newRootNode) {
        setNewRootNodeTitle('');
        setNewRootNodeDescription('');
        toast({ title: "Root Node Added", description: `"${newRootNode.title}" added to the mindmap.` });
        
        const viewportRect = zoomPanContainerRef.current.getBoundingClientRect();
        const nodeCenterX_logical = newRootNode.x + NODE_CARD_WIDTH / 2;
        const nodeCenterY_logical = newRootNode.y + getNodeHeight(newRootNode) / 2;
        
        const newScale = 1.0; // Or keep current scale? For now, reset to 1 for clarity
        setScale(newScale);

        let newPanX = (viewportRect.width / 2) - (nodeCenterX_logical * newScale);
        let newPanY = (viewportRect.height / 2) - (nodeCenterY_logical * newScale);
        
        setPan(clampPan(newPanX, newPanY, newScale));
    }
  }, [newRootNodeTitle, newRootNodeDescription, mindmap, addNode, toast, getNodeHeight, clampPan, canvasNumericWidth, canvasNumericHeight]);


  useEffect(() => {
    if (mindmap && !initialViewCentered && zoomPanContainerRef.current) {
      handleRecenterView();
      setInitialViewCentered(true);
    }
  }, [mindmapId, mindmap, initialViewCentered, handleRecenterView]);


  const handleAddChildNode = useCallback((parentId: string) => {
    if (!mindmap) return;
    const parentNode = mindmap.data.nodes[parentId];
    if (!parentNode) return;

    // Find a position for the new child node relative to the parent
    const existingChildren = parentNode.childIds.map(id => mindmap.data.nodes[id]);
    const parentHeight = getNodeHeight(parentNode);
    let newX = parentNode.x;
    let newY = parentNode.y + parentHeight + 50; // Default below parent

    if (existingChildren.length > 0) {
        // Simple horizontal stacking for now
        const lastChild = existingChildren[existingChildren.length -1];
        if (lastChild) {
            newX = lastChild.x + NODE_CARD_WIDTH + 30;
            newY = lastChild.y; // Keep same Y as siblings
        }
    }


    const tempNewNode: NodeData = {
      id: `temp-${uuidv4()}`,
      title: '',
      description: "",
      emoji: "➕",
      parentId: parentId,
      childIds: [],
      x: newX, 
      y: newY, 
      customBackgroundColor: undefined,
      imageUrl: undefined,
    };
    setEditingNode(tempNewNode);
    setIsEditDialogOpen(true);
  }, [mindmap, getNodeHeight]);

  const handleEditNode = useCallback((node: NodeData) => {
    setEditingNode(node);
    setIsEditDialogOpen(true);
  }, []);

  const handleSaveNode = useCallback((nodeId: string, data: EditNodeInput) => {
    if (!mindmap || !editingNode) return;

    const finalData = {
      title: data.title,
      description: data.description,
      emoji: data.emoji,
      customBackgroundColor: data.customBackgroundColor === 'no-custom-color' ? undefined : data.customBackgroundColor,
      imageUrl: data.imageUrl,
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
    const nodeElement = event.currentTarget;
    const nodeRect = nodeElement.getBoundingClientRect(); // Screen coordinates of the node
    
    // Calculate offset of mouse click relative to the node's top-left corner ON THE SCREEN
    const screenDragOffsetX = event.clientX - nodeRect.left;
    const screenDragOffsetY = event.clientY - nodeRect.top;

    // Convert screen offset to logical offset (how much of the node content is under the mouse)
    const logicalDragOffsetX = screenDragOffsetX / scale;
    const logicalDragOffsetY = screenDragOffsetY / scale;
    
    event.dataTransfer.setData('application/json', JSON.stringify({
      nodeId,
      logicalDragOffsetX: logicalDragOffsetX, 
      logicalDragOffsetY: logicalDragOffsetY,
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
      const jsonData = event.dataTransfer.getData('application/json');
      if (!jsonData) return;
      dragData = JSON.parse(jsonData);
    } catch (e) {
      console.error("Could not parse drag data:", e);
      return;
    }

    const { nodeId, logicalDragOffsetX, logicalDragOffsetY } = dragData;
    if (!nodeId || logicalDragOffsetX === undefined || logicalDragOffsetY === undefined) {
      console.error("Invalid drag data received:", dragData);
      return;
    }

    const viewportRect = zoomPanContainerRef.current.getBoundingClientRect();
    
    // Mouse position relative to the viewport container's top-left
    const mouseXInViewport = event.clientX - viewportRect.left;
    const mouseYInViewport = event.clientY - viewportRect.top;

    // Convert mouse viewport position to logical canvas position
    let newX_logical = (mouseXInViewport - pan.x) / scale - logicalDragOffsetX;
    let newY_logical = (mouseYInViewport - pan.y) / scale - logicalDragOffsetY;
    
    // No clamping for node positions
    // newX_logical = Math.max(0, Math.min(newX_logical, canvasNumericWidth - NODE_CARD_WIDTH));
    // const nodeToUpdate = mindmap.data.nodes[nodeId]; // For height calculation if needed
    // const nodeHeight = getNodeHeight(nodeToUpdate);
    // newY_logical = Math.max(0, Math.min(newY_logical, canvasNumericHeight - nodeHeight));


    updateNodePosition(mindmap.id, nodeId, newX_logical, newY_logical);
  }, [mindmap, updateNodePosition, pan, scale, getNodeHeight, canvasNumericWidth, canvasNumericHeight]);


  const handleExportJson = useCallback(() => {
    if (!mindmap) return;
    const jsonString = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(mindmap, null, 2));
    const link = document.createElement("a");
    link.href = jsonString;
    link.download = `${mindmap.name.replace(/\s+/g, '_').toLowerCase()}_mindmap.json`;
    link.click();
    toast({ title: "Exported", description: "Mindmap data exported as JSON." });
  }, [mindmap, toast]);

  const handleButtonZoomIn = useCallback(() => adjustZoom(ZOOM_SENSITIVITY), [adjustZoom]);
  const handleButtonZoomOut = useCallback(() => adjustZoom(-ZOOM_SENSITIVITY), [adjustZoom]);

  const handleWheelZoom = useCallback((event: WheelEvent) => {
    if (!zoomPanContainerRef.current) return;
    event.preventDefault();
    const delta = event.deltaY > 0 ? -ZOOM_SENSITIVITY : ZOOM_SENSITIVITY;
    
    const viewportRect = zoomPanContainerRef.current.getBoundingClientRect();
    const focalX_viewport = event.clientX - viewportRect.left;
    const focalY_viewport = event.clientY - viewportRect.top;
    
    adjustZoom(delta, focalX_viewport, focalY_viewport);
  }, [adjustZoom]);


  const handlePanMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if (activeTool !== 'pan') return;
    // Prevent panning if clicking on a node or its interactive elements
    if ((event.target as HTMLElement).closest('.node-card-draggable') || (event.target as HTMLElement).closest('button')) return;

    event.preventDefault();
    setIsPanning(true);

    const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
    const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;

    panStartRef.current = {
      mouseX: clientX,
      mouseY: clientY,
      initialPanX: pan.x,
      initialPanY: pan.y,
    };
    if (zoomPanContainerRef.current) {
        zoomPanContainerRef.current.style.cursor = 'grabbing';
    }
  }, [activeTool, pan]);

  const handlePanMouseMove = useCallback((event: MouseEvent | TouchEvent) => {
    if (!isPanning || !panStartRef.current || !zoomPanContainerRef.current) return;
    event.preventDefault();

    const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
    const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;

    const dx = clientX - panStartRef.current.mouseX;
    const dy = clientY - panStartRef.current.mouseY;
    
    const newPanX = panStartRef.current.initialPanX + dx;
    const newPanY = panStartRef.current.initialPanY + dy;
    
    setPan(clampPan(newPanX, newPanY, scale));
  }, [isPanning, scale, clampPan]);

  const handlePanMouseUpOrLeave = useCallback(() => {
    if (isPanning) {
      setIsPanning(false);
      panStartRef.current = null;
      if (zoomPanContainerRef.current && activeTool === 'pan') {
        zoomPanContainerRef.current.style.cursor = 'grab';
      } else if (zoomPanContainerRef.current) {
        zoomPanContainerRef.current.style.cursor = 'default';
      }
    }
  }, [isPanning, activeTool]);


  useEffect(() => {
    const container = zoomPanContainerRef.current;
    if (!container) return;

    container.addEventListener('wheel', handleWheelZoom, { passive: false });
    
    if (isPanning) {
      window.addEventListener('mousemove', handlePanMouseMove);
      window.addEventListener('mouseup', handlePanMouseUpOrLeave);
      window.addEventListener('mouseleave', handlePanMouseUpOrLeave);
      window.addEventListener('touchmove', handlePanMouseMove);
      window.addEventListener('touchend', handlePanMouseUpOrLeave);
    }
    
    return () => {
      container.removeEventListener('wheel', handleWheelZoom);
      window.removeEventListener('mousemove', handlePanMouseMove);
      window.removeEventListener('mouseup', handlePanMouseUpOrLeave);
      window.removeEventListener('mouseleave', handlePanMouseUpOrLeave);
      window.removeEventListener('touchmove', handlePanMouseMove);
      window.removeEventListener('touchend', handlePanMouseUpOrLeave);
    };
  }, [isPanning, handlePanMouseMove, handlePanMouseUpOrLeave, handleWheelZoom]);
  
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


  const handleTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 2 && zoomPanContainerRef.current) {
      event.preventDefault();
      const t1 = event.touches[0];
      const t2 = event.touches[1];
      const distance = Math.sqrt(Math.pow(t2.clientX - t1.clientX, 2) + Math.pow(t2.clientY - t1.clientY, 2));
      
      const viewportRect = zoomPanContainerRef.current.getBoundingClientRect();
      const midPointViewport = {
        x: (t1.clientX + t2.clientX) / 2 - viewportRect.left,
        y: (t1.clientY + t2.clientY) / 2 - viewportRect.top,
      };

      pinchStateRef.current = { 
        initialDistance: distance, 
        initialScale: scale, 
        initialPan: { ...pan }, 
        midPoint: midPointViewport 
      };
    } else if (event.touches.length === 1 && activeTool === 'pan') {
        handlePanMouseDown(event); 
    }
  }, [scale, pan, activeTool, handlePanMouseDown]);

  const handleTouchMove = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 2 && pinchStateRef.current && zoomPanContainerRef.current) {
      event.preventDefault();
      const t1 = event.touches[0];
      const t2 = event.touches[1];
      const currentDistance = Math.sqrt(Math.pow(t2.clientX - t1.clientX, 2) + Math.pow(t2.clientY - t1.clientY, 2));
      const scaleDelta = currentDistance / pinchStateRef.current.initialDistance;
      let newScale = pinchStateRef.current.initialScale * scaleDelta;
      newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));

      const { midPoint, initialPan, initialScale } = pinchStateRef.current;
      
      const logicalX = (midPoint.x - initialPan.x) / initialScale;
      const logicalY = (midPoint.y - initialPan.y) / initialScale;

      let newPanX = midPoint.x - logicalX * newScale;
      let newPanY = midPoint.y - logicalY * newScale;
      
      setScale(newScale);
      setPan(clampPan(newPanX, newPanY, newScale));
    } else if (event.touches.length === 1 && isPanning && activeTool === 'pan') {
      // This is handled by the global touchmove listener calling handlePanMouseMove
    }
  }, [isPanning, activeTool, clampPan]);

  const handleTouchEnd = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length < 2) {
      pinchStateRef.current = null;
    }
    if (event.touches.length < 1 && isPanning) {
        // This is handled by the global touchend listener calling handlePanMouseUpOrLeave
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
      <div className="flex flex-col h-full flex-grow w-full bg-muted/10">
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

        {/* Main Canvas Viewport */}
        <div
          ref={zoomPanContainerRef}
          className="flex-grow relative overflow-hidden bg-muted/20" 
          onMouseDown={handlePanMouseDown}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{ touchAction: 'none' }} 
        >
          {/* Canvas Content - This div is transformed */}
          <div
            ref={canvasContentRef}
            className="relative" 
            onDragOver={handleDragOverCanvas}
            onDrop={handleDropOnCanvas}
            style={{
              width: CANVAS_CONTENT_WIDTH_STR,
              height: CANVAS_CONTENT_HEIGHT_STR,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
              transformOrigin: '0 0',
              // pointerEvents set based on activeTool in useEffect for cursor
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

                const parentHeight = getNodeHeight(parentNode);
                const nodeHeight = getNodeHeight(node);

                const startX = (parentNode.x ?? 0) + NODE_CARD_WIDTH / 2;
                const startY = (parentNode.y ?? 0) + parentHeight / 2;
                const endX = (node.x ?? 0) + NODE_CARD_WIDTH / 2;
                const endY = (node.y ?? 0) + nodeHeight / 2;
                
                const c1x = startX; 
                const c1y = startY + Math.max(30, Math.abs(endY - startY) / 2.5);
                const c2x = endX;
                const c2y = endY - Math.max(30, Math.abs(endY - startY) / 2.5);

                const pathData = `M ${startX} ${startY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${endX} ${endY}`;
                
                let strokeColor = parentNode.customBackgroundColor 
                                    ? `hsl(var(--${parentNode.customBackgroundColor}))`
                                    : (parentNode.parentId === null ? "hsl(var(--primary))" : "hsl(var(--accent))");


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
                style={{ pointerEvents: activeTool === 'pan' ? 'none' : 'auto' }} 
              />
            ))}

            {allNodes.length === 0 && (
               <div
                className="absolute flex items-center justify-center pointer-events-none text-center"
                style={{
                  top: `calc(50% - ${pan.y / scale}px)`, 
                  left: `calc(50% - ${pan.x / scale}px)`,
                  transform: `translate(-50%, -50%) scale(${1 / scale})`, 
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

    