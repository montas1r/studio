
"use client";

import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { Mindmap, NodeData, EditNodeInput, PaletteColorKey } from '@/types/mindmap';
import { useMindmaps } from '@/hooks/useMindmaps';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NodeCard } from './NodeCard';
import { EditNodeDialog } from './EditNodeDialog';
import { PlusCircle, Download, ArrowLeft, Home, Layers, Hand } from 'lucide-react';
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
const CANVAS_CONTENT_WIDTH = '1200px'; 
const CANVAS_CONTENT_HEIGHT = '1200px';

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

  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  // dragOffset is set via dataTransfer now, but kept in state for potential fallback or other uses.
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [activeTool, setActiveTool] = useState<'select' | 'pan'>('select');
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ mouseX: number, mouseY: number, initialPanX: number, initialPanY: number } | null>(null);


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
      
      if (viewportContainerRef.current && newNode.x !== undefined && newNode.y !== undefined) {
        const viewportRect = viewportContainerRef.current.getBoundingClientRect();
        // Calculate pan to center the new node.
        // Target pan.x = (viewport width / 2) - node's logical x - (node width / 2)
        // Target pan.y = (viewport height / 2) - node's logical y - (node height / 2) 
        // Assuming node height is approx NODE_HEADER_HEIGHT * 2 for centering calculation
        const targetX = viewportRect.width / 2 - newNode.x - NODE_CARD_WIDTH / 2;
        const targetY = viewportRect.height / 2 - newNode.y - NODE_HEADER_HEIGHT ; 
        setPan({ x: targetX, y: targetY });
      }
    }
  }, [newRootNodeTitle, newRootNodeDescription, mindmap, addNode, toast, setPan]);

  const handleAddChildNode = useCallback((parentId: string) => {
    if (!mindmap) return;
    const parentNode = mindmap.data.nodes[parentId];
    if (!parentNode) return;

    // Initial position guess, will be refined by addNode in useMindmaps hook
    const initialX = (parentNode.x ?? 0) + NODE_CARD_WIDTH + 30; 
    const initialY = (parentNode.y ?? 0);


    const tempNewNode: NodeData = {
      id: `temp-${uuidv4()}`, 
      title: '', 
      description: "",
      emoji: "➕", 
      parentId: parentId,
      childIds: [],
      x: initialX, 
      y: initialY,
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
      updateNode(mindmap.id, nodeId, data);
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
    if (activeTool === 'pan') { // Prevent node drag if pan tool is active
      event.preventDefault();
      return;
    }
    const nodeElement = event.currentTarget;
    if (!nodeElement) return;

    const nodeRect = nodeElement.getBoundingClientRect();
    const currentDragOffset = {
      x: event.clientX - nodeRect.left,
      y: event.clientY - nodeRect.top,
    };
    setDragOffset(currentDragOffset); 
    event.dataTransfer.setData('application/json', JSON.stringify(currentDragOffset));

    setDraggedNodeId(nodeId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", nodeId); 
  }, [activeTool]);


  const handleDragOverCanvas = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault(); 
    if (draggedNodeId) {
      event.dataTransfer.dropEffect = "move";
    }
  }, [draggedNodeId]);

  const handleDropOnCanvas = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!draggedNodeId || !mindmap || !viewportContainerRef.current) return;

    let offsetX = dragOffset.x; 
    let offsetY = dragOffset.y; 

    try {
      const data = event.dataTransfer.getData('application/json');
      if (data) {
        const parsedOffset = JSON.parse(data);
        offsetX = parsedOffset.x;
        offsetY = parsedOffset.y;
      }
    } catch (e) {
      console.error("Could not parse drag offset from dataTransfer, falling back to state:", e);
    }

    const viewportRect = viewportContainerRef.current.getBoundingClientRect();
    
    // Calculate new logical position accounting for pan
    let newX = event.clientX - viewportRect.left - pan.x - offsetX;
    let newY = event.clientY - viewportRect.top - pan.y - offsetY;
    
    updateNodePosition(mindmap.id, draggedNodeId, newX, newY);
    setDraggedNodeId(null);
  }, [draggedNodeId, mindmap, dragOffset, updateNodePosition, pan]);


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
    // Prevent panning if clicking directly on a node or its interactive elements
    if ((event.target as HTMLElement).closest('.node-card-draggable')) {
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
    if (viewportContainerRef.current) {
      viewportContainerRef.current.style.cursor = 'grabbing';
    }
  }, [activeTool, isPanning, pan.x, pan.y]);

  const handlePanMouseMove = useCallback((event: MouseEvent) => {
    if (!isPanning || !panStartRef.current) return;
    event.preventDefault();
    const dx = event.clientX - panStartRef.current.mouseX;
    const dy = event.clientY - panStartRef.current.mouseY;
    setPan({
      x: panStartRef.current.initialPanX + dx,
      y: panStartRef.current.initialPanY + dy,
    });
  }, [isPanning]);

  const handlePanMouseUpOrLeave = useCallback(() => {
    if (isPanning) {
      setIsPanning(false);
      panStartRef.current = null;
      if (viewportContainerRef.current) {
        viewportContainerRef.current.style.cursor = activeTool === 'pan' ? 'grab' : 'default';
      }
    }
  }, [isPanning, activeTool]);

  useEffect(() => {
    if (isPanning) {
      window.addEventListener('mousemove', handlePanMouseMove);
      window.addEventListener('mouseup', handlePanMouseUpOrLeave);
      window.addEventListener('mouseleave', handlePanMouseUpOrLeave); // Handle mouse leaving window
    } else {
      window.removeEventListener('mousemove', handlePanMouseMove);
      window.removeEventListener('mouseup', handlePanMouseUpOrLeave);
      window.removeEventListener('mouseleave', handlePanMouseUpOrLeave);
    }
    return () => { // Cleanup
      window.removeEventListener('mousemove', handlePanMouseMove);
      window.removeEventListener('mouseup', handlePanMouseUpOrLeave);
      window.removeEventListener('mouseleave', handlePanMouseUpOrLeave);
    };
  }, [isPanning, handlePanMouseMove, handlePanMouseUpOrLeave]);
  
  // Effect to set cursor based on activeTool
  useEffect(() => {
    if (viewportContainerRef.current) {
      viewportContainerRef.current.style.cursor = activeTool === 'pan' ? (isPanning ? 'grabbing' : 'grab') : 'default';
    }
  }, [activeTool, isPanning]);

  // Effect for initial centering when mindmap loads
  useEffect(() => {
    if (mindmap && viewportContainerRef.current && mindmap.data.rootNodeIds.length > 0) {
        const firstRootNodeId = mindmap.data.rootNodeIds[0];
        const firstRootNode = mindmap.data.nodes[firstRootNodeId];
        if (firstRootNode && firstRootNode.x !== undefined && firstRootNode.y !== undefined) {
            const viewportRect = viewportContainerRef.current.getBoundingClientRect();
            const targetX = viewportRect.width / 2 - firstRootNode.x - NODE_CARD_WIDTH / 2;
            const targetY = viewportRect.height / 2 - firstRootNode.y - NODE_HEADER_HEIGHT; // Center based on header
            
            // Only pan to center if it hasn't been panned yet (or significantly)
            // This avoids re-centering if the user has already started navigating
            if (Math.abs(pan.x - targetX) > 5 || Math.abs(pan.y - targetY) > 5) {
              // Check if pan state is at initial (0,0) before auto-panning,
              // or if the current pan is significantly different from the target center.
              // This avoids re-centering if the user has already panned.
              // A more robust check might involve a flag like `initialViewCentered`.
              if (pan.x === 0 && pan.y === 0) { 
                 setPan({ x: targetX, y: targetY });
              }
            }
        }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mindmapId]); // Rerun when mindmapId changes (new map loaded)


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
  const svgKey = allNodes.map(n => `${n.id}-${n.x}-${n.y}-${(n.childIds || []).join(',')}`).join('|');


  return (
    <TooltipProvider>
      <div className="flex flex-col h-full flex-grow w-full">
         <div className="p-2 border-b bg-background/95 backdrop-blur-sm sticky top-0 z-30 shadow-sm space-y-2">
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
                <TooltipContent><p>Back to Library</p></TooltipContent>
              </Tooltip>
              <h1 className="text-xl font-semibold text-foreground truncate" title={mindmap.name}>
                {mindmap.name}
              </h1>
              {mindmap.category && (
                <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-full flex items-center gap-1 whitespace-nowrap">
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

        <div
          ref={viewportContainerRef} 
          className="flex-grow relative bg-muted/20 min-h-[calc(100vh-180px)] overflow-hidden" // Key: overflow-hidden
          onDragOver={handleDragOverCanvas} 
          onDrop={handleDropOnCanvas}
          onMouseDown={handlePanMouseDown} // Attach pan mousedown here
        >
            <div
                ref={canvasContentRef} 
                className="relative" 
                style={{
                    width: CANVAS_CONTENT_WIDTH, 
                    height: CANVAS_CONTENT_HEIGHT,
                    transform: `translate(${pan.x}px, ${pan.y}px)`,
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
                    className="node-card-draggable" // Ensure this class is on NodeCard for click detection
                />
                ))}

                <svg
                    className="absolute top-0 left-0 pointer-events-none"
                    style={{
                        width: CANVAS_CONTENT_WIDTH, 
                        height: CANVAS_CONTENT_HEIGHT,
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
                    
                    let strokeColor = "hsl(var(--accent))"; 
                    if (!parentNode.parentId) { 
                        strokeColor = "hsl(var(--primary))";
                    }

                    return (
                    <path
                        key={`${parentNode.id}-${node.id}`}
                        d={pathData}
                        stroke={strokeColor}
                        strokeWidth="2"
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
                        // Center within the transformed canvas by offsetting by negative pan
                        transform: `translate(calc(-50% - ${pan.x}px), calc(-50% - ${pan.y}px))`,
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
