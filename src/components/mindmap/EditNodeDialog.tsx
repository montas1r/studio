
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
import type { EditNodeInput, NodeData, NodeSize } from '@/types/mindmap';
import { summarizeNodeContent, type SummarizeNodeContentInput } from '@/ai/flows/summarize-node';
import { Sparkles, Loader2, Ruler } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
// import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"; // Keep if used elsewhere, not for size now
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";


interface EditNodeDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  node: NodeData | null; 
  onSave: (nodeId: string, data: EditNodeInput, newSize?: NodeSize) => void;
}

export function EditNodeDialog({ isOpen, onOpenChange, node, onSave }: EditNodeDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [emoji, setEmoji] = useState('');
  const [selectedNodeSize, setSelectedNodeSize] = useState<NodeSize>('standard');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (node) {
      setTitle(node.title);
      setDescription(node.description);
      setEmoji(node.emoji || '');
      setSelectedNodeSize(node.size || 'standard');
    } else {
      setTitle('');
      setDescription('');
      setEmoji('');
      setSelectedNodeSize('standard');
    }
  }, [node]);

  const handleSubmit = () => {
    if (node && title.trim()) {
      onSave(
        node.id, 
        { 
          title: title.trim(),
          description, // Description will be saved as Markdown
          emoji: emoji.trim() || undefined,
        },
        selectedNodeSize
      );
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
      const input: SummarizeNodeContentInput = { content: description }; // Summarize Markdown
      const result = await summarizeNodeContent(input);
      setDescription(result.summary); // Resulting summary might also be Markdown or plain text
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
                placeholder="Node Description (Markdown supported)" // Updated placeholder
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
            <Label htmlFor="node-size" className="text-right flex items-center">
              <Ruler className="mr-1.5 h-4 w-4 text-muted-foreground inline-block" /> Size
            </Label>
            <div className="col-span-3">
                <Select value={selectedNodeSize} onValueChange={(value) => setSelectedNodeSize(value as NodeSize)}>
                    <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select node size" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="mini">Mini</SelectItem>
                        <SelectItem value="standard">Standard</SelectItem>
                        <SelectItem value="massive">Massive</SelectItem>
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
