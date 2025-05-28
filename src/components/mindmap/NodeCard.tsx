
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
  let currentButtonTextClass = "";
  let descriptionBgClass = "bg-card"; 

  // Determine base theme styling first
  if (isRoot) {
    currentCardClasses = cn(currentCardClasses, "bg-primary/10 border-primary");
    currentHeaderClasses = cn(currentHeaderClasses, "bg-primary/20 text-primary-foreground");
    currentButtonTextClass = "text-primary-foreground";
    descriptionBgClass = "bg-primary/10";
  } else {
    currentCardClasses = cn(currentCardClasses, "bg-accent/10 border-accent");
    currentHeaderClasses = cn(currentHeaderClasses, "bg-accent/20 text-accent-foreground");
    currentButtonTextClass = "text-accent-foreground";
    descriptionBgClass = "bg-accent/10";
  }
  
  // Override with custom background color if set
  if (node.customBackgroundColor) {
    const customColorVar = `var(--${node.customBackgroundColor})`;
    cardStyle.backgroundColor = `hsl(${customColorVar})`;
    currentCardClasses = cn(cardBaseClasses, `border-[hsl(${customColorVar})]`); // Override border
    
    // Make header transparent or slightly darker/lighter version of custom color
    // For simplicity, let's use a subtle overlay on the custom color for the header
    currentHeaderClasses = cn(headerBaseClasses, `bg-[hsla(var(--${node.customBackgroundColor}-raw,var(--${node.customBackgroundColor})),0.8)]`); 
    currentButtonTextClass = "text-[hsl(var(--card-foreground))] dark:text-[hsl(var(--card-foreground))]"; // Assuming card-foreground provides good contrast

    // For description, use a lighter/less opaque version of the custom color
    descriptionBgClass = `bg-[hsla(var(--${node.customBackgroundColor}-raw,var(--${node.customBackgroundColor})),0.2)]`;
  }
  
  const buttonHoverBgClass = node.customBackgroundColor 
    ? "hover:bg-[hsla(var(--card-foreground-raw,0_0%_98%),0.1)] dark:hover:bg-[hsla(var(--card-foreground-raw,0_0%_98%),0.1)]"
    : (isRoot ? "hover:bg-primary/30" : "hover:bg-accent/30");

  return (
    <div
      id={`node-${node.id}`}
      className={cn(currentCardClasses, className)} 
      style={cardStyle}
      draggable
      onDragStart={(e) => onDragStart(e, node.id)}
    >
      <div className={cn(currentHeaderClasses)}>
        <div className="flex items-center gap-1.5 flex-grow min-w-0">
          {node.emoji && <span className="text-lg mr-1.5 flex-shrink-0">{node.emoji}</span>}
          <h3 className={cn("text-base font-semibold truncate", 
            node.customBackgroundColor ? 'text-[hsl(var(--card-foreground))]' : (isRoot ? 'text-primary-foreground' : 'text-accent-foreground')
          )} title={node.title}>
            {node.title}
          </h3>
        </div>
        <div className="flex items-center space-x-1 flex-shrink-0 ml-2">
          <Button variant="ghost" size="icon" onClick={() => onEdit(node)} aria-label="Edit node" className={cn("h-7 w-7", currentButtonTextClass, buttonHoverBgClass)}>
            <Edit3 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onAddChild(node.id)} className={cn("h-7 w-7", currentButtonTextClass, buttonHoverBgClass)} aria-label="Add child node">
            <PlusCircle className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onDelete(node.id)} aria-label="Delete node" className={cn("h-7 w-7 text-destructive hover:bg-destructive/10")}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {node.description && (
        <div className={cn(
            "p-3 text-sm rounded-b-xl flex-grow",
            descriptionBgClass, 
            node.customBackgroundColor ? 'text-[hsl(var(--card-foreground))] opacity-80' : 'text-card-foreground/80'
        )}>
          <p className="whitespace-pre-wrap text-xs leading-relaxed break-words">{node.description}</p>
        </div>
      )}
      {(!node.description) && <div className="min-h-[20px]"></div>}
    </div>
  );
}
