
"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Mindmap, NodeData, EditNodeInput } from '@/types/mindmap';
import { useMindmaps } from '@/hooks/useMindmaps';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NodeCard } from './NodeCard';
import { EditNodeDialog } from './EditNodeDialog';
import { PlusCircle, Download, ArrowLeft, AlertTriangle, Palette, LocateFixed, Hand, ZoomIn, ZoomOut } from 'lucide-react';
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

interface MindmapEditorProps {
  mindmapId: string;
}

const NODE_CARD_WIDTH = 300;
const NODE_HEADER_HEIGHT = 50;
const CANVAS_CONTENT_WIDTH = '1200px'; // Default canvas size
const CANVAS_CONTENT_HEIGHT = '1200px';


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

  const canvasRef = useRef<HTMLDivElement>(null); // For the scrollable container
  const canvasContentRef = useRef<HTMLDivElement>(null); // For the content that nodes are positioned relative to

  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

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
      // Basic scroll into view
      setTimeout(() => {
        if (canvasRef.current) {
            const nodeElement = document.getElementById(`node-${newNode.id}`);
            if (nodeElement) {
                // Calculate scroll position to center the new node
                const canvasRect = canvasRef.current.getBoundingClientRect();
                const nodeRect = nodeElement.getBoundingClientRect(); // This is relative to viewport

                const desiredScrollLeft = newNode.x - (canvasRect.width / 2) + (NODE_CARD_WIDTH / 2);
                const desiredScrollTop = newNode.y - (canvasRect.height / 2) + (NODE_HEADER_HEIGHT / 2);

                canvasRef.current.scrollTo({
                    left: desiredScrollLeft,
                    top: desiredScrollTop,
                    behavior: 'smooth'
                });
            }
        }
      }, 100);
    }
  }, [newRootNodeTitle, newRootNodeDescription, mindmap, addNode, toast]);

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
      y: (parentNode.y ?? 0) + NODE_HEADER_HEIGHT + 100, // Initial placement below parent
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
         setTimeout(() => { // Scroll to newly created child node
            if (canvasRef.current) {
                const nodeElement = document.getElementById(`node-${permanentNode.id}`);
                if (nodeElement) {
                    const canvasRect = canvasRef.current.getBoundingClientRect();
                    const desiredScrollLeft = permanentNode.x - (canvasRect.width / 2) + (NODE_CARD_WIDTH / 2);
                    const desiredScrollTop = permanentNode.y - (canvasRect.height / 2) + (NODE_HEADER_HEIGHT / 2);
                    canvasRef.current.scrollTo({
                        left: desiredScrollLeft,
                        top: desiredScrollTop,
                        behavior: 'smooth'
                    });
                }
            }
        }, 100);
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
    if (!mindmap || !canvasContentRef.current) return;
    const node = mindmap.data.nodes[nodeId];
    if (!node) return;

    const canvasContentRect = canvasContentRef.current.getBoundingClientRect();
    const nodeElement = document.getElementById(`node-${nodeId}`);
    if (!nodeElement) return;
    const nodeRect = nodeElement.getBoundingClientRect(); // Node's current pos on screen

    // Calculate offset from node's top-left corner to mouse click point
    setDragOffset({
      x: event.clientX - nodeRect.left,
      y: event.clientY - nodeRect.top,
    });

    setDraggedNodeId(nodeId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", nodeId);
  }, [mindmap]);


  const handleDragOverCanvas = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (draggedNodeId) {
      event.dataTransfer.dropEffect = "move";
    }
  }, [draggedNodeId]);

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!draggedNodeId || !mindmap || !canvasContentRef.current || !canvasRef.current) return;

    const canvasContentRect = canvasContentRef.current.getBoundingClientRect();

    // Mouse position relative to the scrolled canvas content's top-left corner
    const mouseXInCanvasContent = event.clientX - canvasContentRect.left + canvasRef.current.scrollLeft;
    const mouseYInCanvasContent = event.clientY - canvasContentRect.top + canvasRef.current.scrollTop;

    let newX = mouseXInCanvasContent - dragOffset.x;
    let newY = mouseYInCanvasContent - dragOffset.y;

    updateNodePosition(mindmap.id, draggedNodeId, newX, newY);
    setDraggedNodeId(null);
  }, [draggedNodeId, mindmap, dragOffset, updateNodePosition]);

  const handleExportJson = useCallback(() => {
    if (!mindmap) return;
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(mindmap, null, 2))}`;
    const link = document.createElement("a");
    link.href = jsonString;
    link.download = `${mindmap.name.replace(/\s+/g, '_').toLowerCase()}_mindmap.json`;
    link.click();
    toast({ title: "Exported", description: "Mindmap data exported as JSON." });
  }, [mindmap, toast]);

  useEffect(() => {
    if (canvasRef.current && mindmap && Object.keys(mindmap.data.nodes).length > 0) {
      const firstRootNodeId = mindmap.data.rootNodeIds[0];
      if (firstRootNodeId && mindmap.data.nodes[firstRootNodeId]) {
        const firstNode = mindmap.data.nodes[firstRootNodeId];
        const targetX = (firstNode.x ?? 0) - (canvasRef.current.offsetWidth / 2) + (NODE_CARD_WIDTH / 2);
        const targetY = (firstNode.y ?? 0) - (canvasRef.current.offsetHeight / 2) + (NODE_HEADER_HEIGHT / 2);
        canvasRef.current.scrollTo({ left: targetX, top: targetY, behavior: 'auto' });
      }
    }
  }, [mindmapId, mindmap]);

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
        <div className="p-1 border-b bg-background/80 backdrop-blur-sm sticky top-0 z-30 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2 mb-2 px-2">
            <div className="flex items-center gap-2 flex-shrink-0 min-w-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                    <Link href="/"><ArrowLeft className="h-4 w-4" /></Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Back to Library</p></TooltipContent>
              </Tooltip>
              <h1 className="text-base font-semibold text-foreground truncate" title={mindmap.name}>
                {mindmap.name}
              </h1>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
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
          <div className="flex flex-col sm:flex-row items-stretch gap-2 px-2 pb-1">
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

        {/* Main Canvas Area - Scrollable */}
        <div
          ref={canvasRef}
          className="flex-grow relative overflow-auto bg-muted/20 min-h-[calc(100vh-160px)] sm:min-h-[calc(100vh-140px)]" // Adjusted min-height
          onDragOver={handleDragOverCanvas}
        >
            <div
                ref={canvasContentRef}
                className="relative" // This is where nodes are absolutely positioned.
                style={{
                    width: CANVAS_CONTENT_WIDTH,
                    height: CANVAS_CONTENT_HEIGHT,
                }}
                onDrop={handleDrop} // Drop on the content div
                onDragOver={handleDragOverCanvas} // Also need dragOver here for drop to work
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
                    className="node-card-draggable"
                />
                ))}

                {/* Render Connecting Lines */}
                <svg
                className="absolute top-0 left-0 pointer-events-none"
                style={{
                    width: CANVAS_CONTENT_WIDTH,
                    height: CANVAS_CONTENT_HEIGHT,
                    overflow: 'visible',
                }}
                key={`lines-svg-${allNodes.map(n => `${n.id}-${n.x}-${n.y}-${n.customBackgroundColor || ''}`).join()}`}
                >
                {allNodes.map(node => {
                    if (!node.parentId) return null;
                    const parentNode = mindmap.data.nodes[node.parentId];
                    if (!parentNode) return null;

                    const startX = (parentNode.x ?? 0) + NODE_CARD_WIDTH / 2;
                    let startY = (parentNode.y ?? 0) + NODE_HEADER_HEIGHT / 2;
                    // Adjust startY if parent has an image, to draw line from below image area
                    // if (parentNode.imageUrl) {
                    //     startY = (parentNode.y ?? 0) + NODE_HEADER_HEIGHT + (NODE_CARD_WIDTH * (9/16) / 2); // Approx center of image area
                    // }


                    const endX = (node.x ?? 0) + NODE_CARD_WIDTH / 2;
                    const endY = (node.y ?? 0);

                    const sCurveOffsetY = Math.max(20, Math.min(80, Math.abs(endY - startY) / 2));
                    const pathData = `M ${startX} ${startY} C ${startX} ${startY + sCurveOffsetY}, ${endX} ${endY - sCurveOffsetY}, ${endX} ${endY}`;

                    let strokeColor = "hsl(var(--accent))";
                    if (parentNode.customBackgroundColor) {
                        strokeColor = `hsl(var(--${parentNode.customBackgroundColor}))`;
                    } else if (!parentNode.parentId) {
                        strokeColor = "hsl(var(--primary))";
                    }

                    return (
                    <path
                        key={`${parentNode.id}-${node.id}`}
                        d={pathData}
                        stroke={strokeColor}
                        strokeWidth={2}
                        fill="none"
                    />
                    );
                })}
                </svg>

                {allNodes.length === 0 && (
                <div
                    className="absolute flex items-center justify-center pointer-events-none text-center inset-0"
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
