
"use client";

import type { NodeData } from '@/types/mindmap';
import { Button } from "@/components/ui/button";
import { Edit3, Trash2, PlusCircle } from 'lucide-react';
import React from 'react';
import { cn } from '@/lib/utils';

interface NodeCardProps {
  node: NodeData;
  onEdit: (node: NodeData) => void;
  onDelete: (nodeId: string) => void;
  onAddChild: (parentId: string) => void;
  onDragStart: (event: React.DragEvent<HTMLDivElement>, nodeId: string) => void;
  className?: string;
}

export function NodeCard({ node, onEdit, onDelete, onAddChild, onDragStart, className }: NodeCardProps) {
  const isRoot = !node.parentId;

  const cardBaseClasses = "rounded-xl shadow-xl w-[300px] flex flex-col border-2 cursor-grab"; // Fixed width for now
  const headerBaseClasses = "flex items-center justify-between p-3 rounded-t-xl";
  
  const rootNodeCardClasses = "bg-primary/10 border-primary";
  const rootNodeHeaderClasses = "bg-primary/20 text-primary-foreground";
  
  const childNodeCardClasses = "bg-accent/10 border-accent";
  const childNodeHeaderClasses = "bg-accent/20 text-accent-foreground";

  return (
    <div
      id={`node-${node.id}`}
      className={cn(
        cardBaseClasses,
        isRoot ? rootNodeCardClasses : childNodeCardClasses,
        className
      )}
      style={{
        position: 'absolute',
        left: `${node.x}px`,
        top: `${node.y}px`,
      }}
      draggable
      onDragStart={(e) => onDragStart(e, node.id)}
    >
      <div className={cn(
        headerBaseClasses,
        isRoot ? rootNodeHeaderClasses : childNodeHeaderClasses
      )}>
        <div className="flex items-center gap-1.5 flex-grow min-w-0">
          {node.emoji && <span className="text-lg mr-1.5 flex-shrink-0">{node.emoji}</span>}
          <h3 className="text-base font-semibold truncate" title={node.title}>
            {node.title}
          </h3>
        </div>
        <div className="flex items-center space-x-1 flex-shrink-0 ml-2">
          <Button variant="ghost" size="icon" onClick={() => onEdit(node)} aria-label="Edit node" className={cn("h-7 w-7", isRoot ? "text-primary-foreground hover:bg-primary/30" : "text-accent-foreground hover:bg-accent/30")}>
            <Edit3 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onAddChild(node.id)} className={cn("h-7 w-7", isRoot ? "text-primary-foreground hover:bg-primary/30" : "text-accent-foreground hover:bg-accent/30")} aria-label="Add child node">
            <PlusCircle className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onDelete(node.id)} aria-label="Delete node" className={cn("h-7 w-7 text-destructive hover:bg-destructive/10")}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {node.description && (
        <div className={cn("p-3 text-sm rounded-b-xl", isRoot ? "bg-primary/5" : "bg-accent/5")}>
          <p className="whitespace-pre-wrap text-muted-foreground text-xs leading-relaxed break-words">{node.description}</p>
        </div>
      )}
    </div>
  );
}
