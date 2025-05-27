
"use client";

import type { NodeData } from '@/types/mindmap';
import { Button } from "@/components/ui/button";
import { Edit3, Trash2, PlusCircle, ChevronDown, ChevronRight, GripVertical } from 'lucide-react';
import React, { useState } from 'react';
import { cn } from '@/lib/utils';

interface NodeCardProps {
  node: NodeData;
  onEdit: (node: NodeData) => void;
  onDelete: (nodeId: string) => void;
  onAddChild: (parentId: string) => void;
  renderChildren: (nodeId: string) => React.ReactNode;
  hasChildren: boolean;
  isRoot?: boolean;
  className?: string;
}

export function NodeCard({ node, onEdit, onDelete, onAddChild, renderChildren, hasChildren, isRoot = false, className }: NodeCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div 
      className={cn(
        "bg-card text-card-foreground rounded-lg shadow-lg w-full max-w-md flex flex-col",
        isRoot ? 'border-primary border-2' : 'border',
        className
      )}
    >
      <div className={cn(
        "flex items-center justify-between p-3 rounded-t-lg",
        isRoot ? "bg-primary/10" : "bg-muted/50"
      )}>
        <div className="flex items-center gap-2 flex-grow min-w-0">
          {hasChildren && (
            <Button variant="ghost" size="icon" onClick={() => setIsExpanded(!isExpanded)} className="mr-1 flex-shrink-0 h-7 w-7">
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          )}
          {!hasChildren && <div className="w-8 mr-1 flex-shrink-0"></div>} {/* Placeholder for alignment */}
          <h3 className="text-base font-semibold truncate" title={node.title}>{node.title}</h3>
        </div>
        <div className="flex items-center space-x-1 flex-shrink-0 ml-2">
          <Button variant="ghost" size="icon" onClick={() => onEdit(node)} aria-label="Edit node" className="h-7 w-7">
            <Edit3 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onAddChild(node.id)} className="text-primary hover:text-primary/90 h-7 w-7" aria-label="Add child node">
            <PlusCircle className="h-4 w-4" />
          </Button>
          <Button variant="ghost" color="destructive" size="icon" onClick={() => onDelete(node.id)} aria-label="Delete node" className="text-destructive hover:text-destructive/90 h-7 w-7">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isExpanded && (
        <>
          {(node.description || (hasChildren && node.childIds.length === 0)) && ( // Show content area if description or if it's an empty parent
            <div className="p-3 text-sm">
              {node.description ? (
                <p className="whitespace-pre-wrap text-muted-foreground text-xs leading-relaxed break-words">{node.description}</p>
              ) : (
                <p className="italic text-xs text-muted-foreground">No description. Add children or edit to add details.</p>
              )}
            </div>
          )}
          
          {hasChildren && node.childIds.length > 0 && (
            <div className="pl-5 pr-3 pb-3 pt-2"> {/* Indentation for children, less than before */}
              <div className="flex flex-col gap-3 border-l-2 border-dashed border-border pl-4"> {/* Children container with connecting line illusion */}
                {renderChildren(node.id)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
