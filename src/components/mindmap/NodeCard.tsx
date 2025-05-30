
"use client";

import type { NodeData } from '@/types/mindmap';
import { Button } from "@/components/ui/button";
import { Edit3, Trash2, PlusCircle } from 'lucide-react';
import React, { useCallback } from 'react'; 
import { cn } from '@/lib/utils';

interface NodeCardProps {
  node: NodeData;
  onEdit: (node: NodeData) => void;
  onDelete: (nodeId: string) => void;
  onAddChild: (parentId: string) => void;
  onDragStart: (event: React.DragEvent<HTMLDivElement>, nodeId: string) => void;
  className?: string;
  // No domRefCallback in v0.0.5 simpler wire drawing
}

const NodeCardComponent = ({ 
  node, 
  onEdit, 
  onDelete, 
  onAddChild, 
  onDragStart, 
  className,
}: NodeCardProps) => {
  const isRoot = !node.parentId;
  
  const cardPositionStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${node.x}px`,
    top: `${node.y}px`,
    width: '300px', // Fixed width
  };

  const cardBaseClasses = "flex flex-col cursor-grab transition-all duration-150 ease-out overflow-hidden rounded-2xl shadow-lg border-2";
  
  const themeBgClass = isRoot ? "bg-primary" : "bg-accent";
  const themeBorderClass = isRoot ? "border-primary" : "border-accent";
  const themeHeaderTextColorClass = isRoot ? "text-primary-foreground" : "text-accent-foreground";
  const themeButtonHoverBgClass = "hover:bg-black/20";

  const currentCardClasses = cn(cardBaseClasses, themeBgClass, themeBorderClass, className);
  
  // For v0.0.5, description box background is a lighter version of the theme color
  const descriptionBgClass = isRoot ? 'bg-primary/10' : 'bg-accent/10';
  const descriptionTextColorClass = isRoot ? 'text-primary-foreground/90' : 'text-accent-foreground/90';


  return (
    <div
      id={`node-${node.id}`}
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
};

NodeCardComponent.displayName = 'NodeCardComponent';
export const NodeCard = React.memo(NodeCardComponent);
