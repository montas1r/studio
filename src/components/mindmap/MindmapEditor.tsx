
"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Mindmap, NodeData, EditNodeInput } from '@/types/mindmap';
import { useMindmaps } from '@/hooks/useMindmaps';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NodeCard } from './NodeCard';
import { EditNodeDialog } from './EditNodeDialog';
import { PlusCircle, Download, ArrowLeft, AlertTriangle, Hand, ZoomIn, ZoomOut, LocateFixed } from 'lucide-react';
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

const NODE_CARD_WIDTH = 300; // Approximate, for layout calculations
const NODE_HEADER_HEIGHT = 50; // Approximate, for layout calculations
const CANVAS_CONTENT_WIDTH = '8000px'; // Large logical canvas size
const CANVAS_CONTENT_HEIGHT = '8000px'; // Large logical canvas size

const MIN_ZOOM_FACTOR = 0.1; // Minimum scale factor
const MAX_ZOOM_FACTOR = 2.5; // Maximum scale factor
const ZOOM_STEP_FACTOR = 1.2; // How much to zoom in/out with buttons

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
  const panStartRef = useRef({ x: 0, y: 0 });
  const [activeTool, setActiveTool] = useState<'select' | 'pan'>('select');
  const [initialViewCentered, setInitialViewCentered] = useState(false);

  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const getNodesBoundingBox = useCallback(() => {
    if (!mindmap || Object.keys(mindmap.data.nodes).length === 0) {
      return null;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    Object.values(mindmap.data.nodes).forEach(node => {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + NODE_CARD_WIDTH); // Assuming fixed width for simplicity
      // Estimate node height based on description; can be refined
      const approxNodeHeight = NODE_HEADER_HEIGHT + (node.description ? 50 : 0) + (node.description?.split('\n').length || 1) * 15;
      maxY = Math.max(maxY, node.y + approxNodeHeight);
    });
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }, [mindmap]);

  const calculateOptimalFit = useCallback(() => {
    if (!viewportContainerRef.current) return { scale: 1, pan: { x: 0, y: 0 } };

    const viewportWidth = viewportContainerRef.current.clientWidth;
    const viewportHeight = viewportContainerRef.current.clientHeight;
    const padding = 50; // Padding around the nodes when fitting

    const nodesBoundingBox = getNodesBoundingBox();

    if (!nodesBoundingBox || nodesBoundingBox.width === 0 || nodesBoundingBox.height === 0) {
      // No nodes or zero-size bounding box, center logical 0,0
      return {
        scale: 1,
        pan: {
          x: viewportWidth / 2,
          y: viewportHeight / 2,
        }
      };
    }

    const scaleX = (viewportWidth - 2 * padding) / nodesBoundingBox.width;
    const scaleY = (viewportHeight - 2 * padding) / nodesBoundingBox.height;
    const newScale = Math.max(MIN_ZOOM_FACTOR, Math.min(MAX_ZOOM_FACTOR, Math.min(scaleX, scaleY)));

    const bbCenterX = nodesBoundingBox.minX + nodesBoundingBox.width / 2;
    const bbCenterY = nodesBoundingBox.minY + nodesBoundingBox.height / 2;

    const newPanX = (viewportWidth / 2) - (bbCenterX * newScale);
    const newPanY = (viewportHeight / 2) - (bbCenterY * newScale);

    return { scale: newScale, pan: { x: newPanX, y: newPanY } };
  }, [getNodesBoundingBox]);


  const handleRecenterView = useCallback(() => {
    const { scale: newScale, pan: newPan } = calculateOptimalFit();
    setScale(newScale);
    setPan(newPan);
  }, [calculateOptimalFit]);


  useEffect(() => {
    if (mindmap && !initialViewCentered && viewportContainerRef.current) {
      handleRecenterView();
      setInitialViewCentered(true);
    }
  }, [mindmap, initialViewCentered, handleRecenterView]);


  const handleZoom = useCallback((zoomFactor: number, clientX?: number, clientY?: number) => {
    if (!viewportContainerRef.current) return;

    const viewportRect = viewportContainerRef.current.getBoundingClientRect();
    const pointerX = clientX === undefined ? viewportRect.width / 2 : clientX - viewportRect.left;
    const pointerY = clientY === undefined ? viewportRect.height / 2 : clientY - viewportRect.top;

    const currentScale = scale;
    let newScale = currentScale * zoomFactor;

    // Apply min/max zoom limits based on fixed factors
    newScale = Math.max(MIN_ZOOM_FACTOR, Math.min(MAX_ZOOM_FACTOR, newScale));
    
    if (newScale === currentScale) return; // No change in scale

    const panX = pan.x - (pointerX - pan.x) * (newScale / currentScale - 1);
    const panY = pan.y - (pointerY - pan.y) * (newScale / currentScale - 1);

    setScale(newScale);
    setPan({ x: panX, y: panY });

  }, [scale, pan]);


  const handlePanMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (activeTool !== 'pan' || !viewportContainerRef.current) return;
    // Check if the click is on the background, not on a node card
    if ((event.target as HTMLElement).closest('.node-card-draggable')) {
      return;
    }
    event.preventDefault();
    setIsPanning(true);
    panStartRef.current = { x: event.clientX - pan.x, y: event.clientY - pan.y };
    if (viewportContainerRef.current) {
        viewportContainerRef.current.style.cursor = 'grabbing';
    }
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
      if (viewportContainerRef.current && activeTool === 'pan') {
          viewportContainerRef.current.style.cursor = 'grab';
      } else if (viewportContainerRef.current) {
          viewportContainerRef.current.style.cursor = 'default';
      }
    }
  }, [isPanning, activeTool]);

  useEffect(() => {
    if (activeTool === 'pan' && viewportContainerRef.current) {
      viewportContainerRef.current.style.cursor = isPanning ? 'grabbing' : 'grab';
    } else if (viewportContainerRef.current) {
      viewportContainerRef.current.style.cursor = 'default';
    }
  }, [activeTool, isPanning]);

  useEffect(() => {
    window.addEventListener('mousemove', handlePanMouseMove);
    window.addEventListener('mouseup', handlePanMouseUpOrLeave);
    window.addEventListener('mouseleave', handlePanMouseUpOrLeave);
    return () => {
      window.removeEventListener('mousemove', handlePanMouseMove);
      window.removeEventListener('mouseup', handlePanMouseUpOrLeave);
      window.removeEventListener('mouseleave', handlePanMouseUpOrLeave);
    };
  }, [handlePanMouseMove, handlePanMouseUpOrLeave]);


  const handleAddRootNode = useCallback(async () => {
    if (newRootNodeTitle.trim() === '') {
      toast({ title: "Title Required", description: "Please enter a title for the new root node.", variant: "destructive" });
      return;
    }
    if (!mindmap || !viewportContainerRef.current ) return;

    const newNode = addNode(mindmap.id, null, { title: newRootNodeTitle, description: newRootNodeDescription, emoji: '💡' });

    if (newNode) {
      setNewRootNodeTitle('');
      setNewRootNodeDescription('');
      toast({ title: "Root Node Added", description: `"${newNode.title}" added to the mindmap.` });
      
      // Pan to the new node after it's added and state updates
      setTimeout(() => {
        const viewportWidth = viewportContainerRef.current?.clientWidth || 0;
        const viewportHeight = viewportContainerRef.current?.clientHeight || 0;
        
        // Calculate pan to center the new node
        const newPanX = (viewportWidth / 2) - (newNode.x + NODE_CARD_WIDTH / 2) * scale;
        const newPanY = (viewportHeight / 2) - (newNode.y + NODE_HEADER_HEIGHT / 2) * scale;
        
        setPan({x: newPanX, y: newPanY});
        if (scale < MIN_ZOOM_FACTOR * 1.5) { // If very zoomed out, zoom in a bit
             setScale(Math.min(MAX_ZOOM_FACTOR, Math.max(MIN_ZOOM_FACTOR, 0.5)));
        }
      }, 100);
    }
  }, [newRootNodeTitle, newRootNodeDescription, mindmap, addNode, toast, scale, setPan]);

  const handleAddChildNode = useCallback((parentId: string) => {
    if (!mindmap) return;
    const parentNode = mindmap.data.nodes[parentId];
    if (!parentNode) return;

    const tempNewNode: NodeData = {
      id: `temp-${uuidv4()}`,
      title: '', // Will be filled in dialog
      description: "",
      emoji: "➕",
      parentId: parentId,
      childIds: [],
      // Calculate temporary position based on parent, this will be refined by addNode
      x: parentNode.x + NODE_CARD_WIDTH / 4, 
      y: parentNode.y + NODE_HEADER_HEIGHT + 80, 
    };
    setEditingNode(tempNewNode);
    setIsEditDialogOpen(true);
  }, [mindmap, setEditingNode, setIsEditDialogOpen]);


  const handleEditNode = useCallback((node: NodeData) => {
    setEditingNode(node);
    setIsEditDialogOpen(true);
  }, [setEditingNode, setIsEditDialogOpen]);

  const handleSaveNode = useCallback((nodeId: string, data: EditNodeInput) => {
    if (!mindmap || !editingNode) return;

    if (editingNode.id.startsWith('temp-')) { // Creating a new node
      const permanentNode = addNode(mindmap.id, editingNode.parentId, data); // x,y will be set by addNode
      if (permanentNode) {
        toast({ title: "Node Created", description: `Node "${permanentNode.title}" added.` });
        // Pan to new child node
         setTimeout(() => {
            if (viewportContainerRef.current) {
                const viewportWidth = viewportContainerRef.current.clientWidth;
                const viewportHeight = viewportContainerRef.current.clientHeight;
                const newPanX = (viewportWidth / 2) - (permanentNode.x + NODE_CARD_WIDTH / 2) * scale;
                const newPanY = (viewportHeight / 2) - (permanentNode.y + NODE_HEADER_HEIGHT / 2) * scale;
                setPan({x: newPanX, y: newPanY});
            }
        }, 100);
      }
    } else { // Updating an existing node
      updateNode(mindmap.id, nodeId, data);
      toast({ title: "Node Updated", description: `Node "${data.title}" saved.` });
    }
    setEditingNode(null);
    setIsEditDialogOpen(false);
  }, [mindmap, editingNode, addNode, updateNode, toast, setEditingNode, setIsEditDialogOpen, scale, setPan]);

  const requestDeleteNode = useCallback((nodeId: string) => {
    if (!mindmap) return;
    const node = mindmap.data.nodes[nodeId];
    if (node) {
      setNodeToDelete({ id: nodeId, title: node.title });
      setIsDeleteDialogOpen(true);
    }
  }, [mindmap, setNodeToDelete, setIsDeleteDialogOpen]);

  const confirmDeleteNode = useCallback(() => {
    if (!mindmap || !nodeToDelete) return;
    deleteNodeFromHook(mindmap.id, nodeToDelete.id);
    toast({ title: "Node Deleted", description: `Node "${nodeToDelete.title || 'Untitled'}" and its children removed.`, variant: "destructive" });
    setIsDeleteDialogOpen(false);
    setNodeToDelete(null);
    // After deletion, recenter view might be useful
    setTimeout(handleRecenterView, 100);
  }, [mindmap, nodeToDelete, deleteNodeFromHook, toast, setIsDeleteDialogOpen, setNodeToDelete, handleRecenterView]);

  const handleNodeDragStart = useCallback((event: React.DragEvent<HTMLDivElement>, nodeId: string) => {
     if (activeTool === 'pan') { // Don't drag nodes if pan tool is active
        event.preventDefault();
        return;
     }
    if (!viewportContainerRef.current || !mindmap) return;

    const nodeElement = event.currentTarget; // The div that is being dragged (NodeCard)
    const nodeRect = nodeElement.getBoundingClientRect(); // Position relative to viewport

    // Mouse position relative to the viewport
    const clientX = event.clientX;
    const clientY = event.clientY;
    
    const draggedNodeData = mindmap.data.nodes[nodeId];
    if (!draggedNodeData) return;

    // Calculate initial offset of mouse from node's top-left corner in logical space
    // Node's logical (x,y) needs to be converted to viewport space first to find diff
    const nodeViewportX = draggedNodeData.x * scale + pan.x;
    const nodeViewportY = draggedNodeData.y * scale + pan.y;
    
    setDragOffset({
      x: (clientX - nodeViewportX) / scale,
      y: (clientY - nodeViewportY) / scale,
    });
    
    setDraggedNodeId(nodeId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", nodeId); // Necessary for drag to work
  }, [mindmap, pan, scale, activeTool]);


  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (draggedNodeId) {
      event.dataTransfer.dropEffect = "move";
    }
  }, [draggedNodeId]);

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!draggedNodeId || !mindmap || !viewportContainerRef.current) return;

    const viewportRect = viewportContainerRef.current.getBoundingClientRect();
    const clientX = event.clientX;
    const clientY = event.clientY;

    // Mouse position relative to the viewport container (where drop occurs)
    const mouseXInViewport = clientX - viewportRect.left;
    const mouseYInViewport = clientY - viewportRect.top;

    // Convert viewport mouse position to logical canvas coordinates
    // This is where the top-left of the node should be after applying the offset
    let newX = (mouseXInViewport - pan.x) / scale - dragOffset.x;
    let newY = (mouseYInViewport - pan.y) / scale - dragOffset.y;
    
    // Keep nodes within the defined canvas origin (0,0) if desired, or allow negative
    // For "fixed" canvas, we constrain to 0,0 at top-left
    newX = Math.max(0, newX);
    newY = Math.max(0, newY);

    updateNodePosition(mindmap.id, draggedNodeId, newX, newY);
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
      <div className="p-1 border-b bg-background/80 backdrop-blur-sm rounded-t-lg sticky top-0 z-20">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <div className="flex items-center gap-2 flex-shrink-0">
             <Tooltip>
                <TooltipTrigger asChild>
                     <Button asChild variant="outline" size="icon" className="h-7 w-7">
                        <Link href="/">
                            <ArrowLeft className="h-4 w-4" />
                        </Link>
                     </Button>
                </TooltipTrigger>
                <TooltipContent><p>Back to Library</p></TooltipContent>
            </Tooltip>
            <h1 className="text-base font-semibold text-foreground truncate" title={mindmap.name}>
              {mindmap.name}
            </h1>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button variant={activeTool === 'pan' ? "default" : "outline"} size="icon" onClick={() => setActiveTool(prev => prev === 'pan' ? 'select' : 'pan')} className="h-7 w-7">
                        <Hand className="h-4 w-4" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent><p>Hand Tool (Pan Canvas)</p></TooltipContent>
            </Tooltip>
             <Tooltip>
                <TooltipTrigger asChild>
                    <Button variant="outline" size="icon" onClick={() => handleZoom(ZOOM_STEP_FACTOR)} className="h-7 w-7">
                        <ZoomIn className="h-4 w-4" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent><p>Zoom In</p></TooltipContent>
            </Tooltip>
            <Tooltip>
                <TooltipTrigger asChild>
                     <Button variant="outline" size="icon" onClick={() => handleZoom(1 / ZOOM_STEP_FACTOR)} className="h-7 w-7">
                        <ZoomOut className="h-4 w-4" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent><p>Zoom Out</p></TooltipContent>
            </Tooltip>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button variant="outline" size="icon" onClick={handleRecenterView} className="h-7 w-7">
                        <LocateFixed className="h-4 w-4" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent><p>Recenter View</p></TooltipContent>
            </Tooltip>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button variant="outline" size="icon" onClick={handleExportJson} className="h-7 w-7">
                        <Download className="h-4 w-4" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent><p>Export JSON</p></TooltipContent>
            </Tooltip>
          </div>
        </div>
        <div className="mt-1 flex flex-col sm:flex-row items-stretch gap-1">
          <Input
            type="text"
            value={newRootNodeTitle}
            onChange={(e) => setNewRootNodeTitle(e.target.value)}
            placeholder="New Root Idea Title"
            className="flex-grow h-8 text-xs"
          />
          <Textarea
            value={newRootNodeDescription}
            onChange={(e) => setNewRootNodeDescription(e.target.value)}
            placeholder="Description (Optional)"
            rows={1}
            className="flex-grow text-xs min-h-[32px] h-8 resize-none"
          />
          <Button onClick={handleAddRootNode} size="sm" className="h-8 text-xs whitespace-nowrap">
            <PlusCircle className="mr-1 h-3 w-3" /> Add Root Idea
          </Button>
        </div>
      </div>

      {/* Main Canvas Area - Fixed Viewport with Transformable Content */}
      <div
        ref={viewportContainerRef}
        className={cn(
            "flex-grow relative overflow-hidden bg-muted/20 border-2 border-dashed border-destructive rounded-b-lg",
            activeTool === 'pan' ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'
          )}
        onMouseDown={handlePanMouseDown}
        onDragOver={handleDragOver} 
        onDrop={handleDrop}      
      >
        <div
            ref={canvasContentRef}
            className="absolute top-0 left-0 pointer-events-none" // Node interactions are handled by NodeCard
            style={{
                width: CANVAS_CONTENT_WIDTH,
                height: CANVAS_CONTENT_HEIGHT,
                transformOrigin: '0 0',
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
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
                  className="node-card-draggable pointer-events-auto" 
                />
            ))}

            {/* Render Connecting Lines */}
            <svg
                className="absolute top-0 left-0 w-full h-full pointer-events-none"
                style={{ width: CANVAS_CONTENT_WIDTH, height: CANVAS_CONTENT_HEIGHT }}
                 // Re-render lines if nodes, scale, or pan change
                key={`lines-svg-${allNodes.length}-${scale}-${pan.x}-${pan.y}`}
            >
                {allNodes.map(node => {
                  if (!node.parentId) return null;
                  const parentNode = mindmap.data.nodes[node.parentId];
                  if (!parentNode) return null;

                  // Center of parent card's bottom edge (approx)
                  const startX = parentNode.x + NODE_CARD_WIDTH / 2;
                  const startY = parentNode.y + NODE_HEADER_HEIGHT + (parentNode.description ? 20 : 0); // Adjust if desc exists

                  // Center of child card's top edge
                  const endX = node.x + NODE_CARD_WIDTH / 2;
                  const endY = node.y;
                  
                  // Control points for S-curve
                  // Adjust curviness based on vertical distance
                  const sCurveOffsetY = Math.max(20, Math.min(80, Math.abs(endY - startY) / 2));

                  const pathData = `M ${startX} ${startY} C ${startX} ${startY + sCurveOffsetY}, ${endX} ${endY - sCurveOffsetY}, ${endX} ${endY}`;
                  
                  const strokeColor = parentNode.parentId === null ? "hsl(var(--primary))" : "hsl(var(--accent))";

                  return (
                    <path
                      key={`${parentNode.id}-${node.id}`}
                      d={pathData}
                      stroke={strokeColor}
                      strokeWidth={Math.max(0.5, 2 / scale)} 
                      fill="none"
                    />
                  );
                })}
            </svg>

            {/* Empty Mindmap Message */}
            {allNodes.length === 0 && (
                <div
                  className="absolute flex items-center justify-center pointer-events-none text-center"
                  style={{
                    // Center message in the viewport, considering pan and scale
                    top: `calc(50% - ${pan.y / scale}px)`, 
                    left: `calc(50% - ${pan.x / scale}px)`,
                    transform: `translate(-50%, -50%) scale(${1/scale})`, 
                    width: '300px'
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
