
"use client";

import { useState, useEffect } from 'react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { EditNodeInput, NodeData, PaletteColorKey } from '@/types/mindmap';
import { summarizeNodeContent, type SummarizeNodeContentInput } from '@/ai/flows/summarize-node';
import { Sparkles, Loader2, Palette } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface EditNodeDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  node: NodeData | null; // Can be existing or temporary new node
  onSave: (nodeId: string, data: EditNodeInput) => void;
}

const PALETTE_OPTIONS: { label: string; value: PaletteColorKey | 'no-custom-color' }[] = [
  { label: "Default Theme", value: "no-custom-color" },
  { label: "Indigo (Chart 1)", value: "chart-1" },
  { label: "Rose (Chart 2)", value: "chart-2" },
  { label: "Teal (Chart 3)", value: "chart-3" },
  { label: "Amber (Chart 4)", value: "chart-4" },
  { label: "Sky Blue (Chart 5)", value: "chart-5" },
];

export function EditNodeDialog({ isOpen, onOpenChange, node, onSave }: EditNodeDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [emoji, setEmoji] = useState('');
  const [customBackgroundColor, setCustomBackgroundColor] = useState<PaletteColorKey | 'no-custom-color'>('no-custom-color');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (node) {
      setTitle(node.title);
      setDescription(node.description);
      setEmoji(node.emoji || '');
      setCustomBackgroundColor(node.customBackgroundColor || 'no-custom-color');
    } else {
      // Reset for new node if node becomes null (though typically dialog closes)
      setTitle('');
      setDescription('');
      setEmoji('');
      setCustomBackgroundColor('no-custom-color');
    }
  }, [node]);

  const handleSubmit = () => {
    if (node && title.trim()) {
      onSave(node.id, { // Pass node.id (which is temp-uuid for new nodes)
        title: title.trim(),
        description,
        emoji: emoji.trim() || undefined,
        customBackgroundColor: customBackgroundColor === 'no-custom-color' ? undefined : customBackgroundColor,
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
              Node Color
            </Label>
            <div className="col-span-3">
              <Select
                value={customBackgroundColor}
                onValueChange={(value) => setCustomBackgroundColor(value as PaletteColorKey | 'no-custom-color')}
              >
                <SelectTrigger id="node-bg-color">
                  <SelectValue placeholder="Select Node Color" />
                </SelectTrigger>
                <SelectContent>
                  {PALETTE_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      <div className="flex items-center gap-2">
                        {option.value !== 'no-custom-color' && (
                           <span 
                             className="h-4 w-4 rounded-full border" 
                             style={{ backgroundColor: `hsl(var(--${option.value}))`}}
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" onClick={handleSubmit} disabled={!title.trim()}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

