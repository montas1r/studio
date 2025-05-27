
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
  renderChildren: (nodeId: string, parentIsRoot: boolean) => React.ReactNode; // Updated signature
  hasChildren: boolean;
  isRoot?: boolean;
  className?: string;
  parentIsRootForWireColor?: boolean; // New prop: is the direct parent a root node?
}

export function NodeCard({ node, onEdit, onDelete, onAddChild, renderChildren, hasChildren, isRoot = false, className, parentIsRootForWireColor }: NodeCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const cardBaseClasses = "rounded-xl shadow-xl w-full max-w-md flex flex-col border-2";
  const headerBaseClasses = "flex items-center justify-between p-3 rounded-t-xl";
  
  const rootNodeCardClasses = "bg-primary/5 border-primary";
  const rootNodeHeaderClasses = "bg-primary/10";
  
  const childNodeCardClasses = "bg-accent/5 border-accent";
  const childNodeHeaderClasses = "bg-accent/10";

  const childrenConnectWithPrimaryColor = isRoot; // If this node is root, its children's wires are primary

  return (
    <div className={cn("relative", className)}> {/* Outermost wrapper, applies className from props */}
      {!isRoot && (
        <div // Horizontal "wire" for non-root nodes, connecting to parent's vertical line
          className={cn(
            "absolute top-1/2 -translate-y-1/2 -left-[17px] w-[18px] h-0.5 z-[-1]", // Adjusted to connect to vertical line
            parentIsRootForWireColor ? "bg-primary/70" : "bg-accent/70"
          )}
        />
      )}
      <div // This is the actual card visual block
        className={cn(
          cardBaseClasses,
          isRoot ? rootNodeCardClasses : childNodeCardClasses,
          !isRoot && "ml-6" // Indent child cards to make space for vertical line and their own horizontal line
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
            {!hasChildren && <div className="w-8 mr-1 flex-shrink-0"></div>}
            <h3 className={cn(
              "text-base font-semibold truncate",
              isRoot ? "text-primary-foreground" : "text-accent-foreground" 
            )} title={node.title}>
              {node.title}
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

        {isExpanded && (node.description || (hasChildren && node.childIds.length === 0)) && (
          <div className={cn("p-3 text-sm", isRoot ? "bg-primary/5" : "bg-accent/5", !hasChildren || node.childIds.length === 0 ? "rounded-b-xl" : "")}>
            {node.description ? (
              <p className="whitespace-pre-wrap text-muted-foreground text-xs leading-relaxed break-words">{node.description}</p>
            ) : (
              <p className="italic text-xs text-muted-foreground">No description. Add children or edit to add details.</p>
            )}
          </div>
        )}
      </div>

      {/* Children Area - rendered outside the main card visual block but inside the wrapper */}
      {isExpanded && hasChildren && node.childIds.length > 0 && (
        <div className={cn(
          "relative mt-1 rounded-b-xl", // Small margin from parent card visual block
          isRoot ? "bg-primary/5" : "bg-accent/5", // Background for the children container area
           // If current node is not root, its children container also needs the ml-6 indent.
           // This ensures the vertical line is correctly positioned relative to its children.
          !isRoot ? "ml-6" : ""
        )}>
          {/* Vertical "wire" line for children */}
          <div className={cn(
            "absolute left-[calc(theme(spacing.6)/2-1px)] top-0 bottom-0 w-0.5 z-[-1]", // Positioned in the middle of its children's ml-6 margin
            childrenConnectWithPrimaryColor ? "bg-primary/70" : "bg-accent/70"
          )}/>
          <div className="flex flex-col gap-2 pt-2 pb-2 pr-2 pl-1"> {/* Children have their own NodeCard wrappers which include wires */}
            {renderChildren(node.id, childrenConnectWithPrimaryColor)}
          </div>
        </div>
      )}
    </div>
  );
}
