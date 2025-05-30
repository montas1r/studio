
"use client";

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { Mindmap, NodeData, EditNodeInput, NodesObject, PaletteColorKey } from '@/types/mindmap';
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

const CANVAS_CONTENT_WIDTH_STR = '2000px';
const CANVAS_CONTENT_HEIGHT_STR = '2000px';
const FIXED_VIEWPORT_WIDTH = 1200;
const FIXED_VIEWPORT_HEIGHT = 800;

const deepClone = <T,>(obj: T): T => {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  // Basic deep clone for plain objects/arrays; for complex cases like Dates, Functions, etc., a more robust solution is needed.
  // For MindmapData, this should be sufficient.
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch (e) {
    console.error("Deep clone failed, falling back to shallow copy for safety:", e);
    // Fallback for unsupported types or circular structures (though mindmap data shouldn't have circular structures that break stringify)
    if (Array.isArray(obj)) {
      return [...obj] as any as T;
    } else if (typeof obj === 'object') {
      return { ...obj } as T;
    }
    return obj; // Should not happen for MindmapData
  }
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
    getApproxNodeHeight,
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
    const oldElement = currentMap.get(nodeId);
  
    let changed = false;
    if (element) {
      // Only set if the element is new or different, or if the ID wasn't there
      if (!nodeExisted || oldElement !== element) {
        currentMap.set(nodeId, element);
        changed = true;
      }
    } else {
      if (nodeExisted) {
        currentMap.delete(nodeId);
        changed = true;
      }
    }
    // Only trigger recalc if map content genuinely changes (add/delete) or a new element instance is provided.
    // The "oldElement !== element" check helps if a node re-renders and gets a new DOM element instance.
    if (changed) {
      setWireRecalcTrigger(prev => prev + 1);
    }
  }, []); // Stable callback, relies on useRef and stable setters

  const clampPan = useCallback((newPanX: number, newPanY: number, currentScale: number) => {
    if (!viewportContainerRef.current) return { x: 0, y: 0 };
    const viewportRect = viewportContainerRef.current.getBoundingClientRect();
    let clampedX = newPanX;
    let clampedY = newPanY;

    const scaledCanvasWidth = canvasNumericWidth * currentScale;
    const scaledCanvasHeight = canvasNumericHeight * currentScale;

    // If scaled canvas is wider than viewport, allow panning such that canvas edges can align with viewport edges
    if (scaledCanvasWidth > viewportRect.width) {
      clampedX = Math.min(0, Math.max(newPanX, viewportRect.width - scaledCanvasWidth));
    } else { // If scaled canvas is narrower, keep it within viewport (or center it)
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

  const handleButtonZoomIn = useCallback(() => adjustZoom(scale * 1.2), [adjustZoom, scale]);
  const handleButtonZoomOut = useCallback(() => adjustZoom(scale / 1.2), [adjustZoom, scale]);

  const handleRecenterView = useCallback(() => {
    if (!viewportContainerRef.current || !mindmap) return;

    const allNodesArray = Object.values(mindmap.data.nodes);
    const viewportRect = viewportContainerRef.current.getBoundingClientRect();

    if (allNodesArray.length === 0) {
      const initialScale = 1; // No nodes, default to 1x scale
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
      maxX = Math.max(maxX, node.x + NODE_CARD_WIDTH);
      maxY = Math.max(maxY, node.y + getApproxNodeHeight(node));
    });

    const contentWidth = Math.max(NODE_CARD_WIDTH, maxX - minX);
    const contentHeight = Math.max(getApproxNodeHeight(allNodesArray[0] || null), maxY - minY);

    const PADDING = 50; // Pixel padding around content within viewport

    let newFitScale = 1;
    if (contentWidth > 0 && contentHeight > 0) {
      const targetViewportWidth = viewportRect.width - 2 * PADDING;
      const targetViewportHeight = viewportRect.height - 2 * PADDING;
      if (targetViewportWidth <= 0 || targetViewportHeight <= 0) {
        newFitScale = 0.25; // Fallback if viewport is too small
      } else {
        const scaleX = targetViewportWidth / contentWidth;
        const scaleY = targetViewportHeight / contentHeight;
        newFitScale = Math.min(scaleX, scaleY, 2.0); // Max zoom 2.0
      }
    } else {
      newFitScale = 1; // Default scale if no content dimensions
    }

    newFitScale = Math.max(0.25, newFitScale); // Min zoom 0.25

    const contentCenterX_logical = minX + contentWidth / 2;
    const contentCenterY_logical = minY + contentHeight / 2;

    const newFitPanX = viewportRect.width / 2 - contentCenterX_logical * newFitScale;
    const newFitPanY = viewportRect.height / 2 - contentCenterY_logical * newFitScale;

    const clampedFitPan = clampPan(newFitPanX, newFitPanY, newFitScale);

    setScale(newFitScale);
    setPan(clampedFitPan);
  }, [mindmap, getApproxNodeHeight, NODE_CARD_WIDTH, clampPan, canvasNumericWidth, canvasNumericHeight]);

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
    if (mindmap?.data) {
      if (undoStack.length === 0 && redoStack.length === 0 && Object.keys(mindmap.data.nodes).length > 0) {
        // Push the initial loaded state onto the undo stack
        // This allows undoing the very first action back to the loaded state
        setUndoStack([deepClone(mindmap.data)]);
      }
    }
    // This effect should only run once when the mindmap data is initially loaded
    // to set up the first undo state. Subsequent undo states are handled by `beforeMutation`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mindmapId, mindmap?.data]);


  const handleUndo = useCallback(() => {
    if (!mindmap || undoStack.length === 0) return;

    const currentSnapshot = deepClone(mindmap.data);
    const previousData = deepClone(undoStack[undoStack.length - 1]);

    setRedoStack(prev => [currentSnapshot, ...prev.slice(0, 19)]);
    setUndoStack(prev => prev.slice(0, -1));

    updateMindmap(mindmap.id, { data: previousData });
    setWireRecalcTrigger(prev => prev + 1);
  }, [mindmap, undoStack, updateMindmap]);

  const handleRedo = useCallback(() => {
    if (!mindmap || redoStack.length === 0) return;
    const nextData = deepClone(redoStack[0]);

    setUndoStack(prev => [...prev.slice(-19), deepClone(mindmap.data)]);
    setRedoStack(prev => prev.slice(1));

    updateMindmap(mindmap.id, { data: nextData });
    setWireRecalcTrigger(prev => prev + 1);
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
    // Prevent panning if clicking on a node card or interactive elements within it
    if ((event.target as HTMLElement).closest('.node-card-draggable') || (event.target as HTMLElement).closest('[data-tool-button]')) return;

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
    if (isPanning) {
      setIsPanning(false);
    }
  }, [isPanning]);

  useEffect(() => {
    const vpCurrent = viewportContainerRef.current;
    if (!vpCurrent || activeTool !== 'pan') {
      if (vpCurrent) vpCurrent.style.cursor = 'default';
      return;
    }

    const currentCursor = isPanning ? 'grabbing' : 'grab';
    vpCurrent.style.cursor = currentCursor;

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
  }, [isPanning, activeTool, handlePanMouseMove, handlePanMouseUpOrLeave]);

  const handleWheelZoom = useCallback((event: WheelEvent) => {
    if (!viewportContainerRef.current) return;
    // Prevent wheel zoom if interacting with an input/textarea within the viewport (e.g., if nodes become editable inline)
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.closest('.node-card-draggable')) {
      // Allow native scroll for inputs/textareas, or if wheeling over a node card (might be useful for long node content later)
      // For now, we block wheel zoom on node cards to prevent accidental zooms when trying to scroll node content (if it were scrollable).
      return;
    }
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
    return () => {
      if (vpCurrent) {
        vpCurrent.removeEventListener('wheel', handleWheelZoom);
      }
    };
  }, [handleWheelZoom]);


  const handleTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (!viewportContainerRef.current) return;
    const touches = event.touches;

    // Prevent default touch behaviors like scrolling the page if interacting with the canvas
    if ((event.target as HTMLElement).closest('.canvas-touch-area')) {
        event.preventDefault();
    }


    if (touches.length === 1 && activeTool === 'pan') {
      if ((touches[0].target as HTMLElement).closest('.node-card-draggable') || (touches[0].target as HTMLElement).closest('[data-tool-button]')) return;
      setIsPanning(true);
      panStartRef.current = { mouseX: touches[0].clientX, mouseY: touches[0].clientY, panX: pan.x, panY: pan.y };
    } else if (touches.length === 2) {
      setIsPanning(false); // Stop any single-touch pan
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
    
    // Prevent default touch behaviors like scrolling the page if interacting with the canvas
    if ((event.target as HTMLElement).closest('.canvas-touch-area')) {
        event.preventDefault();
    }

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
    if (!mindmap || !viewportContainerRef.current) return;
    beforeMutation();

    const newNodeDetails: EditNodeInput = { title: newRootNodeTitle, description: newRootNodeDescription, emoji: '💡' };
    // useMindmaps hook will handle initial x,y for root nodes
    const newRootNode = addNode(mindmap.id, null, newNodeDetails);

    if (newRootNode) {
      setNewRootNodeTitle(''); setNewRootNodeDescription('');
      toast({ title: "Root Node Added", description: `"${newRootNode.title}" added.` });

      // Center view on the new node
      const viewportRect = viewportContainerRef.current.getBoundingClientRect();
      const nodeCenterX_logical = newRootNode.x + NODE_CARD_WIDTH / 2;
      const nodeCenterY_logical = newRootNode.y + getApproxNodeHeight(newRootNode) / 2;

      const newPanX = viewportRect.width / 2 - nodeCenterX_logical * scale;
      const newPanY = viewportRect.height / 2 - nodeCenterY_logical * scale;
      setPan(clampPan(newPanX, newPanY, scale));
      setWireRecalcTrigger(prev => prev + 1);
    }
  }, [newRootNodeTitle, newRootNodeDescription, mindmap, addNode, toast, getApproxNodeHeight, NODE_CARD_WIDTH, beforeMutation, scale, clampPan, pan]);


  const handleAddChildNode = useCallback((parentId: string) => {
    if (!mindmap) return;
    const parentNode = mindmap.data.nodes[parentId];
    if (!parentNode) return;

    // Temporarily create node data for the dialog, actual add happens on save
    const tempNewNode: NodeData = {
      id: `temp-${Date.now()}`, // Temporary ID
      title: '',
      description: "",
      emoji: "➕",
      parentId: parentId,
      childIds: [],
      // Position will be determined by useMindmaps addNode or dialog can suggest based on parent
      x: parentNode.x + NODE_CARD_WIDTH / 2, // Suggest a starting point
      y: parentNode.y + getApproxNodeHeight(parentNode) + 50,
      // customBackgroundColor: undefined, // Explicitly undefined for new temp nodes
    };
    setEditingNode(tempNewNode);
    setIsEditDialogOpen(true);
  }, [mindmap, getApproxNodeHeight, NODE_CARD_WIDTH]);

  const handleEditNode = useCallback((node: NodeData) => {
    setEditingNode(deepClone(node));
    setIsEditDialogOpen(true);
  }, []);

  const handleSaveNode = useCallback((nodeIdFromDialog: string, data: EditNodeInput) => {
    if (!mindmap || !editingNode) return;
    beforeMutation();

    let savedNode: NodeData | undefined;
    if (editingNode.id.startsWith('temp-')) { // It's a new node
      savedNode = addNode(mindmap.id, editingNode.parentId, data);
      if (savedNode) {
        toast({ title: "Node Created", description: `Node "${savedNode.title}" added.` });
      }
    } else { // It's an existing node
      updateNodeDataHook(mindmap.id, editingNode.id, data);
      const potentiallyUpdatedMindmap = getMindmapById(mindmapId); // Re-fetch to get latest data
      savedNode = potentiallyUpdatedMindmap?.data.nodes[editingNode.id];
      toast({ title: "Node Updated", description: `Node "${data.title}" saved.` });
    }
    setEditingNode(null);
    setIsEditDialogOpen(false);
    if (savedNode) setWireRecalcTrigger(prev => prev + 1);
  }, [mindmap, editingNode, addNode, updateNodeDataHook, toast, beforeMutation, getMindmapById, mindmapId]);


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
    setWireRecalcTrigger(prev => prev + 1);
  }, [mindmap, nodeToDelete, deleteNodeFromHook, toast, beforeMutation]);

  const handleNodeDragStart = useCallback((event: React.DragEvent<HTMLDivElement>, nodeId: string) => {
    if (activeTool === 'pan') {
      event.preventDefault();
      return;
    }
    const nodeElement = nodeElementsRef.current.get(nodeId);
    if (!nodeElement) return;

    const nodeRect = nodeElement.getBoundingClientRect();
    // Store logical offset (relative to node's top-left, scaled)
    const logicalDragOffsetX = (event.clientX - nodeRect.left) / scale;
    const logicalDragOffsetY = (event.clientY - nodeRect.top) / scale;

    const payload = { nodeId, logicalDragOffsetX, logicalDragOffsetY };
    event.dataTransfer.setData('application/json', JSON.stringify(payload));
    event.dataTransfer.effectAllowed = "move";
    dragDataRef.current = payload;
  }, [activeTool, scale]);

  const handleDragOverCanvas = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const handleDropOnCanvas = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!viewportContainerRef.current || !mindmap || activeTool === 'pan' || !dragDataRef.current) return;

    const { nodeId, logicalDragOffsetX, logicalDragOffsetY } = dragDataRef.current;
    if (!nodeId) return;

    const viewportRect = viewportContainerRef.current.getBoundingClientRect();

    // Calculate new logical top-left for the node
    let newX_logical = (event.clientX - viewportRect.left - pan.x) / scale - logicalDragOffsetX;
    let newY_logical = (event.clientY - viewportRect.top - pan.y) / scale - logicalDragOffsetY;

    // Clamp node position within logical canvas boundaries
    const nodeToDrag = mindmap.data.nodes[nodeId];
    if (!nodeToDrag) return;
    const approxNodeHeight = getApproxNodeHeight(nodeToDrag);
    
    newX_logical = Math.max(0, Math.min(newX_logical, canvasNumericWidth - NODE_CARD_WIDTH));
    newY_logical = Math.max(0, Math.min(newY_logical, canvasNumericHeight - approxNodeHeight));

    beforeMutation();
    updateNodePosition(mindmap.id, nodeId, newX_logical, newY_logical);
    setWireRecalcTrigger(prev => prev + 1); // Force wire redraw
    dragDataRef.current = null;
  }, [mindmap, updateNodePosition, pan, scale, activeTool, beforeMutation, NODE_CARD_WIDTH, canvasNumericWidth, canvasNumericHeight, getApproxNodeHeight]);


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


  useEffect(() => {
    if (!viewportContainerRef.current || !canvasContentRef.current || !mindmap) {
      setWireDrawData([]); // Clear wires if no canvas or mindmap
      return;
    }

    const frameId = requestAnimationFrame(() => {
      if (!viewportContainerRef.current || !canvasContentRef.current || !mindmap) return; // Double check

      const round = (num: number) => Math.round(num); // Round to nearest integer for path data
      const newWiresArray: WireDrawData[] = [];
      const viewportRect = viewportContainerRef.current.getBoundingClientRect();

      Object.values(mindmap.data.nodes).forEach(node => {
        if (!node.parentId || !mindmap.data.nodes[node.parentId!]) return;

        const parentNode = mindmap.data.nodes[node.parentId!];
        const parentEl = nodeElementsRef.current.get(node.parentId!);
        const childEl = nodeElementsRef.current.get(node.id);

        if (parentNode && parentEl instanceof HTMLDivElement && childEl instanceof HTMLDivElement) {
          const parentRect = parentEl.getBoundingClientRect();
          const childRect = childEl.getBoundingClientRect();

          // Anchors relative to screen
          const parentAnchorX_screen = parentRect.left + parentRect.width / 2;
          const parentAnchorY_screen = parentRect.top + parentRect.height; // Bottom-center of parent
          const childAnchorX_screen = childRect.left + childRect.width / 2;
          const childAnchorY_screen = childRect.top; // Top-center of child

          // Convert screen anchors to logical canvas coordinates (where SVG is drawn)
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
          
          // Wire coloring logic from v0.0.5 (no custom node color)
          let strokeColor = parentNode.parentId === null ? "hsl(var(--primary))" : "hsl(var(--accent))";
          
          newWiresArray.push({ key: `${parentNode.id}-${node.id}`, d, stroke: strokeColor });
        }
      });
      
      // Only update state if the actual wire data has changed to prevent infinite loops
      setWireDrawData(prevWireData => {
        if (JSON.stringify(prevWireData) === JSON.stringify(newWiresArray)) {
          return prevWireData;
        }
        return newWiresArray;
      });
    });

    return () => cancelAnimationFrame(frameId);
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

  const canUndo = undoStack.length > 0;
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

        {/* Centering wrapper for the fixed viewport */}
        <div className="flex-grow flex items-center justify-center p-0 bg-background">
          <div
            ref={viewportContainerRef}
            className="canvas-touch-area bg-card shadow-2xl relative" // Added canvas-touch-area for explicit touch event handling
            style={{
              width: `${FIXED_VIEWPORT_WIDTH}px`,
              height: `${FIXED_VIEWPORT_HEIGHT}px`,
              overflow: 'hidden',
              userSelect: 'none', // Prevent text selection during drag/pan
            }}
            onMouseDown={handlePanMouseDown}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
            onDragOver={handleDragOverCanvas} // Needed for node drop
            onDrop={handleDropOnCanvas}       // Needed for node drop
          >
            <div
              ref={canvasContentRef}
              className="absolute top-0 left-0 bg-card border-2 border-dashed border-sky-300" // Dotted line for logical canvas
              style={{
                width: CANVAS_CONTENT_WIDTH_STR, // e.g., '2000px'
                height: CANVAS_CONTENT_HEIGHT_STR, // e.g., '2000px'
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                transformOrigin: '0 0',
                pointerEvents: 'auto', // Ensure this container allows pointer events for its children (nodes)
              }}
            >
              <svg
                className="absolute top-0 left-0 pointer-events-none" // SVG itself should not catch pointer events
                style={{ width: '100%', height: '100%', overflow: 'visible' }} // Overflow visible for lines outside bounds
              >
                {wireDrawData.map(wire => (
                  <path
                    key={wire.key}
                    d={wire.d}
                    stroke={wire.stroke}
                    strokeWidth={Math.max(1, 2 / scale)} // Line thickness adjusts with zoom
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
                  className="node-card-draggable" // Class to identify nodes for pan/drag logic
                  domRefCallback={(element) => setNodeElementRef(nodeData.id, element)}
                />
              ))}

              {allNodes.length === 0 && (
                 <div
                  className="absolute inset-0 flex items-center justify-center pointer-events-none text-center"
                  style={{
                    // Center message within the logical canvas, scaled appropriately
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

    