
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

function isValidHttpUrl(string?: string): boolean {
  if (!string) return false;
  try {
    const url = new URL(string);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (_) {
    return false;
  }
}

export function NodeCard({ node, isRoot, onEdit, onDelete, onAddChild, onDragStart, className }: NodeCardProps) {

  const cardBaseClasses = "rounded-xl shadow-xl w-[300px] flex flex-col border-2 cursor-grab";
  const headerBaseClasses = "flex items-center justify-between p-3 rounded-t-xl";

  // Theme colors (fallbacks if no custom color)
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

  let currentCardClasses = cardBaseClasses;
  let currentHeaderClasses = headerBaseClasses;
  let currentButtonTextClass = ""; // For button text color when custom bg is applied

  if (node.customBackgroundColor) {
    cardStyle.backgroundColor = `hsl(var(--${node.customBackgroundColor}))`;
    // For custom backgrounds, we might want a neutral border, or derive it.
    // For simplicity, let's use a slightly darker version of the custom color for the border if possible,
    // or a generic border. For now, we'll use a standard border.
    currentCardClasses = cn(cardBaseClasses, 'border-foreground/20'); // A neutral border for custom colors
    // Header might need dynamic text color for contrast, for now, use card-foreground
    currentHeaderClasses = cn(headerBaseClasses, 'bg-transparent'); // Make header transparent to show node's custom bg
    currentButtonTextClass = "text-card-foreground dark:text-card-foreground"; // Ensure buttons are visible
  } else {
    currentCardClasses = cn(cardBaseClasses, isRoot ? rootNodeCardClasses : childNodeCardClasses);
    currentHeaderClasses = cn(headerBaseClasses, isRoot ? rootNodeHeaderClasses : childNodeHeaderClasses);
    currentButtonTextClass = isRoot ? "text-primary-foreground" : "text-accent-foreground";
  }

  const shouldRenderImage = node.imageUrl && isValidHttpUrl(node.imageUrl);

  return (
    <div
      id={`node-${node.id}`}
      className={cn(currentCardClasses, className)}
      style={cardStyle}
      draggable
      onDragStart={(e) => onDragStart(e, node.id)}
    >
      <div className={cn(currentHeaderClasses)}>
        <div className="flex items-center gap-1.5 flex-grow min-w-0">
          {node.emoji && <span className="text-lg mr-1.5 flex-shrink-0">{node.emoji}</span>}
          <h3 className={cn("text-base font-semibold truncate", node.customBackgroundColor ? 'text-card-foreground' : (isRoot ? 'text-primary-foreground' : 'text-accent-foreground'))} title={node.title}>
            {node.title}
          </h3>
        </div>
        <div className="flex items-center space-x-1 flex-shrink-0 ml-2">
          <Button variant="ghost" size="icon" onClick={() => onEdit(node)} aria-label="Edit node" className={cn("h-7 w-7", currentButtonTextClass, node.customBackgroundColor ? "hover:bg-black/10 dark:hover:bg-white/10" : (isRoot ? "hover:bg-primary/30" : "hover:bg-accent/30"))}>
            <Edit3 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onAddChild(node.id)} className={cn("h-7 w-7", currentButtonTextClass, node.customBackgroundColor ? "hover:bg-black/10 dark:hover:bg-white/10" : (isRoot ? "hover:bg-primary/30" : "hover:bg-accent/30"))} aria-label="Add child node">
            <PlusCircle className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onDelete(node.id)} aria-label="Delete node" className={cn("h-7 w-7 text-destructive hover:bg-destructive/10")}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {shouldRenderImage && (
        <div className="relative w-full aspect-video overflow-hidden">
          <Image
            src={node.imageUrl!}
            alt={`Image for ${node.title}`}
            fill // Replaced layout="fill" objectFit="cover" with fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw" // Example sizes, adjust as needed
            style={{ objectFit: 'cover' }} // Replaced layout="fill" objectFit="cover" with fill
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
              const parent = target.parentElement;
              if (parent) {
                const placeholder = document.createElement('div');
                placeholder.className = "w-full h-full flex items-center justify-center bg-muted text-muted-foreground text-xs";
                placeholder.textContent = "Invalid Image";
                parent.appendChild(placeholder);
              }
            }}
            data-ai-hint="node content image"
          />
        </div>
      )}

      {node.description && (
        <div className={cn(
            "p-3 text-sm rounded-b-xl flex-grow", // Added flex-grow for description
             node.customBackgroundColor ? 'bg-transparent' : (isRoot ? "bg-primary/5" : "bg-accent/5")
        )}>
          <p className="whitespace-pre-wrap text-muted-foreground text-xs leading-relaxed break-words">{node.description}</p>
        </div>
      )}
      {/* Ensure card has min height if no description/image */}
      {(!node.description && !shouldRenderImage) && <div className="min-h-[20px]"></div>}
    </div>
  );
}
