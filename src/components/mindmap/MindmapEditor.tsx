
"use client";

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { Mindmap, NodeData, EditNodeInput } from '@/types/mindmap';
import { useMindmaps } from '@/hooks/useMindmaps';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NodeCard } from './NodeCard';
import { EditNodeDialog } from './EditNodeDialog';
import { PlusCircle, Download, ArrowLeft, Home, Layers, Hand, ZoomIn, ZoomOut, LocateFixed, Settings2 } from 'lucide-react';
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
const APPROX_LINE_HEIGHT = 18; 
const MIN_DESC_LINES_FOR_TALL_NODE = 2; 
const APPROX_NODE_MIN_HEIGHT_NO_DESC = 70; 
const APPROX_NODE_MIN_HEIGHT_WITH_DESC_SHORT = APPROX_NODE_MIN_HEIGHT_NO_DESC + APPROX_LINE_HEIGHT * 1 + 20; 
const APPROX_NODE_MIN_HEIGHT_WITH_DESC_TALL = APPROX_NODE_MIN_HEIGHT_NO_DESC + APPROX_LINE_HEIGHT * MIN_DESC_LINES_FOR_TALL_NODE + 20;

const CANVAS_CONTENT_WIDTH_STR = '1200px'; 
const CANVAS_CONTENT_HEIGHT_STR = '1200px';


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
  const dragOffsetRef = useRef<{ x: number, y: number }>({ x: 0, y: 0 });

  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [activeTool, setActiveTool] = useState<'select' | 'pan'>('select');
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number, y: number, panX: number, panY: number } | null>(null);
  const [initialViewCentered, setInitialViewCentered] = useState(false);
  
  const canvasNumericWidth = useMemo(() => parseFloat(CANVAS_CONTENT_WIDTH_STR), []);
  const canvasNumericHeight = useMemo(() => parseFloat(CANVAS_CONTENT_HEIGHT_STR), []);


  const getNodeHeight = useCallback((node: NodeData | null): number => {
    if (!node) return APPROX_NODE_MIN_HEIGHT_NO_DESC;
    if (!node.description) return APPROX_NODE_MIN_HEIGHT_NO_DESC;
    const lineCount = node.description.split('\n').length;
    if (lineCount >= MIN_DESC_LINES_FOR_TALL_NODE) {
      return APPROX_NODE_MIN_HEIGHT_WITH_DESC_TALL;
    }
    return APPROX_NODE_MIN_HEIGHT_WITH_DESC_SHORT;
  }, []);

  const clampPan = useCallback((newPanX: number, newPanY: number, currentScale: number, viewportRect: DOMRect | null) => {
    if (!viewportRect) return { x: newPanX, y: newPanY };

    const scaledCanvasWidth = canvasNumericWidth * currentScale;
    const scaledCanvasHeight = canvasNumericHeight * currentScale;

    let clampedX = newPanX;
    if (scaledCanvasWidth > viewportRect.width) {
      clampedX = Math.min(0, Math.max(newPanX, viewportRect.width - scaledCanvasWidth));
    } else {
      clampedX = Math.max(0, Math.min(newPanX, viewportRect.width - scaledCanvasWidth));
    }

    let clampedY = newPanY;
    if (scaledCanvasHeight > viewportRect.height) {
      clampedY = Math.min(0, Math.max(newPanY, viewportRect.height - scaledCanvasHeight));
    } else {
      clampedY = Math.max(0, Math.min(newPanY, viewportRect.height - scaledCanvasHeight));
    }
    return { x: clampedX, y: clampedY };
  }, [canvasNumericWidth, canvasNumericHeight]);


  const handleZoom = useCallback((zoomIn: boolean) => {
    const viewportRect = viewportContainerRef.current?.getBoundingClientRect();
    if (!viewportRect) return;

    const zoomFactor = 1.1;
    const newScale = zoomIn ? scale * zoomFactor : scale / zoomFactor;
    const clampedScale = Math.max(0.2, Math.min(newScale, 2)); // Min 0.2x, Max 2x

    // Zoom towards the center of the viewport
    const viewportCenterX = viewportRect.width / 2;
    const viewportCenterY = viewportRect.height / 2;

    // Calculate the logical point on canvas under the viewport center
    const logicalCenterX = (viewportCenterX - pan.x) / scale;
    const logicalCenterY = (viewportCenterY - pan.y) / scale;

    // Calculate new pan to keep this logical point at the viewport center
    let newPanX = viewportCenterX - (logicalCenterX * clampedScale);
    let newPanY = viewportCenterY - (logicalCenterY * clampedScale);

    const clampedNewPan = clampPan(newPanX, newPanY, clampedScale, viewportRect);

    setScale(clampedScale);
    setPan(clampedNewPan);
  }, [scale, pan, clampPan]);

  const handleRecenterView = useCallback(() => {
    const viewportRect = viewportContainerRef.current?.getBoundingClientRect();
    if (!viewportRect || !mindmap) {
      // Default centering if no viewport or mindmap
      const initialPan = clampPan(-canvasNumericWidth / 4, -canvasNumericHeight / 4, 1, viewportRect);
      setPan(initialPan);
      setScale(1);
      return;
    }
  
    const nodes = Object.values(mindmap.data.nodes);
    if (nodes.length === 0) {
      const initialPan = clampPan(
        (viewportRect.width - canvasNumericWidth) / 2,
        (viewportRect.height - canvasNumericHeight) / 2,
        1, 
        viewportRect
      );
      setPan(initialPan);
      setScale(1);
      return;
    }
  
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach(node => {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + NODE_CARD_WIDTH);
      maxY = Math.max(maxY, node.y + getNodeHeight(node));
    });
  
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
  
    if (contentWidth === 0 || contentHeight === 0) { // Single node or all nodes at same point
      const node = nodes[0];
      const newScale = 1; // Reset scale for single node view
      let newPanX = viewportRect.width / 2 - (node.x + NODE_CARD_WIDTH / 2) * newScale;
      let newPanY = viewportRect.height / 2 - (node.y + getNodeHeight(node) / 2) * newScale;
      
      const clampedPan = clampPan(newPanX, newPanY, newScale, viewportRect);
      setPan(clampedPan);
      setScale(newScale);
      return;
    }

    const padding = 50; // Padding around the content
    const scaleX = (viewportRect.width - 2 * padding) / contentWidth;
    const scaleY = (viewportRect.height - 2 * padding) / contentHeight;
    const newScale = Math.min(scaleX, scaleY, 1.5); // Cap max zoom out for fit all
    const clampedScale = Math.max(0.1, newScale); // Min scale
  
    const contentCenterX = minX + contentWidth / 2;
    const contentCenterY = minY + contentHeight / 2;
  
    let newPanX = viewportRect.width / 2 - contentCenterX * clampedScale;
    let newPanY = viewportRect.height / 2 - contentCenterY * clampedScale;
  
    const clampedPan = clampPan(newPanX, newPanY, clampedScale, viewportRect);
    setPan(clampedPan);
    setScale(clampedScale);
    setInitialViewCentered(true);
  }, [mindmap, getNodeHeight, clampPan, canvasNumericWidth, canvasNumericHeight]);

  useEffect(() => {
    if (mindmap && viewportContainerRef.current && !initialViewCentered) {
      handleRecenterView();
    }
  }, [mindmap, initialViewCentered, handleRecenterView]);


  const handlePanMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (activeTool !== 'pan' || !viewportContainerRef.current) return;
    // Prevent panning if clicking on a node card or its interactive elements
    if ((event.target as HTMLElement).closest('.node-card-draggable')) {
      return;
    }
    event.preventDefault();
    setIsPanning(true);
    panStartRef.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
    viewportContainerRef.current.style.cursor = 'grabbing';
  }, [activeTool, pan]);

  const handlePanMouseMove = useCallback((event: MouseEvent) => {
    if (!isPanning || !panStartRef.current || !viewportContainerRef.current) return;
    event.preventDefault();
    const dx = event.clientX - panStartRef.current.x;
    const dy = event.clientY - panStartRef.current.y;
    const newPanX = panStartRef.current.panX + dx;
    const newPanY = panStartRef.current.panY + dy;

    const viewportRect = viewportContainerRef.current.getBoundingClientRect();
    const clampedPan = clampPan(newPanX, newPanY, scale, viewportRect);
    setPan(clampedPan);
  }, [isPanning, scale, clampPan]);

  const handlePanMouseUpOrLeave = useCallback(() => {
    if (isPanning) {
      setIsPanning(false);
      if (viewportContainerRef.current) {
        viewportContainerRef.current.style.cursor = activeTool === 'pan' ? 'grab' : 'default';
      }
    }
  }, [isPanning, activeTool]);

  useEffect(() => {
    if (isPanning) {
      window.addEventListener('mousemove', handlePanMouseMove);
      window.addEventListener('mouseup', handlePanMouseUpOrLeave);
      window.addEventListener('mouseleave', handlePanMouseUpOrLeave);
    }
    return () => {
      window.removeEventListener('mousemove', handlePanMouseMove);
      window.removeEventListener('mouseup', handlePanMouseUpOrLeave);
      window.removeEventListener('mouseleave', handlePanMouseUpOrLeave);
    };
  }, [isPanning, handlePanMouseMove, handlePanMouseUpOrLeave]);

  useEffect(() => {
    if (viewportContainerRef.current) {
      viewportContainerRef.current.style.cursor = activeTool === 'pan' ? 'grab' : 'default';
    }
  }, [activeTool]);
  
  const handleAddRootNode = useCallback(async () => {
    if (newRootNodeTitle.trim() === '') {
      toast({ title: "Title Required", description: "Please enter a title for the new root node.", variant: "destructive" });
      return;
    }
    if (!mindmap) return;

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
      
      const viewportRect = viewportContainerRef.current?.getBoundingClientRect();
      if (viewportRect) {
        const newPanX = viewportRect.width / 2 - (newNode.x + NODE_CARD_WIDTH / 2) * scale;
        const newPanY = viewportRect.height / 2 - (newNode.y + getNodeHeight(newNode) / 2) * scale;
        const clampedPan = clampPan(newPanX, newPanY, scale, viewportRect);
        setPan(clampedPan);
      }
    }
  }, [newRootNodeTitle, newRootNodeDescription, mindmap, addNode, toast, scale, pan, getNodeHeight, clampPan]);


  const handleAddChildNode = useCallback((parentId: string) => {
    if (!mindmap) return;
    const parentNode = mindmap.data.nodes[parentId];
    if (!parentNode) return;
    
    const tempNewNode: NodeData = {
      id: `temp-${uuidv4()}`, 
      title: '', 
      description: "",
      emoji: "➕",
      parentId: parentId,
      childIds: [],
      x: (parentNode.x ?? 0) + NODE_CARD_WIDTH + 30, 
      y: (parentNode.y ?? 0),
    };
    setEditingNode(tempNewNode);
    setIsEditDialogOpen(true);
  }, [mindmap]);

  const handleEditNode = useCallback((node: NodeData) => {
    setEditingNode(node);
    setIsEditDialogOpen(true);
  }, []);

  const handleSaveNode = useCallback((nodeId: string, data: EditNodeInput) => {
    if (!mindmap || !editingNode) return; 
    
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
    const nodeRect = nodeElement.getBoundingClientRect();
    
    const logicalDragOffsetX = (event.clientX - nodeRect.left) / scale;
    const logicalDragOffsetY = (event.clientY - nodeRect.top) / scale;
    
    event.dataTransfer.setData('application/json', JSON.stringify({ 
      nodeId, 
      offsetX: logicalDragOffsetX, 
      offsetY: logicalDragOffsetY 
    }));
    event.dataTransfer.effectAllowed = "move";
  }, [scale, activeTool]);

  const handleDragOverCanvas = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const handleDropOnCanvas = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!viewportContainerRef.current || !mindmap) return;

    let dragData;
    try {
      dragData = JSON.parse(event.dataTransfer.getData('application/json'));
    } catch (e) {
      console.error("Could not parse drag data:", e);
      return;
    }

    const { nodeId, offsetX, offsetY } = dragData;
    if (!nodeId) return;
    
    const viewportRect = viewportContainerRef.current.getBoundingClientRect();
    
    let newX_logical = (event.clientX - viewportRect.left - pan.x) / scale - offsetX;
    let newY_logical = (event.clientY - viewportRect.top - pan.y) / scale - offsetY;
    
    // Clamp node position to canvas boundaries
    const nodeHeight = getNodeHeight(mindmap.data.nodes[nodeId]);
    newX_logical = Math.max(0, Math.min(newX_logical, canvasNumericWidth - NODE_CARD_WIDTH));
    newY_logical = Math.max(0, Math.min(newY_logical, canvasNumericHeight - nodeHeight));

    updateNodePosition(mindmap.id, nodeId, newX_logical, newY_logical);
  }, [mindmap, updateNodePosition, pan, scale, getNodeHeight, canvasNumericWidth, canvasNumericHeight]);

  const handleExportJson = useCallback(() => {
    if (!mindmap) return;
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(mindmap, null, 2))}`;
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
          <Link href="/"><Home className="mr-1.5 h-4 w-4" /> Library</Link>
        </Button>
      </div>
    );
  }

  const allNodes = Object.values(mindmap.data.nodes);
  const svgKey = allNodes.map(n => `${n.id}-${n.x}-${n.y}-${(n.childIds || []).join(',')}-${n.customBackgroundColor || ''}`).join('|');

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
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant={activeTool === 'pan' ? "secondary" : "ghost"} 
                    size="icon" 
                    onClick={() => setActiveTool(prev => prev === 'pan' ? 'select' : 'pan')}
                    className="h-8 w-8"
                  >
                    <Hand className="h-4 w-4" />
                    <span className="sr-only">Pan Tool</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Pan Tool (Spacebar)</p></TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={() => handleZoom(true)} className="h-8 w-8">
                    <ZoomIn className="h-4 w-4" />
                    <span className="sr-only">Zoom In</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Zoom In</p></TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={() => handleZoom(false)} className="h-8 w-8">
                    <ZoomOut className="h-4 w-4" />
                    <span className="sr-only">Zoom Out</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Zoom Out</p></TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={handleRecenterView} className="h-8 w-8">
                    <LocateFixed className="h-4 w-4" />
                    <span className="sr-only">Recenter View</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Recenter View</p></TooltipContent>
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

        {/* Canvas Area */}
        <div
          ref={viewportContainerRef}
          className="flex-grow relative bg-muted/20 overflow-hidden"
          onDragOver={handleDragOverCanvas}
          onDrop={handleDropOnCanvas}
          onMouseDown={handlePanMouseDown}
        >
          <div
            ref={canvasContentRef}
            className="relative" 
            style={{
              width: CANVAS_CONTENT_WIDTH_STR,
              height: CANVAS_CONTENT_HEIGHT_STR,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
              transformOrigin: '0 0',
            }}
          >
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
                const startY = (parentNode.y ?? 0) + getNodeHeight(parentNode) / 2; 
                
                const endX = (node.x ?? 0) + NODE_CARD_WIDTH / 2;
                const endY = (node.y ?? 0) + getNodeHeight(node) / 2; 

                const c1x = startX;
                const c1y = startY + Math.max(20, Math.abs(endY - startY) / 2.5);
                const c2x = endX;
                const c2y = endY - Math.max(20, Math.abs(endY - startY) / 2.5);
                const pathData = `M ${startX} ${startY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${endX} ${endY}`;
                
                let strokeColor = "hsl(var(--border))"; 
                if (parentNode.customBackgroundColor) {
                  strokeColor = `hsl(var(--${parentNode.customBackgroundColor}))`;
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
                className="absolute flex items-center justify-center pointer-events-none text-center"
                style={{
                  top: `50%`, 
                  left: `50%`,
                  transform: `translate(-50%, -50%) scale(${1 / scale})`, 
                  // Adjust message position if canvas is panned
                  // This might need further refinement for perfect centering with pan
                  // For now, it's relative to the canvasContentRef's 0,0
                }}
              >
                <div 
                  className="text-muted-foreground text-lg bg-background/80 p-6 rounded-md shadow-lg"
                >
                  This mindmap is empty. Add a root idea to get started!
                </div>
              </div>
            )}
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
