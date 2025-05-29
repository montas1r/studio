
"use client";

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { Mindmap, NodeData, EditNodeInput, PaletteColorKey, MindmapData } from '@/types/mindmap';
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

const NODE_CARD_WIDTH = 300;
const LOGICAL_CANVAS_WIDTH_STR = '2000px';
const LOGICAL_CANVAS_HEIGHT_STR = '2000px';
const INITIAL_ROOT_Y_OFFSET = 100; // For first root node in a new mindmap

interface MindmapEditorProps {
  mindmapId: string;
}

// Helper for deep cloning
const deepClone = <T,>(obj: T): T => {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  // Handle Date (though not directly in MindmapData, good practice)
  if (obj instanceof Date) {
    return new Date(obj.getTime()) as any;
  }
  // Handle Array
  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item)) as any;
  }
  // Handle Object
  const clonedObj = {} as T;
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      clonedObj[key] = deepClone(obj[key]);
    }
  }
  return clonedObj;
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
  const [initialViewCentered, setInitialViewCentered] = useState(false);
  
  const dragDataRef = useRef<{ nodeId: string; logicalDragOffsetX: number; logicalDragOffsetY: number } | null>(null);

  const viewportContainerRef = useRef<HTMLDivElement>(null); 
  const canvasContentRef = useRef<HTMLDivElement>(null); 

  const canvasNumericWidth = useMemo(() => parseInt(LOGICAL_CANVAS_WIDTH_STR, 10), []);
  const canvasNumericHeight = useMemo(() => parseInt(LOGICAL_CANVAS_HEIGHT_STR, 10), []);

  // Undo/Redo State
  const [undoStack, setUndoStack] = useState<MindmapData[]>([]);
  const [redoStack, setRedoStack] = useState<MindmapData[]>([]);

  // Effect to initialize undo stack with the loaded mindmap data
  useEffect(() => {
    if (mindmap?.data && undoStack.length === 0) {
      setUndoStack([deepClone(mindmap.data)]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mindmap?.data]); // Only run when mindmap.data is first loaded


  const recordHistory = useCallback(() => {
    if (mindmap?.data) {
      setUndoStack(prev => [...prev, deepClone(mindmap.data)]);
      setRedoStack([]); // Clear redo stack on new action
    }
  }, [mindmap?.data]);
  
  // Wrapped action: Call this before any mutation from useMindmaps
  const beforeMutation = useCallback(() => {
    if (mindmap?.data) {
      setUndoStack(prev => {
        const newStack = [...prev, deepClone(mindmap.data)];
        // Optional: Limit history size
        // if (newStack.length > MAX_HISTORY_SIZE) return newStack.slice(1);
        return newStack;
      });
      setRedoStack([]);
    }
  }, [mindmap?.data]);


  const handleUndo = useCallback(() => {
    if (!mindmap || undoStack.length <= 1) return; // Keep at least the initial state or current if only one

    const currentActualData = deepClone(mindmap.data); // Current state from useMindmaps
    
    setUndoStack(prevStack => {
        if (prevStack.length <= 1) return prevStack; // Should not happen if button is disabled

        const newUndoStack = prevStack.slice(0, -1);
        const previousData = newUndoStack[newUndoStack.length -1];
        
        if (previousData) {
             setRedoStack(prevRedo => [currentActualData, ...prevRedo]);
             updateMindmap(mindmap.id, { data: deepClone(previousData) }); // Revert to this state
        }
        return newUndoStack;
    });

  }, [mindmap, undoStack, updateMindmap]);


  const handleRedo = useCallback(() => {
    if (!mindmap || redoStack.length === 0) return;

    const currentActualData = deepClone(mindmap.data);
    const nextData = deepClone(redoStack[0]);

    setUndoStack(prevUndo => [...prevUndo, currentActualData]);
    setRedoStack(prevRedo => prevRedo.slice(1));
    updateMindmap(mindmap.id, { data: nextData });

  }, [mindmap, redoStack, updateMindmap]);


  // Keyboard shortcuts for Undo/Redo
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const ctrlKey = isMac ? event.metaKey : event.ctrlKey;

      if (ctrlKey && event.key === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if (ctrlKey && event.key === 'y' && !isMac) { // Ctrl+Y for redo on Windows/Linux
        event.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleUndo, handleRedo]);


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
    
    const newScale = Math.min(2.0, Math.max(0.25, newScaleAttempt)); 
    const viewportRect = viewportContainerRef.current.getBoundingClientRect();

    const targetX = focalX_viewport !== undefined ? focalX_viewport : viewportRect.width / 2;
    const targetY = focalY_viewport !== undefined ? focalY_viewport : viewportRect.height / 2;

    const newPanX = targetX - (targetX - pan.x) * (newScale / scale);
    const newPanY = targetY - (targetY - pan.y) * (newScale / scale);
    
    const clamped = clampPan(newPanX, newPanY, newScale);

    setScale(newScale);
    setPan(clamped);
  }, [scale, pan, clampPan]);
  

  const handleButtonZoomIn = useCallback(() => adjustZoom(scale * 1.2), [adjustZoom, scale]);
  const handleButtonZoomOut = useCallback(() => adjustZoom(scale / 1.2), [adjustZoom, scale]);
  
  const handleRecenterView = useCallback(() => {
    if (!viewportContainerRef.current || !mindmap) return;
    const allNodesArray = Object.values(mindmap.data.nodes);
    const viewportRect = viewportContainerRef.current.getBoundingClientRect();

    if (allNodesArray.length === 0) {
        const targetScale = 1;
        const newPanX = (viewportRect.width - (canvasNumericWidth * targetScale) / 2) + (canvasNumericWidth*targetScale/2) - (canvasNumericWidth/2 * targetScale);
        const newPanY = (viewportRect.height - (canvasNumericHeight * targetScale) / 2) + (canvasNumericHeight*targetScale/2) - (INITIAL_ROOT_Y_OFFSET + 50) * targetScale;
        
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
    const padding = 50; 

    let newScaleUnclamped;
    if (contentWidth <=0 || contentHeight <= 0) { 
        newScaleUnclamped = 1;
    } else {
        const scaleX = (viewportRect.width - 2 * padding) / contentWidth;
        const scaleY = (viewportRect.height - 2 * padding) / contentHeight;
        newScaleUnclamped = Math.min(scaleX, scaleY);
    }
    
    const newScale = Math.min(2.0, Math.max(0.25, newScaleUnclamped));
    const contentCenterX = minX + contentWidth / 2;
    const contentCenterY = minY + contentHeight / 2;

    const newPanX = viewportRect.width / 2 - contentCenterX * newScale;
    const newPanY = viewportRect.height / 2 - contentCenterY * newScale;
    const clamped = clampPan(newPanX, newPanY, newScale);

    setScale(newScale);
    setPan(clamped);

  }, [mindmap, getApproxNodeHeight, clampPan, canvasNumericWidth, canvasNumericHeight]);


  const handlePanMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (activeTool !== 'pan' || !viewportContainerRef.current) return;
    if ((event.target as HTMLElement).closest('.node-card-draggable') || (event.target as HTMLElement).closest('button')) {
      return; 
    }
    event.preventDefault();
    setIsPanning(true);
    panStartRef.current = { 
        mouseX: event.clientX, 
        mouseY: event.clientY, 
        initialPanX: pan.x, 
        initialPanY: pan.y 
    };
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
    }
    panStartRef.current = null;
  }, [isPanning]);
  
  const touchStartRef = useRef<{
    dist: number;
    centerX_viewport: number;
    centerY_viewport: number;
    initialPanX: number;
    initialPanY: number;
    isPinching: boolean;
    lastTouch1X?: number;
    lastTouch1Y?: number;
  } | null>(null);

  const handleTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (!viewportContainerRef.current) return;
    const touches = event.touches;
    const viewportRect = viewportContainerRef.current.getBoundingClientRect();

    if (touches.length === 1 && activeTool === 'pan') {
      if ((event.target as HTMLElement).closest('.node-card-draggable') || (event.target as HTMLElement).closest('button')) return;
      setIsPanning(true);
      touchStartRef.current = { 
        dist: 0, centerX_viewport: 0, centerY_viewport: 0, isPinching: false,
        initialPanX: pan.x, initialPanY: pan.y,
        lastTouch1X: touches[0].clientX,
        lastTouch1Y: touches[0].clientY,
      };
    } else if (touches.length === 2) {
      event.preventDefault(); // Prevent default pinch actions like page zoom
      setIsPanning(false); // Stop normal panning if it was active
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const centerX = (touches[0].clientX + touches[1].clientX) / 2;
      const centerY = (touches[0].clientY + touches[1].clientY) / 2;
      
      touchStartRef.current = { 
        dist, 
        centerX_viewport: centerX - viewportRect.left, 
        centerY_viewport: centerY - viewportRect.top, 
        initialPanX: pan.x, initialPanY: pan.y, 
        isPinching: true 
      };
    }
  }, [activeTool, pan]);

  const handleTouchMove = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (!touchStartRef.current || !viewportContainerRef.current) return;
    const touches = event.touches;
    
    if (touches.length === 1 && isPanning && touchStartRef.current && !touchStartRef.current.isPinching && touchStartRef.current.lastTouch1X !== undefined && touchStartRef.current.lastTouch1Y !== undefined) {
        const dx = touches[0].clientX - touchStartRef.current.lastTouch1X;
        const dy = touches[0].clientY - touchStartRef.current.lastTouch1Y;
        const newPanX = touchStartRef.current.initialPanX + dx; // Use stored initialPan for this gesture
        const newPanY = touchStartRef.current.initialPanY + dy;
        const clamped = clampPan(newPanX, newPanY, scale);
        setPan(clamped); 
    } else if (touches.length === 2 && touchStartRef.current.isPinching) {
      event.preventDefault();
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      const newDist = Math.sqrt(dx * dx + dy * dy);
      
      const newScaleAttempt = scale * (newDist / touchStartRef.current.dist);
      adjustZoom(newScaleAttempt, touchStartRef.current.centerX_viewport, touchStartRef.current.centerY_viewport);
      
      touchStartRef.current.dist = newDist; 
    }
  }, [isPanning, scale, clampPan, adjustZoom]);

  const handleTouchEnd = useCallback(() => {
    if (isPanning) {
      setIsPanning(false);
    }
    touchStartRef.current = null;
  }, [isPanning]);
  
  useEffect(() => {
    const vpCurrent = viewportContainerRef.current;
    if (isPanning && activeTool === 'pan') {
      window.addEventListener('mousemove', handlePanMouseMove);
      window.addEventListener('mouseup', handlePanMouseUpOrLeave);
      window.addEventListener('mouseleave', handlePanMouseUpOrLeave);
      if (vpCurrent) vpCurrent.style.cursor = 'grabbing';

      return () => {
        window.removeEventListener('mousemove', handlePanMouseMove);
        window.removeEventListener('mouseup', handlePanMouseUpOrLeave);
        window.removeEventListener('mouseleave', handlePanMouseUpOrLeave);
        if (vpCurrent) vpCurrent.style.cursor = activeTool === 'pan' ? 'grab' : 'default';
      };
    } else if (vpCurrent) {
        vpCurrent.style.cursor = activeTool === 'pan' ? 'grab' : 'default';
    }
  }, [isPanning, handlePanMouseMove, handlePanMouseUpOrLeave, activeTool]);


  useEffect(() => {
    if (mindmap && !initialViewCentered) {
      handleRecenterView();
      setInitialViewCentered(true);
    }
  }, [mindmap, initialViewCentered, handleRecenterView]);


  const handleAddRootNode = useCallback(async () => {
    if (newRootNodeTitle.trim() === '') {
      toast({ title: "Title Required", description: "Please enter a title for the new root node.", variant: "destructive" });
      return;
    }
    if (!mindmap || !viewportContainerRef.current) return;
    
    beforeMutation(); // Record history before mutation

    const defaultEmoji = '💡';
    const newNodeDetails: EditNodeInput = {
      title: newRootNodeTitle,
      description: newRootNodeDescription,
      emoji: defaultEmoji,
      // customBackgroundColor: undefined, // No custom color by default for root
    };
    
    const newRootNode = addNode(mindmap.id, null, newNodeDetails); // useMindmaps now handles initial placement logic
    if (newRootNode) {
      setNewRootNodeTitle('');
      setNewRootNodeDescription('');
      toast({ title: "Root Node Added", description: `"${newRootNode.title}" added.` });
      
      // Pan to the new node
      const viewportRect = viewportContainerRef.current.getBoundingClientRect();
      const nodeCenterX = newRootNode.x + NODE_CARD_WIDTH / 2;
      const nodeCenterY = newRootNode.y + getApproxNodeHeight(newRootNode) / 2;
      const newPanX = viewportRect.width / 2 - nodeCenterX * scale;
      const newPanY = viewportRect.height / 2 - nodeCenterY * scale;
      const clampedPan = clampPan(newPanX, newPanY, scale);
      setPan(clampedPan); 
    }
  }, [newRootNodeTitle, newRootNodeDescription, mindmap, addNode, toast, getApproxNodeHeight, scale, clampPan, beforeMutation]);

  const handleAddChildNode = useCallback((parentId: string) => {
    if (!mindmap) return;
    const parentNode = mindmap.data.nodes[parentId];
    if (!parentNode) return;

    // const parentHeight = getApproxNodeHeight(parentNode);
    // const initialX = (parentNode.x ?? 0); 
    // const initialY = (parentNode.y ?? 0) + parentHeight + 50; 

    const tempNewNode: NodeData = {
      id: `temp-${uuidv4()}`, // Temporary ID for dialog
      title: '',
      description: "",
      emoji: "➕",
      parentId: parentId,
      childIds: [],
      x: 0, // Placeholder, will be calculated by useMindmaps.addNode
      y: 0, // Placeholder
      // customBackgroundColor: parentNode.customBackgroundColor,  // v0.0.4 does not have custom color selection
    };
    setEditingNode(tempNewNode);
    setIsEditDialogOpen(true);
  }, [mindmap/*, getApproxNodeHeight*/]);

  const handleEditNode = useCallback((node: NodeData) => {
    setEditingNode(deepClone(node)); // Edit a copy to avoid mutating state directly before save
    setIsEditDialogOpen(true);
  }, []);

  const handleSaveNode = useCallback((nodeIdFromDialog: string, data: EditNodeInput) => {
    if (!mindmap || !editingNode) return;

    beforeMutation(); // Record history before mutation

    const finalData: EditNodeInput = {
      title: data.title,
      description: data.description,
      emoji: data.emoji,
      // customBackgroundColor: data.customBackgroundColor, // v0.0.4 does not have custom color
    };


    if (editingNode.id.startsWith('temp-')) { // It's a new node
      const permanentNode = addNode(mindmap.id, editingNode.parentId, finalData); 
      if (permanentNode) {
        toast({ title: "Node Created", description: `Node "${permanentNode.title}" added.` });
      }
    } else { // It's an existing node
      updateNode(mindmap.id, editingNode.id, finalData);
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
    
    beforeMutation(); // Record history before mutation
    
    deleteNodeFromHook(mindmap.id, nodeToDelete.id);
    toast({ title: "Node Deleted", description: `Node "${nodeToDelete.title || 'Untitled'}" and its children removed.`, variant: "destructive" });
    setIsDeleteDialogOpen(false);
    setNodeToDelete(null);
  }, [mindmap, nodeToDelete, deleteNodeFromHook, toast, beforeMutation]);

 const handleNodeDragStart = useCallback((event: React.DragEvent<HTMLDivElement>, nodeId: string) => {
    if (activeTool === 'pan') {
      event.preventDefault();
      return;
    }
    const nodeElement = event.currentTarget;
    const nodeRect = nodeElement.getBoundingClientRect();
    
    // Store logical offset (relative to node's top-left, adjusted for current scale)
    const logicalDragOffsetX = (event.clientX - nodeRect.left) / scale;
    const logicalDragOffsetY = (event.clientY - nodeRect.top) / scale;
    
    const dragPayload = {
      nodeId,
      logicalDragOffsetX: logicalDragOffsetX, 
      logicalDragOffsetY: logicalDragOffsetY,
    };
    event.dataTransfer.setData('application/json', JSON.stringify(dragPayload));
    event.dataTransfer.effectAllowed = "move";
    dragDataRef.current = dragPayload; // Also store in ref as fallback
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
      if (!dragPayload) { console.error("No drag data found"); return; }
    } catch (e) { console.error("Could not parse drag data:", e); return; }

    const { nodeId, logicalDragOffsetX, logicalDragOffsetY } = dragPayload;
    if (!nodeId || logicalDragOffsetX === undefined || logicalDragOffsetY === undefined) {
      console.error("Invalid drag data received:", dragPayload); return;
    }
    
    beforeMutation(); // Record history before mutation

    const viewportRect = viewportContainerRef.current.getBoundingClientRect();
    
    // Calculate new logical top-left position of the node
    let newX_logical = (event.clientX - viewportRect.left - pan.x) / scale - logicalDragOffsetX;
    let newY_logical = (event.clientY - viewportRect.top - pan.y) / scale - logicalDragOffsetY;

    // Clamping node position to within the logical canvas bounds
    const nodeToDrag = mindmap.data.nodes[nodeId];
    if (!nodeToDrag) return;
    const approxNodeHeight = getApproxNodeHeight(nodeToDrag);

    newX_logical = Math.max(0, Math.min(newX_logical, canvasNumericWidth - NODE_CARD_WIDTH));
    newY_logical = Math.max(0, Math.min(newY_logical, canvasNumericHeight - approxNodeHeight));


    updateNodePosition(mindmap.id, nodeId, newX_logical, newY_logical);
    dragDataRef.current = null; 
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
        <Button asChild variant="outline" size="sm">
          <Link href="/"><ArrowLeft className="mr-1.5 h-4 w-4" /> Library</Link>
        </Button>
      </div>
    );
  }

  const allNodes = Object.values(mindmap.data.nodes);
  const svgKey = allNodes.map(n => `${n.id}-${n.x}-${n.y}-${n.parentId}-${(n.childIds || []).join(',')}-${scale}-${pan.x}-${pan.y}`).join('|');

  const canUndo = undoStack.length > 1; // More than initial state
  const canRedo = redoStack.length > 0;


  return (
    <TooltipProvider>
      <div className="flex flex-col h-full flex-grow w-full">
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
                    {/* Undo/Redo Buttons */}
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={handleUndo} disabled={!canUndo} className="h-8 w-8">
                                <Undo className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent><p>Undo (Ctrl+Z)</p></TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={handleRedo} disabled={!canRedo} className="h-8 w-8">
                                <Redo className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent><p>Redo (Ctrl+Shift+Z)</p></TooltipContent>
                    </Tooltip>


                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={() => setActiveTool(prev => prev === 'pan' ? 'select' : 'pan')} 
                                    className={cn("h-8 w-8", activeTool === 'pan' && "bg-accent text-accent-foreground hover:bg-accent/90")}>
                                <Hand className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent><p>Pan Tool (P)</p></TooltipContent>
                    </Tooltip>
                     <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={handleButtonZoomIn} className="h-8 w-8">
                                <ZoomIn className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent><p>Zoom In</p></TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                             <Button variant="ghost" size="icon" onClick={handleButtonZoomOut} className="h-8 w-8">
                                <ZoomOut className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent><p>Zoom Out</p></TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={handleRecenterView} className="h-8 w-8">
                                <LocateFixed className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent><p>Recenter View</p></TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" onClick={handleExportJson} className="h-8 w-8">
                            <Download className="h-4 w-4" />
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
        <div className="flex-grow flex items-center justify-center p-0 bg-muted/20 overflow-hidden"> {/* Centering wrapper, no padding */}
          <div
            ref={viewportContainerRef}
            className="relative bg-card shadow-2xl rounded-lg" 
            style={{
              width: `1200px`, // Fixed viewport size
              height: `800px`,  // Fixed viewport size
              overflow: 'hidden', // Crucial for fixed viewport
              // cursor handled by useEffect based on activeTool and isPanning
            }}
            onMouseDown={handlePanMouseDown}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onDragOver={handleDragOverCanvas}
            onDrop={handleDropOnCanvas}
          >
            <div
              ref={canvasContentRef}
              className="bg-transparent border-2 border-dashed border-sky-300" // Logical canvas has the border now
              style={{
                width: LOGICAL_CANVAS_WIDTH_STR, // Large logical canvas
                height: LOGICAL_CANVAS_HEIGHT_STR, // Large logical canvas
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                transformOrigin: '0 0',
                position: 'absolute', 
                top: 0, 
                left: 0,
                pointerEvents: activeTool === 'pan' && isPanning ? 'none' : 'auto', // Allow events unless actively panning background
              }}
            >
              <svg
                className="absolute top-0 left-0 pointer-events-none" // SVG itself doesn't catch mouse events
                style={{
                  width: LOGICAL_CANVAS_WIDTH_STR, 
                  height: LOGICAL_CANVAS_HEIGHT_STR,
                  overflow: 'visible', 
                }}
                key={svgKey} 
              >
                {allNodes.map(node => {
                  if (!node.parentId) return null;
                  const parentNode = mindmap.data.nodes[node.parentId];
                  if (!parentNode) return null;

                  const parentCardCenterX = (parentNode.x ?? 0) + NODE_CARD_WIDTH / 2;
                  const parentCardBottomY = (parentNode.y ?? 0) + getApproxNodeHeight(parentNode) -10; 
                  
                  const childCardCenterX = (node.x ?? 0) + NODE_CARD_WIDTH / 2;
                  const childCardTopY = (node.y ?? 0) + 10; 

                  const c1x = parentCardCenterX;
                  const c1y = parentCardBottomY + Math.max(30, Math.abs(childCardTopY - parentCardBottomY) / 2);
                  const c2x = childCardCenterX;
                  const c2y = childCardTopY - Math.max(30, Math.abs(childCardTopY - parentCardBottomY) / 2);

                  const pathData = `M ${parentCardCenterX} ${parentCardBottomY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${childCardCenterX} ${childCardTopY}`;
                  
                  let strokeColor = "hsl(var(--muted-foreground))"; 
                  if (parentNode.customBackgroundColor) { // v0.0.4 does not have custom colors
                      // strokeColor = `hsl(var(--${parentNode.customBackgroundColor}))`;
                       strokeColor = parentNode.parentId ? "hsl(var(--accent))" : "hsl(var(--primary))"; // Fallback to theme if somehow custom color exists
                  } else if (!parentNode.parentId) { 
                      strokeColor = "hsl(var(--primary))";
                  } else { 
                      strokeColor = "hsl(var(--accent))";
                  }


                  return (
                    <path
                      key={`${parentNode.id}-${node.id}`}
                      d={pathData}
                      stroke={strokeColor}
                      strokeWidth={2 / scale} 
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
                  className="absolute inset-0 flex items-center justify-center pointer-events-none text-center"
                  style={{ 
                    // Center within the logical canvas, adjusted for scale
                    top: `${canvasNumericHeight / 2}px`, 
                    left: `${canvasNumericWidth / 2}px`, 
                    transform: `translate(-50%, -50%) scale(${1 / scale})`, // Counter-scale the message itself
                    transformOrigin: 'center center',
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
    

    