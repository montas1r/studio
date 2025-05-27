
"use client";

import type { NodeData } from '@/types/mindmap';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Edit3, Trash2, PlusCircle, ChevronDown, ChevronRight } from 'lucide-react';
import React, { useState } from 'react';

interface NodeCardProps {
  node: NodeData;
  onEdit: (node: NodeData) => void;
  onDelete: (nodeId: string) => void;
  onAddChild: (parentId: string) => void;
  renderChildren: (nodeId: string) => React.ReactNode;
  hasChildren: boolean;
  isRoot?: boolean;
}

export function NodeCard({ node, onEdit, onDelete, onAddChild, renderChildren, hasChildren, isRoot = false }: NodeCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <Card className={`mb-4 shadow-md hover:shadow-lg transition-shadow duration-200 rounded-lg ${isRoot ? 'border-primary border-2' : ''}`}>
      <CardHeader className="flex flex-row items-center justify-between p-4 bg-muted/30 rounded-t-lg">
        <div className="flex items-center">
          {hasChildren && (
            <Button variant="ghost" size="icon" onClick={() => setIsExpanded(!isExpanded)} className="mr-2">
              {isExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
            </Button>
          )}
          <CardTitle className="text-lg font-semibold">{node.title}</CardTitle>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="icon" onClick={() => onEdit(node)} aria-label="Edit node">
            <Edit3 className="h-4 w-4" />
          </Button>
          <Button variant="destructive" size="icon" onClick={() => onDelete(node.id)} aria-label="Delete node">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      {isExpanded && (
        <>
          <CardContent className="p-4">
            {node.description ? (
              <CardDescription className="whitespace-pre-wrap text-sm">{node.description}</CardDescription>
            ) : (
              <CardDescription className="italic text-xs">No description yet.</CardDescription>
            )}
          </CardContent>
          <CardFooter className="p-4 border-t">
            <Button variant="ghost" size="sm" onClick={() => onAddChild(node.id)} className="text-primary hover:text-primary/90">
              <PlusCircle className="mr-2 h-4 w-4" /> Add Child Node
            </Button>
          </CardFooter>
          {hasChildren && (
            <div className="pl-6 pr-2 pb-2">
              {renderChildren(node.id)}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
