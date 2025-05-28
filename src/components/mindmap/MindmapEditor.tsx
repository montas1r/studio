
"use client";

import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { Mindmap, NodeData, EditNodeInput } from '@/types/mindmap';
import { useMindmaps } from '@/hooks/useMindmaps';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NodeCard } from './NodeCard';
import { EditNodeDialog } from './EditNodeDialog';
import { PlusCircle, Download, ArrowLeft, Home, Layers, ZoomIn, ZoomOut, LocateFixed, Hand } from 'lucide-react';
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

const NODE_CARD_WIDTH = 300; // Keep this for node rendering logic
const APPROX_NODE_MIN_HEIGHT_NO_DESC = 70; // Used for wire endpoint calculation
const APPROX_LINE_HEIGHT = 18;
const MIN_DESC_LINES_FOR_TALL_NODE = 2;
const APPROX_NODE_MIN_HEIGHT_WITH_DESC_SHORT = APPROX_NODE_MIN_HEIGHT_NO_DESC + APPROX_LINE_HEIGHT * 1 + 20;
const APPROX_NODE_MIN_HEIGHT_WITH_DESC_TALL = APPROX_NODE_MIN_HEIGHT_NO_DESC + APPROX_LINE_HEIGHT * MIN_DESC_LINES_FOR_TALL_NODE + 20;


const CANVAS_CONTENT_WIDTH_STR = '1200px';
const CANVAS_CONTENT_HEIGHT_STR = '1200px';

const MIN_SCALE = 0.25;
const MAX_SCALE = 2.0;


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

  const zoomPanContainerRef = useRef<HTMLDivElement>(null);
  const canvasContentRef = useRef<HTMLDivElement>(null);
  
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const pinchStateRef = useRef<{ initialDistance: number; initialScale: number; initialPan: {x: number; y: number}, midPoint: {x:number; y:number} } | null>(null);


  const canvasNumericWidth = parseInt(CANVAS_CONTENT_WIDTH_STR, 10);
  const canvasNumericHeight = parseInt(CANVAS_CONTENT_HEIGHT_STR, 10);

  const getNodeHeight = useCallback((node: NodeData | null): number => {
    if (!node) return APPROX_NODE_MIN_HEIGHT_NO_DESC;
    if (!node.description) return APPROX_NODE_MIN_HEIGHT_NO_DESC;
    const lineCount = node.description.split('\n').length;
    if (lineCount >= MIN_DESC_LINES_FOR_TALL_NODE) {
      return APPROX_NODE_MIN_HEIGHT_WITH_DESC_TALL;
    }
    return APPROX_NODE_MIN_HEIGHT_WITH_DESC_SHORT;
  }, []);

  const handleAddRootNode = useCallback(async () => {
    if (newRootNodeTitle.trim() === '') {
      toast({ title: "Title Required", description: "Please enter a title for the new root node.", variant: "destructive" });
      return;
    }
    if (!mindmap || !zoomPanContainerRef.current) return;

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
      const viewportRect = zoomPanContainerRef.current.getBoundingClientRect();
      const newPanX = (viewportRect.width / 2) - (newNode.x * scale) - (NODE_CARD_WIDTH * scale / 2) ;
      const newPanY = (viewportRect.height / 2) - (newNode.y * scale) - (getNodeHeight(newNode) * scale / 2);
      setPan({x: newPanX, y: newPanY});
    }
  }, [newRootNodeTitle, newRootNodeDescription, mindmap, addNode, toast, scale, getNodeHeight]);

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
      x: (parentNode.x ?? 0) + NODE_CARD_WIDTH + 30, // Default offset from parent
      y: (parentNode.y ?? 0), // Same y as parent initially
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
      const permanentNode = addNode(mindmap.id, editingNode.parentId, data, editingNode.x, editingNode.y); // Pass initial x,y
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
    if (!zoomPanContainerRef.current) return;
    const nodeElement = event.currentTarget;
    const nodeRect = nodeElement.getBoundingClientRect();
    const viewportRect = zoomPanContainerRef.current.getBoundingClientRect();

    // Calculate logical offset of mouse within the node, considering scale
    const logicalOffsetX = (event.clientX - nodeRect.left) / scale;
    const logicalOffsetY = (event.clientY - nodeRect.top) / scale;
    
    event.dataTransfer.setData('application/json', JSON.stringify({
      nodeId,
      offsetX: logicalOffsetX, // Store logical offset
      offsetY: logicalOffsetY,
    }));
    event.dataTransfer.effectAllowed = "move";
  }, [scale]);


  const handleDragOverCanvas = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const handleDropOnCanvas = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!zoomPanContainerRef.current || !mindmap) return;

    let dragData;
    try {
      dragData = JSON.parse(event.dataTransfer.getData('application/json'));
    } catch (e) {
      console.error("Could not parse drag data:", e);
      return;
    }

    const { nodeId, offsetX: logicalOffsetX, offsetY: logicalOffsetY } = dragData;
    if (!nodeId || logicalOffsetX === undefined || logicalOffsetY === undefined) {
      console.error("Invalid drag data received:", dragData);
      return;
    }

    const viewportRect = zoomPanContainerRef.current.getBoundingClientRect();

    // Calculate mouse position relative to the viewport's top-left
    const mouseXInViewport = event.clientX - viewportRect.left;
    const mouseYInViewport = event.clientY - viewportRect.top;

    // Convert mouse position to logical canvas coordinates
    let newX_logical = (mouseXInViewport - pan.x) / scale - logicalOffsetX;
    let newY_logical = (mouseYInViewport - pan.y) / scale - logicalOffsetY;
    
    // Clamp to canvas boundaries
    newX_logical = Math.max(0, Math.min(newX_logical, canvasNumericWidth - NODE_CARD_WIDTH));
    const nodeHeight = getNodeHeight(mindmap.data.nodes[nodeId]);
    newY_logical = Math.max(0, Math.min(newY_logical, canvasNumericHeight - nodeHeight));


    updateNodePosition(mindmap.id, nodeId, newX_logical, newY_logical);
  }, [mindmap, updateNodePosition, pan, scale, canvasNumericWidth, canvasNumericHeight, getNodeHeight]);


  const handleExportJson = useCallback(() => {
    if (!mindmap) return;
    const jsonString = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(mindmap, null, 2));
    const link = document.createElement("a");
    link.href = jsonString;
    link.download = `${mindmap.name.replace(/\s+/g, '_').toLowerCase()}_mindmap.json`;
    link.click();
    toast({ title: "Exported", description: "Mindmap data exported as JSON." });
  }, [mindmap, toast]);

  const adjustZoom = useCallback((newScaleTarget: number, focalX_viewport?: number, focalY_viewport?: number) => {
    if (!zoomPanContainerRef.current) return;

    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScaleTarget));
    const viewportRect = zoomPanContainerRef.current.getBoundingClientRect();
    
    const targetX = focalX_viewport ?? viewportRect.width / 2;
    const targetY = focalY_viewport ?? viewportRect.height / 2;

    // Point on canvas that was under the focal point BEFORE zoom
    const logicalX_before = (targetX - pan.x) / scale;
    const logicalY_before = (targetY - pan.y) / scale;

    // New pan to keep that point under the focal point AFTER zoom
    const newPanX = targetX - logicalX_before * newScale;
    const newPanY = targetY - logicalY_before * newScale;

    // Clamped pan
    const scaledCanvasWidth = canvasNumericWidth * newScale;
    const scaledCanvasHeight = canvasNumericHeight * newScale;

    const finalPanX = Math.min(0, Math.max(newPanX, viewportRect.width - scaledCanvasWidth));
    const finalPanY = Math.min(0, Math.max(newPanY, viewportRect.height - scaledCanvasHeight));
    
    setScale(newScale);
    setPan({ x: finalPanX, y: finalPanY });

  }, [pan, scale, canvasNumericWidth, canvasNumericHeight]);

  const handleWheelZoom = useCallback((event: WheelEvent) => {
    if (!zoomPanContainerRef.current) return;
    event.preventDefault();
    const delta = event.deltaY > 0 ? 0.9 : 1.1; // Zoom factor
    const viewportRect = zoomPanContainerRef.current.getBoundingClientRect();
    const focalX = event.clientX - viewportRect.left;
    const focalY = event.clientY - viewportRect.top;
    adjustZoom(scale * delta, focalX, focalY);
  }, [scale, adjustZoom]);

  const handleButtonZoomIn = useCallback(() => adjustZoom(scale * 1.2), [scale, adjustZoom]);
  const handleButtonZoomOut = useCallback(() => adjustZoom(scale / 1.2), [scale, adjustZoom]);

  const handleRecenterView = useCallback(() => {
    if (!mindmap || !zoomPanContainerRef.current) {
      setScale(1);
      setPan({ x: 0, y: 0 });
      return;
    }
    const allNodesArray = Object.values(mindmap.data.nodes);
    if (allNodesArray.length === 0) {
      setScale(1);
      const viewportRect = zoomPanContainerRef.current.getBoundingClientRect();
      const initialPanX = (viewportRect.width - (canvasNumericWidth * 1)) / 2; // Center the 0,0 of logical canvas
      const initialPanY = (viewportRect.height - (canvasNumericHeight * 1)) / 2;
      setPan({ x: initialPanX, y: initialPanY});
      return;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    allNodesArray.forEach(node => {
      const nodeHeight = getNodeHeight(node);
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + NODE_CARD_WIDTH);
      maxY = Math.max(maxY, node.y + nodeHeight);
    });

    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    const viewportRect = zoomPanContainerRef.current.getBoundingClientRect();
    const padding = 50; // pixels in viewport

    const newScaleX = (viewportRect.width - 2 * padding) / contentWidth;
    const newScaleY = (viewportRect.height - 2 * padding) / contentHeight;
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min(newScaleX, newScaleY)));
    
    const contentCenterX = minX + contentWidth / 2;
    const contentCenterY = minY + contentHeight / 2;

    const newPanX = (viewportRect.width / 2) - (contentCenterX * newScale);
    const newPanY = (viewportRect.height / 2) - (contentCenterY * newScale);
    
    // Clamp pan
    const scaledCanvasWidth = canvasNumericWidth * newScale;
    const scaledCanvasHeight = canvasNumericHeight * newScale;
    const finalPanX = Math.min(0, Math.max(newPanX, viewportRect.width - scaledCanvasWidth));
    const finalPanY = Math.min(0, Math.max(newPanY, viewportRect.height - scaledCanvasHeight));

    setScale(newScale);
    setPan({ x: finalPanX, y: finalPanY });
  }, [mindmap, getNodeHeight, canvasNumericWidth, canvasNumericHeight]);

  // Pinch-to-zoom handlers
  const handleTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 2) {
      event.preventDefault();
      const t1 = event.touches[0];
      const t2 = event.touches[1];
      const distance = Math.sqrt(Math.pow(t2.clientX - t1.clientX, 2) + Math.pow(t2.clientY - t1.clientY, 2));
      const midPoint = {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2,
      };
      pinchStateRef.current = { initialDistance: distance, initialScale: scale, initialPan: { ...pan }, midPoint };
    }
  }, [scale, pan]);

  const handleTouchMove = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 2 && pinchStateRef.current && zoomPanContainerRef.current) {
      event.preventDefault();
      const t1 = event.touches[0];
      const t2 = event.touches[1];
      const currentDistance = Math.sqrt(Math.pow(t2.clientX - t1.clientX, 2) + Math.pow(t2.clientY - t1.clientY, 2));
      const scaleDelta = currentDistance / pinchStateRef.current.initialDistance;
      const newScaleUnclamped = pinchStateRef.current.initialScale * scaleDelta;
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScaleUnclamped));

      const viewportRect = zoomPanContainerRef.current.getBoundingClientRect();
      const pinchMidPointViewport = {
        x: pinchStateRef.current.midPoint.x - viewportRect.left,
        y: pinchStateRef.current.midPoint.y - viewportRect.top,
      };
      
      // Calculate logical point under the initial pinch midpoint
      const logicalX = (pinchMidPointViewport.x - pinchStateRef.current.initialPan.x) / pinchStateRef.current.initialScale;
      const logicalY = (pinchMidPointViewport.y - pinchStateRef.current.initialPan.y) / pinchStateRef.current.initialScale;

      // Calculate new pan to keep that logical point at the same screen position
      let newPanX = pinchMidPointViewport.x - logicalX * newScale;
      let newPanY = pinchMidPointViewport.y - logicalY * newScale;
      
      // Clamp pan
      const scaledCanvasWidth = canvasNumericWidth * newScale;
      const scaledCanvasHeight = canvasNumericHeight * newScale;
      newPanX = Math.min(0, Math.max(newPanX, viewportRect.width - scaledCanvasWidth));
      newPanY = Math.min(0, Math.max(newPanY, viewportRect.height - scaledCanvasHeight));
      
      setScale(newScale);
      setPan({ x: newPanX, y: newPanY });
    }
  }, [canvasNumericWidth, canvasNumericHeight]);

  const handleTouchEnd = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length < 2) {
      pinchStateRef.current = null;
    }
  }, []);


  useEffect(() => {
    const container = zoomPanContainerRef.current;
    if (container) {
      container.addEventListener('wheel', handleWheelZoom, { passive: false });
      return () => {
        container.removeEventListener('wheel', handleWheelZoom);
      };
    }
  }, [handleWheelZoom]);
  
  // Initial centering effect
  useEffect(() => {
    handleRecenterView();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mindmapId]); // Recenter when mindmap changes


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
  const svgKey = allNodes.map(n => `${n.id}-${n.x}-${n.y}-${n.parentId}-${(n.childIds || []).join(',')}-${scale}-${pan.x}-${pan.y}`).join('|');

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
               {/* Zoom Controls Moved to Fixed Position */}
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

        {/* Main Canvas Area */}
        <div
          ref={zoomPanContainerRef}
          className="flex-grow relative overflow-hidden bg-muted/20 cursor-default"
          onDragOver={handleDragOverCanvas}
          onDrop={handleDropOnCanvas}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{ touchAction: 'none' }} // Prevents browser default touch actions like scroll
        >
          <div
            ref={canvasContentRef}
            className="relative"
            style={{
              width: CANVAS_CONTENT_WIDTH_STR,
              height: CANVAS_CONTENT_HEIGHT_STR,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
              transformOrigin: '0 0',
              pointerEvents: 'auto', // Ensure interactions on the content itself
            }}
          >
            <svg
              className="absolute top-0 left-0 pointer-events-none"
              style={{
                width: CANVAS_CONTENT_WIDTH_STR,
                height: CANVAS_CONTENT_HEIGHT_STR,
                overflow: 'visible', 
              }}
              key={svgKey} // Re-render SVG if node positions, scale or pan change
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
                const c1y = startY + Math.max(50, Math.abs(endY - startY) / 2);
                const c2x = endX;
                const c2y = endY - Math.max(50, Math.abs(endY - startY) / 2);
                const pathData = `M ${startX} ${startY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${endX} ${endY}`;

                let strokeColor = "hsl(var(--muted-foreground))";
                if (parentNode.customBackgroundColor) {
                    strokeColor = `hsl(var(--${parentNode.customBackgroundColor}))`;
                } else if (parentNode.parentId === null) { // Is a root node
                    strokeColor = "hsl(var(--primary))";
                } else { // Is a child node (not root)
                    strokeColor = "hsl(var(--accent))";
                }

                return (
                  <path
                    key={`${parentNode.id}-${node.id}`}
                    d={pathData}
                    stroke={strokeColor}
                    strokeWidth={Math.max(1, 2 / scale)} // Ensure stroke is visible when zoomed out
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
                className="node-card-draggable" // For pan vs. drag detection
              />
            ))}

            {allNodes.length === 0 && (
               <div
                className="absolute flex items-center justify-center pointer-events-none text-center"
                style={{
                  top: '50%', // Relative to canvasContentRef
                  left: '50%',
                  transform: 'translate(-50%, -50%)', // Center within canvasContentRef
                  // No scale needed here as it's inside the scaled container
                }}
              >
                <div className="text-muted-foreground text-lg bg-background/80 p-6 rounded-md shadow-lg">
                  This mindmap is empty. Add a root idea to get started!
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Zoom and Recenter Controls - Fixed Position */}
        <div className="fixed bottom-4 right-4 z-20 flex flex-col gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button onClick={handleButtonZoomIn} variant="outline" size="icon" className="shadow-lg bg-background/80 hover:bg-muted">
                <ZoomIn />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left"><p>Zoom In</p></TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button onClick={handleButtonZoomOut} variant="outline" size="icon" className="shadow-lg bg-background/80 hover:bg-muted">
                <ZoomOut />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left"><p>Zoom Out</p></TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button onClick={handleRecenterView} variant="outline" size="icon" className="shadow-lg bg-background/80 hover:bg-muted">
                <LocateFixed />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left"><p>Recenter View</p></TooltipContent>
          </Tooltip>
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
