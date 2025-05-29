
"use client";

import type { NodeData, PaletteColorKey } from '@/types/mindmap';
import { Button } from "@/components/ui/button";
import { Edit3, Trash2, PlusCircle } from 'lucide-react';
import React from 'react';
import { cn } from '@/lib/utils';
import Image from 'next/image'; // Keep for potential future use, but not used in v0.0.5 logic

const APPROX_MIN_DESC_BOX_HEIGHT = 20; 

interface NodeCardProps {
  node: NodeData;
  onEdit: (node: NodeData) => void;
  onDelete: (nodeId: string) => void;
  onAddChild: (parentId: string) => void;
  onDragStart: (event: React.DragEvent<HTMLDivElement>, nodeId: string) => void;
  className?: string;
}

// Helper to determine text color contrast.
// This is a simplified version. For perfect contrast, a more sophisticated algorithm is needed.
function getContrastingTextColor(backgroundColorVar?: PaletteColorKey): string {
  if (!backgroundColorVar) return "text-primary-foreground"; // Default for primary/accent

  // Based on the chart colors in globals.css (dark/light text needs)
  switch (backgroundColorVar) {
    case 'chart-1': // Indigo
    case 'chart-2': // Rose
    case 'chart-3': // Teal
      return "text-primary-foreground"; // White/light text
    case 'chart-4': // Amber
    case 'chart-5': // Sky Blue
      return "text-foreground"; // Dark text (primary foreground of light theme)
    default:
      return "text-primary-foreground";
  }
}


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
  let descriptionBgClass = "";

  const cardStyle: React.CSSProperties = { ...cardPositionStyle };

  if (node.customBackgroundColor) {
    cardStyle.backgroundColor = `hsl(var(--${node.customBackgroundColor}))`;
    currentCardClasses = cn(currentCardClasses, `border-[hsl(var(--${node.customBackgroundColor}))]`); // Border matches background
    currentHeaderClasses = cn(currentHeaderClasses); // Header bg is same as card bg
    
    headerTextColorClass = getContrastingTextColor(node.customBackgroundColor);
    buttonTextColorClass = headerTextColorClass; // Buttons use same contrasting text
    // Create a slightly darker hover for custom backgrounds by reducing lightness or adding opacity
    // This is a simplification; a proper HSL manipulation library would be better.
    // For now, we'll just use a generic darker semi-transparent overlay for hover.
    buttonHoverBgClass = "hover:bg-black/10 dark:hover:bg-white/10";

    // Description box with lighter version of custom background
    // We need the -raw value for HSLA if available, otherwise use the main color.
    // Assuming chart colors have a -raw variant like in some themes.
    const colorVar = `var(--${node.customBackgroundColor}-raw, var(--${node.customBackgroundColor}))`;
    descriptionBgClass = `bg-[hsla(${colorVar},0.1)]`; // 10% opacity

  } else {
    if (isRoot) {
      currentCardClasses = cn(currentCardClasses, "bg-primary border-primary");
      currentHeaderClasses = cn(currentHeaderClasses, "bg-primary");
      headerTextColorClass = "text-primary-foreground";
      buttonTextColorClass = "text-primary-foreground";
      buttonHoverBgClass = "hover:bg-primary/80";
      descriptionBgClass = "bg-primary/10"; // Lighter version of primary
    } else {
      currentCardClasses = cn(currentCardClasses, "bg-accent border-accent");
      currentHeaderClasses = cn(currentHeaderClasses, "bg-accent");
      headerTextColorClass = "text-accent-foreground";
      buttonTextColorClass = "text-accent-foreground";
      buttonHoverBgClass = "hover:bg-accent/80";
      descriptionBgClass = "bg-accent/10"; // Lighter version of accent
    }
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
      
      {/* Description Box Styling */}
      <div className={cn(
          "p-3 flex-grow", 
          descriptionBgClass, // Applied dynamic or theme-based light background
          headerTextColorClass, // Text color should contrast with the descriptionBg
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
