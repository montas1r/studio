
"use client";

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { Mindmap, NodeData, EditNodeInput, MindmapData, PaletteColorKey } from '@/types/mindmap';
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


const CANVAS_CONTENT_WIDTH_STR = '2000px';
const CANVAS_CONTENT_HEIGHT_STR = '2000px';

const deepClone = <T,>(obj: T): T => {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  // Fallback for structuredClone if not available (e.g., older environments)
  // For complex objects with Dates, Maps, Sets, etc., a more robust deep cloning library might be needed.
  // However, for this specific MindmapData structure, JSON parse/stringify should suffice.
  try {
    if (typeof structuredClone === 'function') {
      return structuredClone(obj);
    }
  } catch (e) {
    // Fallback if structuredClone fails for some reason
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

  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [activeTool, setActiveTool] = useState<'select' | 'pan'>('select');
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ mouseX: number; mouseY: number; initialPanX: number; initialPanY: number } | null>(null);

  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartScaleRef = useRef<number>(1);
  const pinchCenterRef = useRef<{x: number, y: number} | null>(null);

  const viewportContainerRef = useRef<HTMLDivElement>(null);
  const canvasContentRef = useRef<HTMLDivElement>(null);
  const dragDataRef = useRef<{ nodeId: string; logicalDragOffsetX: number; logicalDragOffsetY: number } | null>(null);

  const [undoStack, setUndoStack] = useState<MindmapData[]>([]);
  const [redoStack, setRedoStack] = useState<MindmapData[]>([]);
  const initialViewCenteredRef = useRef(false);

  const canvasNumericWidth = useMemo(() => parseInt(CANVAS_CONTENT_WIDTH_STR, 10), []);
  const canvasNumericHeight = useMemo(() => parseInt(CANVAS_CONTENT_HEIGHT_STR, 10), []);

  const [wireDrawData, setWireDrawData] = useState<WireDrawData[]>([]);
  const nodeElementsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const [wireRecalcTrigger, setWireRecalcTrigger] = useState(0);


  const setNodeElement = useCallback((nodeId: string, element: HTMLDivElement | null) => {
    const currentMap = nodeElementsRef.current;
    let mapChanged = false;
    if (element) {
      if (currentMap.get(nodeId) !== element) {
        currentMap.set(nodeId, element);
        mapChanged = true;
      }
    } else {
      if (currentMap.has(nodeId)) {
        currentMap.delete(nodeId);
        mapChanged = true;
      }
    }

    if (mapChanged) {
      // Only trigger recalculation if the map of elements actually changed.
      // This helps prevent infinite loops by ensuring this callback doesn't cause
      // unnecessary state updates if the element reference itself hasn't changed.
      setWireRecalcTrigger(v => v + 1);
    }
  }, []);


  const clampPan = useCallback((newPanX: number, newPanY: number, currentScale: number) => {
    if (!viewportContainerRef.current) return { x: newPanX, y: newPanY };

    const viewportRect = viewportContainerRef.current.getBoundingClientRect();
    const scaledCanvasWidth = canvasNumericWidth * currentScale;
    const scaledCanvasHeight = canvasNumericHeight * currentScale;

    let clampedX = newPanX;
    let clampedY = newPanY;

    // If canvas is wider than viewport, clamp pan so canvas edges don't go beyond viewport edges
    if (scaledCanvasWidth > viewportRect.width) {
      clampedX = Math.min(0, Math.max(newPanX, viewportRect.width - scaledCanvasWidth));
    } else { // If canvas is narrower, clamp pan to keep canvas within viewport (can be centered)
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

    const currentScale = scale;

    const newPanX = targetX - (targetX - pan.x) * (newScale / currentScale);
    const newPanY = targetY - (targetY - pan.y) * (newScale / currentScale);

    const clampedNewPan = clampPan(newPanX, newPanY, newScale);

    setScale(newScale);
    setPan(clampedNewPan);
  }, [scale, pan, clampPan]);


  const handleButtonZoomIn = useCallback(() => adjustZoom(scale * 1.2), [adjustZoom, scale]);
  const handleButtonZoomOut = useCallback(() => adjustZoom(scale / 1.2), [adjustZoom, scale]);

  const handleRecenterView = useCallback(() => {
    if (!viewportContainerRef.current || !mindmap) return;

    const allNodesArray = Object.values(mindmap.data.nodes);
    const viewportRect = viewportContainerRef.current.getBoundingClientRect();

    if (allNodesArray.length === 0) {
      // Center the empty canvas
      const targetScale = 1;
      const newPanX = (viewportRect.width - canvasNumericWidth * targetScale) / 2;
      const newPanY = (viewportRect.height - canvasNumericHeight * targetScale) / 2;
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

    const contentWidth = Math.max(NODE_CARD_WIDTH, maxX - minX); // Ensure min width
    const contentHeight = Math.max(getApproxNodeHeight(allNodesArray[0]), maxY - minY); // Ensure min height based on one node

    const PADDING = 50; // Padding around content in viewport pixels

    let newFitScale = 1;
    if (contentWidth > 0 && contentHeight > 0 && (viewportRect.width - 2 * PADDING) > 0 && (viewportRect.height - 2 * PADDING) > 0) {
        const scaleX = (viewportRect.width - 2 * PADDING) / contentWidth;
        const scaleY = (viewportRect.height - 2 * PADDING) / contentHeight;
        newFitScale = Math.min(scaleX, scaleY);
    } else if (allNodesArray.length > 0) { // Content has some dimension but viewport too small or one dimension is zero
        const scaleX = (viewportRect.width - 2 * PADDING) / Math.max(1, contentWidth); // Avoid division by zero
        const scaleY = (viewportRect.height - 2 * PADDING) / Math.max(1, contentHeight); // Avoid division by zero
        newFitScale = Math.min(scaleX, scaleY);
    }


    newFitScale = Math.max(0.25, Math.min(newFitScale, 2.0)); // Clamp scale

    const contentCenterX_logical = minX + contentWidth / 2;
    const contentCenterY_logical = minY + contentHeight / 2;

    const newFitPanX = viewportRect.width / 2 - contentCenterX_logical * newFitScale;
    const newFitPanY = viewportRect.height / 2 - contentCenterY_logical * newFitScale;

    const clampedFitPan = clampPan(newFitPanX, newFitPanY, newFitScale);
    setScale(newFitScale);
    setPan(clampedFitPan);
  }, [mindmap, getApproxNodeHeight, clampPan, NODE_CARD_WIDTH, canvasNumericWidth, canvasNumericHeight]);


  useEffect(() => {
    if (mindmap && !initialViewCenteredRef.current && viewportContainerRef.current) {
      handleRecenterView();
      initialViewCenteredRef.current = true;
    }
  }, [mindmap, handleRecenterView]);


  const beforeMutation = useCallback(() => {
    if (mindmap?.data) {
      const currentDataSnapshot = deepClone(mindmap.data);
      setUndoStack(prev => [...prev.slice(-19), currentDataSnapshot]); // Keep last 20 states
      setRedoStack([]); // Clear redo stack on new action
    }
  }, [mindmap?.data]);

  useEffect(() => {
    if (mindmap?.data) {
      // Initialize undo stack with the first loaded state if it's empty
      if (undoStack.length === 0 ) {
         // Only set initial if undoStack is truly empty and mindmap data is loaded
        setUndoStack([deepClone(mindmap.data)]);
        setRedoStack([]);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mindmapId, mindmap?.data]); // Depend on mindmapId to re-init for new mindmap


  const handleUndo = useCallback(() => {
    if (!mindmap || undoStack.length <= 1) return; // Need at least one state to revert to

    const currentSnapshot = deepClone(mindmap.data); // Current state before undo
    const previousData = deepClone(undoStack[undoStack.length - 2]); // The state to revert to

    setRedoStack(prev => [currentSnapshot, ...prev.slice(0,19)]);
    setUndoStack(prev => prev.slice(0, -1)); // Remove current from undo (it's now in redo)
    updateMindmap(mindmap.id, { data: previousData });
  }, [mindmap, undoStack, updateMindmap]);

  const handleRedo = useCallback(() => {
    if (!mindmap || redoStack.length === 0) return;
    const nextData = deepClone(redoStack[0]); // The state to re-apply

    setUndoStack(prev => [...prev.slice(-19), deepClone(mindmap.data)]); // Current state pushed to undo
    setRedoStack(prev => prev.slice(1)); // Remove from redo
    updateMindmap(mindmap.id, { data: nextData });
  }, [mindmap, redoStack, undoStack, updateMindmap]);


  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      // Ignore if typing in an input/textarea or contenteditable
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


  const handlePanMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (activeTool !== 'pan' || !viewportContainerRef.current) return;
    // Prevent pan if clicking on a node card or a tool button
    const targetIsNode = (event.target as HTMLElement).closest('.node-card-draggable');
    const targetIsButton = (event.target as HTMLElement).closest('[data-tool-button]');
    if (targetIsNode || targetIsButton) return;

    event.preventDefault();
    setIsPanning(true);
    panStartRef.current = { mouseX: event.clientX, mouseY: event.clientY, initialPanX: pan.x, initialPanY: pan.y };
  }, [activeTool, pan.x, pan.y]); // Added pan.x, pan.y to dependencies

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
  }, [isPanning]);


  useEffect(() => {
    const vpCurrent = viewportContainerRef.current;
    if (!vpCurrent) return;

    const currentCursor = activeTool === 'pan' ? (isPanning ? 'grabbing' : 'grab') : 'default';
    vpCurrent.style.cursor = currentCursor;

    if (isPanning && activeTool === 'pan') {
      window.addEventListener('mousemove', handlePanMouseMove);
      window.addEventListener('mouseup', handlePanMouseUpOrLeave);
      window.addEventListener('mouseleave', handlePanMouseUpOrLeave); // Handle mouse leaving window
      return () => {
        window.removeEventListener('mousemove', handlePanMouseMove);
        window.removeEventListener('mouseup', handlePanMouseUpOrLeave);
        window.removeEventListener('mouseleave', handlePanMouseUpOrLeave);
      };
    }
  }, [isPanning, activeTool, handlePanMouseMove, handlePanMouseUpOrLeave]);


  const handleWheelZoom = useCallback((event: WheelEvent) => {
    if (!viewportContainerRef.current) return;
    // Prevent zoom if over a node card or a tool button to avoid conflicts with node scrolling or button actions
    const targetIsNode = (event.target as HTMLElement).closest('.node-card-draggable');
    const targetIsButton = (event.target as HTMLElement).closest('[data-tool-button]');
    if (targetIsNode || targetIsButton) return;

    event.preventDefault();
    const viewportRect = viewportContainerRef.current.getBoundingClientRect();
    const focalX = event.clientX - viewportRect.left; // Mouse position relative to viewport
    const focalY = event.clientY - viewportRect.top;
    const delta = event.deltaY > 0 ? 0.9 : 1.1; // Standard zoom factor
    adjustZoom(scale * delta, focalX, focalY);
  }, [adjustZoom, scale]);


  const handleTouchStart = useCallback((event: TouchEvent) => {
    if (!viewportContainerRef.current) return;
    // Prevent default behaviors (like scrolling page) if interacting with canvas background
    const targetIsNode = (event.target as HTMLElement).closest('.node-card-draggable');
    const targetIsButton = (event.target as HTMLElement).closest('[data-tool-button]');
    
    if(targetIsNode || targetIsButton) return; // Allow default touch on nodes/buttons

    const touches = event.touches;
    if (touches.length === 1 && activeTool === 'pan') {
      event.preventDefault(); // Prevent page scroll when panning
      setIsPanning(true);
      panStartRef.current = { mouseX: touches[0].clientX, mouseY: touches[0].clientY, initialPanX: pan.x, initialPanY: pan.y };
    } else if (touches.length === 2) {
      event.preventDefault(); // Prevent page scroll/zoom when pinch-zooming
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
  }, [activeTool, pan.x, pan.y, scale]); // Added pan.x, pan.y, scale to dependencies

  const handleTouchMove = useCallback((event: TouchEvent) => {
    if (!viewportContainerRef.current) return;
     // Prevent default behaviors if touch move is for canvas interaction
     const targetIsNode = (event.target as HTMLElement).closest('.node-card-draggable');
     if(targetIsNode) return; // Allow default touch scroll on nodes if they have internal scroll

    const touches = event.touches;
    if (touches.length === 1 && isPanning && panStartRef.current && activeTool === 'pan') {
      event.preventDefault();
      const dx = touches[0].clientX - panStartRef.current.mouseX;
      const dy = touches[0].clientY - panStartRef.current.mouseY;
      setPan(clampPan(panStartRef.current.initialPanX + dx, panStartRef.current.initialPanY + dy, scale));
    } else if (touches.length === 2 && pinchStartDistRef.current !== null && pinchCenterRef.current) {
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


  useEffect(() => {
    const vpCurrent = viewportContainerRef.current;
    if (!vpCurrent) return;

    // Attach wheel event listener
    vpCurrent.addEventListener('wheel', handleWheelZoom, { passive: false });

    // Attach touch event listeners
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
  }, [handleWheelZoom, handleTouchStart, handleTouchMove, handleTouchEnd]);


  const handleAddRootNode = useCallback(async () => {
    if (newRootNodeTitle.trim() === '') {
      toast({ title: "Title Required", description: "Please enter a title for the new root node.", variant: "destructive" });
      return;
    }
    if (!mindmap || !viewportContainerRef.current) return;
    beforeMutation();

    const newNodeDetails: EditNodeInput = { title: newRootNodeTitle, description: newRootNodeDescription, emoji: '💡' };
    const newRootNode = addNode(mindmap.id, null, newNodeDetails); // UseMindmaps handles initial placement

    if (newRootNode) {
      setNewRootNodeTitle(''); setNewRootNodeDescription('');
      toast({ title: "Root Node Added", description: `"${newRootNode.title}" added.` });
      
      // Center view on the new node
      const viewportRect = viewportContainerRef.current.getBoundingClientRect();
      const nodeCenterX_logical = newRootNode.x + NODE_CARD_WIDTH / 2;
      const nodeCenterY_logical = newRootNode.y + getApproxNodeHeight(newRootNode) / 2;
      
      // Keep current scale, just pan to the new node
      const currentScale = scale;
      const newPanX = viewportRect.width / 2 - nodeCenterX_logical * currentScale;
      const newPanY = viewportRect.height / 2 - nodeCenterY_logical * currentScale;
      setPan(clampPan(newPanX, newPanY, currentScale));
    }
  }, [newRootNodeTitle, newRootNodeDescription, mindmap, addNode, toast, getApproxNodeHeight, NODE_CARD_WIDTH, beforeMutation, scale, clampPan, pan]);


  const handleAddChildNode = useCallback((parentId: string) => {
    if (!mindmap) return;
    const parentNode = mindmap.data.nodes[parentId];
    if (!parentNode) return;

    // Create a temporary node for the dialog
    const tempNewNode: NodeData = {
      id: `temp-${uuidv4()}`, // Temporary ID
      title: '',
      description: "",
      emoji: "➕",
      parentId: parentId,
      childIds: [],
      x: 0, y: 0, // Position will be determined by useMindmaps if saved
      // No customBackgroundColor for v0.0.5
    };
    setEditingNode(tempNewNode);
    setIsEditDialogOpen(true);
  }, [mindmap]);

  const handleEditNode = useCallback((node: NodeData) => {
    setEditingNode(deepClone(node)); // Edit a copy
    setIsEditDialogOpen(true);
  }, []);

  const handleSaveNode = useCallback((nodeIdFromDialog: string, data: EditNodeInput) => {
    if (!mindmap || !editingNode) return; // editingNode must exist
    beforeMutation();

    if (editingNode.id.startsWith('temp-')) { // It's a new node being created
      const permanentNode = addNode(mindmap.id, editingNode.parentId, data); // useMindmaps determines initial pos
      if (permanentNode) {
        toast({ title: "Node Created", description: `Node "${permanentNode.title}" added.` });
      }
    } else { // It's an existing node being updated
      updateNodeDataHook(mindmap.id, editingNode.id, data); // editingNode.id is the permanent ID
      toast({ title: "Node Updated", description: `Node "${data.title}" saved.` });
    }
    setEditingNode(null); // Clear editing node
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


  const handleNodeDragStart = useCallback((event: React.DragEvent<HTMLDivElement>, nodeId: string) => {
    if (activeTool === 'pan') { event.preventDefault(); return; } // Don't drag nodes if pan tool is active
    if (!viewportContainerRef.current) return;

    const nodeElement = event.currentTarget;
    const nodeRect = nodeElement.getBoundingClientRect(); // Screen position of node

    // Logical offset from node's top-left, accounting for current scale
    const logicalDragOffsetX = (event.clientX - nodeRect.left) / scale;
    const logicalDragOffsetY = (event.clientY - nodeRect.top) / scale;

    const payload = { nodeId, logicalDragOffsetX, logicalDragOffsetY };
    event.dataTransfer.setData('application/json', JSON.stringify(payload));
    event.dataTransfer.effectAllowed = "move";
    dragDataRef.current = payload; // Store ref for fallback if dataTransfer is weird
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
      payload = jsonData ? JSON.parse(jsonData) : dragDataRef.current; // Fallback to ref
    } catch (e) { payload = dragDataRef.current; }


    if (!payload || typeof payload.logicalDragOffsetX !== 'number' || typeof payload.logicalDragOffsetY !== 'number') {
      dragDataRef.current = null; return;
    }
    const { nodeId, logicalDragOffsetX, logicalDragOffsetY } = payload;
    if (!nodeId) { dragDataRef.current = null; return; }

    const viewportRect = viewportContainerRef.current.getBoundingClientRect();

    // Calculate new logical position for top-left of node, accounting for pan, scale, and viewport offset
    let newX_logical = (event.clientX - viewportRect.left - pan.x) / scale - logicalDragOffsetX;
    let newY_logical = (event.clientY - viewportRect.top - pan.y) / scale - logicalDragOffsetY;

    // Clamp node position to logical canvas boundaries
    const nodeToDrag = mindmap.data.nodes[nodeId];
    if (!nodeToDrag) { dragDataRef.current = null; return; }
    const approxNodeHeight = getApproxNodeHeight(nodeToDrag);

    newX_logical = Math.max(0, Math.min(newX_logical, canvasNumericWidth - NODE_CARD_WIDTH));
    newY_logical = Math.max(0, Math.min(newY_logical, canvasNumericHeight - approxNodeHeight));
    
    beforeMutation();
    updateNodePosition(mindmap.id, nodeId, newX_logical, newY_logical);
    dragDataRef.current = null; // Clear drag data
  }, [mindmap, updateNodePosition, pan, scale, activeTool, beforeMutation, NODE_CARD_WIDTH, canvasNumericWidth, canvasNumericHeight, getApproxNodeHeight]);


  const handleExportJson = useCallback(() => {
    if (!mindmap) return;
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(mindmap, null, 2))}`;
    const link = document.createElement("a");
    link.href = jsonString;
    link.download = `${mindmap.name.replace(/\s+/g, '_').toLowerCase()}_mindmap.json`;
    link.click();
    toast({ title: "Exported", description: "Mindmap data exported as JSON." });
  }, [mindmap, toast]);

  useEffect(() => {
    if (!viewportContainerRef.current || !mindmap) {
      setWireDrawData([]); // Clear wires if no canvas or mindmap
      return;
    }

    const allNodesCurrent = allNodes; // Use a snapshot of allNodes for this effect run
    if (allNodesCurrent.length === 0) {
        setWireDrawData([]);
        return;
    }
    
    // Use requestAnimationFrame to ensure calculations happen after layout
    const frameId = requestAnimationFrame(() => {
      if (!viewportContainerRef.current) return; // Check again inside rAF

      const newWiresArray: WireDrawData[] = [];
      const viewportRect = viewportContainerRef.current.getBoundingClientRect();

      allNodesCurrent.forEach(node => {
        if (!node.parentId || !mindmap.data.nodes[node.parentId!]) return;

        const parentNode = mindmap.data.nodes[node.parentId!];
        const parentEl = nodeElementsRef.current.get(node.parentId!);
        const childEl = nodeElementsRef.current.get(node.id);

        if (parentNode && parentEl && childEl) {
          // Get bounding client rects INSIDE animation frame for latest positions
          const parentRect = parentEl.getBoundingClientRect();
          const childRect = childEl.getBoundingClientRect();

          // Calculate anchor points in screen coordinates
          const parentAnchorX_screen = parentRect.left + parentRect.width / 2;
          const parentAnchorY_screen = parentRect.top + parentRect.height; // Bottom-center of parent
          const childAnchorX_screen = childRect.left + childRect.width / 2;
          const childAnchorY_screen = childRect.top; // Top-center of child

          // Convert screen coordinates to logical canvas coordinates (relative to canvasContentRef's top-left)
          // This accounts for viewport offset, current pan, and scale
          const parentAnchorX_logical = (parentAnchorX_screen - viewportRect.left - pan.x) / scale;
          const parentAnchorY_logical = (parentAnchorY_screen - viewportRect.top - pan.y) / scale;
          const childAnchorX_logical = (childAnchorX_screen - viewportRect.left - pan.x) / scale;
          const childAnchorY_logical = (childAnchorY_screen - viewportRect.top - pan.y) / scale;
          
          // Bezier curve calculation
          const curveOffsetY = Math.max(30, Math.abs(childAnchorY_logical - parentAnchorY_logical) / 2.5);
          const d = `M ${parentAnchorX_logical} ${parentAnchorY_logical} C ${parentAnchorX_logical} ${parentAnchorY_logical + curveOffsetY}, ${childAnchorX_logical} ${childAnchorY_logical - curveOffsetY}, ${childAnchorX_logical} ${childAnchorY_logical}`;
          
          // v0.0.5 wire color logic (no custom node color)
          let strokeColor = parentNode.parentId === null ? "hsl(var(--primary))" : "hsl(var(--accent))";
          
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

    return () => cancelAnimationFrame(frameId); // Cleanup animation frame
  }, [mindmap, allNodes, pan, scale, wireRecalcTrigger]); // Dependencies


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
  
  const canUndo = undoStack.length > 1;
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

          <div className="flex flex-col sm:flex-row items-stretch gap-1 p-1.5">
            <Input type="text" value={newRootNodeTitle} onChange={(e) => setNewRootNodeTitle(e.target.value)} placeholder="New Root Idea Title" className="flex-grow h-9 text-sm" />
            <Textarea value={newRootNodeDescription} onChange={(e) => setNewRootNodeDescription(e.target.value)} placeholder="Description (Optional)" rows={1} className="flex-grow text-sm min-h-[36px] h-9 resize-y max-h-24" />
            <Button onClick={handleAddRootNode} size="sm" className="h-9 text-sm whitespace-nowrap px-3"><PlusCircle className="mr-1.5 h-4 w-4" /> Add Root Idea</Button>
          </div>
        </div>

        {/* Fixed Viewport for Canvas */}
         <div className="flex-grow flex items-center justify-center p-0 bg-muted/30"> {/* Centering the viewport */}
          <div
            ref={viewportContainerRef}
            className="bg-card shadow-2xl border-2 border-dashed border-sky-300" // Visual container
            style={{
              width: `1200px`, // Fixed viewport size
              height: `800px`, // Fixed viewport size
              overflow: 'hidden', // Crucial: clips the transformed content
              userSelect: 'none', // Prevent text selection during canvas interaction
              position: 'relative', // For absolute positioning of canvasContentRef
            }}
            onMouseDown={handlePanMouseDown} // Pan starts on the viewport
          >
            <div
              ref={canvasContentRef}
              className="relative bg-transparent" // Canvas content is transparent; viewportContainerRef has bg-card
              style={{
                width: CANVAS_CONTENT_WIDTH_STR, // Large logical canvas
                height: CANVAS_CONTENT_HEIGHT_STR,
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                transformOrigin: '0 0', // Scale/pan from top-left
                pointerEvents: 'auto', // Ensure this layer receives pointer events for its children
              }}
              onDragOver={handleDragOverCanvas}
              onDrop={handleDropOnCanvas}
            >
              <svg
                className="absolute top-0 left-0 pointer-events-none" // SVG should not intercept mouse events
                style={{ width: '100%', height: '100%', overflow: 'visible' }} // Allow paths to draw outside nominal SVG bounds if needed
              >
                {wireDrawData.map(wire => (
                  <path
                    key={wire.key}
                    d={wire.d}
                    stroke={wire.stroke}
                    strokeWidth={Math.max(1, 2 / scale)} // Adjust line thickness with zoom
                    fill="none"
                  />
                ))}
              </svg>
              {allNodes.map((nodeData) => (
                <NodeCard
                  key={nodeData.id}
                  node={nodeData}
                  onEdit={handleEditNode}
                  onDelete={requestDeleteNode}
                  onAddChild={handleAddChildNode}
                  onDragStart={(e, id) => handleNodeDragStart(e, id)}
                  className="node-card-draggable" // Class for identifying draggable nodes
                  domRefCallback={(el) => setNodeElement(nodeData.id, el)}
                />
              ))}
              {allNodes.length === 0 && (
                <div
                  className="absolute inset-0 flex items-center justify-center pointer-events-none text-center"
                  style={{
                    // Center message within the logical canvas, scaled inversely to appear fixed size
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
