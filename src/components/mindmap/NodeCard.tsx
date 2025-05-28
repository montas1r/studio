
"use client";

import type { NodeData } from '@/types/mindmap';
import { Button } from "@/components/ui/button";
import { Edit3, Trash2, PlusCircle } from 'lucide-react';
import React from 'react';
import { cn } from '@/lib/utils';

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
  const cardBaseClasses = "rounded-xl shadow-xl w-[300px] flex flex-col border-2 cursor-grab transition-all duration-150 ease-out node-card-draggable";
  const headerBaseClasses = "flex items-center justify-between p-3 rounded-t-xl";
  
  const cardStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${node.x}px`,
    top: `${node.y}px`,
    width: '300px', 
  };

  let currentCardClasses = cardBaseClasses;
  let currentHeaderClasses = headerBaseClasses;
  let headerTextColorClass = "";
  let buttonTextColorClass = "";
  let buttonHoverBgClass = "";
  let descriptionBgClass = "";
  let descriptionTextColorClass = "text-foreground/80"; // Default text color for description

  if (node.customBackgroundColor) {
    cardStyle.backgroundColor = `hsl(var(--${node.customBackgroundColor}))`;
    currentCardClasses = cn(currentCardClasses, `border-[hsl(var(--${node.customBackgroundColor}-raw,var(--${node.customBackgroundColor})))]`);
    headerTextColorClass = `text-[hsl(var(--${node.customBackgroundColor}-foreground,var(--foreground)))]`;
    buttonTextColorClass = headerTextColorClass; 
    buttonHoverBgClass = `hover:bg-[hsla(var(--${node.customBackgroundColor}-raw,var(--${node.customBackgroundColor})),0.2)]`;
    descriptionBgClass = `bg-[hsla(var(--${node.customBackgroundColor}-raw,var(--${node.customBackgroundColor})),0.1)]`; // Lighter version of custom color
    descriptionTextColorClass = headerTextColorClass; 

  } else if (isRoot) {
    currentCardClasses = cn(currentCardClasses, "bg-primary/20 border-primary");
    currentHeaderClasses = cn(currentHeaderClasses, "bg-primary/30");
    headerTextColorClass = "text-primary-foreground";
    buttonTextColorClass = "text-primary-foreground";
    buttonHoverBgClass = "hover:bg-primary/50";
    descriptionBgClass = "bg-primary/10";
    descriptionTextColorClass = "text-primary-foreground";
  } else {
    currentCardClasses = cn(currentCardClasses, "bg-accent/20 border-accent");
    currentHeaderClasses = cn(currentHeaderClasses, "bg-accent/30");
    headerTextColorClass = "text-accent-foreground";
    buttonTextColorClass = "text-accent-foreground";
    buttonHoverBgClass = "hover:bg-accent/50";
    descriptionBgClass = "bg-accent/10";
    descriptionTextColorClass = "text-accent-foreground";
  }
  
  return (
    <div
      id={`node-${node.id}`}
      className={cn(currentCardClasses, className)} 
      style={cardStyle}
      draggable
      onDragStart={(e) => onDragStart(e, node.id)}
      onClick={(e) => e.stopPropagation()} 
      onMouseDown={(e) => e.stopPropagation()} 
    >
      <div className={cn(currentHeaderClasses)}>
        <div className="flex items-center gap-1.5 flex-grow min-w-0">
          {node.emoji && <span className="text-lg mr-1.5 flex-shrink-0 select-none">{node.emoji}</span>}
          <h3 className={cn("text-base font-semibold truncate", headerTextColorClass)} title={node.title}>
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
          <Button variant="ghost" size="icon" onClick={() => onDelete(node.id)} aria-label="Delete node" 
            className={cn("h-7 w-7", 
              node.customBackgroundColor ? buttonTextColorClass : "text-destructive", 
              node.customBackgroundColor ? buttonHoverBgClass : "hover:text-destructive-foreground hover:bg-destructive/80"
            )}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {node.description && (
        <div className={cn(
            "p-3 text-sm rounded-b-xl flex-grow",
            descriptionBgClass, 
            descriptionTextColorClass
        )}>
          <p className="whitespace-pre-wrap text-xs leading-relaxed break-words">{node.description}</p>
        </div>
      )}
      {!node.description && <div className={cn("min-h-[10px] rounded-b-xl", descriptionBgClass)} ></div>}
    </div>
  );
}
