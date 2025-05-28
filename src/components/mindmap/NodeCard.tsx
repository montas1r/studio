
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
  const rootNodeCardClasses = "bg-primary/10 border-primary"; // Main card slight tint
  const rootNodeHeaderClasses = "bg-primary/20 text-primary-foreground";

  const childNodeCardClasses = "bg-accent/10 border-accent"; // Main card slight tint
  const childNodeHeaderClasses = "bg-accent/20 text-accent-foreground";

  const cardStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${node.x}px`,
    top: `${node.y}px`,
    width: '300px',
  };

  let currentCardClasses = cardBaseClasses;
  let currentHeaderClasses = headerBaseClasses;
  let currentButtonTextClass = "";
  let descriptionBgClass = "";

  if (node.customBackgroundColor) {
    cardStyle.backgroundColor = `hsl(var(--${node.customBackgroundColor}))`;
    currentCardClasses = cn(cardBaseClasses, `border-[hsl(var(--${node.customBackgroundColor}))]`); // Border same as custom color
    currentHeaderClasses = cn(headerBaseClasses, 'bg-transparent'); // Header transparent to show node's custom bg
    currentButtonTextClass = "text-card-foreground dark:text-card-foreground"; // Ensure buttons are visible
    descriptionBgClass = `bg-[hsl(var(--${node.customBackgroundColor}))/0.2]`; // Lighter version of custom color, e.g. 20% opacity
  } else {
    currentCardClasses = cn(cardBaseClasses, isRoot ? rootNodeCardClasses : childNodeCardClasses);
    currentHeaderClasses = cn(headerBaseClasses, isRoot ? rootNodeHeaderClasses : childNodeHeaderClasses);
    currentButtonTextClass = isRoot ? "text-primary-foreground" : "text-accent-foreground";
    descriptionBgClass = isRoot ? "bg-primary/10" : "bg-accent/10"; // 10% opacity of theme primary/accent
  }

  const shouldRenderImage = node.imageUrl && isValidHttpUrl(node.imageUrl);

  return (
    <div
      id={`node-${node.id}`}
      className={cn(currentCardClasses, className, "node-card-draggable")} // Added node-card-draggable
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
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            style={{ objectFit: 'cover' }}
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = 'none'; // Hide broken image
              const parent = target.parentElement;
              if (parent) {
                // Check if placeholder already exists
                if (!parent.querySelector('.image-placeholder')) {
                  const placeholder = document.createElement('div');
                  placeholder.className = "image-placeholder w-full h-full flex items-center justify-center bg-muted text-muted-foreground text-xs p-2 text-center";
                  placeholder.textContent = "Invalid or inaccessible image URL";
                  parent.appendChild(placeholder);
                }
              }
            }}
            data-ai-hint="node content image"
          />
        </div>
      )}

      {node.description && (
        <div className={cn(
            "p-3 text-sm rounded-b-xl flex-grow",
            descriptionBgClass // Apply the dynamic background class here
        )}>
          <p className="whitespace-pre-wrap text-muted-foreground text-xs leading-relaxed break-words">{node.description}</p>
        </div>
      )}
      {/* Ensure card has min height if no description/image */}
      {(!node.description && !shouldRenderImage) && <div className="min-h-[20px]"></div>}
    </div>
  );
}
