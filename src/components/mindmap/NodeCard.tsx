
"use client";

import type { NodeData, PaletteColorKey } from '@/types/mindmap';
import { Button } from "@/components/ui/button";
import { Edit3, Trash2, PlusCircle } from 'lucide-react';
import React from 'react';
import { cn } from '@/lib/utils';
import Image from 'next/image';

interface NodeCardProps {
  node: NodeData;
  isRoot: boolean;
  onEdit: (node: NodeData) => void;
  onDelete: (nodeId: string) => void;
  onAddChild: (parentId: string) => void;
  onDragStart: (event: React.DragEvent<HTMLDivElement>, nodeId: string) => void;
  className?: string;
}

// Helper to check for valid HTTP/HTTPS URL
const isValidHttpUrl = (string: string | undefined): boolean => {
  if (!string) return false;
  let url;
  try {
    url = new URL(string);
  } catch (_) {
    return false;
  }
  return url.protocol === "http:" || url.protocol === "https";
};


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
  let buttonTextColorClass = ""; // For text-based buttons if any
  let buttonHoverBgClass = "";   // For icon buttons in the header

  // ---- Styling for the description box ----
  // Force light theme for description box for readability
  const descriptionBgClass = "bg-slate-50"; // A light gray, like a typical light card
  const descriptionTextColorClass = "text-slate-700"; // A dark gray for text
  // ---- End of description box styling ----

  if (node.customBackgroundColor) {
    cardStyle.backgroundColor = `hsl(var(--${node.customBackgroundColor}))`;
    currentCardClasses = cn(currentCardClasses, `border-[hsl(var(--${node.customBackgroundColor}-raw,var(--${node.customBackgroundColor})))]`);
    
    // Attempt to make header text and button icons contrast with custom background
    // This is a simple heuristic, might need refinement for specific palette colors
    // We assume custom backgrounds might be dark or vibrant
    headerTextColorClass = "text-white"; // Default to white text on custom color
    buttonTextColorClass = "text-white";
    buttonHoverBgClass = "hover:bg-white/20";

    // Example: if using a very light custom color like chart-4 (amber/orange in light theme context)
    // you might need more specific logic here if white text doesn't contrast well.
    // For simplicity, we're keeping it generic.
    // If chart-X variables have sufficient contrast with white, this is fine.

  } else if (isRoot) {
    currentCardClasses = cn(currentCardClasses, "bg-primary/20 border-primary"); // Slightly more opaque for main card
    currentHeaderClasses = cn(currentHeaderClasses, "bg-primary/30"); // Header slightly more opaque
    headerTextColorClass = "text-primary-foreground";
    buttonTextColorClass = "text-primary-foreground";
    buttonHoverBgClass = "hover:bg-primary/50";
  } else {
    currentCardClasses = cn(currentCardClasses, "bg-accent/20 border-accent"); // Slightly more opaque
    currentHeaderClasses = cn(currentHeaderClasses, "bg-accent/30");
    headerTextColorClass = "text-accent-foreground";
    buttonTextColorClass = "text-accent-foreground";
    buttonHoverBgClass = "hover:bg-accent/50";
  }
  
  const showImage = isValidHttpUrl(node.imageUrl);
  const [imageError, setImageError] = React.useState(false);

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
          <Button variant="ghost" size="icon" onClick={() => onDelete(node.id)} aria-label="Delete node" className={cn("h-7 w-7 text-destructive hover:text-destructive-foreground", buttonHoverBgClass, "hover:bg-destructive/20")}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {showImage && !imageError && node.imageUrl && (
        <div className="relative w-full aspect-[16/9] overflow-hidden border-y border-black/10 dark:border-white/10">
          <Image 
            src={node.imageUrl} 
            alt={`Image for ${node.title}`} 
            layout="fill" 
            objectFit="cover"
            onError={() => setImageError(true)}
            unoptimized={true} // Useful if you have issues with external image optimization
          />
        </div>
      )}
      {imageError && (
          <div className="p-3 text-xs text-center text-destructive-foreground bg-destructive/50">
            Invalid Image URL
          </div>
      )}

      {node.description && (
        <div className={cn(
            "p-3 text-sm rounded-b-xl flex-grow",
            descriptionBgClass, 
            descriptionTextColorClass // Apply the forced light theme text color
        )}>
          <p className="whitespace-pre-wrap text-xs leading-relaxed break-words">{node.description}</p>
        </div>
      )}
      {/* Ensure there's some min-height if no description or image, for consistent card base */}
      {(!node.description && (!showImage || imageError)) && <div className="min-h-[10px] rounded-b-xl" style={node.customBackgroundColor ? { backgroundColor: `hsla(var(--${node.customBackgroundColor}-raw, var(--${node.customBackgroundColor})), 0.05)`} : (isRoot ? {backgroundColor: 'hsla(var(--primary-raw, var(--primary)),0.05)'}: {backgroundColor: 'hsla(var(--accent-raw, var(--accent)),0.05)'}) }></div>}
    </div>
  );
}
