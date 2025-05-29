
"use client";

import type { NodeData } from '@/types/mindmap';
import { Button } from "@/components/ui/button";
import { Edit3, Trash2, PlusCircle } from 'lucide-react';
import React from 'react';
import { cn } from '@/lib/utils';
import Image from 'next/image';

const APPROX_MIN_DESC_BOX_HEIGHT = 20; // Adjusted for potentially larger base text

interface NodeCardProps {
  node: NodeData;
  isRoot: boolean;
  onEdit: (node: NodeData) => void;
  onDelete: (nodeId: string) => void;
  onAddChild: (parentId: string) => void;
  onDragStart: (event: React.DragEvent<HTMLDivElement>, nodeId: string) => void;
  className?: string;
}

function isValidHttpUrl(string?: string) {
  if (!string) return false;
  let url;
  try {
    url = new URL(string);
  } catch (_) {
    return false;
  }
  return url.protocol === "http:" || url.protocol === "https:";
}

export function NodeCard({ node, isRoot, onEdit, onDelete, onAddChild, onDragStart, className }: NodeCardProps) {
  const cardBaseClasses = "rounded-xl shadow-xl w-[300px] flex flex-col border-2 cursor-grab transition-all duration-150 ease-out overflow-hidden";
  const headerBaseClasses = "flex items-center justify-between p-3 rounded-t-xl";

  const cardStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${node.x}px`,
    top: `${node.y}px`,
    width: '300px', // Fixed width
  };
  
  // if (node.customBackgroundColor) {
  //   cardStyle.backgroundColor = `hsl(var(--${node.customBackgroundColor}))`;
  // }


  let currentCardClasses = cardBaseClasses;
  let currentHeaderClasses = headerBaseClasses;
  let headerTextColorClass = "";
  let buttonTextColorClass = "";
  let buttonHoverBgClass = "";
  let descriptionBgClass = "bg-slate-50"; // Always light for readability as per last request
  let descriptionTextColorClass = "text-slate-700"; // Always dark for readability

  // Default theme based styling (v0.0.5 base)
  if (isRoot) {
    currentCardClasses = cn(currentCardClasses, "bg-primary border-primary");
    currentHeaderClasses = cn(currentHeaderClasses, "bg-primary/80");
    headerTextColorClass = "text-primary-foreground";
    buttonTextColorClass = "text-primary-foreground";
    buttonHoverBgClass = "hover:bg-primary/60";
  } else {
    currentCardClasses = cn(currentCardClasses, "bg-accent border-accent");
    currentHeaderClasses = cn(currentHeaderClasses, "bg-accent/80");
    headerTextColorClass = "text-accent-foreground";
    buttonTextColorClass = "text-accent-foreground";
    buttonHoverBgClass = "hover:bg-accent/60";
  }
  
  // Override with custom color if available (from v0.0.5 + custom color step)
  // if (node.customBackgroundColor) {
  //   cardStyle.backgroundColor = `hsl(var(--${node.customBackgroundColor}))`;
  //   currentCardClasses = cn(cardBaseClasses, `border-[hsl(var(--${node.customBackgroundColor}))]`); // Use Tailwind JIT for border
    
  //   // Attempt to set contrasting button text color for custom backgrounds
  //   // This is a heuristic and might not be perfect for all custom colors.
  //   // For a robust solution, one might need a library to calculate luminance and contrast.
  //   const customColorVar = `--${node.customBackgroundColor}`;
  //   // Assuming HSL: if L > 50%, it's a light color, use dark text. Otherwise, use light text.
  //   // This is a very rough approximation. Proper contrast calculation is complex.
  //   // For now, we'll default to a generally safe option or let the theme's foreground handle it.
  //   // headerTextColorClass = "text-card-foreground"; // Rely on card-foreground from theme for custom
  //   // buttonTextColorClass = "text-card-foreground";
  //   // buttonHoverBgClass = "hover:bg-black/10"; // Generic hover for custom bg
  // }


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
          {node.emoji && <span className="text-xl mr-1.5 flex-shrink-0 select-none">{node.emoji}</span>}
          <h3 className={cn("text-lg font-semibold truncate", headerTextColorClass)} title={node.title}> {/* Increased title size from text-base to text-lg */}
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

      {/* Image display - currently not part of v0.0.5 base */}
      {/* {node.imageUrl && isValidHttpUrl(node.imageUrl) && (
        <div className="relative w-full aspect-video overflow-hidden bg-muted/30">
          <Image 
            src={node.imageUrl} 
            alt={`Image for ${node.title}`} 
            layout="fill" 
            objectFit="contain" 
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none';}} // Simple hide on error
          />
        </div>
      )} */}

      <div className={cn(
          "p-3 flex-grow", // removed text-sm from here
          descriptionBgClass, 
          descriptionTextColorClass,
          !node.description && `min-h-[${APPROX_MIN_DESC_BOX_HEIGHT}px]`
      )}>
        {node.description ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed break-words">{node.description}</p> /* Increased description size from text-xs to text-sm */
        ) : (
          <div className="h-full"></div> 
        )}
      </div>
    </div>
  );
}
