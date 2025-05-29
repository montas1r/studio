
"use client";

import type { NodeData } from '@/types/mindmap';
import { Button } from "@/components/ui/button";
import { Edit3, Trash2, PlusCircle } from 'lucide-react';
import React from 'react';
import { cn } from '@/lib/utils';
// import Image from 'next/image'; // Image feature not in v0.0.5

const APPROX_MIN_DESC_BOX_HEIGHT = 20; 

export function NodeCard({ node, onEdit, onDelete, onAddChild, onDragStart, className }: {
  node: NodeData;
  onEdit: (node: NodeData) => void;
  onDelete: (nodeId: string) => void;
  onAddChild: (parentId: string) => void;
  onDragStart: (event: React.DragEvent<HTMLDivElement>, nodeId: string) => void;
  className?: string;
}) {
  const isRoot = !node.parentId;
  
  const cardPositionStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${node.x}px`,
    top: `${node.y}px`,
    width: '300px', // Fixed width for node cards
  };
  
  const nodeStyle: React.CSSProperties = { ...cardPositionStyle };
  let headerBaseClasses = "flex items-center justify-between px-4 py-2";
  let headerTextColorClass = "";
  let buttonTextColorClass = "";
  let buttonHoverBgClass = "";
  
  let baseBgClass = "";
  let baseBorderClass = "";

  if (node.customBackgroundColor) {
    nodeStyle.backgroundColor = `hsl(${node.customBackgroundColor})`;
    nodeStyle.borderColor = `hsl(${node.customBackgroundColor})`;
    // Attempt a simple contrast for text/buttons on custom background
    // This is very basic. A proper solution involves luminosity calculation.
    const bgColorParts = node.customBackgroundColor.split(" ").map(p => parseInt(p, 10));
    const lightness = bgColorParts.length === 3 ? bgColorParts[2] : 50; // Default to mid-lightness
    if (lightness > 60) {
      headerTextColorClass = "text-gray-800"; // Dark text for light backgrounds
      buttonTextColorClass = "text-gray-700 hover:text-gray-900";
      buttonHoverBgClass = "hover:bg-black/10";
    } else {
      headerTextColorClass = "text-white"; // Light text for dark backgrounds
      buttonTextColorClass = "text-gray-200 hover:text-white";
      buttonHoverBgClass = "hover:bg-white/10";
    }
  } else {
    if (isRoot) {
      baseBgClass = "bg-primary";
      baseBorderClass = "border-primary";
      headerTextColorClass = "text-primary-foreground";
      buttonTextColorClass = "text-primary-foreground";
      buttonHoverBgClass = "hover:bg-primary/80";
    } else {
      baseBgClass = "bg-accent";
      baseBorderClass = "border-accent";
      headerTextColorClass = "text-accent-foreground";
      buttonTextColorClass = "text-accent-foreground";
      buttonHoverBgClass = "hover:bg-accent/80";
    }
  }
  
  // Description box always light-themed
  const descriptionBgClass = "bg-slate-50";
  const descriptionTextColorClass = "text-slate-700";

  return (
    <div
      id={`node-${node.id}`}
      className={cn(
        "node-card-draggable", // Added for distinguishing node drag from canvas pan
        "flex flex-col cursor-grab transition-all duration-150 ease-out overflow-hidden",
        "rounded-2xl shadow-lg border-2", // Structural classes
        baseBgClass, // Default theme background
        baseBorderClass, // Default theme border
        className
      )}
      style={nodeStyle} // Inline styles for custom colors override Tailwind classes
      draggable
      onDragStart={(e) => onDragStart(e, node.id)}
      onClick={(e) => e.stopPropagation()} 
      onMouseDown={(e) => e.stopPropagation()} 
    >
      <div className={cn(headerBaseClasses)}>
        <div className="flex items-center gap-1.5 flex-grow min-w-0">
          {node.emoji && <span className="text-xl mr-1.5 flex-shrink-0 select-none">{node.emoji}</span>}
          <h3 className={cn("text-lg font-semibold truncate", headerTextColorClass)} title={node.title}>
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
            className={cn("h-7 w-7 hover:bg-destructive", buttonTextColorClass, node.customBackgroundColor ? 'hover:text-destructive-foreground' : 'hover:text-destructive-foreground')}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {/* Image rendering not part of v0.0.5 */}

      <div className={cn(
          "px-4 py-3 flex-grow",
          descriptionBgClass, 
          !node.description && `min-h-[${APPROX_MIN_DESC_BOX_HEIGHT}px]`
      )}>
        {node.description ? (
          <p className={cn("text-sm whitespace-pre-wrap leading-relaxed break-words", descriptionTextColorClass)}>{node.description}</p>
        ) : (
          <div className="h-full"></div> 
        )}
      </div>
    </div>
  );
}
