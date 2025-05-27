
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
const CANVAS_CONTENT_WIDTH = '8000px'; 
const CANVAS_CONTENT_HEIGHT = '8000px';

const MIN_ZOOM_FACTOR = 0.2;
const MAX_ZOOM_FACTOR = 2.5;
const ZOOM_STEP_SENSITIVITY = 0.1; // For mouse wheel


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
      maxX = Math.max(maxX, node.x + NODE_CARD_WIDTH);
      const approxNodeHeight = NODE_HEADER_HEIGHT + (node.description ? 50 : 0) + (node.description?.split('\n').length || 1) * 15;
      maxY = Math.max(maxY, node.y + approxNodeHeight);
    });
     if (minX === Infinity) return null; // No valid nodes
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }, [mindmap]);

  const calculateOptimalFit = useCallback((forInitialCentering = false) => {
    if (!viewportContainerRef.current) return { scale: 1, pan: { x: 0, y: 0 } };

    const viewportWidth = viewportContainerRef.current.clientWidth;
    const viewportHeight = viewportContainerRef.current.clientHeight;
    const padding = 50;

    const nodesBoundingBox = getNodesBoundingBox();

    if (!nodesBoundingBox || nodesBoundingBox.width <= 0 || nodesBoundingBox.height <= 0) {
      return {
        scale: forInitialCentering ? 1 : scale, // Keep current scale if not initial centering empty map
        pan: {
          x: viewportWidth / 2 - (0 * (forInitialCentering ? 1 : scale)), // Center logical 0,0
          y: viewportHeight / 2 - (0 * (forInitialCentering ? 1 : scale)),
        }
      };
    }

    const scaleX = (viewportWidth - 2 * padding) / nodesBoundingBox.width;
    const scaleY = (viewportHeight - 2 * padding) / nodesBoundingBox.height;
    const newScale = Math.max(MIN_ZOOM_FACTOR, Math.min(MAX_ZOOM_FACTOR, Math.min(scaleX, scaleY, MAX_ZOOM_FACTOR))); // Cap at MAX_ZOOM_FACTOR

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


  const handleZoom = useCallback((zoomIncrement: number, clientX?: number, clientY?: number) => {
    if (!viewportContainerRef.current) return;

    const viewportRect = viewportContainerRef.current.getBoundingClientRect();
    const pointerX = clientX === undefined ? viewportRect.width / 2 : clientX - viewportRect.left;
    const pointerY = clientY === undefined ? viewportRect.height / 2 : clientY - viewportRect.top;

    const currentScale = scale;
    let newScale = currentScale + zoomIncrement;
    newScale = Math.max(MIN_ZOOM_FACTOR, Math.min(MAX_ZOOM_FACTOR, newScale));
    
    if (newScale === currentScale) return;

    const panX = pan.x - (pointerX - pan.x) * (newScale / currentScale - 1);
    const panY = pan.y - (pointerY - pan.y) * (newScale / currentScale - 1);

    setScale(newScale);
    setPan({ x: panX, y: panY });
  }, [scale, pan]);

  const handleWheelZoom = useCallback((event: WheelEvent) => {
    if (!viewportContainerRef.current || activeTool === 'pan') return; // Don't zoom if panning
    event.preventDefault();
    const zoomIncrement = -event.deltaY * ZOOM_STEP_SENSITIVITY * 0.1; // Adjust sensitivity
    handleZoom(zoomIncrement, event.clientX, event.clientY);
  }, [handleZoom, activeTool]);


  const handlePanMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (activeTool !== 'pan' || !viewportContainerRef.current) return;
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
    const currentViewport = viewportContainerRef.current;
    if (currentViewport) {
        currentViewport.addEventListener('wheel', handleWheelZoom, { passive: false });
    }
    window.addEventListener('mousemove', handlePanMouseMove);
    window.addEventListener('mouseup', handlePanMouseUpOrLeave);
    window.addEventListener('mouseleave', handlePanMouseUpOrLeave); // Handle mouse leaving window

    return () => {
      if (currentViewport) {
        currentViewport.removeEventListener('wheel', handleWheelZoom);
      }
      window.removeEventListener('mousemove', handlePanMouseMove);
      window.removeEventListener('mouseup', handlePanMouseUpOrLeave);
      window.removeEventListener('mouseleave', handlePanMouseUpOrLeave);
    };
  }, [handleWheelZoom, handlePanMouseMove, handlePanMouseUpOrLeave]);


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
      
      setTimeout(() => {
        const viewportWidth = viewportContainerRef.current?.clientWidth || 0;
        const viewportHeight = viewportContainerRef.current?.clientHeight || 0;
        const newPanX = (viewportWidth / 2) - (newNode.x + NODE_CARD_WIDTH / 2) * scale;
        const newPanY = (viewportHeight / 2) - (newNode.y + NODE_HEADER_HEIGHT / 2) * scale;
        setPan({x: newPanX, y: newPanY});
        // Optionally zoom to a reasonable level if very zoomed out
        if (scale < MIN_ZOOM_FACTOR * 2) {
             setScale(Math.min(MAX_ZOOM_FACTOR, Math.max(MIN_ZOOM_FACTOR, 0.75)));
        }
      }, 100);
    }
  }, [newRootNodeTitle, newRootNodeDescription, mindmap, addNode, toast, scale, setPan, setScale]);

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
      x: parentNode.x + NODE_CARD_WIDTH / 4, 
      y: parentNode.y + NODE_HEADER_HEIGHT + 80, 
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
    } else { 
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
    setTimeout(() => handleRecenterView(false), 100); // Recenter after delete
  }, [mindmap, nodeToDelete, deleteNodeFromHook, toast, handleRecenterView]);

  const handleNodeDragStart = useCallback((event: React.DragEvent<HTMLDivElement>, nodeId: string) => {
    if (activeTool === 'pan' || !mindmap || !viewportContainerRef.current) {
      event.preventDefault();
      return;
    }

    const draggedNodeData = mindmap.data.nodes[nodeId];
    if (!draggedNodeData) return;

    // Position of the viewport container itself
    const viewportContainerRect = viewportContainerRef.current.getBoundingClientRect();

    // Node's logical (x,y) converted to screen space relative to the viewportContainer
    const nodeScreenX = draggedNodeData.x * scale + pan.x;
    const nodeScreenY = draggedNodeData.y * scale + pan.y;

    // Mouse position relative to the viewportContainer
    const mouseXInContainer = event.clientX - viewportContainerRect.left;
    const mouseYInContainer = event.clientY - viewportContainerRect.top;
    
    // dragOffset is the mouse's position relative to the node's top-left, in LOGICAL units
    setDragOffset({
      x: (mouseXInContainer - nodeScreenX) / scale,
      y: (mouseYInContainer - nodeScreenY) / scale,
    });
    
    setDraggedNodeId(nodeId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", nodeId); 
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
    const mouseXInViewportContainer = event.clientX - viewportRect.left;
    const mouseYInViewportContainer = event.clientY - viewportRect.top;

    // Convert mouse drop position in viewport container to logical canvas coordinates
    // This is where the mouse pointer IS in the logical canvas
    const mouseLogicalX = (mouseXInViewportContainer - pan.x) / scale;
    const mouseLogicalY = (mouseYInViewportContainer - pan.y) / scale;

    // To get the node's new top-left logical position, subtract the dragOffset
    let newX = mouseLogicalX - dragOffset.x;
    let newY = mouseLogicalY - dragOffset.y;
    
    // newX = Math.max(0, newX); // Removed clamping
    // newY = Math.max(0, newY); // Removed clamping

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
      <div className="p-2 border-b bg-background/90 backdrop-blur-sm rounded-t-lg sticky top-0 z-20 space-y-2 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex items-center gap-2 flex-shrink-0">
             <Tooltip>
                <TooltipTrigger asChild>
                     <Button asChild variant="outline" size="icon" className="h-8 w-8">
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
                        variant={activeTool === 'pan' ? "default" : "outline"} 
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
                    <Button variant="outline" size="icon" onClick={() => handleZoom(ZOOM_STEP_SENSITIVITY)} className="h-8 w-8">
                        <ZoomIn className="h-4 w-4" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent><p>Zoom In</p></TooltipContent>
            </Tooltip>
            <Tooltip>
                <TooltipTrigger asChild>
                     <Button variant="outline" size="icon" onClick={() => handleZoom(-ZOOM_STEP_SENSITIVITY)} className="h-8 w-8">
                        <ZoomOut className="h-4 w-4" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent><p>Zoom Out</p></TooltipContent>
            </Tooltip>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button variant="outline" size="icon" onClick={() => handleRecenterView(false)} className="h-8 w-8">
                        <LocateFixed className="h-4 w-4" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent><p>Recenter View</p></TooltipContent>
            </Tooltip>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button variant="outline" size="icon" onClick={handleExportJson} className="h-8 w-8">
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
            className="flex-grow text-sm min-h-[36px] h-9 resize-y max-h-20" 
          />
          <Button onClick={handleAddRootNode} size="sm" className="h-9 text-sm whitespace-nowrap px-4">
            <PlusCircle className="mr-1.5 h-4 w-4" /> Add Root Idea
          </Button>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div
        ref={viewportContainerRef}
        className="flex-grow relative overflow-hidden bg-muted/30 border-2 border-dashed border-destructive rounded-b-lg"
        onMouseDown={handlePanMouseDown} // For starting pan
        onDragOver={handleDragOver} 
        onDrop={handleDrop}      
      >
        <div
            ref={canvasContentRef}
            className="absolute top-0 left-0 pointer-events-none" 
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
                key={`lines-svg-${allNodes.length}-${scale}-${pan.x}-${pan.y}`} // Re-render if these change
            >
                {allNodes.map(node => {
                  if (!node.parentId) return null;
                  const parentNode = mindmap.data.nodes[node.parentId];
                  if (!parentNode) return null;

                  const startX = parentNode.x + NODE_CARD_WIDTH / 2;
                  const startY = parentNode.y + NODE_HEADER_HEIGHT + (parentNode.description ? 10 : 0);

                  const endX = node.x + NODE_CARD_WIDTH / 2;
                  const endY = node.y;
                  
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
                    top: `50%`, 
                    left: `50%`,
                    transform: `translate(calc(-50% - ${pan.x / scale}px), calc(-50% - ${pan.y / scale}px)) scale(${1/scale})`, 
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

