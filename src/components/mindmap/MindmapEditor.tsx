
"use client";

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { Mindmap, NodeData, EditNodeInput, PaletteColorKey } from '@/types/mindmap';
import { useMindmaps } from '@/hooks/useMindmaps';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NodeCard } from './NodeCard';
import { EditNodeDialog } from './EditNodeDialog';
import { PlusCircle, Download, ArrowLeft, Home, Layers, Hand, ZoomIn, ZoomOut, LocateFixed } from 'lucide-react';
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
const NODE_HEADER_HEIGHT = 50; 
const APPROX_NODE_MIN_HEIGHT = 70; // Header + some padding if no description
const APPROX_NODE_DESC_HEIGHT = 100; // Approx height with description

const CANVAS_CONTENT_WIDTH_STR = '1200px';
const CANVAS_CONTENT_HEIGHT_STR = '1200px';

const MIN_SCALE = 0.2;
const MAX_SCALE = 3.0;
const ZOOM_SENSITIVITY = 1.1;


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

  const viewportContainerRef = useRef<HTMLDivElement>(null);
  const canvasContentRef = useRef<HTMLDivElement>(null);
  
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [scale, setScale] = useState<number>(1);
  const [activeTool, setActiveTool] = useState<'select' | 'pan'>('select');
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ mouseX: number, mouseY: number, initialPanX: number, initialPanY: number } | null>(null);
  const [initialViewCentered, setInitialViewCentered] = useState(false);

  const canvasNumericWidth = useMemo(() => parseInt(CANVAS_CONTENT_WIDTH_STR, 10), []);
  const canvasNumericHeight = useMemo(() => parseInt(CANVAS_CONTENT_HEIGHT_STR, 10), []);


  const handleAddRootNode = useCallback(async () => {
    if (newRootNodeTitle.trim() === '') {
      toast({ title: "Title Required", description: "Please enter a title for the new root node.", variant: "destructive" });
      return;
    }
    if (!mindmap || !viewportContainerRef.current) return;

    const defaultEmoji = '💡';
    const newNodeData: EditNodeInput = {
      title: newRootNodeTitle,
      description: newRootNodeDescription,
      emoji: defaultEmoji,
    };

    const newNode = addNode(mindmap.id, null, newNodeData);
    if (newNode) {
      setNewRootNodeTitle('');
      setNewRootNodeDescription('');
      toast({ title: "Root Node Added", description: `"${newNode.title}" added to the mindmap.` });
      
      // Center view on the new node
      const viewportRect = viewportContainerRef.current.getBoundingClientRect();
      const targetScale = scale; // Keep current scale or reset to 1? Let's try current scale.
      const targetX = viewportRect.width / 2 - (newNode.x + NODE_CARD_WIDTH / 2) * targetScale;
      const targetY = viewportRect.height / 2 - (newNode.y + APPROX_NODE_MIN_HEIGHT / 2) * targetScale;
      
      const newPanX = Math.min(0, Math.max(viewportRect.width - canvasNumericWidth * targetScale, targetX));
      const newPanY = Math.min(0, Math.max(viewportRect.height - canvasNumericHeight * targetScale, targetY));

      setPan({ x: newPanX, y: newPanY });
    }
  }, [newRootNodeTitle, newRootNodeDescription, mindmap, addNode, toast, scale, canvasNumericWidth, canvasNumericHeight]);

  const handleAddChildNode = useCallback((parentId: string) => {
    if (!mindmap) return;
    const parentNode = mindmap.data.nodes[parentId];
    if (!parentNode) return;

    // Calculate initial position relative to parent for the temporary node
    // This might need adjustment based on how useMindmaps places actual children
    const tempNodeX = (parentNode.x ?? 0) + NODE_CARD_WIDTH + 30;
    const tempNodeY = (parentNode.y ?? 0);
    
    const tempNewNode: NodeData = {
      id: `temp-${uuidv4()}`,
      title: '',
      description: "",
      emoji: "➕",
      parentId: parentId,
      childIds: [],
      x: tempNodeX, 
      y: tempNodeY,
    };
    setEditingNode(tempNewNode);
    setIsEditDialogOpen(true);
  }, [mindmap]);

  const handleEditNode = useCallback((node: NodeData) => {
    setEditingNode(node);
    setIsEditDialogOpen(true);
  }, []);

  const handleSaveNode = useCallback((nodeId: string, data: EditNodeInput, colorKey?: PaletteColorKey) => {
    if (!mindmap || !editingNode) return;
    const nodeDetailsWithColor: EditNodeInput = { 
        ...data, 
        customBackgroundColor: colorKey === 'no-custom-color' ? undefined : colorKey 
    };

    if (editingNode.id.startsWith('temp-')) {
      const permanentNode = addNode(mindmap.id, editingNode.parentId, nodeDetailsWithColor);
      if (permanentNode) {
        toast({ title: "Node Created", description: `Node "${permanentNode.title}" added.` });
      }
    } else {
      updateNode(mindmap.id, nodeId, nodeDetailsWithColor);
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
    if (!nodeElement) return;

    const nodeRect = nodeElement.getBoundingClientRect();
    const currentDragOffset = {
      x: (event.clientX - nodeRect.left) / scale, // Logical offset
      y: (event.clientY - nodeRect.top) / scale,  // Logical offset
    };
    event.dataTransfer.setData('application/json', JSON.stringify(currentDragOffset));
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", nodeId); // Still useful as a fallback or ID
  }, [activeTool, scale]);

  const handleDragOverCanvas = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const handleDropOnCanvas = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const nodeId = event.dataTransfer.getData("text/plain");
    if (!nodeId || !mindmap || !viewportContainerRef.current) return;

    let logicalDragOffset = { x: 0, y: 0 };
    try {
      const data = event.dataTransfer.getData('application/json');
      if (data) {
        logicalDragOffset = JSON.parse(data);
      }
    } catch (e) {
      console.error("Could not parse drag offset from dataTransfer:", e);
    }

    const viewportRect = viewportContainerRef.current.getBoundingClientRect();
    
    let newX_logical = (event.clientX - viewportRect.left - pan.x) / scale - logicalDragOffset.x;
    let newY_logical = (event.clientY - viewportRect.top - pan.y) / scale - logicalDragOffset.y;

    // Clamp node position to canvas boundaries
    const nodeToDrag = mindmap.data.nodes[nodeId];
    const nodeHeight = nodeToDrag?.description ? APPROX_NODE_DESC_HEIGHT + NODE_HEADER_HEIGHT : APPROX_NODE_MIN_HEIGHT;

    newX_logical = Math.max(0, Math.min(newX_logical, canvasNumericWidth - NODE_CARD_WIDTH));
    newY_logical = Math.max(0, Math.min(newY_logical, canvasNumericHeight - nodeHeight));
    
    updateNodePosition(mindmap.id, nodeId, newX_logical, newY_logical);
  }, [mindmap, updateNodePosition, pan, scale, canvasNumericWidth, canvasNumericHeight]);

  const handleExportJson = useCallback(() => {
    if (!mindmap) return;
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(mindmap, null, 2))}`;
    const link = document.createElement("a");
    link.href = jsonString;
    link.download = `${mindmap.name.replace(/\s+/g, '_').toLowerCase()}_mindmap.json`;
    link.click();
    toast({ title: "Exported", description: "Mindmap data exported as JSON." });
  }, [mindmap, toast]);


  const handlePanMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (activeTool !== 'pan' || isPanning) return;
    // Prevent panning if clicking on a node or an interactive element within a node
    if ((event.target as HTMLElement).closest('.node-card-draggable') || (event.target as HTMLElement).closest('button, input, textarea, a')) {
      return;
    }
    event.preventDefault();
    setIsPanning(true);
    panStartRef.current = {
      mouseX: event.clientX,
      mouseY: event.clientY,
      initialPanX: pan.x,
      initialPanY: pan.y,
    };
  }, [activeTool, isPanning, pan.x, pan.y]);

  const handlePanMouseMove = useCallback((event: MouseEvent) => {
    if (!isPanning || !panStartRef.current || !viewportContainerRef.current) return;
    event.preventDefault();
    const dx = event.clientX - panStartRef.current.mouseX;
    const dy = event.clientY - panStartRef.current.mouseY;
    
    let newPanX = panStartRef.current.initialPanX + dx;
    let newPanY = panStartRef.current.initialPanY + dy;

    // Clamp panning
    const viewportRect = viewportContainerRef.current.getBoundingClientRect();
    const scaledCanvasWidth = canvasNumericWidth * scale;
    const scaledCanvasHeight = canvasNumericHeight * scale;

    if (scaledCanvasWidth > viewportRect.width) {
      newPanX = Math.min(0, Math.max(newPanX, viewportRect.width - scaledCanvasWidth));
    } else {
      newPanX = Math.max(0, Math.min(newPanX, viewportRect.width - scaledCanvasWidth));
    }

    if (scaledCanvasHeight > viewportRect.height) {
      newPanY = Math.min(0, Math.max(newPanY, viewportRect.height - scaledCanvasHeight));
    } else {
      newPanY = Math.max(0, Math.min(newPanY, viewportRect.height - scaledCanvasHeight));
    }
    
    setPan({ x: newPanX, y: newPanY });
  }, [isPanning, scale, canvasNumericWidth, canvasNumericHeight]);

  const handlePanMouseUpOrLeave = useCallback(() => {
    if (isPanning) {
      setIsPanning(false);
      panStartRef.current = null;
    }
  }, [isPanning]);

  const handleZoom = useCallback((zoomIn: boolean) => {
    if (!viewportContainerRef.current) return;
    const viewportRect = viewportContainerRef.current.getBoundingClientRect();
    const viewportCenterX = viewportRect.width / 2;
    const viewportCenterY = viewportRect.height / 2;

    const newScaleFactor = zoomIn ? ZOOM_SENSITIVITY : 1 / ZOOM_SENSITIVITY;
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * newScaleFactor));

    // Point on canvas that was under the viewport center
    const logicalPointX = (viewportCenterX - pan.x) / scale;
    const logicalPointY = (viewportCenterY - pan.y) / scale;

    // New pan to keep this logical point under the viewport center
    let newPanX = viewportCenterX - logicalPointX * newScale;
    let newPanY = viewportCenterY - logicalPointY * newScale;
    
    // Clamp pan after zoom
    const scaledCanvasWidth = canvasNumericWidth * newScale;
    const scaledCanvasHeight = canvasNumericHeight * newScale;

    if (scaledCanvasWidth > viewportRect.width) {
        newPanX = Math.min(0, Math.max(newPanX, viewportRect.width - scaledCanvasWidth));
    } else {
        newPanX = Math.max(0, Math.min(newPanX, viewportRect.width - scaledCanvasWidth));
    }

    if (scaledCanvasHeight > viewportRect.height) {
        newPanY = Math.min(0, Math.max(newPanY, viewportRect.height - scaledCanvasHeight));
    } else {
        newPanY = Math.max(0, Math.min(newPanY, viewportRect.height - scaledCanvasHeight));
    }

    setScale(newScale);
    setPan({ x: newPanX, y: newPanY });
  }, [scale, pan, canvasNumericWidth, canvasNumericHeight]);

  const handleRecenterView = useCallback(() => {
    if (!mindmap || !viewportContainerRef.current) return;
    const allNodesArray = Object.values(mindmap.data.nodes);
    const viewportRect = viewportContainerRef.current.getBoundingClientRect();

    if (allNodesArray.length === 0) {
      setScale(1);
      const initialPanX = (viewportRect.width - canvasNumericWidth) / 2;
      const initialPanY = (viewportRect.height - canvasNumericHeight) / 2;
      setPan({ 
        x: Math.max(0, Math.min(initialPanX, viewportRect.width - canvasNumericWidth)), 
        y: Math.max(0, Math.min(initialPanY, viewportRect.height - canvasNumericHeight))
      });
      return;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    allNodesArray.forEach(node => {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + NODE_CARD_WIDTH); 
      const nodeHeight = node.description ? APPROX_NODE_DESC_HEIGHT + NODE_HEADER_HEIGHT : APPROX_NODE_MIN_HEIGHT;
      maxY = Math.max(maxY, node.y + nodeHeight);
    });

    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;

    if (contentWidth === 0 || contentHeight === 0) { // Single node or all nodes at same point
      const targetScale = 1;
      setScale(targetScale);
      const contentCenterX = minX + NODE_CARD_WIDTH / 2;
      const contentCenterY = minY + (allNodesArray[0].description ? APPROX_NODE_DESC_HEIGHT + NODE_HEADER_HEIGHT : APPROX_NODE_MIN_HEIGHT) / 2;
      
      let newPanX = viewportRect.width / 2 - contentCenterX * targetScale;
      let newPanY = viewportRect.height / 2 - contentCenterY * targetScale;

      // Clamp pan
      const scaledCanvasWidth = canvasNumericWidth * targetScale;
      const scaledCanvasHeight = canvasNumericHeight * targetScale;
      if (scaledCanvasWidth > viewportRect.width) {
        newPanX = Math.min(0, Math.max(newPanX, viewportRect.width - scaledCanvasWidth));
      } else {
        newPanX = Math.max(0, Math.min(newPanX, viewportRect.width - scaledCanvasWidth));
      }
      if (scaledCanvasHeight > viewportRect.height) {
        newPanY = Math.min(0, Math.max(newPanY, viewportRect.height - scaledCanvasHeight));
      } else {
        newPanY = Math.max(0, Math.min(newPanY, viewportRect.height - scaledCanvasHeight));
      }
      setPan({ x: newPanX, y: newPanY });
      return;
    }
    
    const padding = 50; 
    const scaleX = (viewportRect.width - 2 * padding) / contentWidth;
    const scaleY = (viewportRect.height - 2 * padding) / contentHeight;
    let newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.min(scaleX, scaleY, 1))); // Cap at 1 to avoid over-zooming single/few items
    
    const contentCenterX = minX + contentWidth / 2;
    const contentCenterY = minY + contentHeight / 2;

    let newPanX = viewportRect.width / 2 - contentCenterX * newScale;
    let newPanY = viewportRect.height / 2 - contentCenterY * newScale;
    
    // Clamp pan after recenter
    const scaledCanvasWidth = canvasNumericWidth * newScale;
    const scaledCanvasHeight = canvasNumericHeight * newScale;

    if (scaledCanvasWidth > viewportRect.width) {
        newPanX = Math.min(0, Math.max(newPanX, viewportRect.width - scaledCanvasWidth));
    } else {
        newPanX = Math.max(0, Math.min(newPanX, viewportRect.width - scaledCanvasWidth));
    }

    if (scaledCanvasHeight > viewportRect.height) {
        newPanY = Math.min(0, Math.max(newPanY, viewportRect.height - scaledCanvasHeight));
    } else {
        newPanY = Math.max(0, Math.min(newPanY, viewportRect.height - scaledCanvasHeight));
    }
    
    setScale(newScale);
    setPan({ x: newPanX, y: newPanY });
  }, [mindmap, canvasNumericWidth, canvasNumericHeight]);


  useEffect(() => {
    if (isPanning) {
      window.addEventListener('mousemove', handlePanMouseMove);
      window.addEventListener('mouseup', handlePanMouseUpOrLeave);
      window.addEventListener('mouseleave', handlePanMouseUpOrLeave);
    } else {
      window.removeEventListener('mousemove', handlePanMouseMove);
      window.removeEventListener('mouseup', handlePanMouseUpOrLeave);
      window.removeEventListener('mouseleave', handlePanMouseUpOrLeave);
    }
    return () => {
      window.removeEventListener('mousemove', handlePanMouseMove);
      window.removeEventListener('mouseup', handlePanMouseUpOrLeave);
      window.removeEventListener('mouseleave', handlePanMouseUpOrLeave);
    };
  }, [isPanning, handlePanMouseMove, handlePanMouseUpOrLeave]);

  useEffect(() => {
    if (viewportContainerRef.current) {
      viewportContainerRef.current.style.cursor = activeTool === 'pan' ? (isPanning ? 'grabbing' : 'grab') : 'default';
    }
  }, [activeTool, isPanning]);

  // Initial centering effect
  useEffect(() => {
    if (mindmap && !initialViewCentered && viewportContainerRef.current) {
      handleRecenterView();
      setInitialViewCentered(true);
    }
  }, [mindmap, initialViewCentered, handleRecenterView]);
  
  // Reset initialViewCentered when mindmapId changes so recentering happens for new maps
  useEffect(() => {
    setInitialViewCentered(false);
    // Optionally, reset zoom/pan to a default when map changes
    // setScale(1); 
    // setPan({x: 0, y: 0}); // This might be jarring; handleRecenterView on new mindmapId is better
  }, [mindmapId]);


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
  const svgKey = allNodes.map(n => `${n.id}-${n.x}-${n.y}-${(n.childIds || []).join(',')}-${scale}-${pan.x}-${pan.y}`).join('|');

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full flex-grow w-full">
        {/* Top Control Bar */}
        <div className="p-2 border-b bg-background/90 backdrop-blur-sm space-y-2 flex-shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="flex items-center gap-2 flex-shrink-0 min-w-0">
              <Tooltip>
                <TooltipTrigger asChild>
                   <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                    <Link href="/">
                        <Home className="h-4 w-4" />
                        <span className="sr-only">Back to Library</span>
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
                    variant={activeTool === 'pan' ? "secondary" : "ghost"}
                    size="icon"
                    onClick={() => setActiveTool(activeTool === 'pan' ? 'select' : 'pan')}
                    className="h-8 w-8"
                    aria-label="Toggle Pan Tool"
                  >
                    <Hand className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Pan Canvas (P)</p></TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={() => handleZoom(true)} className="h-8 w-8">
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Zoom In</p></TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={() => handleZoom(false)} className="h-8 w-8">
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
                <TooltipContent><p>Recenter View / Fit All</p></TooltipContent>
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
          ref={viewportContainerRef}
          className="flex-grow relative bg-muted/20 overflow-hidden" // Key: overflow-hidden for fixed canvas
          onDragOver={handleDragOverCanvas}
          onDrop={handleDropOnCanvas}
          onMouseDown={handlePanMouseDown}
        >
          {/* Canvas Content - This is what gets transformed */}
          <div
            ref={canvasContentRef}
            className="relative" // Removed border-2 border-dashed border-destructive
            style={{
              width: CANVAS_CONTENT_WIDTH_STR,
              height: CANVAS_CONTENT_HEIGHT_STR,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
              transformOrigin: '0 0',
            }}
          >
            {allNodes.map((node) => (
              <NodeCard
                key={node.id}
                node={node}
                isRoot={!node.parentId}
                onEdit={handleEditNode}
                onDelete={requestDeleteNode}
                onAddChild={handleAddChildNode}
                onDragStart={(e, id) => handleNodeDragStart(e, id)}
                className="node-card-draggable" // Added for pan conflict check
              />
            ))}

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

                const startX = (parentNode.x ?? 0) + NODE_CARD_WIDTH / 2;
                let startY = (parentNode.y ?? 0) + NODE_HEADER_HEIGHT;

                const endX = (node.x ?? 0) + NODE_CARD_WIDTH / 2;
                const endY = (node.y ?? 0);

                const c1x = startX;
                const c1y = startY + Math.max(20, Math.abs(endY - startY) / 2.5);
                const c2x = endX;
                const c2y = endY - Math.max(20, Math.abs(endY - startY) / 2.5);

                const pathData = `M ${startX} ${startY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${endX} ${endY}`;
                
                let strokeColor = "hsl(var(--border))"; // Default stroke
                if (parentNode.customBackgroundColor) {
                  strokeColor = `hsl(var(--${parentNode.customBackgroundColor}-raw, var(--${parentNode.customBackgroundColor})))`;
                } else {
                  strokeColor = !parentNode.parentId ? "hsl(var(--primary))" : "hsl(var(--accent))";
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

            {allNodes.length === 0 && (
               <div
                className="absolute flex items-center justify-center pointer-events-none text-center"
                style={{
                  top: '50%',
                  left: '50%',
                  // Ensure this message is centered relative to the viewport, not the scaled/panned canvas.
                  // So, we counteract the pan and scale for this specific element.
                  transform: `translate(calc(-50% - ${pan.x / scale}px), calc(-50% - ${pan.y / scale}px)) scale(${1/scale})`,
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

        {/* Edit Node Dialog */}
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

        {/* Delete Confirmation Dialog */}
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
