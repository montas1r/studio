
"use client";

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { Mindmap, NodeData, EditNodeInput } from '@/types/mindmap';
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
import { v4 as uuidv4 } from 'uuid';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

const CANVAS_CONTENT_WIDTH_STR = '2000px'; // Logical canvas size
const CANVAS_CONTENT_HEIGHT_STR = '2000px'; // Logical canvas size
const FIXED_VIEWPORT_WIDTH = 1200; // Fixed viewport size on screen
const FIXED_VIEWPORT_HEIGHT = 800; // Fixed viewport size on screen

const deepClone = <T,>(obj: T): T => {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  // For simple data structures like ours, JSON stringify/parse is usually sufficient
  // For more complex types (Dates, Functions, undefined, etc.), a more robust deep clone is needed
  try {
    if (typeof structuredClone === 'function') { // Use structuredClone if available (modern browsers)
        return structuredClone(obj);
    }
  } catch (e) {
    // fallback for environments where structuredClone might not handle everything or is unavailable
  }
  return JSON.parse(JSON.stringify(obj));
};

interface WireDrawData {
  key: string;
  d: string;
  stroke: string;
}

interface MindmapEditorProps {
  mindmapId: string;
}

export function MindmapEditor({ mindmapId }: MindmapEditorProps) {
  const {
    getMindmapById,
    addNode,
    updateNode: updateNodeDataHook,
    deleteNode: deleteNodeFromHook,
    updateNodePosition,
    updateMindmap,
    NODE_CARD_WIDTH,
    getApproxNodeHeight
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

  // Canvas interaction state
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [activeTool, setActiveTool] = useState<'select' | 'pan'>('select');
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ mouseX: number; mouseY: number; initialPanX: number; initialPanY: number } | null>(null);
  
  // For pinch-to-zoom
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartScaleRef = useRef<number>(1);
  const pinchCenterRef = useRef<{x: number, y: number} | null>(null); // Screen coords

  // DOM Refs
  const viewportContainerRef = useRef<HTMLDivElement>(null); // The 1200x800 fixed viewport
  const canvasContentRef = useRef<HTMLDivElement>(null); // The 2000x2000 logical canvas being transformed
  const dragDataRef = useRef<{ nodeId: string; logicalDragOffsetX: number; logicalDragOffsetY: number } | null>(null); // For node dragging

  // Undo/Redo state
  const [undoStack, setUndoStack] = useState<Mindmap.MindmapData[]>([]);
  const [redoStack, setRedoStack] = useState<Mindmap.MindmapData[]>([]);
  const initialViewCenteredRef = useRef(false);

  // Numeric canvas dimensions for calculations
  const canvasNumericWidth = useMemo(() => parseInt(CANVAS_CONTENT_WIDTH_STR, 10), []);
  const canvasNumericHeight = useMemo(() => parseInt(CANVAS_CONTENT_HEIGHT_STR, 10), []);

  // Wire drawing state
  const [wireDrawData, setWireDrawData] = useState<WireDrawData[]>([]);
  const nodeElementsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const [wireRecalcTrigger, setWireRecalcTrigger] = useState(0); // To trigger wire recalc

  const setNodeElementRef = useCallback((nodeId: string, element: HTMLDivElement | null) => {
    const currentMap = nodeElementsRef.current;
    let needsUpdate = false;

    if (element) { 
        if (!currentMap.has(nodeId) || currentMap.get(nodeId) !== element) {
            currentMap.set(nodeId, element);
            needsUpdate = true;
        }
    } else { 
        if (currentMap.has(nodeId)) {
            currentMap.delete(nodeId);
            needsUpdate = true;
        }
    }
    if (needsUpdate) {
        setWireRecalcTrigger(prev => prev + 1);
    }
  }, []); // Empty dependency array as it only uses refs and setState's functional update


  // Helper to clamp pan values
  const clampPan = useCallback((newPanX: number, newPanY: number, currentScale: number, currentViewportWidth: number, currentViewportHeight: number) => {
    let clampedX = newPanX;
    let clampedY = newPanY;

    const scaledCanvasWidth = canvasNumericWidth * currentScale;
    const scaledCanvasHeight = canvasNumericHeight * currentScale;
    
    // If scaled canvas is wider/taller than viewport, allow it to move such that its edges can align with viewport edges
    if (scaledCanvasWidth > currentViewportWidth) {
      clampedX = Math.min(0, Math.max(newPanX, currentViewportWidth - scaledCanvasWidth));
    } else { // If scaled canvas is smaller, keep it within viewport (can be centered or flush)
      clampedX = Math.max(0, Math.min(newPanX, currentViewportWidth - scaledCanvasWidth));
    }

    if (scaledCanvasHeight > currentViewportHeight) {
      clampedY = Math.min(0, Math.max(newPanY, currentViewportHeight - scaledCanvasHeight));
    } else {
      clampedY = Math.max(0, Math.min(newPanY, currentViewportHeight - scaledCanvasHeight));
    }
    return { x: clampedX, y: clampedY };
  }, [canvasNumericWidth, canvasNumericHeight]);


  const adjustZoom = useCallback((newScaleAttempt: number, focalX_viewport?: number, focalY_viewport?: number) => {
    if (!viewportContainerRef.current) return;

    const newScale = Math.max(0.25, Math.min(2.0, newScaleAttempt)); // Zoom limits
    const viewportRect = viewportContainerRef.current.getBoundingClientRect();

    // Use mouse pointer as focal point if provided, otherwise center of viewport
    const targetX = focalX_viewport !== undefined ? focalX_viewport : viewportRect.width / 2;
    const targetY = focalY_viewport !== undefined ? focalY_viewport : viewportRect.height / 2;

    const currentScale = scale; // Use the 'scale' from state

    // Calculate new pan to keep the focal point stationary
    const newPanX = targetX - (targetX - pan.x) * (newScale / currentScale);
    const newPanY = targetY - (targetY - pan.y) * (newScale / currentScale);
    
    const clampedNewPan = clampPan(newPanX, newPanY, newScale, viewportRect.width, viewportRect.height);

    setScale(newScale);
    setPan(clampedNewPan);
  }, [scale, pan, clampPan]);

  // Button zoom handlers
  const handleButtonZoomIn = useCallback(() => adjustZoom(scale * 1.2), [adjustZoom, scale]);
  const handleButtonZoomOut = useCallback(() => adjustZoom(scale / 1.2), [adjustZoom, scale]);


  const handleRecenterView = useCallback(() => {
    if (!viewportContainerRef.current || !mindmap) return;
    
    const allNodesArray = Object.values(mindmap.data.nodes);
    const viewportRect = viewportContainerRef.current.getBoundingClientRect();

    if (allNodesArray.length === 0) {
        // Center the empty 2000x2000 canvas in the 1200x800 viewport
        const targetScale = Math.min(viewportRect.width / canvasNumericWidth, viewportRect.height / canvasNumericHeight, 1); // Start at 1x or fit if smaller
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
      maxX = Math.max(maxX, node.x + NODE_CARD_WIDTH); // NODE_CARD_WIDTH
      maxY = Math.max(maxY, node.y + getApproxNodeHeight(node));
    });
    
    const contentWidth = Math.max(NODE_CARD_WIDTH, maxX - minX);
    const contentHeight = Math.max(getApproxNodeHeight(allNodesArray[0] || {}), maxY - minY);
    
    const PADDING = 50; // Logical pixels padding around content when fitting
    
    let newFitScale = 1;
    if (contentWidth > 0 && contentHeight > 0) {
        const scaleX = (viewportRect.width - 2 * PADDING) / contentWidth;
        const scaleY = (viewportRect.height - 2 * PADDING) / contentHeight;
        newFitScale = Math.min(scaleX, scaleY);
    }
    
    newFitScale = Math.max(0.25, Math.min(newFitScale, 2.0)); // Apply zoom limits

    const contentCenterX_logical = minX + contentWidth / 2;
    const contentCenterY_logical = minY + contentHeight / 2;

    const newFitPanX = viewportRect.width / 2 - contentCenterX_logical * newFitScale;
    const newFitPanY = viewportRect.height / 2 - contentCenterY_logical * newFitScale;
    
    const clampedFitPan = clampPan(newFitPanX, newFitPanY, newFitScale, viewportRect.width, viewportRect.height);
    
    setScale(newFitScale);
    setPan(clampedFitPan);

  }, [mindmap, getApproxNodeHeight, NODE_CARD_WIDTH, clampPan, canvasNumericWidth, canvasNumericHeight]);


  // Initial view centering
  useEffect(() => {
    if (mindmap && !initialViewCenteredRef.current && viewportContainerRef.current) {
      handleRecenterView();
      initialViewCenteredRef.current = true;
    }
  }, [mindmap, handleRecenterView]);

  // Undo/Redo logic
  const beforeMutation = useCallback(() => {
    if (mindmap?.data) {
      const currentDataSnapshot = deepClone(mindmap.data);
      setUndoStack(prev => [...prev.slice(-19), currentDataSnapshot]); // Limit undo stack size
      setRedoStack([]); // Clear redo stack on new action
    }
  }, [mindmap?.data]);

  // Initialize undo stack with the loaded mindmap state
  useEffect(() => {
    if (mindmap?.data) {
        // Only set initial if undo stack is empty to avoid overwriting during normal ops
        if(undoStack.length === 0) { 
            setUndoStack([deepClone(mindmap.data)]);
            setRedoStack([]);
        }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mindmapId, mindmap?.data]); // Rerun if mindmapId changes (new map loaded) or initial data loads

  const handleUndo = useCallback(() => {
    if (!mindmap || undoStack.length <= 1) return; // Can't undo initial state if it's the only one
    
    const currentSnapshot = deepClone(mindmap.data); // Current state before undo
    const previousData = deepClone(undoStack[undoStack.length - 2]); // The state to revert to

    setRedoStack(prev => [currentSnapshot, ...prev.slice(0,19)]); // Add current to redo
    setUndoStack(prev => prev.slice(0, -1)); // Remove current from undo (as it's now on redo)
    
    updateMindmap(mindmap.id, { data: previousData });
  }, [mindmap, undoStack, updateMindmap]);

  const handleRedo = useCallback(() => {
    if (!mindmap || redoStack.length === 0) return;
    const nextData = deepClone(redoStack[0]); // The state to reapply

    setUndoStack(prev => [...prev.slice(-19), deepClone(mindmap.data)]); // Add current to undo
    setRedoStack(prev => prev.slice(1)); // Remove from redo
    
    updateMindmap(mindmap.id, { data: nextData });
  }, [mindmap, redoStack, undoStack, updateMindmap]);

  // Keyboard shortcuts for Undo/Redo
  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      // Ignore if typing in an input/textarea
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
      } else if (ctrlKey && event.key.toLowerCase() === 'y' && !isMac) { // Ctrl+Y for redo on Windows/Linux
        event.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleUndo, handleRedo]);

  // Manual Panning with Hand Tool
  const handlePanMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (activeTool !== 'pan' || !viewportContainerRef.current) return;
    // Prevent panning if clicking on a node or interactive element within a node
    const targetIsNode = (event.target as HTMLElement).closest('.node-card-draggable');
    if (targetIsNode) return;

    event.preventDefault();
    setIsPanning(true);
    panStartRef.current = { mouseX: event.clientX, mouseY: event.clientY, initialPanX: pan.x, initialPanY: pan.y };
  }, [activeTool, pan.x, pan.y]);

  const handlePanMouseMove = useCallback((event: MouseEvent) => {
    if (!isPanning || !panStartRef.current || !viewportContainerRef.current) return;
    event.preventDefault();
    const dx = event.clientX - panStartRef.current.mouseX;
    const dy = event.clientY - panStartRef.current.mouseY;
    const newPanX = panStartRef.current.initialPanX + dx;
    const newPanY = panStartRef.current.initialPanY + dy;
    const viewportRect = viewportContainerRef.current.getBoundingClientRect();
    setPan(clampPan(newPanX, newPanY, scale, viewportRect.width, viewportRect.height));
  }, [isPanning, scale, clampPan]);

  const handlePanMouseUpOrLeave = useCallback(() => {
    if (isPanning) {
      setIsPanning(false);
    }
  }, [isPanning]);

  // Attach/detach global listeners for panning
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

  // Mouse Wheel Zoom
  const handleWheelZoom = useCallback((event: WheelEvent) => {
    if (!viewportContainerRef.current) return;
    event.preventDefault();
    const viewportRect = viewportContainerRef.current.getBoundingClientRect();
    // Calculate mouse position relative to the viewport container
    const focalX = event.clientX - viewportRect.left;
    const focalY = event.clientY - viewportRect.top;
    const delta = event.deltaY > 0 ? 0.9 : 1.1; // Zoom factor
    adjustZoom(scale * delta, focalX, focalY);
  }, [adjustZoom, scale]);

  useEffect(() => {
    const vpCurrent = viewportContainerRef.current;
    if (!vpCurrent) return;
    // Mouse wheel zoom should always be active on the viewport
    vpCurrent.addEventListener('wheel', handleWheelZoom, { passive: false });
    return () => {
      if (vpCurrent) {
        vpCurrent.removeEventListener('wheel', handleWheelZoom);
      }
    };
  }, [handleWheelZoom]);


  // Pinch-to-Zoom (Basic Implementation)
  const handleTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (!viewportContainerRef.current) return;
    const touches = event.touches;

    const targetIsNode = (event.target as HTMLElement).closest('.node-card-draggable');
    
    if (touches.length === 1 && activeTool === 'pan' && !targetIsNode) {
      event.preventDefault();
      setIsPanning(true);
      panStartRef.current = { mouseX: touches[0].clientX, mouseY: touches[0].clientY, initialPanX: pan.x, initialPanY: pan.y };
    } else if (touches.length === 2 && !targetIsNode) { // Check if not on a node for pinch-zoom
      event.preventDefault();
      setIsPanning(false); // Ensure panning stops if it was active
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      pinchStartDistRef.current = Math.sqrt(dx * dx + dy * dy);
      pinchStartScaleRef.current = scale;
      
      const viewportRect = viewportContainerRef.current.getBoundingClientRect();
      pinchCenterRef.current = { // Store pinch center in screen coordinates relative to viewport
          x: ((touches[0].clientX + touches[1].clientX) / 2) - viewportRect.left,
          y: ((touches[0].clientY + touches[1].clientY) / 2) - viewportRect.top,
      };
    }
  }, [activeTool, pan.x, pan.y, scale]);

  const handleTouchMove = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (!viewportContainerRef.current) return;
    const touches = event.touches;

    const targetIsNode = (event.target as HTMLElement).closest('.node-card-draggable');

    if (touches.length === 1 && isPanning && panStartRef.current && activeTool === 'pan' && !targetIsNode) {
      event.preventDefault();
      const dx = touches[0].clientX - panStartRef.current.mouseX;
      const dy = touches[0].clientY - panStartRef.current.mouseY;
      const viewportRect = viewportContainerRef.current.getBoundingClientRect();
      setPan(clampPan(panStartRef.current.initialPanX + dx, panStartRef.current.initialPanY + dy, scale, viewportRect.width, viewportRect.height));
    } else if (touches.length === 2 && pinchStartDistRef.current !== null && pinchCenterRef.current && !targetIsNode) {
      event.preventDefault();
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      const newDist = Math.sqrt(dx * dx + dy * dy);
      const scaleChange = newDist / pinchStartDistRef.current;
      const newScaleAttempt = pinchStartScaleRef.current * scaleChange;
      adjustZoom(newScaleAttempt, pinchCenterRef.current.x, pinchCenterRef.current.y);
    }
  }, [isPanning, activeTool, scale, clampPan, adjustZoom]);

  const handleTouchEnd = useCallback(() => {
    if (isPanning) {
      setIsPanning(false);
    }
    pinchStartDistRef.current = null;
    pinchCenterRef.current = null;
  }, [isPanning]);

  // Node CRUD operations
  const handleAddRootNode = useCallback(async () => {
    if (newRootNodeTitle.trim() === '') {
      toast({ title: "Title Required", description: "Please enter a title for the new root node.", variant: "destructive" });
      return;
    }
    if (!mindmap || !viewportContainerRef.current ) return;
    beforeMutation();

    const newNodeDetails: EditNodeInput = { title: newRootNodeTitle, description: newRootNodeDescription, emoji: '💡' };
    const newRootNode = addNode(mindmap.id, null, newNodeDetails);

    if (newRootNode) {
      setNewRootNodeTitle(''); setNewRootNodeDescription('');
      toast({ title: "Root Node Added", description: `"${newRootNode.title}" added.` });
      
      // Pan view to center the new root node
      const viewportRect = viewportContainerRef.current.getBoundingClientRect();
      const nodeCenterX_logical = newRootNode.x + NODE_CARD_WIDTH / 2;
      const nodeCenterY_logical = newRootNode.y + getApproxNodeHeight(newRootNode) / 2;
      
      const currentScale = scale;
      const newPanX = viewportRect.width / 2 - nodeCenterX_logical * currentScale;
      const newPanY = viewportRect.height / 2 - nodeCenterY_logical * currentScale;
      setPan(clampPan(newPanX, newPanY, currentScale, viewportRect.width, viewportRect.height));
    }
  }, [newRootNodeTitle, newRootNodeDescription, mindmap, addNode, toast, getApproxNodeHeight, NODE_CARD_WIDTH, beforeMutation, scale, pan, clampPan]);


  const handleAddChildNode = useCallback((parentId: string) => {
    if (!mindmap) return;
    const parentNode = mindmap.data.nodes[parentId];
    if (!parentNode) return;

    // Create a temporary node object to pass to the dialog
    const tempNewNode: NodeData = {
      id: `temp-${uuidv4()}`, // Temporary ID
      title: '', // Empty title for new node
      description: "",
      emoji: "➕",
      parentId: parentId,
      childIds: [],
      x: 0, y: 0, // Placeholder, actual position set by addNode if saved
    };
    setEditingNode(tempNewNode);
    setIsEditDialogOpen(true);
  }, [mindmap]);

  const handleEditNode = useCallback((node: NodeData) => {
    setEditingNode(deepClone(node)); // Edit a copy
    setIsEditDialogOpen(true);
  }, []);

  const handleSaveNode = useCallback((nodeIdFromDialog: string, data: EditNodeInput) => {
    if (!mindmap || !editingNode) return;
    beforeMutation();

    if (editingNode.id.startsWith('temp-')) { // It's a new node being created
      const permanentNode = addNode(mindmap.id, editingNode.parentId, data); // editingNode.parentId will be correct here
      if (permanentNode) {
        toast({ title: "Node Created", description: `Node "${permanentNode.title}" added.` });
      }
    } else { // It's an existing node being updated
      updateNodeDataHook(mindmap.id, editingNode.id, data);
      toast({ title: "Node Updated", description: `Node "${data.title}" saved.` });
    }
    setEditingNode(null);
    setIsEditDialogOpen(false);
  }, [mindmap, editingNode, addNode, updateNodeDataHook, toast, beforeMutation]);


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


  // Node Drag and Drop
  const handleNodeDragStart = useCallback((event: React.DragEvent<HTMLDivElement>, nodeId: string) => {
    if (activeTool === 'pan') { // Prevent node drag if pan tool is active
        event.preventDefault();
        return;
    }
    if (!viewportContainerRef.current) return;

    const nodeElement = event.currentTarget;
    const nodeRect = nodeElement.getBoundingClientRect(); // Screen coordinates of the node
    const viewportRect = viewportContainerRef.current.getBoundingClientRect(); // Screen coordinates of the viewport

    // Calculate drag offset relative to node's top-left, but in logical (scaled) units
    const logicalDragOffsetX = (event.clientX - nodeRect.left) / scale;
    const logicalDragOffsetY = (event.clientY - nodeRect.top) / scale;
    
    const payload = { nodeId, logicalDragOffsetX, logicalDragOffsetY };
    event.dataTransfer.setData('application/json', JSON.stringify(payload));
    event.dataTransfer.effectAllowed = "move";
    // dragDataRef.current = payload; // Not strictly needed if using dataTransfer fully
  }, [activeTool, scale]);


  const handleDragOverCanvas = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault(); // Necessary to allow dropping
    event.dataTransfer.dropEffect = "move";
  }, []);

  const handleDropOnCanvas = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!viewportContainerRef.current || !mindmap || activeTool === 'pan') return;

    let payload;
    try {
      const jsonData = event.dataTransfer.getData('application/json');
      payload = jsonData ? JSON.parse(jsonData) : null; // dragDataRef.current;
    } catch (e) { payload = null; /* dragDataRef.current; */ }

    if (!payload || typeof payload.logicalDragOffsetX !== 'number' || typeof payload.logicalDragOffsetY !== 'number') {
      // dragDataRef.current = null; 
      return;
    }
    const { nodeId, logicalDragOffsetX, logicalDragOffsetY } = payload;
    if (!nodeId) { 
      // dragDataRef.current = null; 
      return;
    }

    const viewportRect = viewportContainerRef.current.getBoundingClientRect();

    // Calculate new logical top-left position of the node
    let newX_logical = (event.clientX - viewportRect.left - pan.x) / scale - logicalDragOffsetX;
    let newY_logical = (event.clientY - viewportRect.top - pan.y) / scale - logicalDragOffsetY;

    const nodeToDrag = mindmap.data.nodes[nodeId];
    if (!nodeToDrag) { /* dragDataRef.current = null; */ return; }
    const approxNodeHeight = getApproxNodeHeight(nodeToDrag);

    // Clamp node position to within logical canvas boundaries
    newX_logical = Math.max(0, Math.min(newX_logical, canvasNumericWidth - NODE_CARD_WIDTH));
    newY_logical = Math.max(0, Math.min(newY_logical, canvasNumericHeight - approxNodeHeight));
    
    beforeMutation();
    updateNodePosition(mindmap.id, nodeId, newX_logical, newY_logical);
    // dragDataRef.current = null;
  }, [mindmap, updateNodePosition, pan, scale, activeTool, beforeMutation, NODE_CARD_WIDTH, canvasNumericWidth, canvasNumericHeight, getApproxNodeHeight]);


  const handleExportJson = useCallback(() => {
    if (!mindmap) return;
    const mindmapToExport = deepClone(mindmap);
    // Strip any transient properties if necessary (not needed with current NodeData)
    const jsonString = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(mindmapToExport, null, 2));
    const link = document.createElement("a");
    link.href = jsonString;
    link.download = `${mindmapToExport.name.replace(/\s+/g, '_').toLowerCase()}_mindmap.json`;
    link.click();
    toast({ title: "Exported", description: "Mindmap data exported as JSON." });
  }, [mindmap, toast]);

  // Wire drawing effect
  useEffect(() => {
    if (!viewportContainerRef.current || !canvasContentRef.current || !mindmap) {
      setWireDrawData([]);
      return;
    }
    
    const frameId = requestAnimationFrame(() => {
      if (!viewportContainerRef.current || !canvasContentRef.current) return;

      const newWiresArray: WireDrawData[] = [];
      const viewportRect = viewportContainerRef.current.getBoundingClientRect();
      const round = (num: number) => Math.round(num * 100) / 100; // Round to 2 decimal places

      allNodes.forEach(node => { // Iterate over allNodes (derived from mindmap state)
        if (!node.parentId || !mindmap.data.nodes[node.parentId!]) return;

        const parentNode = mindmap.data.nodes[node.parentId!];
        const parentEl = nodeElementsRef.current.get(node.parentId!);
        const childEl = nodeElementsRef.current.get(node.id);

        if (parentNode && parentEl && childEl) {
          const parentRect = parentEl.getBoundingClientRect();
          const childRect = childEl.getBoundingClientRect();

          // Calculate anchor points in screen coordinates
          const parentAnchorX_screen = parentRect.left + parentRect.width / 2;
          const parentAnchorY_screen = parentRect.top + parentRect.height; 
          const childAnchorX_screen = childRect.left + childRect.width / 2;
          const childAnchorY_screen = childRect.top;

          // Convert screen anchor points to logical canvas coordinates (where SVG is drawn)
          const parentAnchorX_logical = round((parentAnchorX_screen - viewportRect.left - pan.x) / scale);
          const parentAnchorY_logical = round((parentAnchorY_screen - viewportRect.top - pan.y) / scale);
          const childAnchorX_logical = round((childAnchorX_screen - viewportRect.left - pan.x) / scale);
          const childAnchorY_logical = round((childAnchorY_screen - viewportRect.top - pan.y) / scale);
          
          const pAX = parentAnchorX_logical;
          const pAY = parentAnchorY_logical;
          const cAX = childAnchorX_logical;
          const cAY = childAnchorY_logical;

          const curveOffsetY = Math.max(30, Math.abs(cAY - pAY) / 2.5);
          const d = `M ${pAX} ${pAY} C ${pAX} ${round(pAY + curveOffsetY)}, ${cAX} ${round(cAY - curveOffsetY)}, ${cAX} ${cAY}`;
          
          // Determine stroke color (v0.0.5 - no custom node color)
          let strokeColor = "";
           if(parentNode.parentId === null) { // parent is root
               strokeColor = "hsl(var(--primary))";
           } else { // parent is child
               strokeColor = "hsl(var(--accent))";
           }
          
          newWiresArray.push({ key: `${parentNode.id}-${node.id}`, d, stroke: strokeColor });
        }
      });

      setWireDrawData(prevWireData => {
        if (JSON.stringify(prevWireData) === JSON.stringify(newWiresArray)) {
          return prevWireData; // Avoid unnecessary re-render if data is identical
        }
        return newWiresArray;
      });
    });

    return () => cancelAnimationFrame(frameId);
  // Removed `allNodes` from deps as it's derived from `mindmap`.
  // `getApproxNodeHeight` and `NODE_CARD_WIDTH` are from `useMindmaps` and are stable.
  }, [mindmap, pan, scale, wireRecalcTrigger, getApproxNodeHeight, NODE_CARD_WIDTH]); 


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
  
  const canUndo = undoStack.length > 1; // Can undo if more than initial state
  const canRedo = redoStack.length > 0;
  
  return (
    <TooltipProvider>
      <div className="flex flex-col h-full flex-grow w-full bg-background overflow-hidden">
        {/* Top Control Bar */}
        <div className="p-1 border-b bg-background/80 backdrop-blur-sm sticky top-0 z-20 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-2">
            <div className="flex items-center gap-2 flex-shrink-0 min-w-0">
              <Tooltip><TooltipTrigger asChild><Button data-tool-button asChild variant="ghost" size="icon" className="h-8 w-8"><Link href="/"><ArrowLeft className="h-4 w-4" /></Link></Button></TooltipTrigger><TooltipContent><p>Library</p></TooltipContent></Tooltip>
              <h1 className="text-md font-semibold text-foreground truncate leading-none" title={mindmap.name}>{mindmap.name}</h1>
            </div>

            {/* Canvas Interaction Tools */}
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

          {/* Add New Root Node Form */}
          <div className="flex flex-col sm:flex-row items-stretch gap-1 p-1.5">
            <Input type="text" value={newRootNodeTitle} onChange={(e) => setNewRootNodeTitle(e.target.value)} placeholder="New Root Idea Title" className="flex-grow h-9 text-sm" />
            <Textarea value={newRootNodeDescription} onChange={(e) => setNewRootNodeDescription(e.target.value)} placeholder="Description (Optional)" rows={1} className="flex-grow text-sm min-h-[36px] h-9 resize-y max-h-24" />
            <Button onClick={handleAddRootNode} size="sm" className="h-9 text-sm whitespace-nowrap px-3"><PlusCircle className="mr-1.5 h-4 w-4" /> Add Root Idea</Button>
          </div>
        </div>

        {/* Fixed Viewport for Canvas */}
         <div className="flex-grow flex items-center justify-center p-0 bg-background"> {/* Centering the fixed viewport */}
          <div
            ref={viewportContainerRef} // Ref for the fixed 1200x800 viewport
            className="bg-card shadow-2xl relative" // Changed to bg-card as per v0.0.4
            style={{
              width: `${FIXED_VIEWPORT_WIDTH}px`, 
              height: `${FIXED_VIEWPORT_HEIGHT}px`, 
              overflow: 'hidden', 
              userSelect: 'none', // Prevents text selection during canvas interactions
            }}
            onMouseDown={handlePanMouseDown} // For Hand Tool Panning
            onTouchStart={handleTouchStart} // For Pinch & Pan on touch
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
            // onWheel is attached via useEffect to allow prevention of default scroll
          >
            {/* This is the large logical canvas that gets transformed */}
            <div
              ref={canvasContentRef}
              className="absolute top-0 left-0 bg-card border-2 border-dashed border-sky-300" // v0.0.4 styling
              style={{
                width: CANVAS_CONTENT_WIDTH_STR, 
                height: CANVAS_CONTENT_HEIGHT_STR,
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                transformOrigin: '0 0', 
                pointerEvents: 'auto', // Allow pointer events for drag/drop on this surface
              }}
              onDragOver={handleDragOverCanvas}
              onDrop={handleDropOnCanvas}
            >
              {/* SVG Layer for Wires - Placed first so nodes are on top */}
              <svg
                className="absolute top-0 left-0 pointer-events-none" // Wires should not intercept mouse events
                style={{ width: '100%', height: '100%', overflow: 'visible' }} 
              >
                {wireDrawData.map(wire => (
                  <path
                    key={wire.key}
                    d={wire.d}
                    stroke={wire.stroke}
                    strokeWidth={Math.max(1, 2 / scale)} // Make lines thicker when zoomed out
                    fill="none"
                  />
                ))}
              </svg>

              {/* Render Nodes */}
              {allNodes.map((nodeData) => (
                <NodeCard
                  key={nodeData.id}
                  node={nodeData}
                  onEdit={handleEditNode}
                  onDelete={requestDeleteNode}
                  onAddChild={handleAddChildNode}
                  onDragStart={(e, id) => handleNodeDragStart(e, id)}
                  className="node-card-draggable" // Marker class for drag/pan logic
                  domRefCallback={(el) => setNodeElementRef(nodeData.id, el)}
                />
              ))}

              {/* Empty Mindmap Message */}
              {allNodes.length === 0 && (
                <div
                  className="absolute inset-0 flex items-center justify-center pointer-events-none text-center"
                  style={{
                    // Center message within the logical canvas, scaled inversely
                    top: `${canvasNumericHeight / 2}px`, 
                    left: `${canvasNumericWidth / 2}px`,
                    transform: `translate(-50%, -50%) scale(${1/scale})`, 
                    transformOrigin: 'center center'
                  }}
                >
                  <div className="text-muted-foreground text-lg bg-background/80 p-6 rounded-md shadow-lg">
                    This mindmap is empty. Add a root idea to get started!
                  </div>
                </div>
              )}
            </div> {/* End of canvasContentRef */}
          </div> {/* End of viewportContainerRef */}
        </div> {/* End of flex centering wrapper */}


        {/* Dialogs */}
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
