
"use client";

import type { NodeData } from '@/types/mindmap';
import { Button } from "@/components/ui/button";
import { Edit3, Trash2, PlusCircle, ChevronDown, ChevronRight } from 'lucide-react';
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

  const cardBaseClasses = "rounded-xl shadow-xl w-full max-w-md flex flex-col border-2";
  const headerBaseClasses = "flex items-center justify-between p-3 rounded-t-xl";
  
  const rootNodeCardClasses = "bg-primary/5 border-primary";
  const rootNodeHeaderClasses = "bg-primary/10";
  
  const childNodeCardClasses = "bg-card border-accent"; // Using accent for children
  const childNodeHeaderClasses = "bg-accent/10";


  return (
    <div 
      className={cn(
        cardBaseClasses,
        isRoot ? rootNodeCardClasses : childNodeCardClasses,
        className
      )}
    >
      <div className={cn(
        headerBaseClasses,
        isRoot ? rootNodeHeaderClasses : childNodeHeaderClasses
      )}>
        <div className="flex items-center gap-2 flex-grow min-w-0">
          {hasChildren && (
            <Button variant="ghost" size="icon" onClick={() => setIsExpanded(!isExpanded)} className="mr-1 flex-shrink-0 h-7 w-7">
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          )}
          {!hasChildren && <div className="w-8 mr-1 flex-shrink-0"></div>} {/* Placeholder for alignment */}
          <h3 className={cn(
            "text-base font-semibold truncate",
            isRoot ? "text-primary-foreground" : "text-accent-foreground" // This might not work if header bg is too light, primary/accent text directly
          )} title={node.title}>
             {isRoot ? node.title : node.title}
          </h3>
        </div>
        <div className="flex items-center space-x-1 flex-shrink-0 ml-2">
          <Button variant="ghost" size="icon" onClick={() => onEdit(node)} aria-label="Edit node" className={cn("h-7 w-7", isRoot ? "text-primary-foreground hover:bg-primary/20" : "text-accent-foreground hover:bg-accent/20")}>
            <Edit3 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onAddChild(node.id)} className={cn("h-7 w-7", isRoot ? "text-primary-foreground hover:bg-primary/20" : "text-accent-foreground hover:bg-accent/20")} aria-label="Add child node">
            <PlusCircle className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onDelete(node.id)} aria-label="Delete node" className={cn("h-7 w-7 text-destructive hover:bg-destructive/10" )}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isExpanded && (
        <>
          {(node.description || (hasChildren && node.childIds.length === 0)) && (
            <div className={cn("p-3 text-sm", isRoot ? "bg-primary/5" : "bg-accent/5")}>
              {node.description ? (
                <p className="whitespace-pre-wrap text-muted-foreground text-xs leading-relaxed break-words">{node.description}</p>
              ) : (
                <p className="italic text-xs text-muted-foreground">No description. Add children or edit to add details.</p>
              )}
            </div>
          )}
          
          {hasChildren && node.childIds.length > 0 && (
             <div className={cn("pl-5 pr-3 pb-3 pt-2", isRoot ? "bg-primary/5 rounded-b-xl" : "bg-accent/5 rounded-b-xl")}> {/* Indentation for children, less than before */}
              <div className={cn(
                "flex flex-col gap-3 border-l-2 border-dashed pl-4",
                 isRoot ? "border-primary/50" : "border-accent/50"
                )}> {/* Children container with connecting line illusion */}
                {renderChildren(node.id)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
