
"use client";

import type { NodeData } from '@/types/mindmap';
import { Button } from "@/components/ui/button";
import { Edit3, Trash2, PlusCircle } from 'lucide-react';
import React from 'react'; 
import { cn } from '@/lib/utils';
import Image from 'next/image'; // For potential future image use, keep for now

interface NodeCardProps {
  node: NodeData;
  onEdit: (node: NodeData) => void;
  onDelete: (nodeId: string) => void;
  onAddChild: (parentId: string) => void;
  onDragStart: (event: React.DragEvent<HTMLDivElement>, nodeId: string) => void;
  className?: string;
  domRefCallback: (nodeId: string, element: HTMLDivElement | null) => void;
}

const NodeCardComponent = React.memo(({ 
  node, 
  onEdit, 
  onDelete, 
  onAddChild, 
  onDragStart, 
  className,
  domRefCallback 
}: NodeCardProps) => {
  const isRoot = !node.parentId;
  
  const cardPositionStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${node.x}px`,
    top: `${node.y}px`,
    width: '300px', 
  };

  // Base classes for all nodes
  const cardBaseClasses = "flex flex-col cursor-grab transition-all duration-150 ease-out overflow-hidden rounded-2xl shadow-lg border-2";
  
  // Determine theme-based classes (these act as fallbacks if no custom color)
  const themeBgClass = isRoot ? "bg-primary" : "bg-accent";
  const themeBorderClass = isRoot ? "border-primary" : "border-accent";
  const themeHeaderTextColorClass = isRoot ? "text-primary-foreground" : "text-accent-foreground";
  const themeButtonHoverBgClass = "hover:bg-black/20";

  const currentCardClasses = cn(cardBaseClasses, themeBgClass, themeBorderClass, className);
  
  // Description box styling (always light themed for readability)
  const descriptionBgClass = 'bg-primary/10'; // Example using primary, could be a fixed light color
  const descriptionTextColorClass = 'text-primary-foreground/90';


  const refCallback = React.useCallback((element: HTMLDivElement | null) => {
    domRefCallback(node.id, element);
  }, [domRefCallback, node.id]);

  return (
    <div
      id={`node-${node.id}`}
      ref={refCallback}
      className={currentCardClasses}
      style={cardPositionStyle}
      draggable
      onDragStart={(e) => onDragStart(e, node.id)}
      onClick={(e) => e.stopPropagation()} 
      onMouseDown={(e) => e.stopPropagation()} 
    >
      <div className={cn("flex items-center justify-between px-4 py-2", themeHeaderTextColorClass)} >
        <div className="flex items-center gap-1.5 flex-grow min-w-0">
          {node.emoji && <span className="text-xl mr-1.5 flex-shrink-0 select-none">{node.emoji}</span>}
          <h3 className={cn("text-lg font-semibold truncate")} title={node.title}>
            {node.title || "Untitled"}
          </h3>
        </div>
        <div className="flex items-center space-x-0.5 flex-shrink-0 ml-2">
          <Button variant="ghost" size="icon" onClick={() => onEdit(node)} aria-label="Edit node" className={cn("h-7 w-7", themeHeaderTextColorClass, themeButtonHoverBgClass)}>
            <Edit3 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onAddChild(node.id)} className={cn("h-7 w-7", themeHeaderTextColorClass, themeButtonHoverBgClass)} aria-label="Add child node">
            <PlusCircle className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(node.id)}
            aria-label="Delete node"
            className={cn("h-7 w-7 hover:bg-destructive hover:text-destructive-foreground", themeHeaderTextColorClass)}
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
    </div>
  );
});

NodeCardComponent.displayName = 'NodeCardComponent';
export const NodeCard = NodeCardComponent;
