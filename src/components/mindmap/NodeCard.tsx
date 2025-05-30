
"use client";

import type { NodeData, PaletteColorKey } from '@/types/mindmap';
import { Button } from "@/components/ui/button";
import { Edit3, Trash2, PlusCircle } from 'lucide-react';
import React from 'react'; // Import React
import { cn } from '@/lib/utils';
import Image from 'next/image';

interface NodeCardProps {
  node: NodeData;
  onEdit: (node: NodeData) => void;
  onDelete: (nodeId: string) => void;
  onAddChild: (parentId: string) => void;
  onDragStart: (event: React.DragEvent<HTMLDivElement>, nodeId: string) => void;
  className?: string;
  domRefCallback: (nodeId: string, element: HTMLDivElement | null) => void; // Updated to include nodeId
}

// Renamed to NodeCardComponent to allow React.memo wrapping
const NodeCardComponent = ({ 
  node, 
  onEdit, 
  onDelete, 
  onAddChild, 
  onDragStart, 
  className,
  domRefCallback 
}: NodeCardProps) => {
  const isRoot = !node.parentId;
  
  const cardPositionStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${node.x}px`,
    top: `${node.y}px`,
    width: '300px', // Fixed width for node cards from v0.0.5
  };
  
  // v0.0.5 logic: No customBackgroundColor, only theme-based
  let cardBaseClasses = "flex flex-col cursor-grab transition-all duration-150 ease-out overflow-hidden rounded-2xl shadow-lg border-2";
  let currentCardClasses = "";
  let headerBaseClasses = "flex items-center justify-between px-4 py-2 rounded-t-2xl";
  let headerTextColorClass = "";
  let buttonTextColorClass = "";
  let buttonHoverBgClass = "";
  let descriptionBgClass = ""; 
  let descriptionTextColorClass = "";

  if (isRoot) {
    currentCardClasses = cn(cardBaseClasses, "bg-primary border-primary");
    headerTextColorClass = "text-primary-foreground";
    buttonTextColorClass = "text-primary-foreground";
    buttonHoverBgClass = "hover:bg-black/10";
    descriptionBgClass = "bg-primary/10"; 
    descriptionTextColorClass = "text-primary-foreground";
  } else {
    currentCardClasses = cn(cardBaseClasses, "bg-accent border-accent");
    headerTextColorClass = "text-accent-foreground";
    buttonTextColorClass = "text-accent-foreground";
    buttonHoverBgClass = "hover:bg-black/10";
    descriptionBgClass = "bg-accent/10";
    descriptionTextColorClass = "text-accent-foreground";
  }
  
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
    setImageError(false); 
  }, [node.imageUrl]);

  // Callback ref to register/unregister DOM element
  const refCallback = React.useCallback((element: HTMLDivElement | null) => {
    domRefCallback(node.id, element);
  }, [domRefCallback, node.id]);

  return (
    <div
      id={`node-${node.id}`}
      ref={refCallback} // Use the callback ref here
      className={cn(
        "node-card-draggable", // For identifying nodes vs background
        currentCardClasses,
        className
      )}
      style={cardPositionStyle} 
      draggable
      onDragStart={(e) => onDragStart(e, node.id)}
      onClick={(e) => e.stopPropagation()} 
      onMouseDown={(e) => e.stopPropagation()} 
    >
      <div className={cn(headerBaseClasses)} 
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
            className={cn("h-7 w-7 hover:bg-destructive hover:text-destructive-foreground", buttonTextColorClass)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {/* v0.0.5 logic - imageUrl is not part of NodeData */}
      {/* 
      {node.imageUrl && isValidHttpUrl(node.imageUrl) && !imageError && (
        <div className="relative w-full aspect-video overflow-hidden">
          <Image 
            src={node.imageUrl} 
            alt={`Image for ${node.title}`} 
            fill
            sizes="(max-width: 300px) 100vw, 300px"
            style={{ objectFit: 'cover' }}
            onError={() => setImageError(true)}
            className="bg-muted"
          />
        </div>
      )}
      {imageError && node.imageUrl && (
         <div className="w-full aspect-video flex items-center justify-center bg-muted text-muted-foreground text-xs">
            Invalid Image
          </div>
      )}
      */}

      <div className={cn(
          "px-4 py-3 flex-grow rounded-b-2xl", // py-3 for description
          descriptionBgClass, 
          descriptionTextColorClass,
          !node.description && "min-h-[20px]" 
      )}>
        {node.description ? (
          <p className={cn("text-sm whitespace-pre-wrap leading-relaxed break-words")}>{node.description}</p>
        ) : (
          <div className="h-full"></div> 
        )}
      </div>
    </div>
  );
};

export const NodeCard = React.memo(NodeCardComponent);
