
"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Mindmap, NodeData, EditNodeInput } from '@/types/mindmap';
import { useMindmaps } from '@/hooks/useMindmaps';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NodeCard } from './NodeCard';
import { EditNodeDialog } from './EditNodeDialog';
import { PlusCircle, Download, ArrowLeft, AlertTriangle, Hand, Search, ZoomIn, ZoomOut, LocateFixed } from 'lucide-react';
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

interface MindmapEditorProps {
  mindmapId: string;
}

const NODE_CARD_WIDTH = 300;
const NODE_HEADER_HEIGHT = 50; 
const CANVAS_CONTENT_WIDTH = '1200px';
const CANVAS_CONTENT_HEIGHT = '1200px';

const MIN_SCALE = 0.25;
const MAX_SCALE = 2;

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

  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const [activeTool, setActiveTool] = useState<'select' | 'pan'>('select');
  const [initialViewCentered, setInitialViewCentered] = useState(false);


  const calculateFitScaleAndPan = useCallback(() => {
    if (!mindmap || Object.keys(mindmap.data.nodes).length === 0 || !viewportContainerRef.current) {
      return { newScale: 1, newPan: { x: 0, y: 0 } };
    }

    const nodes = Object.values(mindmap.data.nodes);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    nodes.forEach(node => {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + NODE_CARD_WIDTH); // Consider node width
      maxY = Math.max(maxY, node.y + NODE_HEADER_HEIGHT + (node.description ? 100 : 20) + ( (node as any).imageUrl ? (NODE_CARD_WIDTH * 9/16) : 0) ); // Approx height
    });
    
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    
    if (contentWidth <= 0 || contentHeight <= 0) {
         return { newScale: 1, newPan: { x: (viewportContainerRef.current.clientWidth / 2) - ( (mindmap.data.nodes[mindmap.data.rootNodeIds[0]]?.x ?? 0) + NODE_CARD_WIDTH / 2), 
                                       y: (viewportContainerRef.current.clientHeight / 2) - ( (mindmap.data.nodes[mindmap.data.rootNodeIds[0]]?.y ?? 0) + NODE_HEADER_HEIGHT / 2) } };
    }

    const viewportWidth = viewportContainerRef.current.clientWidth;
    const viewportHeight = viewportContainerRef.current.clientHeight;
    
    const padding = 50; // px
    const scaleX = (viewportWidth - 2 * padding) / contentWidth;
    const scaleY = (viewportHeight - 2 * padding) / contentHeight;
    let newScale = Math.min(scaleX, scaleY, MAX_SCALE);
    newScale = Math.max(newScale, MIN_SCALE);

    const contentCenterX = minX + contentWidth / 2;
    const contentCenterY = minY + contentHeight / 2;

    const newPanX = (viewportWidth / 2) - (contentCenterX * newScale);
    const newPanY = (viewportHeight / 2) - (contentCenterY * newScale);

    return { newScale, newPan: { x: newPanX, y: newPanY } };
  }, [mindmap]);


  const handleRecenterView = useCallback(() => {
    if (!viewportContainerRef.current) return;
    const { newScale, newPan } = calculateFitScaleAndPan();
    setScale(newScale);
    setPan(newPan);
  }, [calculateFitScaleAndPan]);


  useEffect(() => {
    if (mindmap && !initialViewCentered && viewportContainerRef.current) {
      handleRecenterView();
      setInitialViewCentered(true);
    }
  }, [mindmap, initialViewCentered, handleRecenterView]);


  const handleZoom = useCallback((zoomIn: boolean) => {
    const zoomFactor = 0.1;
    const newScale = zoomIn ? scale * (1 + zoomFactor) : scale * (1 - zoomFactor);
    const clampedScale = Math.max(MIN_SCALE, Math.min(newScale, MAX_SCALE));

    if (!viewportContainerRef.current) return;
    const viewportRect = viewportContainerRef.current.getBoundingClientRect();
    const viewportCenterX = viewportRect.width / 2;
    const viewportCenterY = viewportRect.height / 2;

    // Calculate the point on the canvas that is currently at the center of the viewport
    const canvasPointX = (viewportCenterX - pan.x) / scale;
    const canvasPointY = (viewportCenterY - pan.y) / scale;

    // Calculate new pan to keep this canvas point at the center after zooming
    const newPanX = viewportCenterX - (canvasPointX * clampedScale);
    const newPanY = viewportCenterY - (canvasPointY * clampedScale);
    
    setScale(clampedScale);
    setPan({ x: newPanX, y: newPanY });
  }, [scale, pan]);


  const handleAddRootNode = useCallback(async () => {
    if (newRootNodeTitle.trim() === '') {
      toast({ title: "Title Required", description: "Please enter a title for the new root node.", variant: "destructive" });
      return;
    }
    if (!mindmap) return;
    const newNode = addNode(mindmap.id, null, { title: newRootNodeTitle, description: newRootNodeDescription, emoji: '💡' });
    if (newNode) {
      setNewRootNodeTitle('');
      setNewRootNodeDescription('');
      toast({ title: "Root Node Added", description: `"${newNode.title}" added to the mindmap.` });
      
      // Center view on new node
      setTimeout(() => {
        if (viewportContainerRef.current) {
          const newPanX = (viewportContainerRef.current.clientWidth / 2) - ((newNode.x + NODE_CARD_WIDTH / 2) * scale);
          const newPanY = (viewportContainerRef.current.clientHeight / 2) - ((newNode.y + NODE_HEADER_HEIGHT / 2) * scale);
          setPan({x: newPanX, y: newPanY});
        }
      }, 100);
    }
  }, [newRootNodeTitle, newRootNodeDescription, mindmap, addNode, toast, scale]);

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
      x: (parentNode.x ?? 0), 
      y: (parentNode.y ?? 0) + NODE_HEADER_HEIGHT + 100, 
    };
    setEditingNode(tempNewNode);
    setIsEditDialogOpen(true);
  }, [mindmap]);

  const handleSaveNode = useCallback((nodeId: string, data: EditNodeInput) => {
    if (!mindmap || !editingNode) return;
    if (editingNode.id.startsWith('temp-')) {
      const permanentNode = addNode(mindmap.id, editingNode.parentId, data);
      if (permanentNode) {
        toast({ title: "Node Created", description: `Node "${permanentNode.title}" added.` });
         setTimeout(() => { 
            if (viewportContainerRef.current) {
              const newPanX = (viewportContainerRef.current.clientWidth / 2) - ((permanentNode.x + NODE_CARD_WIDTH / 2) * scale);
              const newPanY = (viewportContainerRef.current.clientHeight / 2) - ((permanentNode.y + NODE_HEADER_HEIGHT / 2) * scale);
              setPan({x: newPanX, y: newPanY});
            }
        }, 100);
      }
    } else {
      updateNode(mindmap.id, nodeId, data);
      toast({ title: "Node Updated", description: `Node "${data.title}" saved.` });
    }
    setEditingNode(null);
    setIsEditDialogOpen(false);
  }, [mindmap, editingNode, addNode, updateNode, toast, scale]);

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
    if (!canvasContentRef.current) return;
    const nodeElement = document.getElementById(`node-${nodeId}`);
    if (!nodeElement) return;
    
    const nodeRect = nodeElement.getBoundingClientRect(); // Node's current pos on screen
    // Mouse position relative to the viewportContainer
    const viewportRect = viewportContainerRef.current?.getBoundingClientRect();
    if (!viewportRect) return;

    const clientX = event.clientX;
    const clientY = event.clientY;

    // Calculate offset from node's top-left corner (in scaled/panned canvas space) to mouse click point
    // 1. Mouse position relative to viewportContainer
    const mouseXInViewport = clientX - viewportRect.left;
    const mouseYInViewport = clientY - viewportRect.top;
    
    // 2. Mouse position in logical canvas space (inverse of pan and scale)
    const mouseXInCanvas = (mouseXInViewport - pan.x) / scale;
    const mouseYInCanvas = (mouseYInViewport - pan.y) / scale;

    const node = mindmap?.data.nodes[nodeId];
    if (!node) return;

    setDragOffset({
      x: mouseXInCanvas - node.x,
      y: mouseYInCanvas - node.y,
    });

    setDraggedNodeId(nodeId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", nodeId); // Necessary for Firefox
  }, [pan, scale, mindmap]);


  const handleDragOverCanvas = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (draggedNodeId) {
      event.dataTransfer.dropEffect = "move";
    }
  }, [draggedNodeId]);

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!draggedNodeId || !mindmap || !viewportContainerRef.current ) return;

    const viewportRect = viewportContainerRef.current.getBoundingClientRect();
    
    const clientX = event.clientX;
    const clientY = event.clientY;

    // Mouse position relative to the viewportContainer's top-left corner
    const mouseXInViewport = clientX - viewportRect.left;
    const mouseYInViewport = clientY - viewportRect.top;
    
    // Convert mouse position to logical canvas coordinates (inverse of pan and scale)
    let newX = (mouseXInViewport - pan.x) / scale - dragOffset.x;
    let newY = (mouseYInViewport - pan.y) / scale - dragOffset.y;
    
    updateNodePosition(mindmap.id, draggedNodeId, newX, newY);
    setDraggedNodeId(null);
  }, [draggedNodeId, mindmap, pan, scale, dragOffset, updateNodePosition]);

  const handleExportJson = useCallback(() => {
    if (!mindmap) return;
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(mindmap, null, 2))}`;
    const link = document.createElement("a");
    link.href = jsonString;
    link.download = `${mindmap.name.replace(/\s+/g, '_').toLowerCase()}_mindmap.json`;
    link.click();
    toast({ title: "Exported", description: "Mindmap data exported as JSON." });
  }, [mindmap, toast]);

  const handlePanMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (activeTool !== 'pan' || !(e.target === viewportContainerRef.current || e.target === canvasContentRef.current)) return;
    e.preventDefault();
    setIsPanning(true);
    panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    if (viewportContainerRef.current) viewportContainerRef.current.style.cursor = 'grabbing';
  }, [activeTool, pan]);

  const handlePanMouseMove = useCallback((e: MouseEvent) => {
    if (!isPanning) return;
    e.preventDefault();
    setPan({
      x: e.clientX - panStartRef.current.x,
      y: e.clientY - panStartRef.current.y,
    });
  }, [isPanning]);

  const handlePanMouseUpOrLeave = useCallback(() => {
    if (isPanning) {
      setIsPanning(false);
      if (viewportContainerRef.current) viewportContainerRef.current.style.cursor = activeTool === 'pan' ? 'grab' : 'default';
    }
  }, [isPanning, activeTool]);

  useEffect(() => {
    window.addEventListener('mousemove', handlePanMouseMove);
    window.addEventListener('mouseup', handlePanMouseUpOrLeave);
    window.addEventListener('mouseleave', handlePanMouseUpOrLeave); // Handle leaving window
    return () => {
      window.removeEventListener('mousemove', handlePanMouseMove);
      window.removeEventListener('mouseup', handlePanMouseUpOrLeave);
      window.removeEventListener('mouseleave', handlePanMouseUpOrLeave);
    };
  }, [handlePanMouseMove, handlePanMouseUpOrLeave]);
  
  useEffect(() => {
    if (viewportContainerRef.current) {
      viewportContainerRef.current.style.cursor = activeTool === 'pan' ? (isPanning ? 'grabbing' : 'grab') : 'default';
    }
  }, [activeTool, isPanning]);


  if (!mindmap) {
    return (
      <div className="flex flex-col items-center justify-center h-full flex-grow space-y-4 text-center py-10">
        <AlertTriangle className="w-16 h-16 text-destructive" />
        <h2 className="text-2xl font-bold">Mindmap Not Found</h2>
        <p className="text-muted-foreground">The mindmap you are looking for does not exist or has been deleted.</p>
        <Button asChild variant="outline" size="sm">
          <Link href="/"><ArrowLeft className="mr-1 h-3 w-3" /> Library</Link>
        </Button>
      </div>
    );
  }
  const allNodes = Object.values(mindmap.data.nodes);

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full flex-grow w-full">
        {/* Top Control Bar */}
        <div className="p-2 border-b bg-background/80 backdrop-blur-sm sticky top-0 z-30 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mb-2">
            <div className="flex items-center gap-2 flex-shrink-0 min-w-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                    <Link href="/"><ArrowLeft className="h-4 w-4" /></Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Back to Library</p></TooltipContent>
              </Tooltip>
              <h1 className="text-lg font-semibold text-foreground truncate" title={mindmap.name}>
                {mindmap.name}
              </h1>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className={cn("h-8 w-8", activeTool === 'pan' && 'bg-accent text-accent-foreground')} onClick={() => setActiveTool(activeTool === 'pan' ? 'select' : 'pan')}>
                    <Hand className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Pan Tool (Spacebar)</p></TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleZoom(true)}>
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Zoom In</p></TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleZoom(false)}>
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Zoom Out</p></TooltipContent>
              </Tooltip>
               <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleRecenterView}>
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

        {/* Main Canvas Area - Fixed Viewport, Transformed Content */}
        <div
          ref={viewportContainerRef}
          className="flex-grow relative overflow-hidden bg-muted/20 min-h-[calc(100vh-160px)] sm:min-h-[calc(100vh-140px)]"
          onMouseDown={handlePanMouseDown}
          onDragOver={handleDragOverCanvas} // For node drop
          onDrop={handleDrop} // For node drop
        >
            <div
                ref={canvasContentRef}
                className="relative" 
                style={{
                    width: CANVAS_CONTENT_WIDTH,
                    height: CANVAS_CONTENT_HEIGHT,
                    transform: \`scale(\${scale}) translate(\${pan.x / scale}px, \${pan.y / scale}px)\`,
                    transformOrigin: '0 0',
                    pointerEvents: isPanning ? 'none' : 'auto', // Prevent node interaction during pan
                    overflow: 'visible', // Ensure SVG lines are visible
                }}
                // No onDrop or onDragOver here, handled by viewportContainerRef if it's simpler
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
                    onDragStart={handleNodeDragStart}
                    className="node-card-draggable" // Ensure this class is on the card for pan detection
                />
                ))}

                {/* Render Connecting Lines */}
                <svg
                className="absolute top-0 left-0 pointer-events-none"
                style={{
                    width: CANVAS_CONTENT_WIDTH, // SVG should cover the whole logical canvas
                    height: CANVAS_CONTENT_HEIGHT,
                    overflow: 'visible', 
                }}
                // Keying the SVG on all relevant node properties that affect lines
                key={`lines-svg-\${allNodes.map(n => \`\${n.id}-\${n.x}-\${n.y}-\${n.customBackgroundColor || ''}\`).join()}-\${scale}`}
                >
                {allNodes.map(node => {
                    if (!node.parentId) return null;
                    const parentNode = mindmap.data.nodes[node.parentId];
                    if (!parentNode) return null;

                    const startX = (parentNode.x ?? 0) + NODE_CARD_WIDTH / 2;
                    let startY = (parentNode.y ?? 0) + NODE_HEADER_HEIGHT / 2;
                   
                    const endX = (node.x ?? 0) + NODE_CARD_WIDTH / 2;
                    const endY = (node.y ?? 0);

                    // S-curve calculation
                    const controlPointOffset = Math.max(20, Math.min(80, Math.abs(endY - startY) / 2));
                    const pathData = \`M \${startX} \${startY} C \${startX} \${startY + controlPointOffset}, \${endX} \${endY - controlPointOffset}, \${endX} \${endY}\`;
                    
                    let strokeColor = "hsl(var(--accent))"; 
                    if (parentNode.customBackgroundColor) {
                        strokeColor = \`hsl(var(--\${parentNode.customBackgroundColor}))\`;
                    } else if (!parentNode.parentId) { // Parent is a root node
                        strokeColor = "hsl(var(--primary))";
                    }

                    return (
                    <path
                        key={`${parentNode.id}-${node.id}`}
                        d={pathData}
                        stroke={strokeColor}
                        strokeWidth={2 / scale} // Adjust stroke width based on scale
                        fill="none"
                    />
                    );
                })}
                </svg>

                {allNodes.length === 0 && (
                  <div
                    className="absolute flex items-center justify-center pointer-events-none text-center"
                    style={{
                      // Center message in the viewport, considering pan and scale
                      top: \`calc(50% - \${pan.y / scale}px)\`, 
                      left: \`calc(50% - \${pan.x / scale}px)\`,
                      transform: \`translate(-50%, -50%) scale(\${1 / scale})\`, 
                      width: 'auto',
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
