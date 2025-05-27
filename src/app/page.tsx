
"use client";

import { useMindmaps } from '@/hooks/useMindmaps';
import { CreateMindmapDialog } from '@/components/CreateMindmapDialog';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileText, Eye, Edit3, Trash2, Layers, Calendar, ArrowRight } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import Image from 'next/image';

export default function HomePage() {
  const { mindmaps, createMindmap, deleteMindmap, isLoading } = useMindmaps();
  const router = useRouter();

  const handleCreateMindmap = (input: { name: string; category?: string }) => {
    const newMindmap = createMindmap(input);
    router.push(`/mindmap/${newMindmap.id}`);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">Mindmap Library</h1>
          <p className="text-muted-foreground">
            Access your saved mindmaps or create a new one to start sparking ideas.
          </p>
        </div>
        <CreateMindmapDialog onCreate={handleCreateMindmap} />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="shadow-lg hover:shadow-xl transition-shadow duration-300">
              <CardHeader>
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-2/3" />
              </CardContent>
              <CardFooter className="flex justify-between items-center">
                <Skeleton className="h-10 w-24" />
                <Skeleton className="h-8 w-8 rounded-full" />
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : mindmaps.length === 0 ? (
        <Card className="text-center py-12 shadow-lg">
          <CardContent className="flex flex-col items-center gap-4">
            <Image src="https://placehold.co/300x200.png" alt="No mindmaps placeholder" width={300} height={200} className="rounded-md mb-4 opacity-70" data-ai-hint="empty state illustration" />
            <h2 className="text-2xl font-semibold">No Mindmaps Yet</h2>
            <p className="text-muted-foreground">
              Click "Create New Mindmap" to get started.
            </p>
            <CreateMindmapDialog onCreate={handleCreateMindmap} />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {mindmaps.sort((a,b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).map((mindmap) => (
            <Card key={mindmap.id} className="flex flex-col justify-between shadow-lg hover:shadow-xl transition-shadow duration-300 rounded-xl overflow-hidden">
              <CardHeader>
                <CardTitle className="text-2xl hover:text-primary transition-colors">
                  <Link href={`/mindmap/${mindmap.id}`}>{mindmap.name}</Link>
                </CardTitle>
                {mindmap.category && (
                  <CardDescription className="flex items-center text-sm">
                    <Layers className="mr-1.5 h-3.5 w-3.5" /> {mindmap.category}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="flex-grow">
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {Object.keys(mindmap.data.nodes).length > 0 
                    ? `${Object.keys(mindmap.data.nodes).length} node(s)`
                    : "An empty canvas awaits your ideas."}
                </p>
                 <p className="text-xs text-muted-foreground mt-2 flex items-center">
                  <Calendar className="mr-1.5 h-3.5 w-3.5" /> Last updated: {format(parseISO(mindmap.updatedAt), 'MMM d, yyyy')}
                </p>
              </CardContent>
              <CardFooter className="flex justify-between items-center bg-muted/50 p-4">
                <Button asChild variant="ghost" size="sm" className="text-primary hover:text-primary/90">
                  <Link href={`/mindmap/${mindmap.id}`}>
                    <Edit3 className="mr-2 h-4 w-4" /> Edit
                  </Link>
                </Button>
                <Button variant="destructive" size="icon" onClick={() => deleteMindmap(mindmap.id)} aria-label="Delete mindmap">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
