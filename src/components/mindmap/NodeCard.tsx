
"use client";

import type { NodeData } from '@/types/mindmap';
import { Button } from "@/components/ui/button";
import { Edit3, Trash2, PlusCircle } from 'lucide-react';
import React from 'react';
import { cn } from '@/lib/utils';
import Image from 'next/image'; // Keep for future use if imageUrl is re-added

const APPROX_MIN_DESC_BOX_HEIGHT = 10;

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
  const cardBaseClasses = "rounded-xl shadow-xl w-[300px] flex flex-col border-2 cursor-grab transition-all duration-150 ease-out overflow-hidden";
  const headerBaseClasses = "flex items-center justify-between p-3 rounded-t-xl"; // No, rounded-t-lg here, keep it related to card's xl

  const cardStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${node.x}px`,
    top: `${node.y}px`,
    width: '300px',
  };

  let currentCardClasses = cardBaseClasses;
  let currentHeaderClasses = headerBaseClasses;
  let headerTextColorClass = ""; // Will be determined by theme or custom bg
  let buttonTextColorClass = ""; // Will be determined by theme or custom bg
  let buttonHoverBgClass = "";  // Will be determined by theme or custom bg
  
  // Fixed light theme for description box
  const descriptionBgClass = "bg-slate-100 dark:bg-slate-50"; 
  const descriptionTextColorClass = "text-slate-700 dark:text-slate-800";

  let borderColorClass = "";

  if (node.customBackgroundColor) {
    cardStyle.backgroundColor = `hsl(var(--${node.customBackgroundColor}))`;
    borderColorClass = `border-[hsl(var(--${node.customBackgroundColor}))]`;
    // Determine foreground color based on the palette's definition in globals.css
    // This assumes variables like --chart-1-foreground exist
    headerTextColorClass = `text-[hsl(var(--${node.customBackgroundColor}-foreground,var(--foreground)))]`;
    buttonTextColorClass = headerTextColorClass; // Buttons use same color as header text
    // For hover, we can try to make it slightly darker or use a generic overlay
    buttonHoverBgClass = `hover:bg-[hsla(var(--${node.customBackgroundColor}-raw,var(--${node.customBackgroundColor})),0.8)]`; 
  } else {
    if (isRoot) {
      currentCardClasses = cn(currentCardClasses, "bg-primary/20");
      borderColorClass = "border-primary";
      currentHeaderClasses = cn(currentHeaderClasses, "bg-primary/30");
      headerTextColorClass = "text-primary-foreground";
      buttonTextColorClass = "text-primary-foreground";
      buttonHoverBgClass = "hover:bg-primary/50";
    } else {
      currentCardClasses = cn(currentCardClasses, "bg-accent/20");
      borderColorClass = "border-accent";
      currentHeaderClasses = cn(currentHeaderClasses, "bg-accent/30");
      headerTextColorClass = "text-accent-foreground";
      buttonTextColorClass = "text-accent-foreground";
      buttonHoverBgClass = "hover:bg-accent/50";
    }
  }
  currentCardClasses = cn(currentCardClasses, borderColorClass);


  return (
    <div
      id={`node-${node.id}`}
      className={cn(currentCardClasses, className, "node-card-draggable")}
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
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(node.id)}
            aria-label="Delete node"
            className={cn("h-7 w-7 hover:bg-destructive hover:text-destructive-foreground", buttonTextColorClass)} // Use specific text color
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Image display (if imageUrl is ever re-added to NodeData)
      {node.imageUrl && isValidHttpUrl(node.imageUrl) && (
        <div className="relative w-full aspect-video overflow-hidden bg-muted/30">
          <Image
            src={node.imageUrl}
            alt={`Image for ${node.title}`}
            layout="fill"
            objectFit="cover"
            onError={() => console.warn("Failed to load image:", node.imageUrl)}
          />
        </div>
      )} */}

      <div className={cn(
          "p-3 text-sm rounded-b-xl flex-grow", // rounded-b-xl to match card
          descriptionBgClass,
          descriptionTextColorClass,
          !node.description && `min-h-[${APPROX_MIN_DESC_BOX_HEIGHT}px]`
      )}>
        {node.description ? (
          <p className="whitespace-pre-wrap text-xs leading-relaxed break-words">{node.description}</p>
        ) : (
          <div className="h-full"></div>
        )}
      </div>
    </div>
  );
}

// Helper to check for valid http/https URL (basic check)
// function isValidHttpUrl(string: string) {
//   let url;
//   try {
//     url = new URL(string);
//   } catch (_) {
//     return false;
//   }
//   return url.protocol === "http:" || url.protocol === "https:";
// }
