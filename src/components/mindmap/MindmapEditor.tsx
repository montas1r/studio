
"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Mindmap, NodeData, EditNodeInput } from '@/types/mindmap';
import { useMindmaps } from '@/hooks/useMindmaps';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NodeCard } from './NodeCard';
import { EditNodeDialog } from './EditNodeDialog';
import { PlusCircle, Download, ArrowLeft, AlertTriangle, Edit3, Layers, Calendar, Trash2, LocateFixed } from 'lucide-react';
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

const NODE_CARD_WIDTH = 300; // Approx width of NodeCard
const NODE_HEADER_HEIGHT = 50; // Approx height of NodeCard header
const NODE_APPROX_MIN_HEIGHT = 80; // Approx min height of NodeCard without image/long desc

const CANVAS_CONTENT_WIDTH = '1200px'; // Default canvas width
const CANVAS_CONTENT_HEIGHT = '1200px'; // Default canvas height

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

  const canvasContainerRef = useRef<HTMLDivElement>(null); // For scroll and drop
  const canvasContentRef = useRef<HTMLDivElement>(null); // For node positions and lines

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
      // Simple scroll to new node if possible (might need refinement for exact centering)
      setTimeout(() => {
        const nodeElement = document.getElementById(`node-${newNode.id}`);
        if (nodeElement && canvasContainerRef.current) {
           const containerRect = canvasContainerRef.current.getBoundingClientRect();
           const nodeRect = nodeElement.getBoundingClientRect();
           canvasContainerRef.current.scrollTo({
            left: canvasContainerRef.current.scrollLeft + nodeRect.left - containerRect.left - (containerRect.width / 2) + (nodeRect.width / 2),
            top: canvasContainerRef.current.scrollTop + nodeRect.top - containerRect.top - (containerRect.height / 2) + (nodeRect.height / 2),
            behavior: 'smooth'
           });
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
      x: parentNode.x + NODE_CARD_WIDTH / 4, // Initial rough placement
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

    if (editingNode.id.startsWith('temp-')) {
      const permanentNode = addNode(mindmap.id, editingNode.parentId, data);
      if (permanentNode) {
        toast({ title: "Node Created", description: `Node "${permanentNode.title}" added.` });
         setTimeout(() => {
            const nodeElement = document.getElementById(`node-${permanentNode.id}`);
            if (nodeElement && canvasContainerRef.current) {
              const containerRect = canvasContainerRef.current.getBoundingClientRect();
              const nodeRect = nodeElement.getBoundingClientRect();
              canvasContainerRef.current.scrollTo({
                left: canvasContainerRef.current.scrollLeft + nodeRect.left - containerRect.left - (containerRect.width / 2) + (nodeRect.width / 2),
                top: canvasContainerRef.current.scrollTop + nodeRect.top - containerRect.top - (containerRect.height / 2) + (nodeRect.height / 2),
                behavior: 'smooth'
              });
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

    const canvasRect = canvasContentRef.current.getBoundingClientRect();
    
    // Calculate mouse position relative to the canvasContentRef's top-left (which is its own 0,0)
    // clientX/Y is screen coordinate, canvasRect.left/top is screen coordinate of canvasContentRef
    const mouseXInCanvas = event.clientX - canvasRect.left;
    const mouseYInCanvas = event.clientY - canvasRect.top;

    setDragOffset({
      x: mouseXInCanvas - node.x,
      y: mouseYInCanvas - node.y,
    });
    setDraggedNodeId(nodeId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", nodeId); // Necessary for some browsers
  }, [mindmap]);

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault(); // Allow dropping
    if (draggedNodeId) {
      event.dataTransfer.dropEffect = "move";
    }
  }, [draggedNodeId]);

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!draggedNodeId || !mindmap || !canvasContainerRef.current || !canvasContentRef.current) return;

    const canvasContainerRect = canvasContainerRef.current.getBoundingClientRect();
    
    // Mouse position relative to the canvasContainerRef's top-left corner
    const mouseXInContainer = event.clientX - canvasContainerRect.left;
    const mouseYInContainer = event.clientY - canvasContainerRect.top;

    // Add scroll offsets of the canvasContainerRef to get mouse position relative to the scrollable content
    let newX = mouseXInContainer + canvasContainerRef.current.scrollLeft - dragOffset.x;
    let newY = mouseYInContainer + canvasContainerRef.current.scrollTop - dragOffset.y;

    // No negative coordinates for simplicity in this renewed version
    // newX = Math.max(0, newX); 
    // newY = Math.max(0, newY);

    updateNodePosition(mindmap.id, draggedNodeId, newX, newY);
    setDraggedNodeId(null);
  }, [draggedNodeId, mindmap, dragOffset, updateNodePosition]);

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
          ref={canvasContainerRef}
          className="flex-grow relative overflow-auto bg-muted/20 min-h-[calc(100vh-180px)] sm:min-h-[calc(100vh-160px)]"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {/* Content Div - Scaled/Panned (large fixed size) */}
          <div
            ref={canvasContentRef}
            className="relative" // Removed border here
            style={{
              width: CANVAS_CONTENT_WIDTH,
              height: CANVAS_CONTENT_HEIGHT,
              // No transform here for this simplified version
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
              key={`lines-svg-${allNodes.length}-${allNodes.map(n => `${n.x}-${n.y}`).join()}`} // Re-render if node positions change
            >
              {allNodes.map(node => {
                if (!node.parentId) return null;
                const parentNode = mindmap.data.nodes[node.parentId];
                if (!parentNode) return null;

                const startX = parentNode.x + NODE_CARD_WIDTH / 2;
                let startY = parentNode.y + NODE_HEADER_HEIGHT / 2;
                if (parentNode.imageUrl) startY = parentNode.y + NODE_HEADER_HEIGHT;

                const endX = node.x + NODE_CARD_WIDTH / 2;
                const endY = node.y;

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
                    strokeWidth={2} // Fixed stroke width
                    fill="none"
                  />
                );
              })}
            </svg>

            {allNodes.length === 0 && (
              <div
                className="absolute flex items-center justify-center pointer-events-none text-center"
                style={{
                  top: `50%`,
                  left: `50%`,
                  transform: `translate(-50%, -50%)`,
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
