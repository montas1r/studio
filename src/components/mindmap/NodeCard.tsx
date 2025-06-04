
"use client";

import type { NodeData, NodeSize } from '@/types/mindmap';
import { Button } from "@/components/ui/button";
import { Edit3, Trash2, PlusCircle } from 'lucide-react';
import React, { useRef, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { STANDARD_NODE_WIDTH } from '@/hooks/useMindmaps'; // Default width if node.width not set
import { marked } from 'marked'; // Import marked


interface NodeCardProps {
  node: NodeData;
  onEdit: (node: NodeData) => void;
  onDelete: (nodeId: string) => void;
  onAddChild: (parentId: string) => void;
  onDragStart: (event: React.DragEvent<HTMLDivElement>, nodeId: string) => void;
  onNodeTouchStart: (nodeId: string, event: React.TouchEvent<HTMLDivElement>) => void; // New prop for touch
  onNodeHeightChange?: (nodeId: string, measuredHeight: number) => void;
  isBeingManuallyResized?: boolean; // To pause observer during manual drag
  getApproxNodeHeightFromHook: (nodeContent: Partial<Pick<NodeData, 'title' | 'description' | 'emoji' | 'size'>>, currentWidth: number) => number;
  className?: string;
}

const NodeCardComponent = React.memo<NodeCardProps>(({
  node,
  onEdit,
  onDelete,
  onAddChild,
  onDragStart,
  onNodeTouchStart, // Destructure new prop
  onNodeHeightChange,
  isBeingManuallyResized,
  getApproxNodeHeightFromHook,
  className,
}) => {
  const isRoot = !node.parentId;
  const nodeRef = useRef<HTMLDivElement>(null);

  const cardPositionStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${node.x}px`,
    top: `${node.y}px`,
    width: node.width ? `${node.width}px` : `${STANDARD_NODE_WIDTH}px`,
    height: node.height ? `${node.height}px` : undefined,
  };

  const themeBgClass = isRoot ? "bg-primary" : "bg-accent";
  const themeBorderClass = isRoot ? "border-primary" : "border-accent";
  const headerTextColorClass = isRoot ? "text-primary-foreground" : "text-accent-foreground";
  const buttonHoverBgClass = "hover:bg-black/20";

  const descriptionBgClass = 'bg-slate-100 dark:bg-slate-800';
  const descriptionTextColorClass = 'text-slate-700 dark:text-slate-200';

  const cardBaseClasses = "flex flex-col cursor-grab transition-all duration-150 ease-out overflow-hidden rounded-2xl shadow-lg border-2";
  const currentCardClasses = cn(cardBaseClasses, themeBgClass, themeBorderClass, className);

  const handleDragStartInternal = (event: React.DragEvent<HTMLDivElement>) => {
    onDragStart(event, node.id);
  };

  const handleTouchStartInternal = (event: React.TouchEvent<HTMLDivElement>) => {
    onNodeTouchStart(node.id, event);
  };

  useEffect(() => {
    const currentRef = nodeRef.current;
    if (currentRef && onNodeHeightChange && !isBeingManuallyResized) {
      const measureAndReportHeight = () => {
        if (!currentRef || isBeingManuallyResized) return;
        const { height: measuredHeightDOM } = currentRef.getBoundingClientRect();
        const newHeight = Math.round(measuredHeightDOM);

        if (newHeight > 0) {
          const nodeContentForApproxHeight = { title: node.title, description: node.description, emoji: node.emoji, size: node.size };
          const currentApproxHeight = getApproxNodeHeightFromHook(nodeContentForApproxHeight, node.width ?? STANDARD_NODE_WIDTH);
          const storedHeight = node.height ?? currentApproxHeight;

          if (Math.abs(storedHeight - newHeight) >= 1) {
            onNodeHeightChange(node.id, newHeight);
          }
        }
      };
      
      const initialRect = currentRef.getBoundingClientRect();
      const initialHeight = Math.round(initialRect.height);
      if (initialHeight > 0 && !isBeingManuallyResized) {
          const nodeContentForApproxHeight = { title: node.title, description: node.description, emoji: node.emoji, size: node.size };
          const currentApproxHeight = getApproxNodeHeightFromHook(nodeContentForApproxHeight, node.width ?? STANDARD_NODE_WIDTH);
          const storedHeightForInitial = node.height ?? currentApproxHeight;
          if (Math.abs(storedHeightForInitial - initialHeight) >=1 ) {
             onNodeHeightChange(node.id, initialHeight);
          }
      }

      const resizeObserver = new ResizeObserver(measureAndReportHeight);
      resizeObserver.observe(currentRef);

      return () => {
        if (currentRef) { 
            resizeObserver.unobserve(currentRef);
        }
        resizeObserver.disconnect();
      };
    }
  }, [
      node.id, 
      node.title, 
      node.description, 
      node.emoji, 
      node.size, // Re-check if size changes
      node.width, // Re-check if width prop changes
      node.height, // Re-check if height prop changes
      onNodeHeightChange, 
      getApproxNodeHeightFromHook,
      STANDARD_NODE_WIDTH,
      isBeingManuallyResized, // Important: Re-evaluate if manual resize state changes
    ]);

  const parsedDescription = useMemo(() => {
    if (node.description) {
      // Configure marked to add line breaks for newlines in Markdown
      marked.setOptions({
        breaks: true, // Convert \n to <br>
        gfm: true,    // Enable GitHub Flavored Markdown (includes breaks)
      });
      return marked.parse(node.description);
    }
    return '';
  }, [node.description]);

  return (
    <div
      id={`node-${node.id}`}
      ref={nodeRef}
      className={currentCardClasses}
      style={cardPositionStyle}
      draggable // Keep for desktop drag
      onDragStart={handleDragStartInternal}
      onTouchStart={handleTouchStartInternal} // Add touch start handler
      onClick={(e) => e.stopPropagation()} 
      onMouseDown={(e) => e.stopPropagation() }
    >
      <div className={cn("flex items-center justify-between px-4 py-2", headerTextColorClass)} >
        <div className="flex items-center gap-1.5 flex-grow min-w-0">
          {node.emoji && <span className="text-xl mr-1.5 flex-shrink-0 select-none">{node.emoji}</span>}
          <h3 className={cn("text-lg font-semibold truncate")} title={node.title}>
            {node.title || "Untitled"}
          </h3>
        </div>
        <div className="flex items-center space-x-0.5 flex-shrink-0 ml-2">
          <Button variant="ghost" size="icon" onClick={() => onEdit(node)} aria-label="Edit node" className={cn("h-7 w-7", headerTextColorClass, buttonHoverBgClass)}>
            <Edit3 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onAddChild(node.id)} className={cn("h-7 w-7", headerTextColorClass, buttonHoverBgClass)} aria-label="Add child node">
            <PlusCircle className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(node.id)}
            aria-label="Delete node"
            className={cn("h-7 w-7 hover:bg-destructive hover:text-destructive-foreground", headerTextColorClass)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className={cn(
          "px-4 py-3 flex-grow overflow-y-auto", // Added overflow-y-auto
          descriptionBgClass,
          descriptionTextColorClass,
          !node.description && "min-h-[24px]" 
      )}>
        {node.description ? (
          <div
            className="prose prose-sm dark:prose-invert max-w-none leading-relaxed break-words" // Added prose classes
            dangerouslySetInnerHTML={{ __html: parsedDescription }}
          />
        ) : (
          <div className="h-full"></div> 
        )}
      </div>
    </div>
  );
});

NodeCardComponent.displayName = 'NodeCardComponent';
export const NodeCard = NodeCardComponent;
