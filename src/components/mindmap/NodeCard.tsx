
"use client";

import type { NodeData, PaletteColorKey } from '@/types/mindmap';
import { Button } from "@/components/ui/button";
import { Edit3, Trash2, PlusCircle } from 'lucide-react';
import React from 'react';
import { cn } from '@/lib/utils';
// import Image from 'next/image'; // Removed for this revert

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
  const cardBaseClasses = "rounded-xl shadow-xl w-[300px] flex flex-col border-2 cursor-grab transition-all duration-150 ease-out";
  const headerBaseClasses = "flex items-center justify-between p-3 rounded-t-xl";

  const rootNodeCardClasses = "bg-primary/10 border-primary";
  const rootNodeHeaderClasses = "bg-primary/20 text-primary-foreground";

  const childNodeCardClasses = "bg-accent/10 border-accent";
  const childNodeHeaderClasses = "bg-accent/20 text-accent-foreground";

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

  if (node.customBackgroundColor) {
    const customColorVar = `var(--${node.customBackgroundColor})`;
    cardStyle.backgroundColor = `hsl(${customColorVar})`;
    currentCardClasses = cn(cardBaseClasses, `border-[hsl(${customColorVar})]`); 
    currentHeaderClasses = cn(headerBaseClasses, 'bg-transparent'); 
    currentButtonTextClass = "text-[hsl(var(--card-foreground))] dark:text-[hsl(var(--card-foreground))]";
    // Use hsla for background with opacity for the description
    descriptionBgClass = `bg-[hsla(var(--${node.customBackgroundColor}),0.2)]`;
  } else {
    currentCardClasses = cn(cardBaseClasses, isRoot ? rootNodeCardClasses : childNodeCardClasses);
    currentHeaderClasses = cn(headerBaseClasses, isRoot ? rootNodeHeaderClasses : childNodeHeaderClasses);
    currentButtonTextClass = isRoot ? "text-primary-foreground" : "text-accent-foreground";
    descriptionBgClass = isRoot ? "bg-primary/10" : "bg-accent/10";
  }
  
  const buttonHoverBgClass = node.customBackgroundColor 
    ? "hover:bg-[hsla(var(--card-foreground-raw,0_0%_98%),0.1)] dark:hover:bg-[hsla(var(--card-foreground-raw,0_0%_98%),0.1)]"
    : (isRoot ? "hover:bg-primary/30" : "hover:bg-accent/30");

  // const showImage = node.imageUrl && isValidHttpUrl(node.imageUrl); // Removed for this revert

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
          <h3 className={cn("text-base font-semibold truncate", node.customBackgroundColor ? 'text-[hsl(var(--card-foreground))]' : (isRoot ? 'text-primary-foreground' : 'text-accent-foreground'))} title={node.title}>
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

      {/* Image display removed for this revert */}

      {node.description && (
        <div className={cn(
            "p-3 text-sm rounded-b-xl flex-grow",
            descriptionBgClass, // Apply the potentially semi-transparent background
            node.customBackgroundColor ? 'text-[hsl(var(--card-foreground))] opacity-80' : 'text-card-foreground/80'
        )}>
          <p className="whitespace-pre-wrap text-xs leading-relaxed break-words">{node.description}</p>
        </div>
      )}
      {(!node.description) && <div className="min-h-[20px]"></div>}
    </div>
  );
}

// function isValidHttpUrl(string?: string) { // Removed for this revert
//   if (!string) return false;
//   let url;
//   try {
//     url = new URL(string);
//   } catch (_) {
//     return false;  
//   }
//   return url.protocol === "http:" || url.protocol === "https:";
// }
