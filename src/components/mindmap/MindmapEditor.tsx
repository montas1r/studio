
"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Mindmap, NodeData, EditNodeInput } from '@/types/mindmap';
import { useMindmaps } from '@/hooks/useMindmaps';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NodeCard } from './NodeCard';
import { EditNodeDialog } from './EditNodeDialog';
import { PlusCircle, Download, ArrowLeft, AlertTriangle, LocateFixed } from 'lucide-react';
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
  const canvasContentRef = useRef<HTMLDivElement>(null); // For the content that gets transformed

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
      // Simple scroll into view if canvasRef exists
      setTimeout(() => {
        if (canvasRef.current) {
          const nodeElement = document.getElementById(`node-${newNode.id}`);
          if (nodeElement) {
            const canvasRect = canvasRef.current.getBoundingClientRect();
            const nodeRect = nodeElement.getBoundingClientRect();
            canvasRef.current.scrollTo({
              left: canvasRef.current.scrollLeft + nodeRect.left - canvasRect.left - (canvasRect.width / 2) + (nodeRect.width / 2),
              top: canvasRef.current.scrollTop + nodeRect.top - canvasRect.top - (canvasRect.height / 2) + (nodeRect.height / 2),
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
      y: (parentNode.y ?? 0) + 100, // Initial placement below parent
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
          if (canvasRef.current) {
            const nodeElement = document.getElementById(`node-${permanentNode.id}`);
            if (nodeElement) {
              const canvasRect = canvasRef.current.getBoundingClientRect();
              const nodeRect = nodeElement.getBoundingClientRect();
              canvasRef.current.scrollTo({
                left: canvasRef.current.scrollLeft + nodeRect.left - canvasRect.left - (canvasRect.width / 2) + (nodeRect.width / 2),
                top: canvasRef.current.scrollTop + nodeRect.top - canvasRect.top - (canvasRect.height / 2) + (nodeRect.height / 2),
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
    
    // Mouse position relative to the canvasContentRef's top-left corner
    const mouseXInCanvasContent = event.clientX - canvasContentRect.left;
    const mouseYInCanvasContent = event.clientY - canvasContentRect.top;

    setDragOffset({
      x: mouseXInCanvasContent - (node.x ?? 0),
      y: mouseYInCanvasContent - (node.y ?? 0),
    });
    setDraggedNodeId(nodeId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", nodeId); // Necessary for Firefox
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
    
    const mouseXInCanvasContent = event.clientX - canvasContentRect.left;
    const mouseYInCanvasContent = event.clientY - canvasContentRect.top;

    let newX = mouseXInCanvasContent - dragOffset.x;
    let newY = mouseYInCanvasContent - dragOffset.y;
    
    // No clamping to allow free movement, including negative coordinates
    // newX = Math.max(0, newX); 
    // newY = Math.max(0, newY);

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
    // Center initial view (very basic, can be improved)
    if (canvasRef.current && mindmap && Object.keys(mindmap.data.nodes).length > 0) {
        const firstRootNodeId = mindmap.data.rootNodeIds[0];
        if (firstRootNodeId && mindmap.data.nodes[firstRootNodeId]) {
            const firstNode = mindmap.data.nodes[firstRootNodeId];
            const targetX = (firstNode.x ?? 0) - (canvasRef.current.offsetWidth / 2) + (NODE_CARD_WIDTH / 2);
            const targetY = (firstNode.y ?? 0) - (canvasRef.current.offsetHeight / 2) + (NODE_HEADER_HEIGHT / 2);
            canvasRef.current.scrollTo({ left: targetX, top: targetY, behavior: 'auto' });
        }
    }
  }, [mindmapId, mindmap]); // Run when mindmapId changes or mindmap data loads

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
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-2">
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

        {/* Main Canvas Area - Scrollable */}
        <div
          ref={canvasRef} // This is the scrollable viewport
          className="flex-grow relative overflow-auto bg-muted/20 min-h-[calc(100vh-180px)] sm:min-h-[calc(100vh-160px)]"
          onDragOver={handleDragOverCanvas}
          onDrop={handleDrop}
        >
          {/* Content Div - Large fixed size for node placement, this is what gets panned/zoomed if we re-add those tools */}
          <div
            ref={canvasContentRef} 
            className="relative" // Removed border, as the parent div has no explicit border now
            style={{
              width: CANVAS_CONTENT_WIDTH,
              height: CANVAS_CONTENT_HEIGHT,
              // transform: `scale(${scale}) translate(${pan.x}px, ${pan.y}px)`, // Removed transform for simplicity
              // transformOrigin: '0 0',
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
              // Unique key to force re-render when node positions or colors change
              key={`lines-svg-${allNodes.map(n => `${n.id}-${n.x}-${n.y}-${n.customBackgroundColor || ''}`).join()}`}
            >
              {allNodes.map(node => {
                if (!node.parentId) return null;
                const parentNode = mindmap.data.nodes[node.parentId];
                if (!parentNode) return null;

                const startX = (parentNode.x ?? 0) + NODE_CARD_WIDTH / 2;
                let startY = (parentNode.y ?? 0) + NODE_HEADER_HEIGHT / 2;
                 if (parentNode.imageUrl && parentNode.customBackgroundColor) { // Check if image and custom color
                    startY = (parentNode.y ?? 0) + NODE_HEADER_HEIGHT; // Start line below header if image
                } else if (parentNode.imageUrl) { // Only image
                     startY = (parentNode.y ?? 0) + NODE_HEADER_HEIGHT;
                }


                const endX = (node.x ?? 0) + NODE_CARD_WIDTH / 2;
                const endY = (node.y ?? 0); 

                const sCurveOffsetY = Math.max(20, Math.min(80, Math.abs(endY - startY) / 2));
                const pathData = `M ${startX} ${startY} C ${startX} ${startY + sCurveOffsetY}, ${endX} ${endY - sCurveOffsetY}, ${endX} ${endY}`;

                let strokeColor = "hsl(var(--accent))"; // Default for child-to-child connection
                if (parentNode.customBackgroundColor) {
                    strokeColor = `hsl(var(--${parentNode.customBackgroundColor}))`;
                } else if (!parentNode.parentId) { // Parent is a root node (no custom color)
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
