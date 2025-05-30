
"use client";

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { Mindmap, NodeData, EditNodeInput, PaletteColorKey } from '@/types/mindmap';
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
  // For simple data structures like MindmapData, JSON stringify/parse is a common deep clone method.
  // Be cautious if your data includes Dates, Functions, undefined, Infinity, NaN, RegExps, Maps, Sets, etc.
  try {
    if (typeof structuredClone === 'function') {
      return structuredClone(obj);
    }
  } catch (e) {
    // fallback for environments where structuredClone might not be available or has issues
  }
  return JSON.parse(JSON.stringify(obj));
};


interface WireDrawData {
  key: string;
  d: string;
  stroke: string;
}

export function MindmapEditor({ mindmapId }: MindmapPageProps) {
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
  const [pan, setPan] = useState({ x: (FIXED_VIEWPORT_WIDTH - parseInt(CANVAS_CONTENT_WIDTH_STR,10) * 0.5) / 2 , y: (FIXED_VIEWPORT_HEIGHT - parseInt(CANVAS_CONTENT_HEIGHT_STR,10) * 0.5) / 2 });
  const [activeTool, setActiveTool] = useState<'select' | 'pan'>('select');
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ mouseX: number; mouseY: number; panX: number; panY: number } | null>(null);
  
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartScaleRef = useRef<number>(1);
  const pinchCenterRef = useRef<{x: number, y: number} | null>(null);

  const viewportContainerRef = useRef<HTMLDivElement>(null);
  const canvasContentRef = useRef<HTMLDivElement>(null);
  const dragDataRef = useRef<{ nodeId: string; logicalDragOffsetX: number; logicalDragOffsetY: number } | null>(null);

  const [undoStack, setUndoStack] = useState<Mindmap['data'][]>([]);
  const [redoStack, setRedoStack] = useState<Mindmap['data'][]>([]);
  const initialViewCenteredRef = useRef(false);

  const canvasNumericWidth = useMemo(() => parseInt(CANVAS_CONTENT_WIDTH_STR, 10), []);
  const canvasNumericHeight = useMemo(() => parseInt(CANVAS_CONTENT_HEIGHT_STR, 10), []);

  const [wireDrawData, setWireDrawData] = useState<WireDrawData[]>([]);
  const nodeElementsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const [wireRecalcTrigger, setWireRecalcTrigger] = useState(0);


  const setNodeElementRef = useCallback((nodeId: string, element: HTMLDivElement | null) => {
    const currentMap = nodeElementsRef.current;
    const nodeExisted = currentMap.has(nodeId);

    if (element) {
      currentMap.set(nodeId, element); // Always update the ref
      if (!nodeExisted) {
        // Node was newly added to the map, trigger wire recalc
        setWireRecalcTrigger(prev => prev + 1);
      }
    } else { // Element is null, node is being unmounted
      if (nodeExisted) {
        currentMap.delete(nodeId);
        // Node was removed from the map, trigger wire recalc
        setWireRecalcTrigger(prev => prev + 1);
      }
    }
  }, []); // Empty dependency array makes this callback stable


  const clampPan = useCallback((newPanX: number, newPanY: number, currentScale: number) => {
    if (!viewportContainerRef.current) return { x: 0, y: 0 };
    const viewportRect = viewportContainerRef.current.getBoundingClientRect();
    let clampedX = newPanX;
    let clampedY = newPanY;

    const scaledCanvasWidth = canvasNumericWidth * currentScale;
    const scaledCanvasHeight = canvasNumericHeight * currentScale;
    
    // If scaled canvas is wider/taller than viewport, ensure canvas edges don't go beyond viewport edges.
    if (scaledCanvasWidth > viewportRect.width) {
      clampedX = Math.min(0, Math.max(newPanX, viewportRect.width - scaledCanvasWidth));
    } else { // Scaled canvas is narrower than viewport, allow it to be anywhere within, or centered.
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
    
    // Calculate new pan to keep the focal point stable
    // The point on the canvas that was under targetX_viewport before zoom:
    // logicalX = (targetX_viewport - pan.x) / currentScale
    // We want this logicalX to be under targetX_viewport after zoom as well:
    // targetX_viewport = (logicalX * newScale) + newPanX
    // newPanX = targetX_viewport - logicalX * newScale
    // newPanX = targetX_viewport - ((targetX_viewport - pan.x) / currentScale) * newScale
    const newPanX = targetX_viewport - (targetX_viewport - pan.x) * (newScale / currentScale);
    const newPanY = targetY_viewport - (targetY_viewport - pan.y) * (newScale / currentScale);
    
    const clampedNewPan = clampPan(newPanX, newPanY, newScale);

    setScale(newScale);
    setPan(clampedNewPan);
  }, [scale, pan, clampPan]);


  const handleButtonZoomIn = useCallback(() => adjustZoom(scale * 1.2), [adjustZoom, scale]);
  const handleButtonZoomOut = useCallback(() => adjustZoom(scale / 1.2), [adjustZoom, scale]);


  const handleRecenterView = useCallback(() => {
    if (!viewportContainerRef.current || !mindmap) {
        const initialScale = 0.5;
        const initialPanX = (FIXED_VIEWPORT_WIDTH - canvasNumericWidth * initialScale) / 2;
        const initialPanY = (FIXED_VIEWPORT_HEIGHT - canvasNumericHeight * initialScale) / 2;
        setScale(initialScale);
        setPan(clampPan(initialPanX, initialPanY, initialScale));
        return;
    }
    
    const allNodesArray = Object.values(mindmap.data.nodes);
    const viewportRect = viewportContainerRef.current.getBoundingClientRect();

    if (allNodesArray.length === 0) {
        const initialScale = Math.min(viewportRect.width / canvasNumericWidth, viewportRect.height / canvasNumericHeight, 0.75);
        const newPanX = (viewportRect.width - canvasNumericWidth * initialScale) / 2;
        const newPanY = (viewportRect.height - canvasNumericHeight * initialScale) / 2;
        const clamped = clampPan(newPanX, newPanY, initialScale);
        setScale(initialScale);
        setPan(clamped);
        return;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    allNodesArray.forEach(node => {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + NODE_CARD_WIDTH); // NODE_CARD_WIDTH is constant
      maxY = Math.max(maxY, node.y + getApproxNodeHeight(node));
    });
    
    const contentWidth = Math.max(NODE_CARD_WIDTH, maxX - minX);
    const contentHeight = Math.max(getApproxNodeHeight(allNodesArray[0] || null), maxY - minY); // Ensure a fallback for height
    
    const PADDING = 50; // Padding in viewport pixels
    
    let newFitScale = 1;
    if (contentWidth > 0 && contentHeight > 0) {
        // Target dimensions within viewport considering padding
        const targetViewportWidth = viewportRect.width - 2 * PADDING;
        const targetViewportHeight = viewportRect.height - 2 * PADDING;

        const scaleX = targetViewportWidth / contentWidth;
        const scaleY = targetViewportHeight / contentHeight;
        newFitScale = Math.min(scaleX, scaleY);
    } else { 
        newFitScale = 0.75; // Default scale for single node or empty
    }
    
    newFitScale = Math.max(0.25, Math.min(newFitScale, 1.5)); // Clamp scale

    const contentCenterX_logical = minX + contentWidth / 2;
    const contentCenterY_logical = minY + contentHeight / 2;

    const newFitPanX = viewportRect.width / 2 - contentCenterX_logical * newFitScale;
    const newFitPanY = viewportRect.height / 2 - contentCenterY_logical * newFitScale;
    
    const clampedFitPan = clampPan(newFitPanX, newFitPanY, newFitScale);
    
    setScale(newFitScale);
    setPan(clampedFitPan);

  }, [mindmap, getApproxNodeHeight, NODE_CARD_WIDTH, clampPan, canvasNumericWidth, canvasNumericHeight]);


  useEffect(() => {
    if (mindmap && !initialViewCenteredRef.current && viewportContainerRef.current) {
      handleRecenterView();
      initialViewCenteredRef.current = true;
    }
  }, [mindmap, handleRecenterView, mindmapId]);

  const beforeMutation = useCallback(() => {
    if (mindmap?.data) {
      const currentDataSnapshot = deepClone(mindmap.data);
      setUndoStack(prev => [...prev.slice(-19), currentDataSnapshot]); // Keep last 20 states
      setRedoStack([]);
    }
  }, [mindmap?.data]);

  useEffect(() => {
    if (mindmap?.data) {
        // Initialize undo stack only if it's completely empty (e.g. on first load or mindmap change)
        if(undoStack.length === 0 && redoStack.length === 0) { 
            // Push current state as the initial baseline
            setUndoStack([deepClone(mindmap.data)]);
        }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mindmapId, mindmap?.data]); // Rerun if mindmapId or data changes to reset history for new map

  const handleUndo = useCallback(() => {
    if (!mindmap || undoStack.length <= 1) return; // Need at least one previous state to undo to (current is implied to be top of stack)
    
    const currentSnapshot = deepClone(mindmap.data);
    const previousData = deepClone(undoStack[undoStack.length - 1]); // The actual last saved state

    setRedoStack(prev => [currentSnapshot, ...prev.slice(0,19)]);
    setUndoStack(prev => prev.slice(0, -1));
    
    updateMindmap(mindmap.id, { data: previousData });
  }, [mindmap, undoStack, updateMindmap]);

  const handleRedo = useCallback(() => {
    if (!mindmap || redoStack.length === 0) return;
    const nextData = deepClone(redoStack[0]);

    // Before applying redo, save current state to undo stack
    setUndoStack(prev => [...prev.slice(-19), deepClone(mindmap.data)]);
    setRedoStack(prev => prev.slice(1));
    
    updateMindmap(mindmap.id, { data: nextData });
  }, [mindmap, redoStack, undoStack, updateMindmap]);


  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return; // Don't interfere with text input
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


  const handlePanMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (activeTool !== 'pan' || !viewportContainerRef.current) return;
    // Check if the click target is a node card or one of its interactive elements
    const targetIsNode = (event.target as HTMLElement).closest('.node-card-draggable');
    const targetIsButton = (event.target as HTMLElement).closest('[data-tool-button]'); // for header buttons
    if (targetIsNode || targetIsButton) return;

    event.preventDefault();
    setIsPanning(true);
    panStartRef.current = { mouseX: event.clientX, mouseY: event.clientY, panX: pan.x, panY: pan.y };
  }, [activeTool, pan.x, pan.y]);

  const handlePanMouseMove = useCallback((event: MouseEvent) => {
    if (!isPanning || !panStartRef.current || !viewportContainerRef.current) return;
    event.preventDefault();
    const dx = event.clientX - panStartRef.current.mouseX;
    const dy = event.clientY - panStartRef.current.mouseY;
    const newPanX = panStartRef.current.panX + dx;
    const newPanY = panStartRef.current.panY + dy;
    setPan(clampPan(newPanX, newPanY, scale));
  }, [isPanning, scale, clampPan]);

  const handlePanMouseUpOrLeave = useCallback(() => {
    if (isPanning) {
      setIsPanning(false);
    }
  }, [isPanning]);

  useEffect(() => {
    const vpCurrent = viewportContainerRef.current;
    if (!vpCurrent) return;

    const currentCursor = activeTool === 'pan' ? (isPanning ? 'grabbing' : 'grab') : 'default';
    vpCurrent.style.cursor = currentCursor;

    if (isPanning && activeTool === 'pan') {
      window.addEventListener('mousemove', handlePanMouseMove);
      window.addEventListener('mouseup', handlePanMouseUpOrLeave);
      window.addEventListener('mouseleave', handlePanMouseUpOrLeave); // Catch if mouse leaves window
      return () => {
        window.removeEventListener('mousemove', handlePanMouseMove);
        window.removeEventListener('mouseup', handlePanMouseUpOrLeave);
        window.removeEventListener('mouseleave', handlePanMouseUpOrLeave);
      };
    }
  }, [isPanning, activeTool, handlePanMouseMove, handlePanMouseUpOrLeave]);


  const handleWheelZoom = useCallback((event: WheelEvent) => {
    if (!viewportContainerRef.current) return;
    event.preventDefault(); // Prevent page scroll
    const viewportRect = viewportContainerRef.current.getBoundingClientRect();
    // Calculate mouse position relative to the viewport container
    const focalX_viewport = event.clientX - viewportRect.left;
    const focalY_viewport = event.clientY - viewportRect.top;

    const delta = event.deltaY > 0 ? 0.9 : 1.1; // Zoom factor
    adjustZoom(scale * delta, focalX_viewport, focalY_viewport);
  }, [adjustZoom, scale]);

  useEffect(() => {
    const vpCurrent = viewportContainerRef.current;
    if (!vpCurrent) return;
    // Attach wheel event listener directly to the viewport container
    vpCurrent.addEventListener('wheel', handleWheelZoom, { passive: false });
    return () => {
      if (vpCurrent) {
        vpCurrent.removeEventListener('wheel', handleWheelZoom);
      }
    };
  }, [handleWheelZoom]); // Re-attach if handleWheelZoom changes (due to its own dependencies)


  const handleTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (!viewportContainerRef.current) return;
    const touches = event.touches;
    const targetIsNode = (event.target as HTMLElement).closest('.node-card-draggable');
    const targetIsButton = (event.target as HTMLElement).closest('[data-tool-button]');

    if (targetIsNode || targetIsButton) return;
    
    if (touches.length === 1 && activeTool === 'pan') {
      event.preventDefault();
      setIsPanning(true);
      panStartRef.current = { mouseX: touches[0].clientX, mouseY: touches[0].clientY, panX: pan.x, panY: pan.y };
    } else if (touches.length === 2) { // Pinch to zoom
      event.preventDefault();
      setIsPanning(false); // Stop panning if it was active
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
    const targetIsNode = (event.target as HTMLElement).closest('.node-card-draggable');
    const targetIsButton = (event.target as HTMLElement).closest('[data-tool-button]');

    if (targetIsNode || targetIsButton) return;

    if (touches.length === 1 && isPanning && panStartRef.current && activeTool === 'pan') {
      event.preventDefault();
      const dx = touches[0].clientX - panStartRef.current.mouseX;
      const dy = touches[0].clientY - panStartRef.current.mouseY;
      setPan(clampPan(panStartRef.current.panX + dx, panStartRef.current.panY + dy, scale));
    } else if (touches.length === 2 && pinchStartDistRef.current !== null && pinchCenterRef.current) { // Pinch zoom move
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


  const handleAddRootNode = useCallback(async () => {
    if (newRootNodeTitle.trim() === '') {
      toast({ title: "Title Required", description: "Please enter a title for the new root node.", variant: "destructive" });
      return;
    }
    if (!mindmap || !viewportContainerRef.current ) return;
    beforeMutation();

    const newNodeDetails: EditNodeInput = { title: newRootNodeTitle, description: newRootNodeDescription, emoji: '💡' };
    const newRootNode = addNode(mindmap.id, null, newNodeDetails); // addNode from useMindmaps handles placement logic

    if (newRootNode) {
      setNewRootNodeTitle(''); setNewRootNodeDescription('');
      toast({ title: "Root Node Added", description: `"${newRootNode.title}" added.` });
      
      // Pan view to center the new root node
      const viewportRect = viewportContainerRef.current.getBoundingClientRect();
      const nodeCenterX_logical = newRootNode.x + NODE_CARD_WIDTH / 2;
      const nodeCenterY_logical = newRootNode.y + getApproxNodeHeight(newRootNode) / 2;
      
      const currentScale = scale; // Use current scale
      const newPanX = viewportRect.width / 2 - nodeCenterX_logical * currentScale;
      const newPanY = viewportRect.height / 2 - nodeCenterY_logical * currentScale;
      setPan(clampPan(newPanX, newPanY, currentScale));
    }
  }, [newRootNodeTitle, newRootNodeDescription, mindmap, addNode, toast, getApproxNodeHeight, NODE_CARD_WIDTH, beforeMutation, scale, pan, clampPan]);


  const handleAddChildNode = useCallback((parentId: string) => {
    if (!mindmap) return;
    const parentNode = mindmap.data.nodes[parentId];
    if (!parentNode) return;
    // Create a temporary node object to pass to the dialog
    // Actual node creation will happen in handleSaveNode if confirmed
    const tempNewNode: NodeData = {
      id: `temp-${uuidv4()}`, // Temporary ID
      title: '', // Will be filled in dialog
      description: "",
      emoji: "➕", // Default emoji
      parentId: parentId,
      childIds: [],
      // Placeholder X/Y, actual position will be calculated by addNode relative to parent
      // if this node is saved. For the dialog, these aren't directly used for rendering on canvas.
      x: parentNode.x, 
      y: parentNode.y + getApproxNodeHeight(parentNode) + 50,
      // No custom color for temp node, will be set in dialog
    };
    setEditingNode(tempNewNode);
    setIsEditDialogOpen(true);
  }, [mindmap, getApproxNodeHeight]);

  const handleEditNode = useCallback((node: NodeData) => {
    setEditingNode(deepClone(node)); // Edit a copy
    setIsEditDialogOpen(true);
  }, []);

  const handleSaveNode = useCallback((nodeIdFromDialog: string, data: EditNodeInput) => {
    if (!mindmap || !editingNode) return; // editingNode should be set if dialog is open for saving
    beforeMutation();

    if (editingNode.id.startsWith('temp-')) { // It's a new node being created
      // useMindmaps' addNode will assign permanent ID and calculate final position
      const permanentNode = addNode(mindmap.id, editingNode.parentId, data, editingNode.x, editingNode.y);
      if (permanentNode) {
        toast({ title: "Node Created", description: `Node "${permanentNode.title}" added.` });
      }
    } else { // It's an existing node being updated
      updateNodeDataHook(mindmap.id, editingNode.id, data);
      toast({ title: "Node Updated", description: `Node "${data.title}" saved.` });
    }
    setEditingNode(null); // Clear editing state
    setIsEditDialogOpen(false); // Close dialog
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


  const handleNodeDragStart = useCallback((event: React.DragEvent<HTMLDivElement>, nodeId: string) => {
    if (activeTool === 'pan') { // Prevent node drag if pan tool is active
        event.preventDefault();
        return;
    }
    if (!viewportContainerRef.current || !canvasContentRef.current) return;

    const nodeElement = nodeElementsRef.current.get(nodeId);
    if (!nodeElement) return;

    const nodeRect = nodeElement.getBoundingClientRect(); // Screen coordinates of the node card

    // Calculate drag offset relative to node's top-left, in LOGICAL units
    // This is where the mouse clicked *within* the node card, scaled.
    const logicalDragOffsetX = (event.clientX - nodeRect.left) / scale;
    const logicalDragOffsetY = (event.clientY - nodeRect.top) / scale;
    
    const payload = { nodeId, logicalDragOffsetX, logicalDragOffsetY };
    event.dataTransfer.setData('application/json', JSON.stringify(payload));
    event.dataTransfer.effectAllowed = "move";
    // Store this in a ref as well, as dataTransfer might not be accessible in all drag events consistently
    dragDataRef.current = payload; 
  }, [activeTool, scale]);


  const handleDragOverCanvas = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault(); // Necessary to allow dropping
    event.dataTransfer.dropEffect = "move";
  }, []);

  const handleDropOnCanvas = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!viewportContainerRef.current || !mindmap || activeTool === 'pan' || !dragDataRef.current) return;

    const { nodeId, logicalDragOffsetX, logicalDragOffsetY } = dragDataRef.current; // Use the ref
    if (!nodeId) return;

    const viewportRect = viewportContainerRef.current.getBoundingClientRect();

    // Calculate new logical top-left position of the node on the large canvas
    // 1. Mouse position relative to viewport: (event.clientX - viewportRect.left)
    // 2. Adjust for current pan: (mouse_relative_to_viewport - pan.x)
    // 3. Scale to logical units: (adjusted_for_pan / scale)
    // 4. Subtract the initial drag offset within the node: (scaled_position - logicalDragOffsetX)
    let newX_logical = (event.clientX - viewportRect.left - pan.x) / scale - logicalDragOffsetX;
    let newY_logical = (event.clientY - viewportRect.top - pan.y) / scale - logicalDragOffsetY;

    const nodeToDrag = mindmap.data.nodes[nodeId];
    if (!nodeToDrag) return;
    const approxNodeHeight = getApproxNodeHeight(nodeToDrag);

    // Clamp node position to within logical canvas boundaries (2000x2000 in v0.0.5)
    newX_logical = Math.max(0, Math.min(newX_logical, canvasNumericWidth - NODE_CARD_WIDTH));
    newY_logical = Math.max(0, Math.min(newY_logical, canvasNumericHeight - approxNodeHeight));
    
    beforeMutation();
    updateNodePosition(mindmap.id, nodeId, newX_logical, newY_logical);
    dragDataRef.current = null; // Clear drag data
  }, [mindmap, updateNodePosition, pan, scale, activeTool, beforeMutation, NODE_CARD_WIDTH, canvasNumericWidth, canvasNumericHeight, getApproxNodeHeight]);


  const handleExportJson = useCallback(() => {
    if (!mindmap) return;
    const mindmapToExport = deepClone(mindmap); // Export a copy
    // Convert to JSON string
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(mindmapToExport, null, 2))}`;
    const link = document.createElement("a");
    link.href = jsonString;
    link.download = `${mindmapToExport.name.replace(/\s+/g, '_').toLowerCase()}_mindmap.json`;
    link.click();
    toast({ title: "Exported", description: "Mindmap data exported as JSON." });
  }, [mindmap, toast]);


  useEffect(() => {
    if (!viewportContainerRef.current || !canvasContentRef.current || !mindmap) {
      setWireDrawData([]);
      return;
    }
    
    // Use requestAnimationFrame to ensure calculations happen after layout
    const frameId = requestAnimationFrame(() => {
      if (!viewportContainerRef.current || !canvasContentRef.current) return;

      const newWiresArray: WireDrawData[] = [];
      const viewportRect = viewportContainerRef.current.getBoundingClientRect(); // The 1200x800 viewport

      // Use integer rounding for SVG path coordinates to potentially stabilize comparison
      const round = (num: number) => Math.round(num);

      allNodes.forEach(node => {
        if (!node.parentId || !mindmap.data.nodes[node.parentId!]) return;

        const parentNode = mindmap.data.nodes[node.parentId!];
        const parentEl = nodeElementsRef.current.get(node.parentId!);
        const childEl = nodeElementsRef.current.get(node.id);

        if (parentNode && parentEl && childEl) {
          const parentRect = parentEl.getBoundingClientRect(); // Screen coordinates of parent node
          const childRect = childEl.getBoundingClientRect();   // Screen coordinates of child node

          // Calculate anchor points in SCREEN coordinates
          const parentAnchorX_screen = parentRect.left + parentRect.width / 2;
          const parentAnchorY_screen = parentRect.top + parentRect.height; // Bottom-center of parent
          const childAnchorX_screen = childRect.left + childRect.width / 2;
          const childAnchorY_screen = childRect.top; // Top-center of child

          // Convert screen anchor points to LOGICAL canvas coordinates (relative to canvasContentRef's 0,0)
          const parentAnchorX_logical = round((parentAnchorX_screen - viewportRect.left - pan.x) / scale);
          const parentAnchorY_logical = round((parentAnchorY_screen - viewportRect.top - pan.y) / scale);
          const childAnchorX_logical = round((childAnchorX_screen - viewportRect.left - pan.x) / scale);
          const childAnchorY_logical = round((childAnchorY_screen - viewportRect.top - pan.y) / scale);
          
          const pAX = parentAnchorX_logical;
          const pAY = parentAnchorY_logical;
          const cAX = childAnchorX_logical;
          const cAY = childAnchorY_logical;

          // Bezier curve control points to make an "S" shape
          const curveOffsetY = Math.max(30, Math.abs(cAY - pAY) / 2.5); // Adjust curviness
          const d = `M ${pAX} ${pAY} C ${pAX} ${round(pAY + curveOffsetY)}, ${cAX} ${round(cAY - curveOffsetY)}, ${cAX} ${cAY}`;
          
          let strokeColor = "";
           // For v0.0.5, no custom node colors are used, so rely on theme.
           if(parentNode.parentId === null) { // Parent is a root node
               strokeColor = "hsl(var(--primary))";
           } else { // Parent is a child node
               strokeColor = "hsl(var(--accent))";
           }
          
          newWiresArray.push({ key: `${parentNode.id}-${node.id}`, d, stroke: strokeColor });
        }
      });

      // Only update state if the wire data has actually changed to prevent infinite loops
      setWireDrawData(prevWireData => {
        if (JSON.stringify(prevWireData) === JSON.stringify(newWiresArray)) {
          return prevWireData;
        }
        return newWiresArray;
      });
    });

    return () => cancelAnimationFrame(frameId); // Cleanup on unmount or when dependencies change
  }, [mindmap, pan, scale, wireRecalcTrigger, getApproxNodeHeight, NODE_CARD_WIDTH, allNodes]); // allNodes is derived from mindmap


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
  
  const canUndo = undoStack.length > 1; // Current state is not on the undo stack itself in this model
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

          {/* Add New Root Idea Form */}
          <div className="flex flex-col sm:flex-row items-stretch gap-1 p-1.5">
            <Input type="text" value={newRootNodeTitle} onChange={(e) => setNewRootNodeTitle(e.target.value)} placeholder="New Root Idea Title" className="flex-grow h-9 text-sm" />
            <Textarea value={newRootNodeDescription} onChange={(e) => setNewRootNodeDescription(e.target.value)} placeholder="Description (Optional)" rows={1} className="flex-grow text-sm min-h-[36px] h-9 resize-y max-h-24" />
            <Button onClick={handleAddRootNode} size="sm" className="h-9 text-sm whitespace-nowrap px-3"><PlusCircle className="mr-1.5 h-4 w-4" /> Add Root Idea</Button>
          </div>
        </div>

        {/* Fixed Viewport for Canvas */}
         <div className="flex-grow flex items-center justify-center p-0 bg-background"> {/* Outer centering container */}
          <div
            ref={viewportContainerRef}
            className="bg-card shadow-2xl relative" 
            style={{
              width: `${FIXED_VIEWPORT_WIDTH}px`, 
              height: `${FIXED_VIEWPORT_HEIGHT}px`, 
              overflow: 'hidden', // Clips the canvasContentRef
              userSelect: 'none', // Prevents text selection during drag/pan
            }}
            onMouseDown={handlePanMouseDown} // For pan tool
            onTouchStart={handleTouchStart} // For touch pan/zoom
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
            // Wheel event is now attached directly in useEffect to viewportContainerRef
          >
            <div
              ref={canvasContentRef}
              className="absolute top-0 left-0 bg-card border-2 border-dashed border-sky-300" // Added border to logical canvas
              style={{
                width: CANVAS_CONTENT_WIDTH_STR, 
                height: CANVAS_CONTENT_HEIGHT_STR,
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                transformOrigin: '0 0', // Scale/pan from top-left
                pointerEvents: 'auto', // Ensure this container itself can receive drop events if needed
              }}
              onDragOver={handleDragOverCanvas}
              onDrop={handleDropOnCanvas}
            >
              {/* SVG for drawing wires */}
              <svg
                className="absolute top-0 left-0 pointer-events-none" // Wires should not interfere with mouse events
                style={{ width: '100%', height: '100%', overflow: 'visible' }} // Allow paths to draw outside nominal SVG bounds if needed
              >
                {wireDrawData.map(wire => (
                  <path
                    key={wire.key}
                    d={wire.d}
                    stroke={wire.stroke}
                    strokeWidth={Math.max(1, 2 / scale)} // Adjust stroke width based on zoom
                    fill="none"
                  />
                ))}
              </svg>

              {/* Render Node Cards */}
              {allNodes.map((nodeData) => (
                <NodeCard
                  key={nodeData.id}
                  node={nodeData}
                  onEdit={handleEditNode}
                  onDelete={requestDeleteNode}
                  onAddChild={handleAddChildNode}
                  onDragStart={(e, id) => handleNodeDragStart(e, id)}
                  className="node-card-draggable" // For identifying nodes vs background
                  domRefCallback={(el) => setNodeElementRef(nodeData.id, el)}
                />
              ))}

              {/* Message for empty mindmap */}
              {allNodes.length === 0 && (
                <div
                  className="absolute inset-0 flex items-center justify-center pointer-events-none text-center"
                  style={{
                    // Center message within the logical canvas, scale it inversely to main zoom
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
            </div>
          </div>
        </div>


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

interface MindmapPageProps {
  params: { id: string };
}
// Added this interface to satisfy the props for MindmapEditor within this file.
// In a real app, this would come from the page component.
// This is a placeholder as the original page.tsx was not provided with this request.
export default function MindmapPagePlaceholder({ params }: MindmapPageProps) {
  return <MindmapEditor mindmapId={params.id} />;
}

