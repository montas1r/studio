
"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Mindmap, NodeData, EditNodeInput, PaletteColorKey } from '@/types/mindmap';
import { useMindmaps } from '@/hooks/useMindmaps';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NodeCard } from './NodeCard';
import { EditNodeDialog } from './EditNodeDialog';
import { PlusCircle, Download, ArrowLeft, AlertTriangle, Palette, Layers } from 'lucide-react';
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

  const canvasRef = useRef<HTMLDivElement>(null); // For scroll calculations
  const canvasContentRef = useRef<HTMLDivElement>(null); // For node positions and SVG lines

  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const handleAddRootNode = useCallback(async () => {
    if (newRootNodeTitle.trim() === '') {
      toast({ title: "Title Required", description: "Please enter a title for the new root node.", variant: "destructive" });
      return;
    }
    if (!mindmap) return;

    // Provide a default emoji for root nodes if not specified
    const defaultEmoji = '💡'; 
    const newNodeData: EditNodeInput = {
      title: newRootNodeTitle,
      description: newRootNodeDescription,
      emoji: defaultEmoji, // Or pass an emoji input if you add one to the form
    };

    const newNode = addNode(mindmap.id, null, newNodeData);
    if (newNode) {
      setNewRootNodeTitle('');
      setNewRootNodeDescription('');
      toast({ title: "Root Node Added", description: `"${newNode.title}" added to the mindmap.` });
      
      // Scroll to new node
      setTimeout(() => {
        if (canvasRef.current && canvasContentRef.current) {
          const nodeElement = document.getElementById(`node-${newNode.id}`);
          if (nodeElement) {
            // Scroll the canvasRef to bring the new node into view.
            // This is a simplified scroll; more complex logic might be needed for precise centering.
            canvasRef.current.scrollTo({
              left: newNode.x - (canvasRef.current.offsetWidth / 2) + (NODE_CARD_WIDTH / 2),
              top: newNode.y - (canvasRef.current.offsetHeight / 2) + (NODE_HEADER_HEIGHT / 2),
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
      id: `temp-${uuidv4()}`, // Temporary ID for creation flow
      title: '', // Will be set in dialog
      description: "",
      emoji: "➕", // Default emoji for new child
      parentId: parentId,
      childIds: [],
      x: (parentNode.x ?? 0), 
      y: (parentNode.y ?? 0) + NODE_HEADER_HEIGHT + 100, // Initial position below parent
      customBackgroundColor: undefined, // Default, no custom color
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
    if (editingNode.id.startsWith('temp-')) { // This indicates a new node creation
      const permanentNode = addNode(mindmap.id, editingNode.parentId, data);
      if (permanentNode) {
        toast({ title: "Node Created", description: `Node "${permanentNode.title}" added.` });
        // Optional: Scroll to new child node
        setTimeout(() => {
             if (canvasRef.current && canvasContentRef.current) {
                const nodeElement = document.getElementById(`node-${permanentNode.id}`);
                if (nodeElement) {
                    canvasRef.current.scrollTo({
                        left: permanentNode.x - (canvasRef.current.offsetWidth / 2) + (NODE_CARD_WIDTH / 2),
                        top: permanentNode.y - (canvasRef.current.offsetHeight / 2) + (NODE_HEADER_HEIGHT / 2),
                        behavior: 'smooth'
                    });
                }
            }
        }, 100);
      }
    } else { // Existing node update
      updateNode(mindmap.id, nodeId, data);
      toast({ title: "Node Updated", description: `Node "${data.title}" saved.` });
    }
    setEditingNode(null); // Clear editing node state
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
    if (!canvasContentRef.current) return;
    
    const nodeElement = document.getElementById(`node-${nodeId}`);
    if (!nodeElement) return;
    
    // Calculate offset from node's top-left to mouse click point
    // This needs to be relative to the node itself, not the viewport or canvas origin
    const nodeRect = nodeElement.getBoundingClientRect(); // Node's current position on screen
    const clientX = event.clientX;
    const clientY = event.clientY;

    setDragOffset({
      x: clientX - nodeRect.left,
      y: clientY - nodeRect.top,
    });

    setDraggedNodeId(nodeId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", nodeId); // Necessary for Firefox
  }, []);


  const handleDragOverCanvas = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (draggedNodeId) {
      event.dataTransfer.dropEffect = "move";
    }
  }, [draggedNodeId]);

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!draggedNodeId || !mindmap || !canvasRef.current || !canvasContentRef.current) return;

    const canvasRect = canvasRef.current.getBoundingClientRect(); // The scrollable container
    
    // Mouse position relative to the scrollable canvas container's top-left
    const clientX = event.clientX;
    const clientY = event.clientY;

    let newX = clientX - canvasRect.left + canvasRef.current.scrollLeft - dragOffset.x;
    let newY = clientY - canvasRect.top + canvasRef.current.scrollTop - dragOffset.y;
    
    // Optionally, you might want to constrain nodes within the canvasContentRef boundaries
    // newX = Math.max(0, Math.min(newX, parseInt(CANVAS_CONTENT_WIDTH) - NODE_CARD_WIDTH));
    // newY = Math.max(0, Math.min(newY, parseInt(CANVAS_CONTENT_HEIGHT) - 150)); // Approx node height

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
                {mindmap.category && (
                  <span className="ml-2 text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Layers className="h-3 w-3" /> {mindmap.category}
                  </span>
                )}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
                {/* Tools removed in this version */}
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

        {/* Main Canvas Area - Simple Scrollable Div */}
        <div
          ref={canvasRef} // This is the scrollable container
          className="flex-grow relative overflow-auto bg-muted/20 min-h-[calc(100vh-160px)] sm:min-h-[calc(100vh-140px)]"
          onDragOver={handleDragOverCanvas}
          onDrop={handleDrop}
        >
            <div
                ref={canvasContentRef} // This div holds the nodes and lines, and defines the logical canvas size
                className="relative" 
                style={{
                    width: CANVAS_CONTENT_WIDTH,
                    height: CANVAS_CONTENT_HEIGHT,
                    // No transform for this simpler version
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
                    onDragStart={handleNodeDragStart}
                />
                ))}

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
                    let startY = (parentNode.y ?? 0) + NODE_HEADER_HEIGHT / 2; // From middle of parent header
                   
                    const endX = (node.x ?? 0) + NODE_CARD_WIDTH / 2;
                    const endY = (node.y ?? 0); // To top-middle of child

                    const controlPointOffset = Math.max(20, Math.min(80, Math.abs(endY - startY) / 2));
                    const pathData = `M ${startX} ${startY} C ${startX} ${startY + controlPointOffset}, ${endX} ${endY - controlPointOffset}, ${endX} ${endY}`;
                    
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
