
"use client";

import type { NodeData } from '@/types/mindmap';
import { Button } from "@/components/ui/button";
import { Edit3, Trash2, PlusCircle } from 'lucide-react';
import React, { useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { NODE_CARD_WIDTH, MIN_NODE_HEIGHT } from '@/hooks/useMindmaps'; // Assuming MIN_NODE_HEIGHT is exported or use a local const

interface NodeCardProps {
  node: NodeData;
  onEdit: (node: NodeData) => void;
  onDelete: (nodeId: string) => void;
  onAddChild: (parentId: string) => void;
  onDragStart: (event: React.DragEvent<HTMLDivElement>, nodeId: string) => void;
  onNodeDimensionsChange?: (nodeId: string, dimensions: { width: number; height: number }) => void;
  onInitiateNodeResize?: (event: React.MouseEvent<HTMLDivElement>, nodeId: string) => void;
  className?: string;
}

const NodeCardComponent = React.memo<NodeCardProps>(({
  node,
  onEdit,
  onDelete,
  onAddChild,
  onDragStart,
  onNodeDimensionsChange,
  onInitiateNodeResize,
  className,
}) => {
  const isRoot = !node.parentId;
  const nodeRef = useRef<HTMLDivElement>(null);

  const cardPositionStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${node.x}px`,
    top: `${node.y}px`,
    width: node.width ? `${node.width}px` : `${NODE_CARD_WIDTH}px`, // Dynamically use node.width or fallback
    height: node.height ? `${node.height}px` : undefined, 
  };

  const themeBgClass = isRoot ? "bg-primary" : "bg-accent";
  const themeBorderClass = isRoot ? "border-primary" : "border-accent";
  const headerTextColorClass = isRoot ? "text-primary-foreground" : "text-accent-foreground";
  const buttonHoverBgClass = "hover:bg-black/20";

  const descriptionBgClass = 'bg-slate-100 dark:bg-slate-800';
  const descriptionTextColorClass = 'text-slate-700 dark:text-slate-200';

  // Removed 'w-80' from here, width is now controlled by cardPositionStyle
  const cardBaseClasses = "flex flex-col cursor-grab transition-all duration-150 ease-out overflow-hidden rounded-2xl shadow-lg border-2"; 
  const currentCardClasses = cn(cardBaseClasses, themeBgClass, themeBorderClass, className);

  const handleDragStartInternal = (event: React.DragEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('.resize-handle')) {
      event.preventDefault();
      return;
    }
    onDragStart(event, node.id);
  };

  useEffect(() => {
    const currentRef = nodeRef.current;
    if (currentRef && onNodeDimensionsChange) {
      const measureAndReport = () => {
        const { width, height } = currentRef.getBoundingClientRect();
        const newWidth = Math.round(width);
        const newHeight = Math.round(height);

        if (newWidth > 0 && newHeight > 0) {
          const storedWidth = node.width ?? NODE_CARD_WIDTH;
          // If node.height is undefined, it means it's content-driven.
          // We report the new height to establish it in the state.
          // If node.height is defined, we only report if it significantly changed.
          const storedHeight = node.height; 
          
          let significantChange = false;
          if (Math.abs(storedWidth - newWidth) >= 1) {
            significantChange = true;
          }
          if (storedHeight !== undefined) { // Only compare if a height was previously stored
            if (Math.abs(storedHeight - newHeight) >= 1) {
              significantChange = true;
            }
          } else { // No height was stored, so this is the first concrete measurement
            significantChange = true;
          }

          if (significantChange) {
            onNodeDimensionsChange(node.id, { width: newWidth, height: newHeight });
          }
        }
      };
      
      const initialRect = currentRef.getBoundingClientRect();
      const initialWidth = Math.round(initialRect.width);
      const initialHeight = Math.round(initialRect.height);

      if (initialWidth > 0 && initialHeight > 0) {
          const expectedInitialWidth = node.width ?? NODE_CARD_WIDTH;
          const storedInitialHeight = node.height; // This is the height from the state
          
          let significantInitialChange = false;
          if (Math.abs(expectedInitialWidth - initialWidth) >= 1) {
            significantInitialChange = true;
          }

          // If no height is stored in state, or if stored height differs from measured
          if (storedInitialHeight === undefined || Math.abs(storedInitialHeight - initialHeight) >= 1) {
            significantInitialChange = true;
          }
          
          if (significantInitialChange) {
             onNodeDimensionsChange(node.id, { width: initialWidth, height: initialHeight });
          }
      }

      const resizeObserver = new ResizeObserver(measureAndReport);
      resizeObserver.observe(currentRef);

      return () => {
        if (currentRef) { 
            resizeObserver.unobserve(currentRef);
        }
        resizeObserver.disconnect();
      };
    }
    // node.width and node.height removed from dependencies as they are outputs of this effect
  }, [node.id, node.title, node.description, node.emoji, onNodeDimensionsChange]);


  const handleResizeMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation(); 
    if (onInitiateNodeResize) {
      onInitiateNodeResize(event, node.id);
    }
  };

  return (
    <div
      id={`node-${node.id}`}
      ref={nodeRef}
      className={currentCardClasses}
      style={cardPositionStyle}
      draggable
      onDragStart={handleDragStartInternal}
      onClick={(e) => e.stopPropagation()} 
      onMouseDown={(e) => { 
         if (!(e.target as HTMLElement).closest('.resize-handle')) {
            e.stopPropagation();
         }
      }}
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
      {onInitiateNodeResize && (
        <div
          className="resize-handle absolute bottom-0 right-0 w-4 h-4 bg-primary/60 hover:bg-primary active:bg-primary cursor-nwse-resize rounded-tl-md border-l border-t border-primary-foreground/50 z-10"
          onMouseDown={handleResizeMouseDown}
          onClick={(e) => e.stopPropagation()} 
        />
      )}
    </div>
  );
});

NodeCardComponent.displayName = 'NodeCardComponent';
export const NodeCard = NodeCardComponent;
