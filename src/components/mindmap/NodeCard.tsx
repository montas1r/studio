
"use client";

import type { NodeData } from '@/types/mindmap'; // Removed PaletteColorKey import
import { Button } from "@/components/ui/button";
import { Edit3, Trash2, PlusCircle } from 'lucide-react';
import React from 'react';
import { cn } from '@/lib/utils';

const APPROX_MIN_DESC_BOX_HEIGHT = 20; 

interface NodeCardProps {
  node: NodeData;
  onEdit: (node: NodeData) => void;
  onDelete: (nodeId: string) => void;
  onAddChild: (parentId: string) => void;
  onDragStart: (event: React.DragEvent<HTMLDivElement>, nodeId: string) => void;
  className?: string;
}

// No getContrastingTextColor needed for v0.0.5 as it uses theme defaults
export function NodeCard({ node, onEdit, onDelete, onAddChild, onDragStart, className }: NodeCardProps) {
  const isRoot = !node.parentId;
  const cardBaseClasses = "rounded-xl shadow-xl flex flex-col cursor-grab transition-all duration-150 ease-out overflow-hidden border-2";
  const headerBaseClasses = "flex items-center justify-between p-3 rounded-t-xl";

  const cardPositionStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${node.x}px`,
    top: `${node.y}px`,
    width: '300px', 
  };
  
  let currentCardClasses = cn(cardBaseClasses);
  let currentHeaderClasses = headerBaseClasses;
  let headerTextColorClass = "";
  let buttonTextColorClass = "";
  let buttonHoverBgClass = "";
  let descriptionBgClass = ""; // For theme-based light description bg

  // v0.0.5 uses theme-based colors, no customBackgroundColor logic here for the main node
  if (isRoot) {
    currentCardClasses = cn(currentCardClasses, "bg-primary border-primary");
    currentHeaderClasses = cn(currentHeaderClasses, "bg-primary");
    headerTextColorClass = "text-primary-foreground";
    buttonTextColorClass = "text-primary-foreground";
    buttonHoverBgClass = "hover:bg-primary/80";
    descriptionBgClass = "bg-primary/10 dark:bg-primary/20"; // Lighter version of primary
  } else {
    currentCardClasses = cn(currentCardClasses, "bg-accent border-accent");
    currentHeaderClasses = cn(currentHeaderClasses, "bg-accent");
    headerTextColorClass = "text-accent-foreground";
    buttonTextColorClass = "text-accent-foreground";
    buttonHoverBgClass = "hover:bg-accent/80";
    descriptionBgClass = "bg-accent/10 dark:bg-accent/20"; // Lighter version of accent
  }
  
  return (
    <div
      id={`node-${node.id}`}
      className={cn(currentCardClasses, className, "node-card-draggable")} // Added node-card-draggable
      style={cardPositionStyle}
      draggable
      onDragStart={(e) => onDragStart(e, node.id)}
      onClick={(e) => e.stopPropagation()} 
      onMouseDown={(e) => e.stopPropagation()} 
    >
      <div className={cn(currentHeaderClasses)}>
        <div className="flex items-center gap-1.5 flex-grow min-w-0">
          {node.emoji && <span className="text-lg mr-1.5 flex-shrink-0 select-none">{node.emoji}</span>}
          <h3 className={cn("text-lg font-semibold truncate", headerTextColorClass)} title={node.title}>
            {node.title}
          </h3>
        </div>
        <div className="flex items-center space-x-0.5 flex-shrink-0 ml-2">
          <Button variant="ghost" size="icon" onClick={() => onEdit(node)} aria-label="Edit node" className={cn("h-7 w-7", buttonTextColorClass, buttonHoverBgClass)}>
            <Edit3 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onAddChild(node.id)} className={cn("h-7 w-7", buttonTextColorClass, buttonHoverBgClass)} aria-label="Add child node">
            <PlusCircle className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(node.id)}
            aria-label="Delete node"
            className={cn("h-7 w-7 hover:bg-destructive hover:text-destructive-foreground", buttonTextColorClass)} 
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {/* Description Box Styling - v0.0.5 uses theme-derived lighter background */}
      <div className={cn(
          "p-3 flex-grow", 
          descriptionBgClass, 
          headerTextColorClass, // Text color should contrast with descriptionBg (theme-based foregrounds)
          !node.description && `min-h-[${APPROX_MIN_DESC_BOX_HEIGHT}px]`
      )}>
        {node.description ? (
          <p className="text-sm whitespace-pre-wrap leading-relaxed break-words">{node.description}</p>
        ) : (
          <div className="h-full"></div> 
        )}
      </div>
    </div>
  );
}
