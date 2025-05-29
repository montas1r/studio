
"use client";

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { Mindmap, NodeData, EditNodeInput, MindmapData } from '@/types/mindmap';
import { useMindmaps } from '@/hooks/useMindmaps';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NodeCard } from './NodeCard';
import { EditNodeDialog } from './EditNodeDialog';
import { PlusCircle, Download, ArrowLeft, Layers, Hand, ZoomIn, ZoomOut, LocateFixed, Undo, Redo, Brain } from 'lucide-react';
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
const CANVAS_CONTENT_WIDTH_STR = '2000px'; // Logical canvas size
const CANVAS_CONTENT_HEIGHT_STR = '2000px'; // Logical canvas size

const FIXED_VIEWPORT_WIDTH = 1200; // Fixed viewport size on screen
const FIXED_VIEWPORT_HEIGHT = 800; // Fixed viewport size on screen


const deepClone = <T,>(obj: T): T => {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item)) as any;
  }
  if (obj instanceof Date) { 
    return new Date(obj.toISOString()) as any;
  }
  try {
    // Using structuredClone for a more robust deep clone if available, fallback to JSON
    if (typeof structuredClone === 'function') {
      return structuredClone(obj);
    }
    return JSON.parse(JSON.stringify(obj));
  } catch (e) {
    console.error("Deep clone failed, falling back to shallow or partial clone for complex types:", e, obj);
    // Fallback for types not handled by JSON.stringify (like functions, undefined)
    const clonedObj = {} as T;
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        clonedObj[key] = deepClone(obj[key]);
      }
    }
    return clonedObj;
  }
};

interface MindmapEditorProps {
  mindmapId: string;
}

export function MindmapEditor({ mindmapId }: MindmapEditorProps) {
  const { getMindmapById, addNode, updateNode, deleteNode: deleteNodeFromHook, updateNodePosition, updateMindmap, getApproxNodeHeight } = useMindmaps();
  const mindmap = getMindmapById(mindmapId);

  const [editingNode, setEditingNode] = useState<NodeData | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [newRootNodeTitle, setNewRootNodeTitle] = useState('');
  const [newRootNodeDescription, setNewRootNodeDescription] = useState('');

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [nodeToDelete, setNodeToDelete] = useState<{ id: string; title: string | undefined } | null>(null);

  const { toast } = useToast();

  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [activeTool, setActiveTool] = useState<'select' | 'pan'>('select');
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ mouseX: number; mouseY: number; initialPanX: number; initialPanY: number } | null>(null);
  const dragDataRef = useRef<{ nodeId: string; logicalDragOffsetX: number; logicalDragOffsetY: number } | null>(null);
  
  const viewportContainerRef = useRef<HTMLDivElement>(null); // The 1200x800 fixed viewport
  const canvasContentRef = useRef<HTMLDivElement>(null); // The 2000x2000 logical canvas

  const canvasNumericWidth = useMemo(() => parseInt(CANVAS_CONTENT_WIDTH_STR, 10), []);
  const canvasNumericHeight = useMemo(() => parseInt(CANVAS_CONTENT_HEIGHT_STR, 10), []);

  const [undoStack, setUndoStack] = useState<MindmapData[]>([]);
  const [redoStack, setRedoStack] = useState<MindmapData[]>([]);
  const initialViewCenteredRef = useRef(false);

  const clampPan = useCallback((newPanX: number, newPanY: number, currentScale: number) => {
    if (!viewportContainerRef.current) return { x: newPanX, y: newPanY };
    const viewportRect = viewportContainerRef.current.getBoundingClientRect();
    
    let clampedX = newPanX;
    let clampedY = newPanY;

    const scaledCanvasWidth = canvasNumericWidth * currentScale;
    const scaledCanvasHeight = canvasNumericHeight * currentScale;

    // If scaled canvas is larger than viewport, ensure viewport doesn't pan beyond canvas edges
    if (scaledCanvasWidth > viewportRect.width) {
      clampedX = Math.min(0, Math.max(newPanX, viewportRect.width - scaledCanvasWidth));
    } else { // If scaled canvas is smaller, ensure it stays within viewport (or allow centering)
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
    const newScale = Math.min(2.0, Math.max(0.25, newScaleAttempt));
    
    const viewportRect = viewportContainerRef.current.getBoundingClientRect();
    const targetX = focalX_viewport !== undefined ? focalX_viewport : viewportRect.width / 2;
    const targetY = focalY_viewport !== undefined ? focalY_viewport : viewportRect.height / 2;

    const newPanX = targetX - (targetX - pan.x) * (newScale / scale);
    const newPanY = targetY - (targetY - pan.y) * (newScale / scale);
    
    const clampedNewPan = clampPan(newPanX, newPanY, newScale);
    setScale(newScale);
    setPan(clampedNewPan);
  }, [scale, pan, clampPan]);

  const handleButtonZoomIn = useCallback(() => adjustZoom(scale * 1.1), [adjustZoom, scale]);
  const handleButtonZoomOut = useCallback(() => adjustZoom(scale / 1.1), [adjustZoom, scale]);

  const handleWheelZoom = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    if (!viewportContainerRef.current) return;
    event.preventDefault();
    const viewportRect = viewportContainerRef.current.getBoundingClientRect();
    const focalX = event.clientX - viewportRect.left;
    const focalY = event.clientY - viewportRect.top;
    const delta = event.deltaY > 0 ? 0.9 : 1.1; // Standard scroll direction
    adjustZoom(scale * delta, focalX, focalY);
  }, [adjustZoom, scale]);

  const handleRecenterView = useCallback(() => {
    if (!viewportContainerRef.current || !mindmap) return;
    const allNodesArray = Object.values(mindmap.data.nodes);
    const viewportRect = viewportContainerRef.current.getBoundingClientRect();

    if (allNodesArray.length === 0) {
      const targetScale = 1; // Default scale
      // Center the logical 0,0 of the canvas in the viewport
      const newPanX = (viewportRect.width - (canvasNumericWidth * targetScale)) / 2 + (canvasNumericWidth * targetScale / 2 - (INITIAL_ROOT_X + NODE_CARD_WIDTH /2) * targetScale);
      const newPanY = (viewportRect.height - (canvasNumericHeight * targetScale)) / 2 + (canvasNumericHeight * targetScale / 2 - (INITIAL_ROOT_Y + getApproxNodeHeight(null) /2) * targetScale);
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
    
    const contentWidth = Math.max(NODE_CARD_WIDTH, maxX - minX);
    const contentHeight = Math.max(getApproxNodeHeight(null), maxY - minY);

    const padding = 50; 
    let newFitScale;
    if (contentWidth <= 0 || contentHeight <= 0 || viewportRect.width - 2 * padding <= 0 || viewportRect.height - 2 * padding <= 0) {
      newFitScale = 1;
    } else {
      const scaleX = (viewportRect.width - 2 * padding) / contentWidth;
      const scaleY = (viewportRect.height - 2 * padding) / contentHeight;
      newFitScale = Math.min(scaleX, scaleY, 2.0);
    }
    newFitScale = Math.max(0.25, newFitScale); 
    
    const contentCenterX_logical = minX + contentWidth / 2;
    const contentCenterY_logical = minY + contentHeight / 2;

    const newFitPanX = viewportRect.width / 2 - contentCenterX_logical * newFitScale;
    const newFitPanY = viewportRect.height / 2 - contentCenterY_logical * newFitScale;
    
    const clampedFitPan = clampPan(newFitPanX, newFitPanY, newFitScale);
    setScale(newFitScale);
    setPan(clampedFitPan);
  }, [mindmap, getApproxNodeHeight, clampPan, canvasNumericWidth, canvasNumericHeight]);

  // Undo Redo Logic
  useEffect(() => {
    if (mindmap?.data) {
      const initialData = deepClone(mindmap.data);
      if (undoStack.length === 0 || JSON.stringify(undoStack[undoStack.length -1]) !== JSON.stringify(initialData)) {
         setUndoStack([initialData]);
         setRedoStack([]);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mindmap?.id]); // Only on mindmap load

 const beforeMutation = useCallback(() => {
    if (mindmap?.data) {
      const currentDataSnapshot = deepClone(mindmap.data);
      setUndoStack(prev => {
        // Avoid duplicate states if mutation happens very fast or is part of same logical op
        if (prev.length > 0 && JSON.stringify(prev[prev.length - 1]) === JSON.stringify(currentDataSnapshot)) {
          return prev;
        }
        return [...prev, currentDataSnapshot];
      });
      setRedoStack([]); // Any new action clears the redo stack
    }
  }, [mindmap?.data]);


  const handleUndo = useCallback(() => {
    if (!mindmap || undoStack.length <= 1) return; 
    
    const currentActualData = deepClone(mindmap.data);
    const previousDataFromStack = undoStack[undoStack.length - 2];

    if (previousDataFromStack) {
      setUndoStack(prevStack => prevStack.slice(0, -1));
      setRedoStack(prevRedo => [currentActualData, ...prevRedo]);
      updateMindmap(mindmap.id, { data: deepClone(previousDataFromStack) });
    }
  }, [mindmap, undoStack, updateMindmap]);

  const handleRedo = useCallback(() => {
    if (!mindmap || redoStack.length === 0) return;
    const currentActualData = deepClone(mindmap.data);
    const nextData = deepClone(redoStack[0]);

    setUndoStack(prevUndo => [...prevUndo, currentActualData]);
    setRedoStack(prevRedo => prevRedo.slice(1));
    updateMindmap(mindmap.id, { data: nextData });
  }, [mindmap, redoStack, updateMindmap]);

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
        if (event.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if (ctrlKey && (event.key.toLowerCase() === 'y') && !isMac) { // Ctrl+Y for redo on Windows/Linux
        event.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);


  useEffect(() => {
    if (mindmap && !initialViewCenteredRef.current) {
      handleRecenterView();
      initialViewCenteredRef.current = true;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mindmap?.id]); // Recenter when mindmap ID changes (i.e., new mindmap loaded)

  const handlePanMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (activeTool !== 'pan' || !viewportContainerRef.current) return;
     // Allow panning only if the direct target is the viewport or canvas background
    if ( (event.target as HTMLElement).closest('.node-card-draggable') ||
         (event.target as HTMLElement).closest('button:not([data-tool-button])') || // exclude tool buttons
         (event.target as HTMLElement).closest('input') ||
         (event.target as HTMLElement).closest('textarea')) {
      return;
    }
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
    panStartRef.current = null;
  }, [isPanning]);

  const touchStartRef = useRef<{
    dist: number; 
    centerX_viewport: number;
    centerY_viewport: number; 
    initialPanX: number;
    initialPanY: number;
    lastTouch1X?: number;
    lastTouch1Y?: number;
    isPinching: boolean;
    isPanningTouch?: boolean;
  } | null>(null);

  const handleTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (!viewportContainerRef.current) return;
    const touches = event.touches;
    const viewportRect = viewportContainerRef.current.getBoundingClientRect();

    if ((event.target as HTMLElement).closest('.node-card-draggable')) {
      // If touch starts on a node, don't initiate pan/pinch from viewport
      return;
    }

    if (touches.length === 1 && activeTool === 'pan') {
      event.preventDefault();
      touchStartRef.current = {
        dist: 0, centerX_viewport: 0, centerY_viewport: 0, isPinching: false,
        initialPanX: pan.x, initialPanY: pan.y,
        lastTouch1X: touches[0].clientX, lastTouch1Y: touches[0].clientY,
        isPanningTouch: true
      };
    } else if (touches.length === 2) { // Always allow pinch zoom regardless of activeTool
      event.preventDefault();
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const centerX = (touches[0].clientX + touches[1].clientX) / 2;
      const centerY = (touches[0].clientY + touches[1].clientY) / 2;
      touchStartRef.current = {
        dist,
        centerX_viewport: centerX - viewportRect.left,
        centerY_viewport: centerY - viewportRect.top,
        initialPanX: pan.x,
        initialPanY: pan.y,
        isPinching: true, 
        isPanningTouch: false
      };
    }
  }, [activeTool, pan]);

  const handleTouchMove = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (!touchStartRef.current || !viewportContainerRef.current) return;
    const touches = event.touches;

    if (touches.length === 1 && touchStartRef.current.isPanningTouch && touchStartRef.current.lastTouch1X !== undefined && touchStartRef.current.lastTouch1Y !== undefined) {
      event.preventDefault();
      const dx = touches[0].clientX - touchStartRef.current.lastTouch1X;
      const dy = touches[0].clientY - touchStartRef.current.lastTouch1Y;
      const newPanX = touchStartRef.current.initialPanX + dx; // Use initialPanX from touchStartRef
      const newPanY = touchStartRef.current.initialPanY + dy; // Use initialPanY from touchStartRef
      setPan(clampPan(newPanX, newPanY, scale));
      // Update lastTouch for next move calculation, relative to the state WHEN TOUCH STARTED
      // This is not strictly needed if using initialPanX/Y always, but good for other pan methods
      // touchStartRef.current.lastTouch1X = touches[0].clientX; 
      // touchStartRef.current.lastTouch1Y = touches[0].clientY;
    } else if (touches.length === 2 && touchStartRef.current.isPinching) {
      event.preventDefault();
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      const newDist = Math.sqrt(dx * dx + dy * dy);
      if (touchStartRef.current.dist > 0) { 
        const newScaleAttempt = scale * (newDist / touchStartRef.current.dist);
        adjustZoom(newScaleAttempt, touchStartRef.current.centerX_viewport, touchStartRef.current.centerY_viewport);
      }
      touchStartRef.current.dist = newDist; // Update dist for next pinch calculation
    }
  }, [scale, pan, clampPan, adjustZoom]); // pan is needed here if pan logic was based on current pan

  const handleTouchEnd = useCallback(() => {
    touchStartRef.current = null;
    setIsPanning(false); // Ensure isPanning is reset for mouse too
  }, []);
  
  useEffect(() => {
    const vpCurrent = viewportContainerRef.current;
    if (!vpCurrent) return;

    // Mouse wheel zoom is always active on the viewport
    const wheelListener = (e: WheelEvent) => handleWheelZoom(e as unknown as React.WheelEvent<HTMLDivElement>);
    vpCurrent.addEventListener('wheel', wheelListener, { passive: false });

    return () => {
      if (vpCurrent) {
         vpCurrent.removeEventListener('wheel', wheelListener);
      }
    };
  }, [handleWheelZoom]); // handleWheelZoom depends on adjustZoom, which depends on scale, pan, clampPan

  useEffect(() => {
    const currentViewport = viewportContainerRef.current;
    if (currentViewport) {
      if (activeTool === 'pan') {
        currentViewport.style.cursor = isPanning ? 'grabbing' : 'grab';
      } else {
        currentViewport.style.cursor = 'default';
      }
    }

    if (isPanning && activeTool === 'pan') { // Only attach these if panning is initiated by mouse AND pan tool is active
      window.addEventListener('mousemove', handlePanMouseMove);
      window.addEventListener('mouseup', handlePanMouseUpOrLeave);
      window.addEventListener('mouseleave', handlePanMouseUpOrLeave);
      return () => {
        window.removeEventListener('mousemove', handlePanMouseMove);
        window.removeEventListener('mouseup', handlePanMouseUpOrLeave);
        window.removeEventListener('mouseleave', handlePanMouseUpOrLeave);
        if (currentViewport && activeTool === 'pan') currentViewport.style.cursor = 'grab'; // Reset cursor on cleanup
      };
    }
  }, [isPanning, handlePanMouseMove, handlePanMouseUpOrLeave, activeTool]);


  const handleAddRootNode = useCallback(async () => {
    if (newRootNodeTitle.trim() === '') {
      toast({ title: "Title Required", description: "Please enter a title for the new root node.", variant: "destructive" });
      return;
    }
    if (!mindmap || !viewportContainerRef.current) return;
    
    beforeMutation(); // Record state before adding node

    const newNodeDetails: EditNodeInput = { title: newRootNodeTitle, description: newRootNodeDescription, emoji: '💡' };
    const newRootNode = addNode(mindmap.id, null, newNodeDetails);

    if (newRootNode) {
      setNewRootNodeTitle(''); setNewRootNodeDescription('');
      toast({ title: "Root Node Added", description: `"${newRootNode.title}" added.` });
      
      // Pan view to center the new node
      const viewportRect = viewportContainerRef.current.getBoundingClientRect();
      const nodeCenterX_logical = newRootNode.x + NODE_CARD_WIDTH / 2;
      const nodeCenterY_logical = newRootNode.y + getApproxNodeHeight(newRootNode) / 2;
      
      const newPanX = viewportRect.width / 2 - nodeCenterX_logical * scale;
      const newPanY = viewportRect.height / 2 - nodeCenterY_logical * scale;
      setPan(clampPan(newPanX, newPanY, scale));
    }
  }, [newRootNodeTitle, newRootNodeDescription, mindmap, addNode, toast, getApproxNodeHeight, scale, clampPan, beforeMutation]);

  const handleAddChildNode = useCallback((parentId: string) => {
    if (!mindmap) return;
    const parentNode = mindmap.data.nodes[parentId];
    if (!parentNode) return;
    
    // No customBackgroundColor in v0.0.5
    const tempNewNode: NodeData = {
      id: `temp-${uuidv4()}`, title: '', description: "", emoji: "➕", parentId: parentId, childIds: [],
      x: 0, y: 0, 
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
    beforeMutation(); // Record state before saving/creating node

    if (editingNode.id.startsWith('temp-')) {
      const permanentNode = addNode(mindmap.id, editingNode.parentId, data);
      if (permanentNode) {
        toast({ title: "Node Created", description: `Node "${permanentNode.title}" added.` });
      }
    } else { 
      updateNode(mindmap.id, editingNode.id, data);
      toast({ title: "Node Updated", description: `Node "${data.title}" saved.` });
    }
    setEditingNode(null); setIsEditDialogOpen(false);
  }, [mindmap, editingNode, addNode, updateNode, toast, beforeMutation]);

  const requestDeleteNode = useCallback((nodeId: string) => {
    if (!mindmap) return;
    const node = mindmap.data.nodes[nodeId];
    if (node) { setNodeToDelete({ id: nodeId, title: node.title }); setIsDeleteDialogOpen(true); }
  }, [mindmap]);

  const confirmDeleteNode = useCallback(() => {
    if (!mindmap || !nodeToDelete) return;
    beforeMutation(); // Record state before deleting node
    deleteNodeFromHook(mindmap.id, nodeToDelete.id);
    toast({ title: "Node Deleted", description: `Node "${nodeToDelete.title || 'Untitled'}" and its children removed.`, variant: "destructive" });
    setIsDeleteDialogOpen(false); setNodeToDelete(null);
  }, [mindmap, nodeToDelete, deleteNodeFromHook, toast, beforeMutation]);

  const handleNodeDragStart = useCallback((event: React.DragEvent<HTMLDivElement>, nodeId: string) => {
    if (activeTool === 'pan') { event.preventDefault(); return; }

    const nodeElement = event.currentTarget;
    const nodeRect = nodeElement.getBoundingClientRect();
    
    // Store logical offset (unscaled)
    const logicalDragOffsetX = (event.clientX - nodeRect.left) / scale;
    const logicalDragOffsetY = (event.clientY - nodeRect.top) / scale;

    const dragPayload = { nodeId, logicalDragOffsetX, logicalDragOffsetY };
    event.dataTransfer.setData('application/json', JSON.stringify(dragPayload));
    event.dataTransfer.effectAllowed = "move";
    dragDataRef.current = dragPayload; // Also store in ref for safety
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
      dragPayload = jsonData ? JSON.parse(jsonData) : dragDataRef.current; // Fallback to ref
      if (!dragPayload || typeof dragPayload.logicalDragOffsetX !== 'number' || typeof dragPayload.logicalDragOffsetY !== 'number') {
        console.error("No valid drag data found on drop"); 
        dragDataRef.current = null;
        return; 
      }
    } catch (e) { 
      console.error("Could not parse drag data on drop:", e); 
      dragDataRef.current = null;
      return; 
    }

    const { nodeId, logicalDragOffsetX, logicalDragOffsetY } = dragPayload;
    if (!nodeId) {
      dragDataRef.current = null;
      return;
    }
    
    const viewportRect = viewportContainerRef.current.getBoundingClientRect();
    
    // Calculate new logical top-left position of the node
    let newX_logical = (event.clientX - viewportRect.left - pan.x) / scale - logicalDragOffsetX;
    let newY_logical = (event.clientY - viewportRect.top - pan.y) / scale - logicalDragOffsetY;

    // Clamp node position to logical canvas boundaries
    const nodeToDrag = mindmap.data.nodes[nodeId];
    if (!nodeToDrag) {
       dragDataRef.current = null;
       return;
    }
    const approxNodeHeight = getApproxNodeHeight(nodeToDrag);
    newX_logical = Math.max(0, Math.min(newX_logical, canvasNumericWidth - NODE_CARD_WIDTH));
    newY_logical = Math.max(0, Math.min(newY_logical, canvasNumericHeight - approxNodeHeight));
    
    beforeMutation(); // Record state before updating node position
    updateNodePosition(mindmap.id, nodeId, newX_logical, newY_logical);
    dragDataRef.current = null; // Clear ref after drop
  }, [mindmap, updateNodePosition, pan, scale, canvasNumericWidth, canvasNumericHeight, getApproxNodeHeight, activeTool, beforeMutation]);

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
  // More robust SVG key, considers node positions, parent/child relationships, and view transform
  const svgKey = allNodes.map(n => `${n.id}-${n.x}-${n.y}-${n.parentId}-${(n.childIds || []).join(',')}`).join('|') + `-${scale}-${pan.x}-${pan.y}`;
  
  const canUndo = undoStack.length > 1;
  const canRedo = redoStack.length > 0;
  
  // Initial coordinates for the very first root node added to an empty mindmap
  const INITIAL_ROOT_X = (canvasNumericWidth / 2) - (NODE_CARD_WIDTH / 2);
  const INITIAL_ROOT_Y = 100;


  return (
    <TooltipProvider>
      <div className="flex flex-col h-full flex-grow w-full">
        {/* Top Control Bar */}
        <div className="p-2 border-b bg-background/90 backdrop-blur-sm space-y-2 flex-shrink-0 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="flex items-center gap-2 flex-shrink-0 min-w-0">
              <Tooltip>
                <TooltipTrigger asChild><Button asChild variant="ghost" size="icon" className="h-8 w-8"><Link href="/"><ArrowLeft className="h-4 w-4" /><span className="sr-only">Library</span></Link></Button></TooltipTrigger>
                <TooltipContent><p>Library</p></TooltipContent>
              </Tooltip>
              <h1 className="text-lg font-semibold text-foreground truncate leading-none" title={mindmap.name}>{mindmap.name}</h1>
              {mindmap.category && (<span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full flex items-center gap-1 whitespace-nowrap leading-none"><Layers className="h-3 w-3" /> {mindmap.category}</span>)}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Tooltip><TooltipTrigger asChild><Button data-tool-button variant="ghost" size="icon" onClick={handleUndo} disabled={!canUndo} className="h-8 w-8"><Undo className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Undo (Ctrl+Z)</p></TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger asChild><Button data-tool-button variant="ghost" size="icon" onClick={handleRedo} disabled={!canRedo} className="h-8 w-8"><Redo className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Redo (Ctrl+Shift+Z)</p></TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger asChild><Button data-tool-button variant="ghost" size="icon" onClick={() => setActiveTool(prev => prev === 'pan' ? 'select' : 'pan')} className={cn("h-8 w-8", activeTool === 'pan' && "bg-accent text-accent-foreground hover:bg-accent/90")}><Hand className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Pan Tool (P)</p></TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger asChild><Button data-tool-button variant="ghost" size="icon" onClick={handleButtonZoomIn} className="h-8 w-8"><ZoomIn className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Zoom In</p></TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger asChild><Button data-tool-button variant="ghost" size="icon" onClick={handleButtonZoomOut} className="h-8 w-8"><ZoomOut className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Zoom Out</p></TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger asChild><Button data-tool-button variant="ghost" size="icon" onClick={handleRecenterView} className="h-8 w-8"><LocateFixed className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Recenter View</p></TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger asChild><Button data-tool-button variant="ghost" size="icon" onClick={handleExportJson} className="h-8 w-8"><Download className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Export JSON</p></TooltipContent></Tooltip>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch gap-2">
            <Input type="text" value={newRootNodeTitle} onChange={(e) => setNewRootNodeTitle(e.target.value)} placeholder="New Root Idea Title" className="flex-grow h-9 text-sm" />
            <Textarea value={newRootNodeDescription} onChange={(e) => setNewRootNodeDescription(e.target.value)} placeholder="Description (Optional)" rows={1} className="flex-grow text-sm min-h-[36px] h-9 resize-y max-h-24" />
            <Button onClick={handleAddRootNode} size="sm" className="h-9 text-sm whitespace-nowrap px-3"><PlusCircle className="mr-1.5 h-4 w-4" /> Add Root Idea</Button>
          </div>
        </div>

        {/* Centering wrapper for the fixed viewport */}
        <div className="flex-grow flex items-center justify-center p-0 bg-muted/20 overflow-hidden">
          <div
            ref={viewportContainerRef}
            className="shadow-2xl rounded-lg"
            style={{ 
              width: `${FIXED_VIEWPORT_WIDTH}px`, 
              height: `${FIXED_VIEWPORT_HEIGHT}px`, 
              overflow: 'hidden', // Crucial: This is the clipping boundary
              userSelect: 'none',
              position: 'relative', // For absolute positioning of canvasContentRef
              backgroundColor: 'var(--card)', // Background for the viewport itself
            }}
            onMouseDown={handlePanMouseDown}
            onWheel={handleWheelZoom} // Attach wheel listener here
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onDragOver={handleDragOverCanvas} // For dropping nodes onto the viewport background
            onDrop={handleDropOnCanvas}       // For dropping nodes onto the viewport background
          >
            <div
              ref={canvasContentRef}
              className="relative bg-transparent border-2 border-dashed border-sky-300" // Logical canvas bg is transparent, border for vis
              style={{
                width: CANVAS_CONTENT_WIDTH_STR, 
                height: CANVAS_CONTENT_HEIGHT_STR,
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                transformOrigin: '0 0', 
                // pointerEvents: isPanning && activeTool === 'pan' ? 'none' : 'auto', // Let events pass through if not panning
                pointerEvents: 'auto', // Nodes need pointer events
              }}
              // Removed onDragOver/onDrop from here to avoid conflict if viewport bg is main drop target
            >
              <svg
                className="absolute top-0 left-0 pointer-events-none" // SVG itself should not intercept mouse events
                style={{ width: CANVAS_CONTENT_WIDTH_STR, height: CANVAS_CONTENT_HEIGHT_STR, overflow: 'visible' }}
                key={svgKey} // Re-render SVG if key changes
              >
                {allNodes.map(node => {
                  if (!node.parentId) return null;
                  const parentNode = mindmap.data.nodes[node.parentId];
                  if (!parentNode) return null;

                  const parentCardCenterX = (parentNode.x ?? 0) + NODE_CARD_WIDTH / 2;
                  const parentCardBottomY = (parentNode.y ?? 0) + getApproxNodeHeight(parentNode) -10; // a bit above bottom edge
                  const childCardCenterX = (node.x ?? 0) + NODE_CARD_WIDTH / 2;
                  const childCardTopY = (node.y ?? 0) + 10;  // a bit below top edge

                  // Control points for Bezier curve
                  const c1x = parentCardCenterX;
                  const c1y = parentCardBottomY + Math.max(30, Math.abs(childCardTopY - parentCardBottomY) / 2);
                  const c2x = childCardCenterX;
                  const c2y = childCardTopY - Math.max(30, Math.abs(childCardTopY - parentCardBottomY) / 2);
                  
                  const pathData = `M ${parentCardCenterX} ${parentCardBottomY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${childCardCenterX} ${childCardTopY}`;
                  
                  // Wire color logic (no customBackgroundColor in v0.0.5)
                  const strokeColor = parentNode.parentId === null ? "hsl(var(--primary))" : "hsl(var(--accent))";

                  return (
                    <path 
                        key={`${parentNode.id}-${node.id}`} 
                        d={pathData} 
                        stroke={strokeColor} 
                        strokeWidth={Math.max(1, 2 / scale)} // Line thickness adjusts with zoom
                        fill="none" 
                    />
                  );
                })}
              </svg>
              {allNodes.map((nodeData) => (
                <NodeCard
                  key={nodeData.id} node={nodeData} isRoot={!nodeData.parentId}
                  onEdit={handleEditNode} onDelete={requestDeleteNode} onAddChild={handleAddChildNode}
                  onDragStart={(e, id) => handleNodeDragStart(e,id)}
                  className="node-card-draggable" // For identifying node cards
                />
              ))}
              {allNodes.length === 0 && (
                <div 
                  className="absolute inset-0 flex items-center justify-center pointer-events-none text-center"
                  style={{ 
                    // Center message on the logical canvas, scaled
                    top: `${canvasNumericHeight / 2}px`, 
                    left: `${canvasNumericWidth / 2}px`, 
                    transform: `translate(-50%, -50%) scale(${1/scale})`, // Counter-scale the message itself
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
