
"use client";

import { use } from 'react';
import { MindmapEditor } from '@/components/mindmap/MindmapEditor';
import { useMindmaps } from '@/hooks/useMindmaps';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

interface MindmapPageProps {
  params: Promise<{ id: string }>; // Updated to reflect params is a Promise
}

export default function MindmapPage({ params }: MindmapPageProps) {
  const { id: mindmapId } = use(params); // Unwrap params using React.use()
  const { isLoading, getMindmapById } = useMindmaps();
  const mindmap = getMindmapById(mindmapId);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-1/4" />
          <Skeleton className="h-10 w-24" />
        </div>
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!mindmap) {
    return (
      <div className="text-center py-10">
        <h1 className="text-2xl font-bold mb-4">Mindmap Not Found</h1>
        <p className="text-muted-foreground mb-6">
          The mindmap you are looking for does not exist or has been deleted.
        </p>
        <Button asChild>
          <Link href="/">
            <ArrowLeft className="mr-2 h-4 w-4" /> Go Back to Library
          </Link>
        </Button>
      </div>
    );
  }
  
  return <MindmapEditor mindmapId={mindmapId} />;
}
