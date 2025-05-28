
"use client";

import { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { EditNodeInput, NodeData, PaletteColorKey } from '@/types/mindmap';
import { summarizeNodeContent, type SummarizeNodeContentInput } from '@/ai/flows/summarize-node';
import { Sparkles, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface EditNodeDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  node: NodeData | null;
  onSave: (nodeId: string, data: EditNodeInput) => void;
}

const PALETTE_OPTIONS: { label: string; value: PaletteColorKey | 'no-custom-color' }[] = [
  { label: "Default Theme", value: "no-custom-color" },
  { label: "Indigo", value: "chart-1" },
  { label: "Rose", value: "chart-2" },
  { label: "Teal", value: "chart-3" },
  { label: "Amber", value: "chart-4" },
  { label: "Sky Blue", value: "chart-5" },
];

export function EditNodeDialog({ isOpen, onOpenChange, node, onSave }: EditNodeDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [emoji, setEmoji] = useState('');
  const [customBackgroundColor, setCustomBackgroundColor] = useState<PaletteColorKey | ''>('');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (node) {
      setTitle(node.title);
      setDescription(node.description);
      setEmoji(node.emoji || '');
      setCustomBackgroundColor(node.customBackgroundColor || '');
    } else {
      // Reset for new node creation if node becomes null
      setTitle('');
      setDescription('');
      setEmoji('');
      setCustomBackgroundColor('');
    }
  }, [node]);

  const handleSubmit = () => {
    if (node && title.trim()) {
      onSave(node.id, {
        title: title.trim(),
        description,
        emoji: emoji.trim() || undefined,
        customBackgroundColor: customBackgroundColor || undefined,
      });
      onOpenChange(false);
    }
  };

  const handleSummarize = async () => {
    if (!description.trim()) {
      toast({
        title: "Cannot Summarize",
        description: "Description is empty. Please add some content to summarize.",
        variant: "destructive",
      });
      return;
    }
    setIsSummarizing(true);
    try {
      const input: SummarizeNodeContentInput = { content: description };
      const result = await summarizeNodeContent(input);
      setDescription(result.summary);
      toast({
        title: "Content Summarized",
        description: "The node description has been updated with the AI summary.",
      });
    } catch (error) {
      console.error("Error summarizing content:", error);
      toast({
        title: "Summarization Failed",
        description: "Could not summarize the content. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSummarizing(false);
    }
  };

  if (!node) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>{node.id.startsWith('temp-') ? 'Create New Node' : 'Edit Node'}</DialogTitle>
          <DialogDescription>
            Update the details for this node. You can use AI to summarize the description.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="node-emoji" className="text-right">
              Emoji
            </Label>
            <Input
              id="node-emoji"
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              className="col-span-3"
              placeholder="✨ (Optional)"
              maxLength={2} 
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="node-title" className="text-right">
              Title
            </Label>
            <Input
              id="node-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="col-span-3"
              placeholder="Node Title"
            />
          </div>
          <div className="grid grid-cols-4 items-start gap-4">
            <Label htmlFor="node-description" className="text-right pt-2">
              Description
            </Label>
            <div className="col-span-3 space-y-2">
              <Textarea
                id="node-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-[100px]"
                placeholder="Node Description"
              />
              <Button onClick={handleSummarize} disabled={isSummarizing || !description.trim()} variant="outline" size="sm">
                {isSummarizing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                AI Summarize
              </Button>
            </div>
          </div>
           <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="node-bg-color" className="text-right">
              BG Color
            </Label>
            <Select
              value={customBackgroundColor || 'no-custom-color'}
              onValueChange={(value) => {
                setCustomBackgroundColor(value === 'no-custom-color' ? '' : value as PaletteColorKey);
              }}
            >
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Select color" />
              </SelectTrigger>
              <SelectContent>
                {PALETTE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex items-center">
                      {option.value !== 'no-custom-color' && (
                        <span
                          className="w-4 h-4 rounded-full mr-2 border"
                          style={{ backgroundColor: `hsl(var(--${option.value}))` }}
                        />
                      )}
                      {option.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" onClick={handleSubmit} disabled={!title.trim()}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
