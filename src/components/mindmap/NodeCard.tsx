
"use client";

import type { NodeData, PaletteColorKey } from '@/types/mindmap';
import { Button } from "@/components/ui/button";
import { Edit3, Trash2, PlusCircle } from 'lucide-react';
import React from 'react'; 
import { cn } from '@/lib/utils';
// No Image component in v0.0.5

interface NodeCardProps {
  node: NodeData;
  onEdit: (node: NodeData) => void;
  onDelete: (nodeId: string) => void;
  onAddChild: (parentId: string) => void;
  onDragStart: (event: React.DragEvent<HTMLDivElement>, nodeId: string) => void;
  className?: string;
  domRefCallback: (nodeId: string, element: HTMLDivElement | null) => void;
}

const NodeCardComponent = ({ 
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

  const cardStyle: React.CSSProperties = {};
  let headerTextColorClass = "";
  let buttonTextColorClass = "";
  let buttonHoverBgClass = "";
  
  // Base classes for border (theme-based or default)
  let borderClass = isRoot ? "border-primary" : "border-accent";

  if (node.customBackgroundColor) {
    cardStyle.backgroundColor = `hsl(var(--${node.customBackgroundColor}))`;
    // Use custom color for border as well if background is custom
    borderClass = `border-[hsl(var(--${node.customBackgroundColor}))]`;

    // Basic contrast check for header text/buttons based on typical palette.
    // These chart colors are often dark, so light text is usually okay.
    // More sophisticated contrast logic would be needed for a wider, unknown palette.
    if (node.customBackgroundColor === 'chart-4' || node.customBackgroundColor === 'chart-5') {
        headerTextColorClass = "text-gray-900"; // Or use a foreground variable from the chart palette
        buttonTextColorClass = "text-gray-900";
        buttonHoverBgClass = "hover:bg-white/30";
    } else {
        headerTextColorClass = "text-primary-foreground"; // Assuming custom colors are dark enough for light text
        buttonTextColorClass = "text-primary-foreground";
        buttonHoverBgClass = "hover:bg-black/20";
    }
  } else {
    // Default theme-based background and text colors
    if (isRoot) {
      cardStyle.backgroundColor = `hsl(var(--primary))`;
      headerTextColorClass = "text-primary-foreground";
      buttonTextColorClass = "text-primary-foreground";
      buttonHoverBgClass = "hover:bg-black/20";
    } else {
      cardStyle.backgroundColor = `hsl(var(--accent))`;
      headerTextColorClass = "text-accent-foreground";
      buttonTextColorClass = "text-accent-foreground";
      buttonHoverBgClass = "hover:bg-black/20";
    }
  }
  
  const refCallback = React.useCallback((element: HTMLDivElement | null) => {
    domRefCallback(node.id, element);
  }, [domRefCallback, node.id]);

  return (
    <div
      id={`node-${node.id}`}
      ref={refCallback}
      className={cn(
        "node-card-draggable", 
        "flex flex-col cursor-grab transition-all duration-150 ease-out overflow-hidden rounded-2xl shadow-lg border-2",
        borderClass, // Apply theme or custom border color
        className
      )}
      style={{ ...cardPositionStyle, ...cardStyle }} 
      draggable
      onDragStart={(e) => onDragStart(e, node.id)}
      onClick={(e) => e.stopPropagation()} 
      onMouseDown={(e) => e.stopPropagation()} 
    >
      <div className={cn("flex items-center justify-between px-4 py-2 rounded-t-2xl", headerTextColorClass)} >
        <div className="flex items-center gap-1.5 flex-grow min-w-0">
          {node.emoji && <span className="text-xl mr-1.5 flex-shrink-0 select-none">{node.emoji}</span>}
          <h3 className={cn("text-lg font-semibold truncate")} title={node.title}>
            {node.title || "Untitled"}
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
          "px-4 py-3 flex-grow rounded-b-2xl",
          "bg-slate-50 text-slate-700", // Always light theme for description box
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

export const NodeCard = React.memo(NodeCardComponent);
