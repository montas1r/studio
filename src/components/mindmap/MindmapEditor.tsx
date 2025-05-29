
"use client";

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { Mindmap, NodeData, EditNodeInput, MindmapData } from '@/types/mindmap';
import { useMindmaps } from '@/hooks/useMindmaps';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NodeCard } from './NodeCard';
import { EditNodeDialog } from './EditNodeDialog';
import { PlusCircle, Download, ArrowLeft, Layers, Hand, ZoomIn, ZoomOut, LocateFixed, Undo, Redo } from 'lucide-react';
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

const NODE_CARD_WIDTH = 300; // From useMindmaps, keep consistent if possible
const CANVAS_CONTENT_WIDTH_STR = '2000px'; // Logical canvas size
const CANVAS_CONTENT_HEIGHT_STR = '2000px'; // Logical canvas size
const FIXED_VIEWPORT_WIDTH = 1200; // Fixed viewport size
const FIXED_VIEWPORT_HEIGHT = 800; // Fixed viewport size

interface MindmapEditorProps {
  mindmapId: string;
}

const deepClone = <T,>(obj: T): T => {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item)) as any;
  }
  if (obj instanceof Date) { // JSON.stringify turns Dates into strings
    return new Date(obj.toISOString()) as any;
  }
  // For generic objects, JSON parse/stringify is a common way for deep clone
  // but it has limitations (e.g., loses functions, undefined, Date objects become strings)
  // For MindmapData, which is serializable, it's generally okay.
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch (e) {
    console.error("Deep clone failed", e, obj);
    // Fallback or error handling if needed
    const clonedObj = {} as T;
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        clonedObj[key] = deepClone(obj[key]);
      }
    }
    return clonedObj;
  }
};


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
  const canvasContentRef = useRef<HTMLDivElement>(null); // The 2000x2000 pannable/zoomable content

  const canvasNumericWidth = useMemo(() => parseInt(CANVAS_CONTENT_WIDTH_STR, 10), []);
  const canvasNumericHeight = useMemo(() => parseInt(CANVAS_CONTENT_HEIGHT_STR, 10), []);

  const [undoStack, setUndoStack] = useState<MindmapData[]>([]);
  const [redoStack, setRedoStack] = useState<MindmapData[]>([]);
  const initialViewCenteredRef = useRef(false);

  useEffect(() => {
    if (mindmap?.data && undoStack.length === 0 && redoStack.length === 0) {
        // Initialize undo stack with the loaded state.
        // The first "undo" should revert to this initial loaded state.
        setUndoStack([deepClone(mindmap.data)]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mindmap?.data]); // Only re-init if mindmap.data itself changes instance

  const beforeMutation = useCallback(() => {
    if (mindmap?.data) {
      setUndoStack(prev => [...prev, deepClone(mindmap.data)]);
      setRedoStack([]); // Any new action clears the redo stack
    }
  }, [mindmap?.data]);

  const handleUndo = useCallback(() => {
    if (!mindmap || undoStack.length <= 1) return; // Need at least one state to revert *from*

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
      // Ignore if typing in an input/textarea
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
      } else if (ctrlKey && event.key.toLowerCase() === 'y' && !isMac) { // Ctrl+Y for redo on Windows/Linux
        event.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  const clampPan = useCallback((newPanX: number, newPanY: number, currentScale: number) => {
    if (!viewportContainerRef.current) return { x: newPanX, y: newPanY };
    const viewportRect = { width: FIXED_VIEWPORT_WIDTH, height: FIXED_VIEWPORT_HEIGHT };
    
    let clampedX = newPanX;
    let clampedY = newPanY;

    const scaledCanvasWidth = canvasNumericWidth * currentScale;
    const scaledCanvasHeight = canvasNumericHeight * currentScale;

    // If scaled canvas is wider than viewport, allow panning such that edges meet viewport edges
    if (scaledCanvasWidth > viewportRect.width) {
      clampedX = Math.min(0, Math.max(newPanX, viewportRect.width - scaledCanvasWidth));
    } else { // If scaled canvas is narrower, allow it to be moved within viewport (can be centered)
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
    const newScale = Math.min(2.0, Math.max(0.25, newScaleAttempt)); // Zoom limits
    
    const viewportRect = { width: FIXED_VIEWPORT_WIDTH, height: FIXED_VIEWPORT_HEIGHT };
    const targetX = focalX_viewport !== undefined ? focalX_viewport : viewportRect.width / 2;
    const targetY = focalY_viewport !== undefined ? focalY_viewport : viewportRect.height / 2;

    const newPanX = targetX - (targetX - pan.x) * (newScale / scale);
    const newPanY = targetY - (targetY - pan.y) * (newScale / scale);
    
    const clamped = clampPan(newPanX, newPanY, newScale);
    setScale(newScale);
    setPan(clamped);
  }, [scale, pan, clampPan]);

  const handleButtonZoomIn = useCallback(() => adjustZoom(scale * 1.1), [adjustZoom, scale]);
  const handleButtonZoomOut = useCallback(() => adjustZoom(scale / 1.1), [adjustZoom, scale]);

  const handleWheelZoom = useCallback((event: WheelEvent) => {
    if (!viewportContainerRef.current) return;
    event.preventDefault();
    const viewportRect = viewportContainerRef.current.getBoundingClientRect();
    const focalX = event.clientX - viewportRect.left;
    const focalY = event.clientY - viewportRect.top;
    const delta = event.deltaY > 0 ? 0.9 : 1.1; // Zoom out for scroll down, in for scroll up
    adjustZoom(scale * delta, focalX, focalY);
  }, [adjustZoom, scale]);

  const handleRecenterView = useCallback(() => {
    if (!viewportContainerRef.current || !mindmap) return;
    const allNodesArray = Object.values(mindmap.data.nodes);
    const viewportRect = { width: FIXED_VIEWPORT_WIDTH, height: FIXED_VIEWPORT_HEIGHT };

    if (allNodesArray.length === 0) {
      const targetScale = 1;
      // Center the 0,0 of the logical canvas in the viewport
      const newPanX = viewportRect.width / 2 - (canvasNumericWidth / 2 * targetScale) + ((canvasNumericWidth/2 - NODE_CARD_WIDTH/2) * targetScale); // Target logical 0,0 for first node
      const newPanY = viewportRect.height / 2 - (canvasNumericHeight / 2 * targetScale) + ((canvasNumericHeight / 2 - 100) * targetScale); // Approx initial Y offset

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

    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    const padding = 50; // Padding around content when fitting

    let newScaleUnclamped;
    if (contentWidth <= 0 || contentHeight <= 0) { // Handle single node case
      newScaleUnclamped = 1; // Default to 1x scale for single or no content
    } else {
      const scaleX = (viewportRect.width - 2 * padding) / contentWidth;
      const scaleY = (viewportRect.height - 2 * padding) / contentHeight;
      newScaleUnclamped = Math.min(scaleX, scaleY, 2.0); // Cap max scale
    }
    
    const newFitScale = Math.max(0.25, newScaleUnclamped); // Ensure min scale
    
    const contentCenterX = minX + contentWidth / 2;
    const contentCenterY = minY + contentHeight / 2;

    const newFitPanX = viewportRect.width / 2 - contentCenterX * newFitScale;
    const newFitPanY = viewportRect.height / 2 - contentCenterY * newFitScale;
    
    const clampedFitPan = clampPan(newFitPanX, newFitPanY, newFitScale);

    setScale(newFitScale);
    setPan(clampedFitPan);
  }, [mindmap, getApproxNodeHeight, clampPan, canvasNumericWidth, canvasNumericHeight]);


  useEffect(() => {
    if (mindmap && !initialViewCenteredRef.current) {
      handleRecenterView();
      initialViewCenteredRef.current = true;
    }
  }, [mindmap, handleRecenterView]);

  const handlePanMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (activeTool !== 'pan' || !viewportContainerRef.current) return;
    // Check if the click target is a node card or something interactive on it
    if ((event.target as HTMLElement).closest('.node-card-draggable') || 
        (event.target as HTMLElement).closest('button') || 
        (event.target as HTMLElement).closest('input') || 
        (event.target as HTMLElement).closest('textarea')) {
      return; // Don't pan if clicking on a node or its controls
    }
    event.preventDefault();
    setIsPanning(true);
    panStartRef.current = { mouseX: event.clientX, mouseY: event.clientY, initialPanX: pan.x, initialPanY: pan.y };
    viewportContainerRef.current.style.cursor = 'grabbing';
  }, [activeTool, pan]);

  const handlePanMouseMove = useCallback((event: MouseEvent) => {
    if (!isPanning || !panStartRef.current || !viewportContainerRef.current) return;
    event.preventDefault();
    const dx = event.clientX - panStartRef.current.mouseX;
    const dy = event.clientY - panStartRef.current.mouseY;
    const newPanX = panStartRef.current.initialPanX + dx;
    const newPanY = panStartRef.current.initialPanY + dy;
    
    const clamped = clampPan(newPanX, newPanY, scale);
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

  // Touch event handling for basic pinch-zoom and one-finger pan (if hand tool active)
  const touchStartRef = useRef<{
    dist: number; // For pinch distance
    centerX_viewport: number; // Pinch center X relative to viewport
    centerY_viewport: number; // Pinch center Y relative to viewport
    initialPanX: number; // For one-finger pan
    initialPanY: number; // For one-finger pan
    lastTouch1X?: number; // For one-finger pan delta
    lastTouch1Y?: number; // For one-finger pan delta
    isPinching: boolean;
    isPanningTouch?: boolean; // For distinguishing one-finger pan from pinch
  } | null>(null);

  const handleTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (!viewportContainerRef.current) return;
    const touches = event.touches;
    const viewportRect = viewportContainerRef.current.getBoundingClientRect();

    if (touches.length === 1 && activeTool === 'pan') {
      if ((event.target as HTMLElement).closest('.node-card-draggable')) return; // Don't pan if touch starts on node
      event.preventDefault(); // Prevent page scroll
      touchStartRef.current = {
        dist: 0, centerX_viewport: 0, centerY_viewport: 0, isPinching: false,
        initialPanX: pan.x, initialPanY: pan.y,
        lastTouch1X: touches[0].clientX, lastTouch1Y: touches[0].clientY,
        isPanningTouch: true
      };
      viewportContainerRef.current.style.cursor = 'grabbing';
    } else if (touches.length === 2) {
      event.preventDefault(); // Prevent page scroll/zoom
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const centerX = (touches[0].clientX + touches[1].clientX) / 2;
      const centerY = (touches[0].clientY + touches[1].clientY) / 2;
      touchStartRef.current = {
        dist,
        centerX_viewport: centerX - viewportRect.left,
        centerY_viewport: centerY - viewportRect.top,
        initialPanX: pan.x, // Not used for pinch pan, but part of structure
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
      const newPanX = pan.x + dx; // Use current pan + delta
      const newPanY = pan.y + dy;
      const clamped = clampPan(newPanX, newPanY, scale);
      setPan(clamped);
      // Update last touch for continuous panning
      touchStartRef.current.lastTouch1X = touches[0].clientX;
      touchStartRef.current.lastTouch1Y = touches[0].clientY;

    } else if (touches.length === 2 && touchStartRef.current.isPinching) {
      event.preventDefault();
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      const newDist = Math.sqrt(dx * dx + dy * dy);
      if (touchStartRef.current.dist > 0) { // Avoid division by zero if initial dist was 0
        const newScaleAttempt = scale * (newDist / touchStartRef.current.dist);
        adjustZoom(newScaleAttempt, touchStartRef.current.centerX_viewport, touchStartRef.current.centerY_viewport);
      }
      touchStartRef.current.dist = newDist; // Update dist for next move
    }
  }, [scale, pan, clampPan, adjustZoom]);

  const handleTouchEnd = useCallback(() => {
    if (touchStartRef.current?.isPanningTouch && viewportContainerRef.current) {
      viewportContainerRef.current.style.cursor = activeTool === 'pan' ? 'grab' : 'default';
    }
    touchStartRef.current = null;
  }, [activeTool]);

  // Effect for mouse wheel zoom listener
  useEffect(() => {
    const vpCurrent = viewportContainerRef.current;
    if (!vpCurrent) return;
    vpCurrent.addEventListener('wheel', handleWheelZoom, { passive: false });
    return () => {
      vpCurrent.removeEventListener('wheel', handleWheelZoom);
    };
  }, [handleWheelZoom]);

  // Effect for global mouse move/up listeners during panning
  useEffect(() => {
    if (isPanning) {
      window.addEventListener('mousemove', handlePanMouseMove);
      window.addEventListener('mouseup', handlePanMouseUpOrLeave);
      window.addEventListener('mouseleave', handlePanMouseUpOrLeave); // Handle mouse leaving window
      return () => {
        window.removeEventListener('mousemove', handlePanMouseMove);
        window.removeEventListener('mouseup', handlePanMouseUpOrLeave);
        window.removeEventListener('mouseleave', handlePanMouseUpOrLeave);
      };
    } else if (viewportContainerRef.current) {
      // Set cursor based on active tool when not actively panning
      viewportContainerRef.current.style.cursor = activeTool === 'pan' ? 'grab' : 'default';
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
      
      // Pan to center the new node
      const viewportRect = { width: FIXED_VIEWPORT_WIDTH, height: FIXED_VIEWPORT_HEIGHT };
      const nodeCenterX = newRootNode.x + NODE_CARD_WIDTH / 2;
      const nodeCenterY = newRootNode.y + getApproxNodeHeight(newRootNode) / 2;
      
      const newPanX = viewportRect.width / 2 - nodeCenterX * scale;
      const newPanY = viewportRect.height / 2 - nodeCenterY * scale;
      setPan(clampPan(newPanX, newPanY, scale));
    }
  }, [newRootNodeTitle, newRootNodeDescription, mindmap, addNode, toast, getApproxNodeHeight, scale, clampPan, beforeMutation]);

  const handleAddChildNode = useCallback((parentId: string) => {
    if (!mindmap) return;
    const parentNode = mindmap.data.nodes[parentId];
    if (!parentNode) return;
    
    const tempNewNode: NodeData = {
      id: `temp-${uuidv4()}`, title: '', description: "", emoji: "➕", parentId: parentId, childIds: [],
      x: 0, y: 0, // Placeholder, will be calculated by useMindmaps.addNode
      // customBackgroundColor: parentNode.customBackgroundColor, // No custom color in v0.0.5
    };
    setEditingNode(tempNewNode);
    setIsEditDialogOpen(true);
  }, [mindmap]);

  const handleEditNode = useCallback((node: NodeData) => {
    setEditingNode(deepClone(node)); // Use deepClone to edit a copy
    setIsEditDialogOpen(true);
  }, []);

  const handleSaveNode = useCallback((nodeIdFromDialog: string, data: EditNodeInput) => {
    if (!mindmap || !editingNode) return;
    beforeMutation();

    if (editingNode.id.startsWith('temp-')) { // Creating a new node
      const permanentNode = addNode(mindmap.id, editingNode.parentId, data);
      if (permanentNode) {
        toast({ title: "Node Created", description: `Node "${permanentNode.title}" added.` });
      }
    } else { // Updating an existing node
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
    beforeMutation();
    deleteNodeFromHook(mindmap.id, nodeToDelete.id);
    toast({ title: "Node Deleted", description: `Node "${nodeToDelete.title || 'Untitled'}" and its children removed.`, variant: "destructive" });
    setIsDeleteDialogOpen(false); setNodeToDelete(null);
  }, [mindmap, nodeToDelete, deleteNodeFromHook, toast, beforeMutation]);

  const handleNodeDragStart = useCallback((event: React.DragEvent<HTMLDivElement>, nodeId: string) => {
    if (activeTool === 'pan') { event.preventDefault(); return; } // Prevent node drag if pan tool is active

    const nodeElement = event.currentTarget;
    const nodeRect = nodeElement.getBoundingClientRect();
    
    // Calculate logical offset (independent of current scale and pan of the canvasContent)
    // The node's on-screen position is already affected by scale/pan of canvasContent.
    // We want the offset within the node itself, scaled to logical units.
    const logicalDragOffsetX = (event.clientX - nodeRect.left) / scale;
    const logicalDragOffsetY = (event.clientY - nodeRect.top) / scale;

    const dragPayload = { nodeId, logicalDragOffsetX, logicalDragOffsetY };
    event.dataTransfer.setData('application/json', JSON.stringify(dragPayload));
    event.dataTransfer.effectAllowed = "move";
    dragDataRef.current = dragPayload; // Store for potential fallback if dataTransfer fails (rare)
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
      dragPayload = jsonData ? JSON.parse(jsonData) : dragDataRef.current; // Use ref as fallback
      if (!dragPayload || dragPayload.logicalDragOffsetX === undefined) { 
        console.error("No valid drag data found on drop"); 
        dragDataRef.current = null; // Clear ref
        return; 
      }
    } catch (e) { 
      console.error("Could not parse drag data on drop:", e); 
      dragDataRef.current = null; // Clear ref
      return; 
    }

    const { nodeId, logicalDragOffsetX, logicalDragOffsetY } = dragPayload;
    if (!nodeId) {
      dragDataRef.current = null;
      return;
    }
    
    beforeMutation();

    const viewportRect = viewportContainerRef.current.getBoundingClientRect();
    
    // Convert screen drop coordinates to logical canvas coordinates
    let newX_logical = (event.clientX - viewportRect.left - pan.x) / scale - logicalDragOffsetX;
    let newY_logical = (event.clientY - viewportRect.top - pan.y) / scale - logicalDragOffsetY;

    // Clamp node position to within the logical canvas bounds
    const nodeToDrag = mindmap.data.nodes[nodeId];
    if (!nodeToDrag) {
       dragDataRef.current = null;
       return;
    }
    const approxNodeHeight = getApproxNodeHeight(nodeToDrag);
    newX_logical = Math.max(0, Math.min(newX_logical, canvasNumericWidth - NODE_CARD_WIDTH));
    newY_logical = Math.max(0, Math.min(newY_logical, canvasNumericHeight - approxNodeHeight));
    
    updateNodePosition(mindmap.id, nodeId, newX_logical, newY_logical);
    dragDataRef.current = null; // Clear ref after successful drop
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
        <Layers className="w-16 h-16 text-destructive" />
        <h2 className="text-2xl font-bold">Mindmap Not Found</h2>
        <p className="text-muted-foreground">The mindmap you are looking for does not exist or has been deleted.</p>
        <Button asChild variant="outline" size="sm"><Link href="/"><ArrowLeft className="mr-1.5 h-4 w-4" /> Library</Link></Button>
      </div>
    );
  }

  const allNodes = Object.values(mindmap.data.nodes);
  const svgKey = allNodes.map(n => `${n.id}-${n.x}-${n.y}-${n.parentId}-${(n.childIds || []).join(',')}-${scale}-${pan.x}-${pan.y}`).join('|');
  
  const canUndo = undoStack.length > 1;
  const canRedo = redoStack.length > 0;

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
              <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={handleUndo} disabled={!canUndo} className="h-8 w-8"><Undo className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Undo (Ctrl+Z)</p></TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={handleRedo} disabled={!canRedo} className="h-8 w-8"><Redo className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Redo (Ctrl+Shift+Z)</p></TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={() => setActiveTool(prev => prev === 'pan' ? 'select' : 'pan')} className={cn("h-8 w-8", activeTool === 'pan' && "bg-accent text-accent-foreground hover:bg-accent/90")}><Hand className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Pan Tool (P)</p></TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={handleButtonZoomIn} className="h-8 w-8"><ZoomIn className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Zoom In</p></TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={handleButtonZoomOut} className="h-8 w-8"><ZoomOut className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Zoom Out</p></TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={handleRecenterView} className="h-8 w-8"><LocateFixed className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Recenter View</p></TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={handleExportJson} className="h-8 w-8"><Download className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Export JSON</p></TooltipContent></Tooltip>
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
            className="relative bg-card shadow-2xl rounded-lg" // Fixed viewport gets bg-card
            style={{ 
              width: `${FIXED_VIEWPORT_WIDTH}px`, 
              height: `${FIXED_VIEWPORT_HEIGHT}px`, 
              overflow: 'hidden', // This is crucial for the "fixed canvas" feel
              userSelect: 'none' // Prevents text selection during pan
            }}
            onMouseDown={handlePanMouseDown} // For Hand Tool pan
            onTouchStart={handleTouchStart}  // For touch pan/zoom
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onDragOver={handleDragOverCanvas} // For dropping nodes
            onDrop={handleDropOnCanvas}
          >
            <div
              ref={canvasContentRef}
              className="relative border-2 border-dashed border-sky-300" // Logical canvas has the border
              style={{
                width: CANVAS_CONTENT_WIDTH_STR, 
                height: CANVAS_CONTENT_HEIGHT_STR,
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                transformOrigin: '0 0', 
                // pointerEvents: isPanning && activeTool === 'pan' ? 'none' : 'auto', // Let events pass if not panning
              }}
            >
              <svg
                className="absolute top-0 left-0 pointer-events-none" // SVG itself doesn't capture mouse events
                style={{ width: CANVAS_CONTENT_WIDTH_STR, height: CANVAS_CONTENT_HEIGHT_STR, overflow: 'visible' }} // Overflow visible for lines
                key={svgKey} // Re-render SVG if key changes
              >
                {allNodes.map(node => {
                  if (!node.parentId) return null;
                  const parentNode = mindmap.data.nodes[node.parentId];
                  if (!parentNode) return null;

                  const parentCardCenterX = (parentNode.x ?? 0) + NODE_CARD_WIDTH / 2;
                  const parentCardBottomY = (parentNode.y ?? 0) + getApproxNodeHeight(parentNode) -10; // -10 to raise start point a bit
                  const childCardCenterX = (node.x ?? 0) + NODE_CARD_WIDTH / 2;
                  const childCardTopY = (node.y ?? 0) + 10; // +10 to lower end point a bit

                  // Bezier curve control points
                  const c1x = parentCardCenterX;
                  const c1y = parentCardBottomY + Math.max(30, Math.abs(childCardTopY - parentCardBottomY) / 2);
                  const c2x = childCardCenterX;
                  const c2y = childCardTopY - Math.max(30, Math.abs(childCardTopY - parentCardBottomY) / 2);
                  
                  const pathData = `M ${parentCardCenterX} ${parentCardBottomY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${childCardCenterX} ${childCardTopY}`;
                  
                  // Determine stroke color (no custom node color in v0.0.5)
                  let strokeColor = isRoot ? "hsl(var(--primary))" : "hsl(var(--accent))";
                   if(parentNode.parentId === null) { // parent is root
                       strokeColor = "hsl(var(--primary))";
                   } else { // parent is child
                       strokeColor = "hsl(var(--accent))";
                   }


                  return (
                    <path 
                        key={`${parentNode.id}-${node.id}`} 
                        d={pathData} 
                        stroke={strokeColor} 
                        strokeWidth={Math.max(1, 2 / scale)} // Ensure stroke width doesn't become too small
                        fill="none" 
                    />
                  );
                })}
              </svg>
              {allNodes.map((node) => (
                <NodeCard
                  key={node.id} node={node} isRoot={!node.parentId}
                  onEdit={handleEditNode} onDelete={requestDeleteNode} onAddChild={handleAddChildNode}
                  onDragStart={(e, id) => handleNodeDragStart(e,id)} // Pass scale to drag start
                  className="node-card-draggable" // For identifying nodes vs canvas background
                />
              ))}
              {allNodes.length === 0 && (
                <div 
                  className="absolute inset-0 flex items-center justify-center pointer-events-none text-center"
                  style={{ 
                    top: `${canvasNumericHeight / 2}px`, 
                    left: `${canvasNumericWidth / 2}px`, 
                    transform: `translate(-50%, -50%) scale(${1/scale})`, // Center message and scale it inversely
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
