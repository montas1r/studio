
"use client";

import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { Mindmap, NodeData, EditNodeInput } from '@/types/mindmap';
import { useMindmaps } from '@/hooks/useMindmaps';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NodeCard } from './NodeCard';
import { EditNodeDialog } from './EditNodeDialog';
import { PlusCircle, Download, ArrowLeft, Home, Layers } from 'lucide-react';
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
const APPROX_NODE_MIN_HEIGHT_NO_DESC = 70;
const APPROX_LINE_HEIGHT = 18;
const MIN_DESC_LINES_FOR_TALL_NODE = 2;
const APPROX_NODE_MIN_HEIGHT_WITH_DESC_SHORT = APPROX_NODE_MIN_HEIGHT_NO_DESC + APPROX_LINE_HEIGHT * 1 + 20;
const APPROX_NODE_MIN_HEIGHT_WITH_DESC_TALL = APPROX_NODE_MIN_HEIGHT_NO_DESC + APPROX_LINE_HEIGHT * MIN_DESC_LINES_FOR_TALL_NODE + 20;

// Fixed canvas size
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

  const canvasRef = useRef<HTMLDivElement>(null);
  const canvasContentRef = useRef<HTMLDivElement>(null);

  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const getNodeHeight = useCallback((node: NodeData | null): number => {
    if (!node) return APPROX_NODE_MIN_HEIGHT_NO_DESC;
    if (!node.description) return APPROX_NODE_MIN_HEIGHT_NO_DESC;
    const lineCount = node.description.split('\\n').length;
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
      x: (parentNode.x ?? 0) + NODE_CARD_WIDTH + 30, // Default offset
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
    const nodeElement = event.currentTarget;
    const nodeRect = nodeElement.getBoundingClientRect();
    const calculatedDragOffset = {
      x: event.clientX - nodeRect.left,
      y: event.clientY - nodeRect.top,
    };

    event.dataTransfer.setData('application/json', JSON.stringify({
      nodeId,
      offsetX: calculatedDragOffset.x,
      offsetY: calculatedDragOffset.y
    }));
    event.dataTransfer.effectAllowed = "move";
  }, []);


  const handleDragOverCanvas = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const handleDropOnCanvas = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!canvasRef.current || !mindmap) return;

    let dragData;
    try {
      dragData = JSON.parse(event.dataTransfer.getData('application/json'));
    } catch (e) {
      console.error("Could not parse drag data:", e);
      return;
    }

    const { nodeId, offsetX, offsetY } = dragData;
    if (!nodeId || offsetX === undefined || offsetY === undefined) {
      console.error("Invalid drag data received:", dragData);
      return;
    }

    const canvasContainerRect = canvasRef.current.getBoundingClientRect();
    const scrollLeft = canvasRef.current.scrollLeft;
    const scrollTop = canvasRef.current.scrollTop;

    let newX = event.clientX - canvasContainerRect.left + scrollLeft - offsetX;
    let newY = event.clientY - canvasContainerRect.top + scrollTop - offsetY;

    updateNodePosition(mindmap.id, nodeId, newX, newY);
  }, [mindmap, updateNodePosition]);


  const handleExportJson = useCallback(() => {
    if (!mindmap) return;
    const jsonString = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(mindmap, null, 2));
    const link = document.createElement("a");
    link.href = jsonString;
    link.download = mindmap.name.replace(/\s+/g, '_').toLowerCase() + '_mindmap.json';
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
  const svgKey = allNodes.map(n => `${n.id}-${n.x}-${n.y}-${n.parentId}-${(n.childIds || []).join(',')}`).join('|');

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
          ref={canvasRef}
          className="flex-grow relative overflow-auto bg-muted/20"
          onDragOver={handleDragOverCanvas}
          onDrop={handleDropOnCanvas}
        >
          <div
            ref={canvasContentRef}
            className="relative"
            style={{
              width: CANVAS_CONTENT_WIDTH_STR,
              height: CANVAS_CONTENT_HEIGHT_STR,
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
                const c1y = startY + Math.max(50, Math.abs(endY - startY) / 2);
                const c2x = endX;
                const c2y = endY - Math.max(50, Math.abs(endY - startY) / 2);

                const pathData = `M ${startX} ${startY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${endX} ${endY}`;

                let strokeColor = "hsl(var(--muted-foreground))";
                if (parentNode.parentId === null) {
                    strokeColor = "hsl(var(--primary))";
                } else {
                    strokeColor = "hsl(var(--accent))";
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
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
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

    