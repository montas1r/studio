
"use client";

import type { NodeData, PaletteColorKey } from '@/types/mindmap';
import { Button } from "@/components/ui/button";
import { Edit3, Trash2, PlusCircle, Image as ImageIcon } from 'lucide-react'; // ImageIcon for placeholder
import React from 'react';
import { cn } from '@/lib/utils';
import Image from 'next/image';

const APPROX_MIN_DESC_BOX_HEIGHT = 20; 

interface NodeCardProps {
  node: NodeData;
  onEdit: (node: NodeData) => void;
  onDelete: (nodeId: string) => void;
  onAddChild: (parentId: string) => void;
  onDragStart: (event: React.DragEvent<HTMLDivElement>, nodeId: string) => void;
  className?: string;
  domRefCallback: (element: HTMLDivElement | null) => void; // New prop for DOM element ref
}

export function NodeCard({ 
  node, 
  onEdit, 
  onDelete, 
  onAddChild, 
  onDragStart, 
  className,
  domRefCallback 
}: NodeCardProps) {
  const isRoot = !node.parentId;
  
  const cardPositionStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${node.x}px`,
    top: `${node.y}px`,
    width: '300px', // Fixed width for node cards
  };
  
  let cardStyle: React.CSSProperties = { ...cardPositionStyle };
  let headerBaseClasses = "flex items-center justify-between px-4 py-2 rounded-t-2xl"; // Ensure top rounding
  let headerTextColorClass = "";
  let buttonTextColorClass = "";
  let buttonHoverBgClass = "";
  
  let baseBorderClass = "border-2"; // Keep border width consistent
  let currentCardClasses = "";

  // Node Background and Border Color
  if (node.customBackgroundColor) {
    cardStyle.backgroundColor = `hsl(var(--${node.customBackgroundColor}))`;
    cardStyle.borderColor = `hsl(var(--${node.customBackgroundColor}))`;
    
    // Basic contrast for text/buttons - this is a simplified approach
    const colorKey = node.customBackgroundColor as PaletteColorKey;
    // Assuming chart colors might be dark or light, let's try a general approach.
    // For very dark custom colors, light text is better. For very light, dark text.
    // This heuristic might need refinement based on your exact palette.
    if (['chart-1', 'chart-3'].includes(colorKey)) { // Assuming these are darker
        headerTextColorClass = "text-white";
        buttonTextColorClass = "text-gray-200 hover:text-white";
        buttonHoverBgClass = "hover:bg-white/10";
    } else { // Assuming these might be lighter or mid-tone
        headerTextColorClass = "text-gray-800";
        buttonTextColorClass = "text-gray-700 hover:text-gray-900";
        buttonHoverBgClass = "hover:bg-black/10";
    }
  } else {
    if (isRoot) {
      currentCardClasses = cn(currentCardClasses, "bg-primary border-primary");
      headerTextColorClass = "text-primary-foreground";
      buttonTextColorClass = "text-primary-foreground";
      buttonHoverBgClass = "hover:bg-black/10"; // Adjusted for primary bg
    } else {
      currentCardClasses = cn(currentCardClasses, "bg-accent border-accent");
      headerTextColorClass = "text-accent-foreground";
      buttonTextColorClass = "text-accent-foreground";
      buttonHoverBgClass = "hover:bg-black/10"; // Adjusted for accent bg
    }
  }
  
  // Description box styling (always light theme as per previous request)
  const descriptionBgClass = "bg-slate-50";
  const descriptionTextColorClass = "text-slate-700";

  const [imageError, setImageError] = React.useState(false);
  const isValidHttpUrl = (string: string | undefined): boolean => {
    if (!string) return false;
    let url;
    try {
      url = new URL(string);
    } catch (_) {
      return false;  
    }
    return url.protocol === "http:" || url.protocol === "https:";
  }

  React.useEffect(() => {
    setImageError(false); // Reset error state when node.imageUrl changes
  }, [node.imageUrl]);

  return (
    <div
      id={`node-${node.id}`}
      ref={domRefCallback} // Assign the ref here
      className={cn(
        "node-card-draggable",
        "flex flex-col cursor-grab transition-all duration-150 ease-out overflow-hidden",
        "rounded-2xl shadow-lg", 
        baseBorderClass,
        currentCardClasses, // Applies bg-primary/accent and border-primary/accent if no custom color
        className
      )}
      style={cardStyle} 
      draggable
      onDragStart={(e) => onDragStart(e, node.id)}
      onClick={(e) => e.stopPropagation()} 
      onMouseDown={(e) => e.stopPropagation()} 
    >
      <div className={cn(headerBaseClasses, cardStyle.backgroundColor ? '' : (isRoot ? 'bg-primary' : 'bg-accent'))} 
           style={{backgroundColor: cardStyle.backgroundColor ? cardStyle.backgroundColor : undefined }} // Ensure header also gets custom bg
      >
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
      
      {node.imageUrl && isValidHttpUrl(node.imageUrl) && !imageError && (
        <div className="relative w-full aspect-video overflow-hidden mt-2">
          <Image 
            src={node.imageUrl} 
            alt={`Image for ${node.title}`} 
            layout="fill" 
            objectFit="cover"
            onError={() => setImageError(true)}
            className="bg-muted"
          />
        </div>
      )}
      {imageError && node.imageUrl && (
         <div className="w-full aspect-video mt-2 flex items-center justify-center bg-muted text-muted-foreground text-xs">
            Invalid Image
          </div>
      )}


      <div className={cn(
          "px-4 py-3 flex-grow rounded-b-2xl", // Ensure bottom rounding
          descriptionBgClass, 
          descriptionTextColorClass,
          !node.description && `min-h-[${APPROX_MIN_DESC_BOX_HEIGHT}px]`
      )}>
        {node.description ? (
          <p className={cn("text-sm whitespace-pre-wrap leading-relaxed break-words")}>{node.description}</p>
        ) : (
          <div className="h-full"></div> 
        )}
      </div>
    </div>
  );
}
