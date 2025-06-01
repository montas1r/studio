
"use client";

import Link from 'next/link';
import { Sparkles } from 'lucide-react';
// import { useTheme } from 'next-themes';
// import { Button } from '@/components/ui/button';
// import { useEffect, useState } from 'react';

export function AppHeader() {
  // const { theme, setTheme } = useTheme();
  // const [mounted, setMounted] = useState(false);

  // useEffect(() => {
  //   setMounted(true);
  // }, []);

  // const toggleTheme = () => {
  //   setTheme(theme === 'dark' ? 'light' : 'dark');
  // };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center space-x-2">
          <Sparkles className="h-6 w-6 text-primary" />
          <span className="font-bold text-xl">SynapseSpark</span>
        </Link>
        
        <div className="text-xs text-muted-foreground">
          © Montasir - 2025
        </div>
        
        {/* {mounted && (
          <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
        )} */}
      </div>
    </header>
  );
}
