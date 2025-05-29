
"use client";

import type { NodeData } from '@/types/mindmap';
import { Button } from "@/components/ui/button";
import { Edit3, Trash2, PlusCircle } from 'lucide-react';
import React from 'react';
import { cn } from '@/lib/utils';
// No Image import in v0.0.5 logic, but PaletteColorKey means custom color logic is now active
// For v0.0.5, descriptionBgClass was theme-based opacity: bg-primary/10 or bg-accent/10
// Then a later request made it always light: bg-slate-50 text-slate-700
// Sticking to "always light" as per latest interpretation before this request.

const APPROX_MIN_DESC_BOX_HEIGHT = 20; 

interface NodeCardProps {
  node: NodeData;
  isRoot: boolean;
  onEdit: (node: NodeData) => void;
  onDelete: (nodeId: string) => void;
  onAddChild: (parentId: string) => void;
  onDragStart: (event: React.DragEvent<HTMLDivElement>, nodeId: string) => void;
  className?: string;
}

export function NodeCard({ node, isRoot, onEdit, onDelete, onAddChild, onDragStart, className }: NodeCardProps) {
  const cardBaseClasses = "rounded-xl shadow-xl flex flex-col cursor-grab transition-all duration-150 ease-out overflow-hidden";
  const headerBaseClasses = "flex items-center justify-between p-3 rounded-t-xl";

  const cardPositionStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${node.x}px`,
    top: `${node.y}px`,
    width: '300px', 
  };
  
  let currentCardClasses = cn(cardBaseClasses, "border-2"); // Always apply border-2 for width
  let currentHeaderClasses = headerBaseClasses;
  let headerTextColorClass = "";
  let buttonTextColorClass = "";
  let buttonHoverBgClass = "";
  
  // Description box is always light-themed as per recent requests for v0.0.5
  const descriptionBgClass = "bg-slate-50";
  const descriptionTextColorClass = "text-slate-700";

  let cardInlineStyle: React.CSSProperties = { ...cardPositionStyle };

  // Determine base theme styling (primary for root, accent for child)
  // These will be overridden by customBorderColor for the border if set.
  if (isRoot) {
    currentCardClasses = cn(currentCardClasses, "bg-primary border-primary"); // border-primary provides fallback
    currentHeaderClasses = cn(currentHeaderClasses, "bg-primary");
    headerTextColorClass = "text-primary-foreground";
    buttonTextColorClass = "text-primary-foreground";
    buttonHoverBgClass = "hover:bg-primary/80";
  } else {
    currentCardClasses = cn(currentCardClasses, "bg-accent border-accent"); // border-accent provides fallback
    currentHeaderClasses = cn(currentHeaderClasses, "bg-accent");
    headerTextColorClass = "text-accent-foreground";
    buttonTextColorClass = "text-accent-foreground";
    buttonHoverBgClass = "hover:bg-accent/80";
  }

  // Apply custom border color if set, overriding theme border color
  if (node.customBorderColor) {
    cardInlineStyle.borderColor = `hsl(var(--${node.customBorderColor}))`;
    // Note: Background color of the node itself (currentCardClasses bg-primary/bg-accent) is NOT changed by customBorderColor.
    // The header and button text colors remain based on isRoot for now.
    // If customBorderColor implies the whole node theme changes, more logic for text contrast would be needed.
    // For now, customBorderColor ONLY affects the border.
  }
  
  return (
    <div
      id={`node-${node.id}`}
      className={cn(currentCardClasses, className)}
      style={cardInlineStyle}
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

      <div className={cn(
          "p-3 flex-grow", 
          descriptionBgClass, 
          descriptionTextColorClass,
          !node.description && `min-h-[${APPROX_MIN_DESC_BOX_HEIGHT}px]`
      )}>
        {node.description ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed break-words">{node.description}</p>
        ) : (
          <div className="h-full"></div> 
        )}
      </div>
    </div>
  );
}
