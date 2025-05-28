
"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Mindmap, NodeData, EditNodeInput } from '@/types/mindmap';
import { useMindmaps } from '@/hooks/useMindmaps';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NodeCard } from './NodeCard';
import { EditNodeDialog } from './EditNodeDialog';
import { PlusCircle, Download, ArrowLeft, Hand, LocateFixed, ZoomIn, ZoomOut, AlertTriangle } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface MindmapEditorProps {
  mindmapId: string;
}

const NODE_CARD_WIDTH = 300;
const NODE_HEADER_HEIGHT = 50;
const NODE_APPROX_MIN_HEIGHT = 80; // Approx min height of node card without image/long desc
const CANVAS_CONTENT_WIDTH = '1200px';
const CANVAS_CONTENT_HEIGHT = '1200px';

const MIN_ZOOM_FACTOR = 0.2;
const MAX_ZOOM_FACTOR = 2.5;
const ZOOM_STEP_SENSITIVITY = 0.1;

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

  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0 }); // For canvas panning
  const [activeTool, setActiveTool] = useState<'select' | 'pan'>('select');
  const [initialViewCentered, setInitialViewCentered] = useState(false);

  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 }); // For node dragging

  const getNodesBoundingBox = useCallback(() => {
    if (!mindmap || Object.keys(mindmap.data.nodes).length === 0) {
      return null;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    Object.values(mindmap.data.nodes).forEach(node => {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + NODE_CARD_WIDTH);
      // Approximate node height: header + description lines + image + padding
      let approxNodeHeight = NODE_HEADER_HEIGHT;
      if (node.description) {
        approxNodeHeight += 20 + (node.description.split('\n').length * 15); // Basic estimate
      }
      if (node.imageUrl) {
        approxNodeHeight += 150; // Estimate for image aspect ratio
      }
      approxNodeHeight = Math.max(NODE_APPROX_MIN_HEIGHT, approxNodeHeight);
      maxY = Math.max(maxY, node.y + approxNodeHeight);
    });
    if (minX === Infinity) return null; // No valid nodes
    return { minX, minY, maxX, maxY, width: Math.max(NODE_CARD_WIDTH, maxX - minX), height: Math.max(NODE_APPROX_MIN_HEIGHT, maxY - minY) };
  }, [mindmap]);

  const calculateOptimalFit = useCallback((forInitialCentering = false) => {
    if (!viewportContainerRef.current) return { scale: 1, pan: { x: 0, y: 0 } };

    const viewportWidth = viewportContainerRef.current.clientWidth;
    const viewportHeight = viewportContainerRef.current.clientHeight;
    const padding = 50;

    const nodesBoundingBox = getNodesBoundingBox();

    if (!nodesBoundingBox || nodesBoundingBox.width <= 0 || nodesBoundingBox.height <= 0) {
      // Default centering if no nodes or invalid bounding box
      return {
        scale: forInitialCentering ? 1 : scale,
        pan: {
          x: viewportWidth / 2 - (0 * (forInitialCentering ? 1 : scale)), // Center logical 0
          y: viewportHeight / 2 - (0 * (forInitialCentering ? 1 : scale)), // Center logical 0
        }
      };
    }

    const scaleX = (viewportWidth - 2 * padding) / nodesBoundingBox.width;
    const scaleY = (viewportHeight - 2 * padding) / nodesBoundingBox.height;
    let newScale = Math.min(scaleX, scaleY, MAX_ZOOM_FACTOR); // Cap max zoom here
    newScale = Math.max(MIN_ZOOM_FACTOR, newScale);

    const bbCenterX = nodesBoundingBox.minX + nodesBoundingBox.width / 2;
    const bbCenterY = nodesBoundingBox.minY + nodesBoundingBox.height / 2;

    const newPanX = (viewportWidth / 2) - (bbCenterX * newScale);
    const newPanY = (viewportHeight / 2) - (bbCenterY * newScale);

    return { scale: newScale, pan: { x: newPanX, y: newPanY } };
  }, [getNodesBoundingBox, scale]);


  const handleRecenterView = useCallback((isInitial = false) => {
    const { scale: newScale, pan: newPan } = calculateOptimalFit(isInitial);
    setScale(newScale);
    setPan(newPan);
  }, [calculateOptimalFit]);

  useEffect(() => {
    if (mindmap && viewportContainerRef.current && !initialViewCentered) {
      handleRecenterView(true);
      setInitialViewCentered(true);
    }
  }, [mindmap, initialViewCentered, handleRecenterView]);


  const handleZoom = useCallback((zoomDirection: 'in' | 'out', clientX?: number, clientY?: number) => {
    if (!viewportContainerRef.current) return;

    const viewportRect = viewportContainerRef.current.getBoundingClientRect();
    // If clientX/Y are not provided (e.g. button click), zoom to center of viewport
    const pointerX = clientX === undefined ? viewportRect.width / 2 : clientX - viewportRect.left;
    const pointerY = clientY === undefined ? viewportRect.height / 2 : clientY - viewportRect.top;

    const currentScale = scale;
    let newScale = currentScale + (zoomDirection === 'in' ? 1 : -1) * currentScale * ZOOM_STEP_SENSITIVITY;
    newScale = Math.max(MIN_ZOOM_FACTOR, Math.min(MAX_ZOOM_FACTOR, newScale));

    if (newScale === currentScale) return; // No change if at min/max and trying to go further

    // Calculate pan adjustment to keep the point under the cursor stationary
    const panX = pan.x - (pointerX - pan.x) * (newScale / currentScale - 1);
    const panY = pan.y - (pointerY - pan.y) * (newScale / currentScale - 1);

    setScale(newScale);
    setPan({ x: panX, y: panY });
  }, [scale, pan]);


  const handlePanMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (activeTool !== 'pan' || !viewportContainerRef.current) return;
    // Prevent panning if clicking on a node card or its interactive elements
    if ((event.target as HTMLElement).closest('.node-card-draggable') || (event.target as HTMLElement).closest('button')) {
      return;
    }
    event.preventDefault();
    setIsPanning(true);
    panStartRef.current = { x: event.clientX - pan.x, y: event.clientY - pan.y };
  }, [activeTool, pan]);

  const handlePanMouseMove = useCallback((event: MouseEvent) => {
    if (!isPanning || activeTool !== 'pan') return;
    event.preventDefault();
    setPan({
      x: event.clientX - panStartRef.current.x,
      y: event.clientY - panStartRef.current.y,
    });
  }, [isPanning, activeTool]);

  const handlePanMouseUpOrLeave = useCallback(() => {
    if (isPanning) {
      setIsPanning(false);
    }
  }, [isPanning]);

  useEffect(() => {
    window.addEventListener('mousemove', handlePanMouseMove);
    window.addEventListener('mouseup', handlePanMouseUpOrLeave);
    window.addEventListener('mouseleave', handlePanMouseUpOrLeave); // Handle mouse leaving window

    return () => {
      window.removeEventListener('mousemove', handlePanMouseMove);
      window.removeEventListener('mouseup', handlePanMouseUpOrLeave);
      window.removeEventListener('mouseleave', handlePanMouseUpOrLeave);
    };
  }, [handlePanMouseMove, handlePanMouseUpOrLeave]);

  useEffect(() => {
    if (viewportContainerRef.current) {
      if (activeTool === 'pan') {
        viewportContainerRef.current.style.cursor = isPanning ? 'grabbing' : 'grab';
      } else {
        viewportContainerRef.current.style.cursor = 'default';
      }
    }
  }, [activeTool, isPanning]);


  const handleAddRootNode = useCallback(async () => {
    if (newRootNodeTitle.trim() === '') {
      toast({ title: "Title Required", description: "Please enter a title for the new root node.", variant: "destructive" });
      return;
    }
    if (!mindmap || !viewportContainerRef.current) return;

    const newNode = addNode(mindmap.id, null, { title: newRootNodeTitle, description: newRootNodeDescription, emoji: '💡' });

    if (newNode) {
      setNewRootNodeTitle('');
      setNewRootNodeDescription('');
      toast({ title: "Root Node Added", description: `"${newNode.title}" added to the mindmap.` });

      // Center view on the new node after a short delay to allow state updates
      setTimeout(() => {
        if (viewportContainerRef.current) {
          const viewportWidth = viewportContainerRef.current.clientWidth;
          const viewportHeight = viewportContainerRef.current.clientHeight;
          const newPanX = (viewportWidth / 2) - (newNode.x + NODE_CARD_WIDTH / 2) * scale;
          const newPanY = (viewportHeight / 2) - (newNode.y + NODE_APPROX_MIN_HEIGHT / 2) * scale; // Use approx height
          setPan({x: newPanX, y: newPanY});
        }
      }, 100);
    }
  }, [newRootNodeTitle, newRootNodeDescription, mindmap, addNode, toast, scale, setPan]);

  const handleAddChildNode = useCallback((parentId: string) => {
    if (!mindmap) return;
    const parentNode = mindmap.data.nodes[parentId];
    if (!parentNode) return;

    // Create a temporary node for the dialog; actual add happens on save
    const tempNewNode: NodeData = {
      id: `temp-${uuidv4()}`, // Temporary ID
      title: '', // Will be filled in dialog
      description: "",
      emoji: "➕",
      parentId: parentId,
      childIds: [],
      // Initial x,y relative to parent, will be confirmed/adjusted by addNode
      x: parentNode.x + NODE_CARD_WIDTH / 4,
      y: parentNode.y + NODE_APPROX_MIN_HEIGHT + 50,
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

    if (editingNode.id.startsWith('temp-')) { // This is a new node
      const permanentNode = addNode(mindmap.id, editingNode.parentId, data); // parentId is from tempNewNode
      if (permanentNode) {
        toast({ title: "Node Created", description: `Node "${permanentNode.title}" added.` });
         setTimeout(() => { // Center on new child node
            if (viewportContainerRef.current) {
                const viewportWidth = viewportContainerRef.current.clientWidth;
                const viewportHeight = viewportContainerRef.current.clientHeight;
                const newPanX = (viewportWidth / 2) - (permanentNode.x + NODE_CARD_WIDTH / 2) * scale;
                const newPanY = (viewportHeight / 2) - (permanentNode.y + NODE_APPROX_MIN_HEIGHT / 2) * scale;
                setPan({x: newPanX, y: newPanY});
            }
        }, 100);
      }
    } else { // This is an existing node
      updateNode(mindmap.id, nodeId, data);
      toast({ title: "Node Updated", description: `Node "${data.title}" saved.` });
    }
    setEditingNode(null);
    setIsEditDialogOpen(false);
  }, [mindmap, editingNode, addNode, updateNode, toast, scale, setPan]);


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
    // Recenter view after deletion, in case the deleted node was central
    setTimeout(() => handleRecenterView(false), 100);
  }, [mindmap, nodeToDelete, deleteNodeFromHook, toast, handleRecenterView]);


  const handleNodeDragStart = useCallback((event: React.DragEvent<HTMLDivElement>, nodeId: string) => {
    if (activeTool === 'pan' || !mindmap || !viewportContainerRef.current) {
      event.preventDefault();
      return;
    }

    const draggedNodeData = mindmap.data.nodes[nodeId];
    if (!draggedNodeData) return;

    const viewportContainerRect = viewportContainerRef.current.getBoundingClientRect();

    // Calculate mouse position in screen space relative to the viewport container's top-left
    const mouseXInContainer = event.clientX - viewportContainerRect.left;
    const mouseYInContainer = event.clientY - viewportContainerRect.top;

    // Transform this screen space position into logical canvas space (relative to canvasContentRef's 0,0)
    const mouseXLogical = (mouseXInContainer - pan.x) / scale;
    const mouseYLogical = (mouseYInContainer - pan.y) / scale;

    // dragOffset is the mouse's logical position relative to the node's logical top-left
    setDragOffset({
      x: mouseXLogical - draggedNodeData.x,
      y: mouseYLogical - draggedNodeData.y,
    });

    setDraggedNodeId(nodeId);
    event.dataTransfer.effectAllowed = "move";
    // Setting some data is often required for drag to work properly, even if not used by drop
    event.dataTransfer.setData("text/plain", nodeId);
  }, [mindmap, pan, scale, activeTool]);


  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault(); // Necessary to allow dropping
    if (draggedNodeId) {
      event.dataTransfer.dropEffect = "move";
    }
  }, [draggedNodeId]);


  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!draggedNodeId || !mindmap || !viewportContainerRef.current) return;

    const viewportRect = viewportContainerRef.current.getBoundingClientRect();

    // Mouse position in screen space relative to the viewport container's top-left
    const mouseXInViewportContainer = event.clientX - viewportRect.left;
    const mouseYInViewportContainer = event.clientY - viewportRect.top;

    // Convert this screen position to logical canvas coordinates
    let newXLogical = (mouseXInViewportContainer - pan.x) / scale - dragOffset.x;
    let newYLogical = (mouseYInViewportContainer - pan.y) / scale - dragOffset.y;

    // No clamping to 0,0. Nodes can be moved to negative coordinates.
    // newXLogical = Math.max(0, newXLogical);
    // newYLogical = Math.max(0, newYLogical);

    updateNodePosition(mindmap.id, draggedNodeId, newXLogical, newYLogical);
    setDraggedNodeId(null);
  }, [draggedNodeId, mindmap, pan, scale, dragOffset, updateNodePosition]);


  const handleExportJson = useCallback(() => {
    if (!mindmap) return;
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(mindmap, null, 2)
    )}`;
    const link = document.createElement("a");
    link.href = jsonString;
    link.download = `${mindmap.name.replace(/\s+/g, '_').toLowerCase()}_mindmap.json`;
    link.click();
    toast({ title: "Exported", description: "Mindmap data exported as JSON." });
  }, [mindmap, toast]);


  if (!mindmap) {
    return (
      <div className="flex flex-col items-center justify-center h-full flex-grow space-y-4 text-center py-10">
        <AlertTriangle className="w-16 h-16 text-destructive" />
        <h2 className="text-2xl font-bold">Mindmap Not Found</h2>
        <p className="text-muted-foreground">The mindmap you are looking for does not exist or has been deleted.</p>
        <Button asChild variant="outline" size="sm">
          <Link href="/">
            <ArrowLeft className="mr-1 h-3 w-3" /> Library
          </Link>
        </Button>
      </div>
    );
  }

  const allNodes = Object.values(mindmap.data.nodes);

  return (
    <TooltipProvider>
    <div className="flex flex-col h-full flex-grow w-full space-y-1">
      {/* Top Control Bar */}
      <div className="p-2 border-b bg-background/90 backdrop-blur-sm sticky top-0 z-20 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-2">
          <div className="flex items-center gap-2 flex-shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                  <Link href="/">
                    <ArrowLeft className="h-4 w-4" />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent><p>Back to Library</p></TooltipContent>
            </Tooltip>
            <h1 className="text-lg font-semibold text-foreground truncate" title={mindmap.name}>
              {mindmap.name}
            </h1>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
             <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        variant={activeTool === 'pan' ? "secondary" : "ghost"}
                        size="icon"
                        onClick={() => setActiveTool(prev => prev === 'pan' ? 'select' : 'pan')}
                        className="h-8 w-8"
                    >
                        <Hand className="h-4 w-4" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent><p>Hand Tool (Pan Canvas)</p></TooltipContent>
            </Tooltip>
             <Tooltip>
                <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={() => handleZoom('in')} className="h-8 w-8">
                        <ZoomIn className="h-4 w-4" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent><p>Zoom In</p></TooltipContent>
            </Tooltip>
            <Tooltip>
                <TooltipTrigger asChild>
                     <Button variant="ghost" size="icon" onClick={() => handleZoom('out')} className="h-8 w-8">
                        <ZoomOut className="h-4 w-4" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent><p>Zoom Out</p></TooltipContent>
            </Tooltip>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={() => handleRecenterView(false)} className="h-8 w-8">
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

      {/* Main Canvas Area: This is the viewport that clips the content */}
      <div
        ref={viewportContainerRef}
        className={cn(
          "flex-grow relative overflow-hidden bg-muted/20", // Slightly more subtle background
          "min-h-[calc(100vh-220px)] sm:min-h-[calc(100vh-200px)]" // Adjusted for new header height
        )}
        onMouseDown={handlePanMouseDown}
        onDragOver={handleDragOver} // Keep for node dragging
        onDrop={handleDrop} // Keep for node dropping
      >
        {/* This div is transformed for pan/zoom and holds all nodes and SVG lines */}
        <div
            ref={canvasContentRef}
            className="relative"
            style={{
                width: CANVAS_CONTENT_WIDTH,
                height: CANVAS_CONTENT_HEIGHT,
                transformOrigin: '0 0',
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                pointerEvents: 'auto', // All interactions happen on this layer
            }}
        >
            {/* Render Nodes */}
            {allNodes.map((node) => (
                <NodeCard
                  key={node.id}
                  node={node}
                  isRoot={!node.parentId}
                  onEdit={handleEditNode}
                  onDelete={requestDeleteNode}
                  onAddChild={handleAddChildNode}
                  onDragStart={(e, id) => handleNodeDragStart(e, id)}
                  className="node-card-draggable" // Class to identify nodes for pan prevention
                />
            ))}

            {/* Render Connecting Lines */}
            <svg
                className="absolute top-0 left-0 pointer-events-none" // Lines should not intercept mouse events
                style={{
                  width: CANVAS_CONTENT_WIDTH,
                  height: CANVAS_CONTENT_HEIGHT,
                  overflow: 'visible', // Allow lines to draw outside nominal SVG bounds if nodes are dragged there
                }}
                // Keying the SVG to force re-render on critical changes that affect line drawing
                key={`lines-svg-${allNodes.length}-${scale}-${pan.x}-${pan.y}`}
            >
                {allNodes.map(node => {
                  if (!node.parentId) return null;
                  const parentNode = mindmap.data.nodes[node.parentId];
                  if (!parentNode) return null;

                  // Anchor points for lines (center of header for start, top-center for end)
                  const startX = parentNode.x + NODE_CARD_WIDTH / 2;
                  let startY = parentNode.y + NODE_HEADER_HEIGHT / 2; // Middle of the header
                  if(parentNode.imageUrl) startY = parentNode.y + NODE_HEADER_HEIGHT; // if image, start from bottom of header


                  const endX = node.x + NODE_CARD_WIDTH / 2;
                  const endY = node.y; // Top of the child node card

                  // Control points for S-curve (cubic Bezier)
                  // Adjust curviness based on vertical distance
                  const sCurveOffsetY = Math.max(20, Math.min(80, Math.abs(endY - startY) / 2));
                  const pathData = `M ${startX} ${startY} C ${startX} ${startY + sCurveOffsetY}, ${endX} ${endY - sCurveOffsetY}, ${endX} ${endY}`;

                  let strokeColor = "hsl(var(--accent))"; // Default for child-to-child
                  if (parentNode.customBackgroundColor) {
                    strokeColor = `hsl(var(--${parentNode.customBackgroundColor}))`;
                  } else if (!parentNode.parentId) { // Parent is a root node with no custom color
                    strokeColor = "hsl(var(--primary))";
                  }


                  return (
                    <path
                      key={`${parentNode.id}-${node.id}`}
                      d={pathData}
                      stroke={strokeColor}
                      strokeWidth={Math.max(0.5, 2 / scale)} // Make lines thinner on zoom, but not too thin
                      fill="none"
                    />
                  );
                })}
            </svg>

            {allNodes.length === 0 && (
                <div
                  className="absolute flex items-center justify-center pointer-events-none text-center"
                  style={{
                    // Position this message in the center of the logical canvas, then adjust for pan/scale
                    top: `calc(${CANVAS_CONTENT_HEIGHT} / 2)`,
                    left: `calc(${CANVAS_CONTENT_WIDTH} / 2)`,
                    transform: `translate(calc(-50% - ${pan.x / scale}px), calc(-50% - ${pan.y / scale}px)) scale(${1/scale})`,
                    width: '300px' // Give the message div a width
                   }}
                >
                  <div className="text-muted-foreground text-lg bg-background/80 p-6 rounded-md shadow-lg">
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
            if (!open) setEditingNode(null); // Clear editingNode when dialog closes
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
