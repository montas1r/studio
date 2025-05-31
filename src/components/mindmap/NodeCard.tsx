
"use client";

import type { NodeData } from '@/types/mindmap';
import { Button } from "@/components/ui/button";
import { Edit3, Trash2, PlusCircle } from 'lucide-react';
import React, { useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { STANDARD_NODE_WIDTH, MIN_NODE_HEIGHT } from '@/hooks/useMindmaps'; // STANDARD_NODE_WIDTH is 320px

interface NodeCardProps {
  node: NodeData;
  onEdit: (node: NodeData) => void;
  onDelete: (nodeId: string) => void;
  onAddChild: (parentId: string) => void;
  onDragStart: (event: React.DragEvent<HTMLDivElement>, nodeId: string) => void;
  onNodeHeightChange?: (nodeId: string, measuredHeight: number) => void; // Renamed, only for height
  getApproxNodeHeightFromHook: (nodeContent: Partial<Pick<NodeData, 'title' | 'description' | 'emoji'>>, currentWidth: number) => number;
  className?: string;
}

const NodeCardComponent = React.memo<NodeCardProps>(({
  node,
  onEdit,
  onDelete,
  onAddChild,
  onDragStart,
  onNodeHeightChange,
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

  // Width is now set by inline style via cardPositionStyle
  const cardBaseClasses = "flex flex-col cursor-grab transition-all duration-150 ease-out overflow-hidden rounded-2xl shadow-lg border-2"; 
  const currentCardClasses = cn(cardBaseClasses, themeBgClass, themeBorderClass, className);

  const handleDragStartInternal = (event: React.DragEvent<HTMLDivElement>) => {
    // No resize handle to check against anymore
    onDragStart(event, node.id);
  };

  useEffect(() => {
    const currentRef = nodeRef.current;
    if (currentRef && onNodeHeightChange) {
      const measureAndReportHeight = () => {
        if (!currentRef) return;
        const { height: measuredHeightDOM } = currentRef.getBoundingClientRect();
        const newHeight = Math.round(measuredHeightDOM);

        if (newHeight > 0) {
          const nodeContentForApproxHeight = { title: node.title, description: node.description, emoji: node.emoji };
          const currentApproxHeight = getApproxNodeHeightFromHook(nodeContentForApproxHeight, node.width ?? STANDARD_NODE_WIDTH);
          const storedHeight = node.height ?? currentApproxHeight;

          if (Math.abs(storedHeight - newHeight) >= 1) {
            onNodeHeightChange(node.id, newHeight);
          }
        }
      };
      
      const initialRect = currentRef.getBoundingClientRect();
      const initialHeight = Math.round(initialRect.height);
      if (initialHeight > 0) {
          const nodeContentForApproxHeight = { title: node.title, description: node.description, emoji: node.emoji };
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
      onNodeHeightChange, 
      getApproxNodeHeightFromHook,
      node.width, // If width changes (due to size selection), height might need re-evaluation
      node.height // Re-check if height prop changes from outside
    ]);

  return (
    <div
      id={`node-${node.id}`}
      ref={nodeRef}
      className={currentCardClasses}
      style={cardPositionStyle}
      draggable
      onDragStart={handleDragStartInternal}
      onClick={(e) => e.stopPropagation()} 
      onMouseDown={(e) => e.stopPropagation() } // Simplified, no resize handle
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
          "px-4 py-3 flex-grow", 
          descriptionBgClass,
          descriptionTextColorClass,
          !node.description && "min-h-[24px]" 
      )}>
        {node.description ? (
          <p className={cn("text-sm whitespace-pre-wrap leading-relaxed break-words")}>{node.description}</p>
        ) : (
          <div className="h-full"></div> 
        )}
      </div>
      {/* Resize handle div removed */}
    </div>
  );
});

NodeCardComponent.displayName = 'NodeCardComponent';
export const NodeCard = NodeCardComponent;
