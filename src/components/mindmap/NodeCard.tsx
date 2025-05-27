
"use client";

import type { NodeData } from '@/types/mindmap';
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

export function NodeCard({ node, isRoot, onEdit, onDelete, onAddChild, onDragStart, className }: NodeCardProps) {
  
  const cardBaseClasses = "rounded-xl shadow-xl w-[300px] flex flex-col border-2 cursor-grab";
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

  if (node.customBackgroundColor) {
    cardStyle.backgroundColor = node.customBackgroundColor;
    // Potentially adjust border or text color for contrast if needed, or rely on user to pick good contrasts
  }

  return (
    <div
      id={`node-${node.id}`}
      className={cn(
        cardBaseClasses,
        !node.customBackgroundColor && (isRoot ? rootNodeCardClasses : childNodeCardClasses), // Apply theme color only if no custom color
        className
      )}
      style={cardStyle}
      draggable
      onDragStart={(e) => onDragStart(e, node.id)}
    >
      <div className={cn(
        headerBaseClasses,
        !node.customBackgroundColor && (isRoot ? rootNodeHeaderClasses : childNodeHeaderClasses) // Apply theme color only if no custom color
      )}>
        <div className="flex items-center gap-1.5 flex-grow min-w-0">
          {node.emoji && <span className="text-lg mr-1.5 flex-shrink-0">{node.emoji}</span>}
          <h3 className="text-base font-semibold truncate" title={node.title}>
            {node.title}
          </h3>
        </div>
        <div className="flex items-center space-x-1 flex-shrink-0 ml-2">
          <Button variant="ghost" size="icon" onClick={() => onEdit(node)} aria-label="Edit node" className={cn("h-7 w-7", !node.customBackgroundColor && (isRoot ? "text-primary-foreground hover:bg-primary/30" : "text-accent-foreground hover:bg-accent/30"), node.customBackgroundColor && "text-card-foreground hover:bg-black/10 dark:hover:bg-white/10" )}>
            <Edit3 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onAddChild(node.id)} className={cn("h-7 w-7", !node.customBackgroundColor && (isRoot ? "text-primary-foreground hover:bg-primary/30" : "text-accent-foreground hover:bg-accent/30"), node.customBackgroundColor && "text-card-foreground hover:bg-black/10 dark:hover:bg-white/10")} aria-label="Add child node">
            <PlusCircle className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onDelete(node.id)} aria-label="Delete node" className={cn("h-7 w-7 text-destructive hover:bg-destructive/10")}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {node.imageUrl && (
        <div className="relative w-full aspect-video overflow-hidden">
          <Image 
            src={node.imageUrl} 
            alt={`Image for ${node.title}`} 
            layout="fill" 
            objectFit="cover" 
            onError={(e) => { (e.target as HTMLImageElement).src = 'https://placehold.co/600x400.png?text=Invalid+Image'; (e.target as HTMLImageElement).alt = 'Invalid image URL'; }}
            data-ai-hint="node content image"
          />
        </div>
      )}

      {node.description && (
        <div className={cn(
            "p-3 text-sm rounded-b-xl", 
            !node.customBackgroundColor && (isRoot ? "bg-primary/5" : "bg-accent/5"),
            node.customBackgroundColor && "bg-transparent" // If custom bg, make this part transparent or use a subtle derived color
        )}>
          <p className="whitespace-pre-wrap text-muted-foreground text-xs leading-relaxed break-words">{node.description}</p>
        </div>
      )}
    </div>
  );
}
