'use server';

/**
 * @fileOverview Summarizes node content in a mindmap using AI.
 *
 * - summarizeNodeContent - A function that summarizes the content of a node.
 * - SummarizeNodeContentInput - The input type for the summarizeNodeContent function.
 * - SummarizeNodeContentOutput - The return type for the summarizeNodeContent function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SummarizeNodeContentInputSchema = z.object({
  content: z.string().describe('The content of the node to summarize.'),
});
export type SummarizeNodeContentInput = z.infer<typeof SummarizeNodeContentInputSchema>;

const SummarizeNodeContentOutputSchema = z.object({
  summary: z.string().describe('The summarized content of the node.'),
});
export type SummarizeNodeContentOutput = z.infer<typeof SummarizeNodeContentOutputSchema>;

export async function summarizeNodeContent(input: SummarizeNodeContentInput): Promise<SummarizeNodeContentOutput> {
  return summarizeNodeContentFlow(input);
}

const summarizeNodeContentPrompt = ai.definePrompt({
  name: 'summarizeNodeContentPrompt',
  input: {schema: SummarizeNodeContentInputSchema},
  output: {schema: SummarizeNodeContentOutputSchema},
  prompt: `Summarize the following content into key points:\n\nContent: {{{content}}}`,
});

const summarizeNodeContentFlow = ai.defineFlow(
  {
    name: 'summarizeNodeContentFlow',
    inputSchema: SummarizeNodeContentInputSchema,
    outputSchema: SummarizeNodeContentOutputSchema,
  },
  async input => {
    const {output} = await summarizeNodeContentPrompt(input);
    return output!;
  }
);
