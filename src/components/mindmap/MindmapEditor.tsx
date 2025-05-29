
"use client";

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { Mindmap, NodeData, EditNodeInput, MindmapData } from '@/types/mindmap';
import { useMindmaps } from '@/hooks/useMindmaps';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NodeCard } from './NodeCard';
import { EditNodeDialog } from './EditNodeDialog';
import { PlusCircle, Download, ArrowLeft, Brain, Hand, ZoomIn, ZoomOut, LocateFixed, Undo, Redo, Layers, Save, FileJson } from 'lucide-react';
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

// Fixed Viewport Dimensions (v0.0.3 setup)
const FIXED_VIEWPORT_WIDTH = 1200;
const FIXED_VIEWPORT_HEIGHT = 800;
// Logical Canvas Dimensions (v0.0.4 setup, now used in v0.0.5)
const CANVAS_CONTENT_WIDTH_STR = '2000px';
const CANVAS_CONTENT_HEIGHT_STR = '2000px';

const deepClone = <T,>(obj: T): T => {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (obj instanceof Date) {
    return new Date(obj.getTime()) as any;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item)) as any;
  }
  // Fallback for environments without structuredClone or for complex objects
  // Note: JSON.parse(JSON.stringify()) has limitations (e.g., loses Date objects, functions, undefined)
  // but for MindmapData which is primarily plain objects, arrays, strings, numbers, it's usually sufficient.
  try {
    if (typeof structuredClone === 'function') {
      return structuredClone(obj);
    }
  } catch (e) {
    // console.warn("structuredClone failed, falling back to JSON.parse(JSON.stringify()):", e);
  }
  return JSON.parse(JSON.stringify(obj));
};


interface MindmapEditorProps {
  mindmapId: string;
}

export function MindmapEditor({ mindmapId }: MindmapEditorProps) {
  const {
    getMindmapById,
    addNode,
    updateNode,
    deleteNode: deleteNodeFromHook,
    updateNodePosition,
    updateMindmap,
    getApproxNodeHeight,
    NODE_CARD_WIDTH
  } = useMindmaps();

  const mindmap = getMindmapById(mindmapId);

  const [editingNode, setEditingNode] = useState<NodeData | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [newRootNodeTitle, setNewRootNodeTitle] = useState('');
  const [newRootNodeDescription, setNewRootNodeDescription] = useState('');
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [nodeToDelete, setNodeToDelete] = useState<{ id: string; title: string | undefined } | null>(null);
  const { toast } = useToast();

  // Canvas interaction states from v0.0.3 / v0.0.5
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [activeTool, setActiveTool] = useState<'select' | 'pan'>('select');
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ mouseX: number; mouseY: number; initialPanX: number; initialPanY: number } | null>(null);
  const pinchStartRef = useRef<{ dist: number; centerX: number; centerY: number; initialPan: { x: number, y: number }, initialScale: number } | null>(null);


  const viewportContainerRef = useRef<HTMLDivElement>(null);
  const canvasContentRef = useRef<HTMLDivElement>(null);

  const canvasNumericWidth = useMemo(() => parseInt(CANVAS_CONTENT_WIDTH_STR, 10), []);
  const canvasNumericHeight = useMemo(() => parseInt(CANVAS_CONTENT_HEIGHT_STR, 10), []);

  // Undo/Redo states
  const [undoStack, setUndoStack] = useState<MindmapData[]>([]);
  const [redoStack, setRedoStack] = useState<MindmapData[]>([]);
  const initialViewCenteredRef = useRef(false);
  const dragDataRef = useRef<{ nodeId: string; logicalDragOffsetX: number; logicalDragOffsetY: number } | null>(null);


  const clampPan = useCallback((newPanX: number, newPanY: number, currentScale: number) => {
    if (!viewportContainerRef.current) return { x: newPanX, y: newPanY };

    const viewportRect = viewportContainerRef.current.getBoundingClientRect();
    const scaledCanvasWidth = canvasNumericWidth * currentScale;
    const scaledCanvasHeight = canvasNumericHeight * currentScale;

    let clampedX = newPanX;
    let clampedY = newPanY;

    // If scaled canvas is wider than viewport, allow panning until edges meet
    if (scaledCanvasWidth > viewportRect.width) {
      clampedX = Math.min(0, Math.max(newPanX, viewportRect.width - scaledCanvasWidth));
    } else { // If scaled canvas is narrower, keep it within viewport (can be centered or aligned)
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

    const newScale = Math.max(0.25, Math.min(2.0, newScaleAttempt));
    const viewportRect = viewportContainerRef.current.getBoundingClientRect();

    const targetX = focalX_viewport !== undefined ? focalX_viewport : viewportRect.width / 2;
    const targetY = focalY_viewport !== undefined ? focalY_viewport : viewportRect.height / 2;

    // Calculate new pan based on the focal point
    // The point on the logical canvas under the focal point should remain under the focal point
    const newPanX = targetX - (targetX - pan.x) * (newScale / scale);
    const newPanY = targetY - (targetY - pan.y) * (newScale / scale);

    const clampedNewPan = clampPan(newPanX, newPanY, newScale);

    setScale(newScale);
    setPan(clampedNewPan);
  }, [scale, pan, clampPan]);


  const handleButtonZoomIn = useCallback(() => adjustZoom(scale * 1.2), [adjustZoom, scale]);
  const handleButtonZoomOut = useCallback(() => adjustZoom(scale / 1.2), [adjustZoom, scale]);

  const handleWheelZoom = useCallback((event: WheelEvent) => {
    if (!viewportContainerRef.current || (event.target as HTMLElement).closest('.node-card-draggable') || (event.target as HTMLElement).closest('[data-tool-button]')) return;
    event.preventDefault();
    const viewportRect = viewportContainerRef.current.getBoundingClientRect();
    const focalX = event.clientX - viewportRect.left;
    const focalY = event.clientY - viewportRect.top;
    const delta = event.deltaY > 0 ? 0.9 : 1.1; // Consistent zoom factor
    adjustZoom(scale * delta, focalX, focalY);
  }, [adjustZoom, scale]);


  const handleRecenterView = useCallback(() => {
    if (!viewportContainerRef.current || !mindmap) return;

    const allNodesArray = Object.values(mindmap.data.nodes);
    const viewportRect = viewportContainerRef.current.getBoundingClientRect();

    if (allNodesArray.length === 0) {
      const targetScale = 1;
      const newPanX = (viewportRect.width / 2) - (canvasNumericWidth / 2) * targetScale;
      const newPanY = (viewportRect.height / 2) - (canvasNumericHeight / 2) * targetScale;
      const clamped = clampPan(newPanX, newPanY, targetScale);
      setScale(targetScale);
      setPan(clamped);
      return;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    allNodesArray.forEach(node => {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + NODE_CARD_WIDTH);
      maxY = Math.max(maxY, node.y + getApproxNodeHeight(node));
    });

    const contentWidth = Math.max(NODE_CARD_WIDTH, maxX - minX); // Ensure contentWidth is at least one node wide
    const contentHeight = Math.max(getApproxNodeHeight(null), maxY - minY); // Ensure contentHeight is at least one node high
    const padding = 50; // Visual padding around content when fitting

    let newFitScale;
    if (contentWidth <= 0 || contentHeight <= 0 || (viewportRect.width - 2 * padding) <= 0 || (viewportRect.height - 2 * padding) <= 0) {
        newFitScale = 1; // Default scale if content or viewport is too small
    } else {
        const scaleX = (viewportRect.width - 2 * padding) / contentWidth;
        const scaleY = (viewportRect.height - 2 * padding) / contentHeight;
        newFitScale = Math.min(scaleX, scaleY, 2.0); // Cap max scale at 2.0
    }
    newFitScale = Math.max(0.25, newFitScale); // Min scale 0.25

    const contentCenterX_logical = minX + contentWidth / 2;
    const contentCenterY_logical = minY + contentHeight / 2;

    const newFitPanX = viewportRect.width / 2 - contentCenterX_logical * newFitScale;
    const newFitPanY = viewportRect.height / 2 - contentCenterY_logical * newFitScale;

    const clampedFitPan = clampPan(newFitPanX, newFitPanY, newFitScale);
    setScale(newFitScale);
    setPan(clampedFitPan);
  }, [mindmap, getApproxNodeHeight, clampPan, NODE_CARD_WIDTH, canvasNumericWidth, canvasNumericHeight]);


  useEffect(() => {
    if (mindmap && !initialViewCenteredRef.current) {
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
    if (mindmap?.data && initialViewCenteredRef.current && undoStack.length === 0) {
        setUndoStack([deepClone(mindmap.data)]);
    }
  }, [mindmap?.data, initialViewCenteredRef.current, undoStack.length]);


  const handleUndo = useCallback(() => {
    if (!mindmap || undoStack.length <= 1) return; // Current state is the last in undoStack
    const previousData = deepClone(undoStack[undoStack.length - 2]); // The actual previous state
    const currentStateForRedo = deepClone(undoStack[undoStack.length - 1]); // Current state moves to redo

    setUndoStack(prev => prev.slice(0, -1));
    setRedoStack(prev => [currentStateForRedo, ...prev.slice(0,19)]);
    updateMindmap(mindmap.id, { data: previousData });
  }, [mindmap, undoStack, updateMindmap]);

  const handleRedo = useCallback(() => {
    if (!mindmap || redoStack.length === 0) return;
    const nextData = deepClone(redoStack[0]);
    // No need to clone mindmap.data again for undo if it's already the last element of undoStack
    // However, to be safe and match the handleUndo logic:
    if (undoStack.length > 0 && mindmap.data !== undoStack[undoStack.length - 1]) {
        setUndoStack(prev => [...prev.slice(-19), deepClone(mindmap.data)]);
    } else if (undoStack.length === 0 && mindmap.data) {
        // This case might occur if undo stack became empty somehow, but we have a current state
        setUndoStack([deepClone(mindmap.data)]);
    }


    setRedoStack(prev => prev.slice(1));
    updateMindmap(mindmap.id, { data: nextData });
  }, [mindmap, redoStack, undoStack, updateMindmap]);


  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const ctrlKey = isMac ? event.metaKey : event.ctrlKey;

      if (ctrlKey && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) { handleRedo(); } else { handleUndo(); }
      } else if (ctrlKey && event.key.toLowerCase() === 'y' && !isMac) {
        event.preventDefault(); handleRedo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);


  const handlePanMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (activeTool !== 'pan' || !viewportContainerRef.current) return;
    // Prevent pan if clicking on a node card or interactive elements within it
    if ((event.target as HTMLElement).closest('.node-card-draggable') || (event.target as HTMLElement).closest('button') || (event.target as HTMLElement).closest('a')) return;

    event.preventDefault();
    setIsPanning(true);
    panStartRef.current = { mouseX: event.clientX, mouseY: event.clientY, initialPanX: pan.x, initialPanY: pan.y };
  }, [activeTool, pan]);

  const handlePanMouseMove = useCallback((event: MouseEvent) => {
    if (!isPanning || !panStartRef.current || !viewportContainerRef.current) return;
    event.preventDefault();
    const dx = event.clientX - panStartRef.current.mouseX;
    const dy = event.clientY - panStartRef.current.mouseY;
    const newPanX = panStartRef.current.initialPanX + dx;
    const newPanY = panStartRef.current.initialPanY + dy;

    setPan(clampPan(newPanX, newPanY, scale));
  }, [isPanning, scale, clampPan]);


  const handlePanMouseUpOrLeave = useCallback(() => {
    if (isPanning) {
      setIsPanning(false);
    }
    // panStartRef.current = null; // Keep this to avoid potential issues if mouseup is outside
  }, [isPanning]);


  // Touch Panning and Pinch Zoom
 useEffect(() => {
    const vpCurrent = viewportContainerRef.current;
    if (!vpCurrent) return;

    const handleTouchStart = (event: TouchEvent) => {
        if ((event.target as HTMLElement).closest('.node-card-draggable')) return;
        
        const touches = event.touches;
        if (touches.length === 1 && activeTool === 'pan') {
            event.preventDefault();
            setIsPanning(true);
            panStartRef.current = { 
                mouseX: touches[0].clientX, 
                mouseY: touches[0].clientY, 
                initialPanX: pan.x, 
                initialPanY: pan.y 
            };
        } else if (touches.length === 2) { // Pinch zoom
            event.preventDefault();
            const dx = touches[0].clientX - touches[1].clientX;
            const dy = touches[0].clientY - touches[1].clientY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const centerX = (touches[0].clientX + touches[1].clientX) / 2;
            const centerY = (touches[0].clientY + touches[1].clientY) / 2;
            const viewportRect = vpCurrent.getBoundingClientRect();
            pinchStartRef.current = { 
                dist, 
                centerX: centerX - viewportRect.left, 
                centerY: centerY - viewportRect.top,
                initialPan: { ...pan },
                initialScale: scale
            };
        }
    };

    const handleTouchMove = (event: TouchEvent) => {
        if ((event.target as HTMLElement).closest('.node-card-draggable')) return;

        const touches = event.touches;
        if (touches.length === 1 && isPanning && panStartRef.current && activeTool === 'pan') {
            event.preventDefault();
            const dx = touches[0].clientX - panStartRef.current.mouseX;
            const dy = touches[0].clientY - panStartRef.current.mouseY;
            const newPanX = panStartRef.current.initialPanX + dx;
            const newPanY = panStartRef.current.initialPanY + dy;
            setPan(clampPan(newPanX, newPanY, scale));
        } else if (touches.length === 2 && pinchStartRef.current) { // Pinch zoom
            event.preventDefault();
            const dx = touches[0].clientX - touches[1].clientX;
            const dy = touches[0].clientY - touches[1].clientY;
            const newDist = Math.sqrt(dx * dx + dy * dy);
            const scaleChange = newDist / pinchStartRef.current.dist;
            const newScaleAttempt = pinchStartRef.current.initialScale * scaleChange;
            
            adjustZoom(newScaleAttempt, pinchStartRef.current.centerX, pinchStartRef.current.centerY);
        }
    };

    const handleTouchEnd = (event: TouchEvent) => {
        // if ((event.target as HTMLElement).closest('.node-card-draggable')) return; // Not needed for touchend
        if (isPanning) {
            setIsPanning(false);
        }
        pinchStartRef.current = null; // Reset pinch state
        // panStartRef.current = null; // Reset pan state for touch
    };
    
    vpCurrent.addEventListener('wheel', handleWheelZoom, { passive: false });
    vpCurrent.addEventListener('touchstart', handleTouchStart, { passive: false });
    vpCurrent.addEventListener('touchmove', handleTouchMove, { passive: false });
    vpCurrent.addEventListener('touchend', handleTouchEnd, { passive: false });
    vpCurrent.addEventListener('touchcancel', handleTouchEnd, { passive: false });


    return () => {
        if (vpCurrent) {
            vpCurrent.removeEventListener('wheel', handleWheelZoom);
            vpCurrent.removeEventListener('touchstart', handleTouchStart);
            vpCurrent.removeEventListener('touchmove', handleTouchMove);
            vpCurrent.removeEventListener('touchend', handleTouchEnd);
            vpCurrent.removeEventListener('touchcancel', handleTouchEnd);
        }
    };
}, [handleWheelZoom, activeTool, pan, scale, isPanning, clampPan, adjustZoom]);


  useEffect(() => {
    const currentViewport = viewportContainerRef.current;
    if (currentViewport) {
      if (activeTool === 'pan') {
        currentViewport.style.cursor = isPanning ? 'grabbing' : 'grab';
      } else {
        currentViewport.style.cursor = 'default';
      }
    }

    if (isPanning && activeTool === 'pan') { // Only for mouse panning
      window.addEventListener('mousemove', handlePanMouseMove);
      window.addEventListener('mouseup', handlePanMouseUpOrLeave);
      window.addEventListener('mouseleave', handlePanMouseUpOrLeave);
      return () => {
        window.removeEventListener('mousemove', handlePanMouseMove);
        window.removeEventListener('mouseup', handlePanMouseUpOrLeave);
        window.removeEventListener('mouseleave', handlePanMouseUpOrLeave);
        if (currentViewport && activeTool === 'pan') currentViewport.style.cursor = 'grab';
      };
    }
  }, [isPanning, handlePanMouseMove, handlePanMouseUpOrLeave, activeTool]);


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

      // Center view on new node
      const viewportRect = viewportContainerRef.current.getBoundingClientRect();
      const nodeCenterX_logical = newRootNode.x + NODE_CARD_WIDTH / 2;
      const nodeCenterY_logical = newRootNode.y + getApproxNodeHeight(newRootNode) / 2;

      const newPanX = viewportRect.width / 2 - nodeCenterX_logical * scale;
      const newPanY = viewportRect.height / 2 - nodeCenterY_logical * scale;
      setPan(clampPan(newPanX, newPanY, scale));
    }
  }, [newRootNodeTitle, newRootNodeDescription, mindmap, addNode, toast, getApproxNodeHeight, scale, clampPan, beforeMutation, NODE_CARD_WIDTH]);

  const handleAddChildNode = useCallback((parentId: string) => {
    if (!mindmap) return;
    const parentNode = mindmap.data.nodes[parentId];
    if (!parentNode) return;

    // For v0.0.5, customBackgroundColor is not part of EditNodeInput/NodeData
    const tempNewNode: NodeData = {
      id: `temp-${uuidv4()}`,
      title: '',
      description: "",
      emoji: "➕",
      parentId: parentId,
      childIds: [],
      x: 0, y: 0,
      // customBackgroundColor: undefined, // Not in v0.0.5
    };
    setEditingNode(tempNewNode);
    setIsEditDialogOpen(true);
  }, [mindmap]);

  const handleEditNode = useCallback((node: NodeData) => {
    setEditingNode(deepClone(node));
    setIsEditDialogOpen(true);
  }, []);

  const handleSaveNode = useCallback((nodeIdFromDialog: string, data: EditNodeInput) => {
    if (!mindmap || !editingNode) return;
    beforeMutation();

    if (editingNode.id.startsWith('temp-')) {
      const permanentNode = addNode(mindmap.id, editingNode.parentId, data);
      if (permanentNode) {
        toast({ title: "Node Created", description: `Node "${permanentNode.title}" added.` });
      }
    } else {
      updateNode(mindmap.id, editingNode.id, data);
      toast({ title: "Node Updated", description: `Node "${data.title}" saved.` });
    }
    setEditingNode(null);
    setIsEditDialogOpen(false);
  }, [mindmap, editingNode, addNode, updateNode, toast, beforeMutation]);

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
    toast({ title: "Node Deleted", description: `Node "${nodeToDelete.title || 'Untitled'}" and its children removed.`, variant: "destructive" });
    setIsDeleteDialogOpen(false);
    setNodeToDelete(null);
  }, [mindmap, nodeToDelete, deleteNodeFromHook, toast, beforeMutation]);


  const handleNodeDragStart = useCallback((event: React.DragEvent<HTMLDivElement>, nodeId: string) => {
    if (activeTool === 'pan') { event.preventDefault(); return; }
    const nodeElement = event.currentTarget;
    const nodeRect = nodeElement.getBoundingClientRect();

    // Store logical offset (relative to node's coordinate system)
    const logicalDragOffsetX = (event.clientX - nodeRect.left) / scale;
    const logicalDragOffsetY = (event.clientY - nodeRect.top) / scale;

    const dragPayload = { nodeId, logicalDragOffsetX, logicalDragOffsetY };
    event.dataTransfer.setData('application/json', JSON.stringify(dragPayload));
    event.dataTransfer.effectAllowed = "move";
    dragDataRef.current = dragPayload; // Keep a ref as fallback
  }, [activeTool, scale]);


  const handleDragOverCanvas = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);


  const handleDropOnCanvas = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!viewportContainerRef.current || !mindmap || activeTool === 'pan') return;

    let dragPayload;
    try {
      const jsonData = event.dataTransfer.getData('application/json');
      dragPayload = jsonData ? JSON.parse(jsonData) : dragDataRef.current;
      if (!dragPayload || typeof dragPayload.logicalDragOffsetX !== 'number' || typeof dragPayload.logicalDragOffsetY !== 'number') {
        console.error("Invalid drag payload:", dragPayload); dragDataRef.current = null; return;
      }
    } catch (e) { console.error("Error parsing drag payload:", e); dragDataRef.current = null; return; }

    const { nodeId, logicalDragOffsetX, logicalDragOffsetY } = dragPayload;
    if (!nodeId) { dragDataRef.current = null; return; }

    const viewportRect = viewportContainerRef.current.getBoundingClientRect();
    // Calculate new logical position
    let newX_logical = (event.clientX - viewportRect.left - pan.x) / scale - logicalDragOffsetX;
    let newY_logical = (event.clientY - viewportRect.top - pan.y) / scale - logicalDragOffsetY;

    const nodeToDrag = mindmap.data.nodes[nodeId];
    if (!nodeToDrag) { dragDataRef.current = null; return; }

    // Clamping node position within logical canvas boundaries (v0.0.4 behavior)
    const approxNodeHeight = getApproxNodeHeight(nodeToDrag);
    newX_logical = Math.max(0, Math.min(newX_logical, canvasNumericWidth - NODE_CARD_WIDTH));
    newY_logical = Math.max(0, Math.min(newY_logical, canvasNumericHeight - approxNodeHeight));

    beforeMutation();
    updateNodePosition(mindmap.id, nodeId, newX_logical, newY_logical);
    dragDataRef.current = null;
  }, [mindmap, updateNodePosition, pan, scale, activeTool, beforeMutation, NODE_CARD_WIDTH, canvasNumericWidth, canvasNumericHeight, getApproxNodeHeight]);


  const handleExportJson = useCallback(() => {
    if (!mindmap) return;
    const jsonString = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(mindmap, null, 2));
    const link = document.createElement("a");
    link.href = jsonString;
    link.download = `${mindmap.name.replace(/\s+/g, '_').toLowerCase()}_mindmap.json`;
    link.click();
    toast({ title: "Exported", description: "Mindmap data exported as JSON." });
  }, [mindmap, toast]);


  if (!mindmap) {
    return (
      <div className="flex flex-col items-center justify-center h-full flex-grow space-y-4 text-center py-10">
        <Brain className="w-16 h-16 text-destructive" />
        <h2 className="text-2xl font-bold">Mindmap Not Found</h2>
        <p className="text-muted-foreground">The mindmap you are looking for does not exist or has been deleted.</p>
        <Button asChild variant="outline" size="sm"><Link href="/"><ArrowLeft className="mr-1.5 h-4 w-4" /> Library</Link></Button>
      </div>
    );
  }

  const allNodes = Object.values(mindmap.data.nodes);
  const svgKey = allNodes.map(n => `${n.id}-${n.x}-${n.y}-${n.parentId}-${(n.childIds || []).join(',')}`).join('|') + `-${scale}-${pan.x}-${pan.y}`;

  const canUndo = undoStack.length > 1;
  const canRedo = redoStack.length > 0;

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full flex-grow w-full bg-background">
        {/* Top Control Bar */}
        <div className="p-1 border-b bg-background/80 backdrop-blur-sm rounded-t-lg sticky top-0 z-10 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-2">
            <div className="flex items-center gap-2 flex-shrink-0 min-w-0">
              <Tooltip><TooltipTrigger asChild><Button asChild variant="ghost" size="icon" className="h-8 w-8"><Link href="/"><ArrowLeft className="h-4 w-4" /></Link></Button></TooltipTrigger><TooltipContent><p>Library</p></TooltipContent></Tooltip>
              <h1 className="text-md font-semibold text-foreground truncate leading-none" title={mindmap.name}>{mindmap.name}</h1>
              {mindmap.category && (<span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full flex items-center gap-1 whitespace-nowrap leading-none"><Layers className="h-3 w-3" /> {mindmap.category}</span>)}
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

        {/* Fixed Viewport for Canvas */}
        <div className="flex-grow flex items-center justify-center p-0 bg-muted/30">
          <div
            ref={viewportContainerRef}
            className="bg-card shadow-2xl rounded-lg" // v0.0.3 uses bg-card here
            style={{
              width: `${FIXED_VIEWPORT_WIDTH}px`,
              height: `${FIXED_VIEWPORT_HEIGHT}px`,
              overflow: 'hidden',
              userSelect: 'none',
              position: 'relative',
            }}
            onMouseDown={handlePanMouseDown} // For mouse-based panning
          >
            <div
              ref={canvasContentRef}
              className="relative bg-card border-2 border-dashed border-sky-300" // v0.0.4 logical canvas visual style
              style={{
                width: CANVAS_CONTENT_WIDTH_STR,
                height: CANVAS_CONTENT_HEIGHT_STR,
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                transformOrigin: '0 0',
                pointerEvents: activeTool === 'pan' && isPanning ? 'none' : 'auto', // Disable pointer events on content during pan
              }}
              onDragOver={handleDragOverCanvas}
              onDrop={handleDropOnCanvas}
            >
              <svg
                className="absolute top-0 left-0 pointer-events-none"
                style={{ width: CANVAS_CONTENT_WIDTH_STR, height: CANVAS_CONTENT_HEIGHT_STR, overflow: 'visible' }}
                key={svgKey}
              >
                {allNodes.map(node => {
                  if (!node.parentId) return null;
                  const parentNode = mindmap.data.nodes[node.parentId];
                  if (!parentNode) return null;

                  const approxParentHeight = getApproxNodeHeight(parentNode);

                  const parentCardCenterX = (parentNode.x ?? 0) + NODE_CARD_WIDTH / 2;
                  const parentAnchorY = (parentNode.y ?? 0) + approxParentHeight - 10; // Adjusted anchor

                  const childCardCenterX = (node.x ?? 0) + NODE_CARD_WIDTH / 2;
                  const childAnchorY = (node.y ?? 0) + 10; // Adjusted anchor
                  
                  const curveOffsetYAdjusted = Math.max(30, Math.abs(childAnchorY - parentAnchorY) / 2);

                  const c1x = parentCardCenterX;
                  const c1y = parentAnchorY + curveOffsetYAdjusted;
                  const c2x = childCardCenterX;
                  const c2y = childAnchorY - curveOffsetYAdjusted;

                  // v0.0.5 default theme wire coloring
                  let strokeColor = "hsl(var(--border))"; 
                   if(parentNode.parentId === null) { // parent is root
                       strokeColor = "hsl(var(--primary))";
                   } else { // parent is child
                       strokeColor = "hsl(var(--accent))";
                   }

                  return (
                    <path
                        key={`${parentNode.id}-${node.id}`}
                        d={`M ${parentCardCenterX} ${parentAnchorY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${childCardCenterX} ${childAnchorY}`}
                        stroke={strokeColor}
                        strokeWidth={Math.max(1, 2 / scale)}
                        fill="none"
                    />
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
                  onDragStart={(e, id) => handleNodeDragStart(e, id)}
                  className="node-card-draggable" // Important for pan vs drag logic
                />
              ))}
              {allNodes.length === 0 && (
                <div
                  className="absolute inset-0 flex items-center justify-center pointer-events-none text-center"
                  style={{
                    top: `${canvasNumericHeight / 2}px`,
                    left: `${canvasNumericWidth / 2}px`,
                    transform: `translate(-50%, -50%) scale(${1/scale})`, // Adjust for current scale
                    transformOrigin: 'center center'
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
