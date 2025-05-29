
"use client";

import type { NodeData } from '@/types/mindmap';
import { Button } from "@/components/ui/button";
import { Edit3, Trash2, PlusCircle } from 'lucide-react';
import React from 'react';
import { cn } from '@/lib/utils';
import Image from 'next/image'; // For image rendering

const APPROX_MIN_DESC_BOX_HEIGHT = 20; // Minimum height for the description box if empty

// Helper to determine text color for good contrast on custom backgrounds
// This is a simplified version, more sophisticated logic might be needed for full accessibility
const getContrastingTextColor = (bgColor?: string): string => {
  if (!bgColor || !bgColor.startsWith('chart-')) {
    return ""; // Default behavior, let theme handle it
  }
  // For chart colors, we'll use their predefined foregrounds
  // HSL values are in globals.css like: --chart-1-foreground: 0 0% 98%;
  // This will translate to text-primary-foreground for --chart-1 if node used bg-primary,
  // or we need a direct way to map chart-X to its foreground variable if not using the primary/accent classes
  
  // Simplified: most of our chart foregrounds are light.
  // If we had dark foregrounds for some chart colors, we'd need a map.
  // For now, assuming custom chart backgrounds need light text.
  // We rely on --chart-X-foreground in globals.css for this logic implicitly through text-foreground.
  // If a direct mapping is needed, this function would be more complex.
  // For the current theme, --primary-foreground and --accent-foreground are light.
  // For this example, let's assume custom chart backgrounds will require light text.
  return "text-[hsl(var(--foreground))]"; // Fallback to general foreground
};


export function NodeCard({ node, onEdit, onDelete, onAddChild, onDragStart, className }: {
  node: NodeData;
  onEdit: (node: NodeData) => void;
  onDelete: (nodeId: string) => void;
  onAddChild: (parentId: string) => void;
  onDragStart: (event: React.DragEvent<HTMLDivElement>, nodeId: string) => void;
  className?: string;
}) {
  const isRoot = !node.parentId;
  
  const cardBaseClasses = "flex flex-col cursor-grab transition-all duration-150 ease-out overflow-hidden border-2 rounded-2xl shadow-lg";
  const headerBaseClasses = "flex items-center justify-between px-4 py-2"; // Updated padding

  const cardPositionStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${node.x}px`,
    top: `${node.y}px`,
    width: '300px', // Fixed width for node cards
  };
  
  const cardStyle: React.CSSProperties = { ...cardPositionStyle };
  let currentCardClasses = cn(cardBaseClasses);
  let currentHeaderClasses = headerBaseClasses;
  let headerTextColorClass = "";
  let buttonTextColorClass = ""; // For buttons in header
  let buttonHoverBgClass = "";
  let descriptionBgClass = ""; 
  let descriptionTextColorClass = "text-foreground/90"; // Default description text color

  if (node.customBackgroundColor) {
    cardStyle.backgroundColor = `hsl(var(--${node.customBackgroundColor}))`;
    currentCardClasses = cn(currentCardClasses, `border-[hsl(var(--${node.customBackgroundColor}))]`);
    
    // For custom backgrounds, try to use a contrasting text color.
    // This simplistic check assumes most chart backgrounds are darker and need lighter text.
    // A more robust solution would involve calculating luminosity or using predefined foregrounds per palette color.
    headerTextColorClass = `text-[hsl(var(--${node.customBackgroundColor}-foreground))]`;
    buttonTextColorClass = headerTextColorClass; // Buttons inherit this
    buttonHoverBgClass = `hover:bg-[hsl(var(--${node.customBackgroundColor}))]/80`; // Darken the custom color slightly on hover

    descriptionBgClass = `bg-[hsla(var(--${node.customBackgroundColor}-raw,var(--${node.customBackgroundColor})),0.1)] dark:bg-[hsla(var(--${node.customBackgroundColor}-raw,var(--${node.customBackgroundColor})),0.2)]`;
    descriptionTextColorClass = headerTextColorClass; // Match header text for consistency on custom bg
  } else {
    if (isRoot) {
      currentCardClasses = cn(currentCardClasses, "bg-primary border-primary");
      currentHeaderClasses = cn(currentHeaderClasses, "bg-primary"); // Header also uses primary
      headerTextColorClass = "text-primary-foreground";
      buttonTextColorClass = "text-primary-foreground";
      buttonHoverBgClass = "hover:bg-primary/80";
      descriptionBgClass = "bg-primary/10 dark:bg-primary/20";
      descriptionTextColorClass = "text-primary-foreground/90";
    } else {
      currentCardClasses = cn(currentCardClasses, "bg-accent border-accent");
      currentHeaderClasses = cn(currentHeaderClasses, "bg-accent"); // Header also uses accent
      headerTextColorClass = "text-accent-foreground";
      buttonTextColorClass = "text-accent-foreground";
      buttonHoverBgClass = "hover:bg-accent/80";
      descriptionBgClass = "bg-accent/10 dark:bg-accent/20";
      descriptionTextColorClass = "text-accent-foreground/90";
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
          {node.emoji && <span className="text-xl mr-1.5 flex-shrink-0 select-none">{node.emoji}</span>}
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
      
      {node.imageUrl && (
        <div className="relative w-full aspect-video overflow-hidden mt-1 mb-2 px-4">
          <Image 
            src={node.imageUrl} 
            alt={`Image for ${node.title}`} 
            layout="fill" 
            objectFit="cover"
            className="rounded-md"
            onError={(e) => (e.currentTarget.style.display = 'none')} // Hide if image fails to load
          />
        </div>
      )}

      <div className={cn(
          "px-4 py-3 flex-grow", // Updated padding
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
