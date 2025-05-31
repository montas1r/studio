
"use client";

import type { NodeData } from '@/types/mindmap';
import { Button } from "@/components/ui/button";
import { Edit3, Trash2, PlusCircle } from 'lucide-react';
import React, { useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface NodeCardProps {
  node: NodeData;
  onEdit: (node: NodeData) => void;
  onDelete: (nodeId: string) => void;
  onAddChild: (parentId: string) => void;
  onDragStart: (event: React.DragEvent<HTMLDivElement>, nodeId: string) => void;
  onNodeDimensionsChange?: (nodeId: string, dimensions: { width: number; height: number }) => void;
  className?: string;
}

const NodeCardComponent = React.memo<NodeCardProps>(({
  node,
  onEdit,
  onDelete,
  onAddChild,
  onDragStart,
  onNodeDimensionsChange,
  className,
}) => {
  const isRoot = !node.parentId;
  const nodeRef = useRef<HTMLDivElement>(null);

  const cardPositionStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${node.x}px`,
    top: `${node.y}px`,
    width: `${node.width ?? 300}px`, // Use measured width or fallback
    // height will be auto based on content or set by NodeData.height if we were to use it directly
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

  useEffect(() => {
    const currentRef = nodeRef.current;
    if (currentRef && onNodeDimensionsChange) {
      const measureAndReport = () => {
        const { width, height } = currentRef.getBoundingClientRect();
        // Round dimensions to avoid rapid tiny updates if desired, or compare with tolerance
        const newWidth = Math.round(width);
        const newHeight = Math.round(height);

        if (newWidth > 0 && newHeight > 0) {
          // Only report if dimensions changed by at least 1px to prevent potential loops
          if (Math.abs((node.width ?? 0) - newWidth) >= 1 || Math.abs((node.height ?? 0) - newHeight) >= 1) {
            onNodeDimensionsChange(node.id, { width: newWidth, height: newHeight });
          }
        }
      };
      
      // Initial measurement
      measureAndReport();

      const resizeObserver = new ResizeObserver(measureAndReport);
      resizeObserver.observe(currentRef);

      return () => {
        resizeObserver.unobserve(currentRef);
        resizeObserver.disconnect();
      };
    }
  }, [node.id, node.title, node.description, node.emoji, onNodeDimensionsChange, node.width, node.height]); // Re-observe if key content impacting size changes, or if onNodeDimensionsChange itself changes

  return (
    <div
      id={`node-${node.id}`}
      ref={nodeRef}
      className={currentCardClasses}
      style={cardPositionStyle}
      draggable
      onDragStart={handleDragStartInternal}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
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
           // The min-h-[24px] here is for the *content box* of this div.
           // Combined with py-3 (12px top/bottom padding), the total section height will be at least 48px.
          !node.description && "min-h-[24px]"
      )}>
        {node.description ? (
          <p className={cn("text-sm whitespace-pre-wrap leading-relaxed break-words")}>{node.description}</p>
        ) : (
          <div className="h-full"></div>
        )}
      </div>
    </div>
  );
});

NodeCardComponent.displayName = 'NodeCardComponent';
export const NodeCard = NodeCardComponent;
