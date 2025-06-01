
"use client";

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { Mindmap, NodeData, EditNodeInput, NodesObject, MindmapData, NodeSize } from '@/types/mindmap';
import { useMindmaps } from '@/hooks/useMindmaps';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NodeCard } from './NodeCard';
import { EditNodeDialog } from './EditNodeDialog';
import { PlusCircle, ArrowLeft, FileJson, Hand, ZoomIn, ZoomOut, LocateFixed, Undo, Redo, FileQuestion } from 'lucide-react';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

const FIXED_VIEWPORT_WIDTH = 1200;
const FIXED_VIEWPORT_HEIGHT = 800;
const LOGICAL_CANVAS_WIDTH_STR = '2000px';
const LOGICAL_CANVAS_HEIGHT_STR = '2000px';

interface MindmapEditorProps {
  mindmapId: string;
}

const deepClone = <T,>(obj: T): T => {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch (e) {
    // console.warn("Deep clone failed, falling back to shallow copy for safety:", e);
    if (Array.isArray(obj)) {
      return [...obj] as any as T;
    } else if (typeof obj === 'object') {
      return { ...obj } as T;
    }
    return obj;
  }
};

export function MindmapEditor({ mindmapId }: MindmapEditorProps) {
  const {
    getMindmapById,
    addNode,
    updateNode, 
    deleteNode: deleteNodeFromHook,
    updateNodePosition,
    updateNodeHeightFromObserver, 
    updateMindmap,
    getApproxNodeHeight,
    getNodeDimensionsForSize, 
    MINI_NODE_WIDTH,
    MINI_NODE_DEFAULT_HEIGHT,
    STANDARD_NODE_WIDTH, 
    STANDARD_NODE_DEFAULT_HEIGHT,
    MASSIVE_NODE_WIDTH,
    MASSIVE_NODE_DEFAULT_HEIGHT,
    MIN_NODE_HEIGHT, 
    MAX_NODE_HEIGHT, 
  } = useMindmaps();

  const mindmap = getMindmapById(mindmapId);
  const allNodes = useMemo(() => mindmap ? Object.values(mindmap.data.nodes) : [], [mindmap]);

  const [editingNode, setEditingNode] = useState<NodeData | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [newRootNodeTitle, setNewRootNodeTitle] = useState('');
  const [newRootNodeDescription, setNewRootNodeDescription] = useState('');
  const [nodeToDelete, setNodeToDelete] = useState<{ id: string; title: string | undefined } | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const { toast } = useToast();

  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [activeTool, setActiveTool] = useState<'select' | 'pan'>('select');
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ mouseX: number; mouseY: number; panX: number; panY: number } | null>(null);

  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartScaleRef = useRef<number>(1);
  const pinchCenterRef = useRef<{ x: number; y: number } | null>(null);

  const viewportContainerRef = useRef<HTMLDivElement>(null);
  const canvasContentRef = useRef<HTMLDivElement>(null);

  const [undoStack, setUndoStack] = useState<Mindmap['data'][]>([]);
  const [redoStack, setRedoStack] = useState<Mindmap['data'][]>([]);
  const initialViewCenteredRef = useRef(false);

  const canvasNumericWidth = useMemo(() => parseInt(LOGICAL_CANVAS_WIDTH_STR, 10), []);
  const canvasNumericHeight = useMemo(() => parseInt(LOGICAL_CANVAS_HEIGHT_STR, 10), []);
  
  const handleNodeHeightChange = useCallback((nodeId: string, measuredHeight: number) => {
    if (mindmapId) { 
      updateNodeHeightFromObserver(mindmapId, nodeId, measuredHeight);
    }
  }, [mindmapId, updateNodeHeightFromObserver]);


  const clampPan = useCallback((newPanX: number, newPanY: number, currentScale: number) => {
    if (!viewportContainerRef.current) return { x: newPanX, y: newPanY };
    const viewportRect = viewportContainerRef.current.getBoundingClientRect();
    let clampedX = newPanX;
    let clampedY = newPanY;

    const scaledCanvasWidth = canvasNumericWidth * currentScale;
    const scaledCanvasHeight = canvasNumericHeight * currentScale;

    if (scaledCanvasWidth > viewportRect.width) {
      clampedX = Math.min(0, Math.max(newPanX, viewportRect.width - scaledCanvasWidth));
    } else {
      clampedX = Math.max(0, Math.min(newPanX, viewportRect.width - scaledCanvasWidth));
    }

    if (scaledCanvasHeight > viewportRect.height) {
      clampedY = Math.min(0, Math.max(newPanY, viewportRect.height - scaledCanvasHeight));
    } else {
      clampedY = Math.max(0, Math.min(newPanY, viewportRect.height - scaledCanvasHeight));
    }
    return { x: clampedX, y: clampedY };
  }, [canvasNumericWidth, canvasNumericHeight]);

  const adjustZoom = useCallback((newScaleAttempt: number, focalX_viewport?: number, focalY_viewport?: number) => {
    if (!viewportContainerRef.current) return;

    const currentScale = scale;
    const newScale = Math.max(0.25, Math.min(2.0, newScaleAttempt));
    const viewportRect = viewportContainerRef.current.getBoundingClientRect();

    const targetX_viewport = focalX_viewport !== undefined ? focalX_viewport : viewportRect.width / 2;
    const targetY_viewport = focalY_viewport !== undefined ? focalY_viewport : viewportRect.height / 2;

    const newPanX = targetX_viewport - (targetX_viewport - pan.x) * (newScale / currentScale);
    const newPanY = targetY_viewport - (targetY_viewport - pan.y) * (newScale / currentScale);

    const clampedNewPan = clampPan(newPanX, newPanY, newScale);

    setScale(newScale);
    setPan(clampedNewPan);
  }, [scale, pan, clampPan]);

  const handleButtonZoomIn = useCallback(() => adjustZoom(scale * 1.1), [adjustZoom, scale]);
  const handleButtonZoomOut = useCallback(() => adjustZoom(scale / 1.1), [adjustZoom, scale]);

  const handleRecenterView = useCallback(() => {
    if (!viewportContainerRef.current || !mindmap) return;

    const allNodesArray = Object.values(mindmap.data.nodes);
    const viewportRect = viewportContainerRef.current.getBoundingClientRect();

    if (allNodesArray.length === 0) {
      const initialScale = 1;
      const newPanX = (viewportRect.width - canvasNumericWidth * initialScale) / 2;
      const newPanY = (viewportRect.height - canvasNumericHeight * initialScale) / 2;
      const clamped = clampPan(newPanX, newPanY, initialScale);
      setScale(initialScale);
      setPan(clamped);
      return;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    allNodesArray.forEach(node => {
      const nodeWidth = node.width ?? STANDARD_NODE_WIDTH; 
      const nodeHeight = node.height ?? getApproxNodeHeight({title: node.title, description: node.description, emoji: node.emoji, size: node.size}, nodeWidth);
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + nodeWidth);
      maxY = Math.max(maxY, node.y + nodeHeight);
    });

    const contentWidth = Math.max((allNodesArray[0]?.width ?? STANDARD_NODE_WIDTH), maxX - minX);
    const contentHeight = Math.max((allNodesArray[0]?.height ?? getApproxNodeHeight(allNodesArray[0] || null, allNodesArray[0]?.width ?? STANDARD_NODE_WIDTH)), maxY - minY);
    
    const PADDING_PERCENT = 0.90;

    let newFitScale = 1;
    if (contentWidth > 0 && contentHeight > 0) {
        const targetViewportWidth = viewportRect.width * PADDING_PERCENT;
        const targetViewportHeight = viewportRect.height * PADDING_PERCENT;
        if (targetViewportWidth <=0 || targetViewportHeight <=0) {
            newFitScale = 0.25;
        } else {
            const scaleX = targetViewportWidth / contentWidth;
            const scaleY = targetViewportHeight / contentHeight;
            newFitScale = Math.min(scaleX, scaleY);
        }
    } else {
        newFitScale = 1;
    }

    newFitScale = Math.max(0.25, Math.min(newFitScale, 2.0));

    const contentCenterX_logical = minX + contentWidth / 2;
    const contentCenterY_logical = minY + contentHeight / 2;

    const newFitPanX = viewportRect.width / 2 - contentCenterX_logical * newFitScale;
    const newFitPanY = viewportRect.height / 2 - contentCenterY_logical * newFitScale;

    const clampedFitPan = clampPan(newFitPanX, newFitPanY, newFitScale);

    setScale(newFitScale);
    setPan(clampedFitPan);
  }, [mindmap, getApproxNodeHeight, clampPan, canvasNumericWidth, canvasNumericHeight, STANDARD_NODE_WIDTH]);


  useEffect(() => {
    if (mindmap && !initialViewCenteredRef.current && viewportContainerRef.current && mindmap.data.nodes) {
      handleRecenterView();
      initialViewCenteredRef.current = true;
    }
  }, [mindmap, handleRecenterView]);

  const beforeMutation = useCallback(() => {
    if (mindmap?.data) {
      const currentDataSnapshot = deepClone(mindmap.data);
      setUndoStack(prev => [...prev.slice(-19), currentDataSnapshot]);
      setRedoStack([]);
    }
  }, [mindmap?.data]);

  useEffect(() => {
    if (mindmap?.data && Object.keys(mindmap.data.nodes).length > 0 && undoStack.length === 0) {
        setUndoStack([deepClone(mindmap.data)]);
    }
  }, [mindmap?.data]); 

  const handleUndo = useCallback(() => {
    if (!mindmap || undoStack.length === 0) return;
    const currentSnapshot = deepClone(mindmap.data);
    const previousData = deepClone(undoStack[undoStack.length - 1]);
    setRedoStack(prev => [currentSnapshot, ...prev.slice(0, 19)]);
    setUndoStack(prev => prev.slice(0, -1));
    updateMindmap(mindmap.id, { data: previousData });
  }, [mindmap, undoStack, updateMindmap]);

  const handleRedo = useCallback(() => {
    if (!mindmap || redoStack.length === 0) return;
    const nextData = deepClone(redoStack[0]);
    setUndoStack(prev => [...prev.slice(-19), deepClone(mindmap.data)]);
    setRedoStack(prev => prev.slice(1));
    updateMindmap(mindmap.id, { data: nextData });
  }, [mindmap, redoStack, undoStack, updateMindmap]);

  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const ctrlKey = isMac ? event.metaKey : event.ctrlKey;

      if (ctrlKey && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if (ctrlKey && (event.key.toLowerCase() === 'y' || (isMac && event.key.toLowerCase() === 'z' && event.shiftKey))) {
        event.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleUndo, handleRedo]);

  const handlePanMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (activeTool !== 'pan' || !viewportContainerRef.current) return;
    const target = event.target as HTMLElement;
    if (target.closest('.node-card-draggable') || target.closest('[data-tool-button]')) return;
    
    event.preventDefault();
    setIsPanning(true);
    panStartRef.current = { mouseX: event.clientX, mouseY: event.clientY, panX: pan.x, panY: pan.y };
  }, [activeTool, pan.x, pan.y]);

  const handlePanMouseMove = useCallback((event: MouseEvent) => {
    if (!isPanning || !panStartRef.current || activeTool !== 'pan') return;
    event.preventDefault();
    const dx = event.clientX - panStartRef.current.mouseX;
    const dy = event.clientY - panStartRef.current.mouseY;
    const newPanX = panStartRef.current.panX + dx;
    const newPanY = panStartRef.current.panY + dy;
    setPan(clampPan(newPanX, newPanY, scale));
  }, [isPanning, scale, clampPan, activeTool]);

  const handlePanMouseUpOrLeave = useCallback(() => {
    if (isPanning) setIsPanning(false);
  }, [isPanning]);

  useEffect(() => {
    const vpCurrent = viewportContainerRef.current;
    if (!vpCurrent) return;
    const currentCursor = activeTool === 'pan' ? (isPanning ? 'grabbing' : 'grab') : 'default';
    vpCurrent.style.cursor = currentCursor;

    if (isPanning && activeTool === 'pan') {
      window.addEventListener('mousemove', handlePanMouseMove);
      window.addEventListener('mouseup', handlePanMouseUpOrLeave);
      window.addEventListener('mouseleave', handlePanMouseUpOrLeave);
      return () => {
        window.removeEventListener('mousemove', handlePanMouseMove);
        window.removeEventListener('mouseup', handlePanMouseUpOrLeave);
        window.removeEventListener('mouseleave', handlePanMouseUpOrLeave);
      };
    }
  }, [isPanning, activeTool, handlePanMouseMove, handlePanMouseUpOrLeave]);

  const handleWheelZoom = useCallback((event: WheelEvent) => {
    if (!viewportContainerRef.current) return;
    const target = event.target as HTMLElement;
    if (target.closest('.node-card-draggable') || target.closest('[data-tool-button]')) return;
    event.preventDefault();
    const viewportRect = viewportContainerRef.current.getBoundingClientRect();
    const focalX_viewport = event.clientX - viewportRect.left;
    const focalY_viewport = event.clientY - viewportRect.top;
    const delta = event.deltaY > 0 ? 0.9 : 1.1;
    adjustZoom(scale * delta, focalX_viewport, focalY_viewport);
  }, [adjustZoom, scale]);

  useEffect(() => {
    const vpCurrent = viewportContainerRef.current;
    if (!vpCurrent) return;
    vpCurrent.addEventListener('wheel', handleWheelZoom, { passive: false });
    return () => { if (vpCurrent) vpCurrent.removeEventListener('wheel', handleWheelZoom); };
  }, [handleWheelZoom]);

  const handleTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (!viewportContainerRef.current) return;
    const touches = event.touches;
    const targetElement = touches[0]?.target as HTMLElement;
    if (targetElement?.closest('.node-card-draggable') || targetElement?.closest('[data-tool-button]')) return;

    if (touches.length === 1 && activeTool === 'pan') {
      event.preventDefault();
      setIsPanning(true);
      panStartRef.current = { mouseX: touches[0].clientX, mouseY: touches[0].clientY, panX: pan.x, panY: pan.y };
    } else if (touches.length === 2) {
      event.preventDefault();
      setIsPanning(false);
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      pinchStartDistRef.current = Math.sqrt(dx * dx + dy * dy);
      pinchStartScaleRef.current = scale;
      const viewportRect = viewportContainerRef.current.getBoundingClientRect();
      pinchCenterRef.current = {
        x: ((touches[0].clientX + touches[1].clientX) / 2) - viewportRect.left,
        y: ((touches[0].clientY + touches[1].clientY) / 2) - viewportRect.top,
      };
    }
  }, [activeTool, pan.x, pan.y, scale]);

  const handleTouchMove = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (!viewportContainerRef.current) return;
    const touches = event.touches;
    const targetElement = touches[0]?.target as HTMLElement;
    if (targetElement?.closest('.node-card-draggable') || targetElement?.closest('[data-tool-button]')) {
      if (!isPanning && pinchStartDistRef.current === null) return;
    }
    event.preventDefault();

    if (touches.length === 1 && isPanning && panStartRef.current && activeTool === 'pan') {
      const dx = touches[0].clientX - panStartRef.current.mouseX;
      const dy = touches[0].clientY - panStartRef.current.mouseY;
      setPan(clampPan(panStartRef.current.panX + dx, panStartRef.current.panY + dy, scale));
    } else if (touches.length === 2 && pinchStartDistRef.current !== null && pinchCenterRef.current) {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      const newDist = Math.sqrt(dx * dx + dy * dy);
      const scaleChange = newDist / pinchStartDistRef.current;
      const newScaleAttempt = pinchStartScaleRef.current * scaleChange;
      adjustZoom(newScaleAttempt, pinchCenterRef.current.x, pinchCenterRef.current.y);
    }
  }, [isPanning, activeTool, scale, clampPan, adjustZoom]);

  const handleTouchEnd = useCallback(() => {
    if (isPanning) setIsPanning(false);
    pinchStartDistRef.current = null;
    pinchCenterRef.current = null;
  }, [isPanning]);

  const handleAddRootNode = useCallback(async () => {
    if (newRootNodeTitle.trim() === '') {
      toast({ title: "Title Required", description: "Please enter a title for the new root node.", variant: "destructive" });
      return;
    }
    if (!mindmap || !viewportContainerRef.current) return;
    beforeMutation();

    const newNodeDetails: EditNodeInput = { title: newRootNodeTitle, description: newRootNodeDescription, emoji: '💡' };
    const newRootNode = addNode(mindmap.id, null, newNodeDetails);

    if (newRootNode) {
      setNewRootNodeTitle(''); setNewRootNodeDescription('');
      toast({ title: "Root Node Added", description: `"${newRootNode.title}" added.` });
      const viewportRect = viewportContainerRef.current.getBoundingClientRect();
      const nodeWidth = newRootNode.width ?? STANDARD_NODE_WIDTH;
      const nodeHeight = newRootNode.height ?? getApproxNodeHeight(newRootNode, nodeWidth);
      const nodeCenterX_logical = newRootNode.x + nodeWidth / 2;
      const nodeCenterY_logical = newRootNode.y + nodeHeight / 2;
      const newPanX = viewportRect.width / 2 - nodeCenterX_logical * scale;
      const newPanY = viewportRect.height / 2 - nodeCenterY_logical * scale;
      setPan(clampPan(newPanX, newPanY, scale));
    }
  }, [newRootNodeTitle, newRootNodeDescription, mindmap, addNode, toast, getApproxNodeHeight, beforeMutation, scale, clampPan, STANDARD_NODE_WIDTH]);

  const handleAddChildNode = useCallback((parentId: string) => {
    if (!mindmap) return;
    const parentNode = mindmap.data.nodes[parentId];
    if (!parentNode) return;
    
    const { width: defaultWidth, defaultHeight } = getNodeDimensionsForSize('standard');
    const tempNewNode: NodeData = {
      id: `temp-${Date.now()}`,
      title: '', description: "", emoji: "➕", parentId: parentId, childIds: [],
      x: parentNode.x + (parentNode.width ?? defaultWidth) / 2, 
      y: parentNode.y + (parentNode.height ?? getApproxNodeHeight(parentNode, parentNode.width ?? defaultWidth)) + 50,
      size: 'standard',
      width: defaultWidth, 
      height: getApproxNodeHeight({title: '', description: '', emoji: "➕", size: 'standard'}, defaultWidth),
    };
    setEditingNode(tempNewNode);
    setIsEditDialogOpen(true);
  }, [mindmap, getApproxNodeHeight, getNodeDimensionsForSize]);

  const handleEditNode = useCallback((node: NodeData) => {
    setEditingNode(deepClone(node));
    setIsEditDialogOpen(true);
  }, []);

  const handleSaveNode = useCallback((nodeIdFromDialog: string, data: EditNodeInput, newSize?: NodeSize) => {
    if (!mindmap || !editingNode) return;
    beforeMutation();
    
    const finalSize = newSize || editingNode.size || 'standard'; 
    const { width: baseWidthForSize, defaultHeight: defaultHeightForSize } = getNodeDimensionsForSize(finalSize);
    const actualHeight = getApproxNodeHeight(
        { title: data.title, description: data.description, emoji: data.emoji, size: finalSize }, 
        baseWidthForSize
    );
    const finalHeight = Math.max(defaultHeightForSize, actualHeight);

    if (editingNode.id.startsWith('temp-')) { 
      const savedNode = addNode(mindmap.id, editingNode.parentId, data); 
      if (savedNode) toast({ title: "Node Created", description: `Node "${savedNode.title}" added.` });
    } else { 
      updateNode(editingNode.id, { 
        ...data, 
        size: finalSize,
        width: baseWidthForSize, 
        height: finalHeight,     
      });
      toast({ title: "Node Updated", description: `Node "${data.title}" saved.` });
    }
    setEditingNode(null);
    setIsEditDialogOpen(false);
  }, [mindmap, editingNode, addNode, updateNode, toast, beforeMutation, getNodeDimensionsForSize, getApproxNodeHeight]);


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
    beforeMutation();
    deleteNodeFromHook(mindmap.id, nodeToDelete.id);
    toast({ title: "Node Deleted", description: `Node "${nodeToDelete.title || 'Untitled'}" removed.`, variant: "destructive" });
    setIsDeleteDialogOpen(false);
    setNodeToDelete(null);
  }, [mindmap, nodeToDelete, deleteNodeFromHook, toast, beforeMutation]);

  const handleNodeDragStart = useCallback((event: React.DragEvent<HTMLDivElement>, nodeId: string) => {
    if (activeTool === 'pan') {
      event.preventDefault();
      return;
    }
    const nodeRect = (event.target as HTMLDivElement).getBoundingClientRect();
    const logicalDragOffsetX = (event.clientX - nodeRect.left) / scale;
    const logicalDragOffsetY = (event.clientY - nodeRect.top) / scale;
    const payload = { nodeId, logicalDragOffsetX, logicalDragOffsetY };
    event.dataTransfer.setData('application/json', JSON.stringify(payload));
    event.dataTransfer.effectAllowed = "move";
  }, [activeTool, scale]);

  const handleDragOverCanvas = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const handleDropOnCanvas = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!viewportContainerRef.current || !mindmap || activeTool === 'pan') return;
    const payloadString = event.dataTransfer.getData('application/json');
    let nodeId: string | undefined;
    let logicalDragOffsetX = 0;
    let logicalDragOffsetY = 0;

    if (payloadString) {
      try {
        const parsedData = JSON.parse(payloadString);
        nodeId = parsedData.nodeId;
        logicalDragOffsetX = typeof parsedData.logicalDragOffsetX === 'number' ? parsedData.logicalDragOffsetX : 0;
        logicalDragOffsetY = typeof parsedData.logicalDragOffsetY === 'number' ? parsedData.logicalDragOffsetY : 0;
      } catch (e) { console.error("Error parsing drag data", e); }
    }
    if (!nodeId) { console.warn("No nodeId in drag data"); return; }

    const viewportRect = viewportContainerRef.current.getBoundingClientRect();
    let newX_logical = (event.clientX - viewportRect.left - pan.x) / scale - logicalDragOffsetX;
    let newY_logical = (event.clientY - viewportRect.top - pan.y) / scale - logicalDragOffsetY;

    const nodeToDrag = mindmap.data.nodes[nodeId];
    if (!nodeToDrag) return;
    const nodeWidth = nodeToDrag.width ?? STANDARD_NODE_WIDTH; 
    const nodeHeight = nodeToDrag.height ?? getApproxNodeHeight(nodeToDrag, nodeWidth);

    newX_logical = Math.max(0, Math.min(newX_logical, canvasNumericWidth - nodeWidth));
    newY_logical = Math.max(0, Math.min(newY_logical, canvasNumericHeight - nodeHeight));

    beforeMutation();
    updateNodePosition(mindmap.id, nodeId, newX_logical, newY_logical);
  }, [mindmap, pan, scale, activeTool, beforeMutation, canvasNumericWidth, canvasNumericHeight, getApproxNodeHeight, updateNodePosition, STANDARD_NODE_WIDTH]);

  const handleExportJson = useCallback(() => {
    if (!mindmap) return;
    const mindmapToExport = deepClone(mindmap);
    const jsonString = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(mindmapToExport, null, 2));
    const link = document.createElement("a");
    link.href = jsonString;
    link.download = mindmapToExport.name.replace(/\s+/g, '_').toLowerCase() + '_mindmap.json';
    link.click();
    toast({ title: "Exported", description: "Mindmap data exported as JSON." });
  }, [mindmap, toast]);


  if (!mindmap) {
    return (
      <div className="flex flex-col items-center justify-center h-full flex-grow space-y-4 text-center py-10">
        <FileQuestion className="w-16 h-16 text-destructive" />
        <h2 className="text-2xl font-bold">Mindmap Not Found</h2>
        <p className="text-muted-foreground">The mindmap you are looking for does not exist or has been deleted.</p>
        <Button asChild variant="outline" size="sm"><Link href="/"><ArrowLeft className="mr-1.5 h-4 w-4" /> Library</Link></Button>
      </div>
    );
  }

  const canUndo = undoStack.length > 0 && !(undoStack.length === 1 && JSON.stringify(undoStack[0]) === JSON.stringify(mindmap.data));
  const canRedo = redoStack.length > 0;

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full flex-grow w-full bg-background overflow-hidden">
        <div className="p-1 border-b bg-background/80 backdrop-blur-sm sticky top-0 z-20 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-2">
            <div className="flex items-center gap-2 flex-shrink-0 min-w-0">
              <Tooltip><TooltipTrigger asChild><Button data-tool-button asChild variant="ghost" size="icon" className="h-8 w-8"><Link href="/"><ArrowLeft className="h-4 w-4" /></Link></Button></TooltipTrigger><TooltipContent><p>Library</p></TooltipContent></Tooltip>
              <h1 className="text-md font-semibold text-foreground truncate leading-none" title={mindmap.name}>{mindmap.name}</h1>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Tooltip><TooltipTrigger asChild><Button data-tool-button variant="ghost" size="icon" onClick={() => setActiveTool(prev => prev === 'pan' ? 'select' : 'pan')} className={cn("h-8 w-8", activeTool === 'pan' && "bg-accent text-accent-foreground hover:bg-accent/90")}><Hand className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Pan Tool (P)</p></TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger asChild><Button data-tool-button variant="ghost" size="icon" onClick={handleButtonZoomIn} className="h-8 w-8"><ZoomIn className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Zoom In</p></TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger asChild><Button data-tool-button variant="ghost" size="icon" onClick={handleButtonZoomOut} className="h-8 w-8"><ZoomOut className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Zoom Out</p></TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger asChild><Button data-tool-button variant="ghost" size="icon" onClick={handleRecenterView} className="h-8 w-8"><LocateFixed className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Recenter View</p></TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger asChild><Button data-tool-button variant="ghost" size="icon" onClick={handleUndo} disabled={!canUndo} className="h-8 w-8"><Undo className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Undo (Ctrl+Z)</p></TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger asChild><Button data-tool-button variant="ghost" size="icon" onClick={handleRedo} disabled={!canRedo} className="h-8 w-8"><Redo className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Redo (Ctrl+Y/Shift+Z)</p></TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger asChild><Button data-tool-button variant="ghost" size="icon" onClick={handleExportJson} className="h-8 w-8"><FileJson className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Export JSON</p></TooltipContent></Tooltip>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch gap-1 p-1.5">
            <Input type="text" value={newRootNodeTitle} onChange={(e) => setNewRootNodeTitle(e.target.value)} placeholder="New Root Idea Title" className="flex-grow h-9 text-sm" />
            <Textarea value={newRootNodeDescription} onChange={(e) => setNewRootNodeDescription(e.target.value)} placeholder="Description (Optional)" rows={1} className="flex-grow text-sm min-h-[36px] h-9 resize-y max-h-24" />
            <Button onClick={handleAddRootNode} size="sm" className="h-9 text-sm whitespace-nowrap px-3"><PlusCircle className="mr-1.5 h-4 w-4" /> Add Root Idea</Button>
          </div>
        </div>

        <div className="flex-grow flex items-center justify-center p-0 bg-background">
          <div
            ref={viewportContainerRef}
            style={{ width: `${FIXED_VIEWPORT_WIDTH}px`, height: `${FIXED_VIEWPORT_HEIGHT}px`, overflow: 'hidden', userSelect: 'auto', backgroundColor: 'hsl(var(--background))', position: 'relative' }}
            onMouseDown={handlePanMouseDown}
            onDragOver={handleDragOverCanvas}
            onDrop={handleDropOnCanvas}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
          >
            <div
              ref={canvasContentRef}
              className="relative bg-card border-2 border-dashed border-sky-300" 
              style={{ width: LOGICAL_CANVAS_WIDTH_STR, height: LOGICAL_CANVAS_HEIGHT_STR, transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`, transformOrigin: '0 0' }}
            >
              <svg
                className="absolute top-0 left-0 pointer-events-none svg-canvas-background"
                style={{ width: '100%', height: '100%', overflow: 'visible' }}
              >
                {allNodes.map(node => {
                  const parentNode = node.parentId ? mindmap.data.nodes[node.parentId] : null;
                  if (!parentNode) return null;

                  const parentNodeWidth = parentNode.width ?? STANDARD_NODE_WIDTH;
                  const parentNodeHeight = parentNode.height ?? getApproxNodeHeight(parentNode, parentNodeWidth);
                  
                  const parentCardCenterX = (parentNode.x ?? 0) + parentNodeWidth / 2;
                  const parentCardBottomY = (parentNode.y ?? 0) + parentNodeHeight;

                  const childNodeWidth = node.width ?? STANDARD_NODE_WIDTH;
                  
                  const childCardCenterX = (node.x ?? 0) + childNodeWidth / 2;
                  const childCardTopY = (node.y ?? 0);

                  const curveOffsetY = Math.max(30, Math.abs(childCardTopY - parentCardBottomY) / 2.5);
                  const d = `M ${parentCardCenterX.toFixed(1)} ${parentCardBottomY.toFixed(1)} C ${parentCardCenterX.toFixed(1)} ${(parentCardBottomY + curveOffsetY).toFixed(1)}, ${childCardCenterX.toFixed(1)} ${(childCardTopY - curveOffsetY).toFixed(1)}, ${childCardCenterX.toFixed(1)} ${childCardTopY.toFixed(1)}`;

                  let strokeColor = parentNode.parentId === null ? "hsl(var(--primary))" : "hsl(var(--accent))";
                  return (
                    <path key={`${parentNode.id}-${node.id}`} d={d} stroke={strokeColor} strokeWidth={Math.max(1, 2 / scale)} fill="none" />
                  );
                })}
              </svg>

              {allNodes.map((nodeData) => (
                <NodeCard
                  key={nodeData.id}
                  node={nodeData}
                  onEdit={handleEditNode}
                  onDelete={requestDeleteNode}
                  onAddChild={handleAddChildNode}
                  onDragStart={(e) => handleNodeDragStart(e, nodeData.id)}
                  onNodeHeightChange={handleNodeHeightChange} 
                  getApproxNodeHeightFromHook={getApproxNodeHeight}
                  STANDARD_NODE_WIDTH_FROM_HOOK={STANDARD_NODE_WIDTH}
                  className="node-card-draggable"
                />
              ))}

              {allNodes.length === 0 && (
                 <div
                  className="absolute inset-0 flex items-center justify-center pointer-events-none text-center"
                  style={{ top: `${canvasNumericHeight / 2}px`, left: `${canvasNumericWidth / 2}px`, transform: `translate(-50%, -50%) scale(${1/scale})`, transformOrigin: 'center center' }}
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
            onOpenChange={(open) => { setIsEditDialogOpen(open); if (!open) setEditingNode(null); }}
            node={editingNode}
            onSave={handleSaveNode}
          />
        )}
        {nodeToDelete && (
          <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader><AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete node "{nodeToDelete.title || 'Untitled'}" and all its children? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => { setIsDeleteDialogOpen(false); setNodeToDelete(null); }}>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={confirmDeleteNode} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </TooltipProvider>
  );
}

