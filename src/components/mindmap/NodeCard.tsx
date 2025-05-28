
"use client";

import type { NodeData } from '@/types/mindmap'; // PaletteColorKey removed
import { Button } from "@/components/ui/button";
import { Edit3, Trash2, PlusCircle } from 'lucide-react';
import React from 'react';
import { cn } from '@/lib/utils';
import Image from 'next/image'; // Kept for potential future use but imageUrl removed from V1.0.0 NodeData

interface NodeCardProps {
  node: NodeData;
  isRoot: boolean;
  onEdit: (node: NodeData) => void;
  onDelete: (nodeId: string) => void;
  onAddChild: (parentId: string) => void;
  onDragStart: (event: React.DragEvent<HTMLDivElement>, nodeId: string) => void;
  className?: string; 
}

const APPROX_MIN_DESC_BOX_HEIGHT = 10; 

export function NodeCard({ node, isRoot, onEdit, onDelete, onAddChild, onDragStart, className }: NodeCardProps) {
  const cardBaseClasses = "rounded-xl shadow-xl w-[300px] flex flex-col border-2 cursor-grab transition-all duration-150 ease-out";
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
  let buttonTextColorClass = "";
  let buttonHoverBgClass = "";
  let descriptionBgClass = "bg-background/30"; // Simpler bg for V1.0.0
  let descriptionTextColorClass = "text-foreground/90"; // Simpler text color for V1.0.0

  // Simplified coloring for V1.0.0 - no customBackgroundColor from palette
  if (isRoot) {
    currentCardClasses = cn(currentCardClasses, "bg-primary/20 border-primary");
    currentHeaderClasses = cn(currentHeaderClasses, "bg-primary/30");
    headerTextColorClass = "text-primary-foreground";
    buttonTextColorClass = "text-primary-foreground";
    buttonHoverBgClass = "hover:bg-primary/50";
    descriptionBgClass = "bg-primary/10"; 
    descriptionTextColorClass = "text-primary-foreground/90";
  } else {
    currentCardClasses = cn(currentCardClasses, "bg-accent/20 border-accent");
    currentHeaderClasses = cn(currentHeaderClasses, "bg-accent/30");
    headerTextColorClass = "text-accent-foreground";
    buttonTextColorClass = "text-accent-foreground";
    buttonHoverBgClass = "hover:bg-accent/50";
    descriptionBgClass = "bg-accent/10";
    descriptionTextColorClass = "text-accent-foreground/90";
  }
  
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
            className={cn("h-7 w-7 hover:bg-destructive hover:text-destructive-foreground", 
              isRoot ? "text-primary-foreground" : "text-accent-foreground" // Simplified for V1.0.0
            )}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {/* Image display removed for V1.0.0 */}

      <div className={cn(
          "p-3 text-sm rounded-b-xl flex-grow",
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
