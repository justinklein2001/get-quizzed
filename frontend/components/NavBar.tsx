"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

export type AppName = "portfolio" | "quizzed" | "smart";

interface NavBarProps {
  currentApp: AppName;
  rightContent?: React.ReactNode;
  className?: string;
}

export function NavBar({ currentApp, rightContent, className }: NavBarProps) {
  const links = [
    { name: "Portfolio", href: "https://justinklein.ca", id: "portfolio" },
    { name: "Get Quizzed", href: "https://get-quizzed.justinklein.ca", id: "quizzed" },
    { name: "Get Smart", href: "https://get-smart.justinklein.ca", id: "smart" },
  ] as const;

  const visibleLinks = links.filter((link) => link.id !== currentApp);

  return (
    <header className={cn("flex w-full items-center justify-between px-8 py-6 border-b border-border bg-card/50 backdrop-blur-sm", className)}>
      <div className="flex items-center gap-2 text-xl font-bold tracking-tight">
        <Link href="/" className="hover:opacity-80 transition-opacity text-foreground">
          Justin Klein
        </Link>
        
        {visibleLinks.map((link) => (
            <div key={link.id} className="flex items-center gap-2">
                 <span className="text-muted-foreground font-normal">|</span>
                 <Link 
                    href={link.href} 
                    className="text-muted-foreground font-normal hover:text-foreground transition-colors"
                  >
                    {link.name}
                 </Link>
            </div>
        ))}
      </div>

      <div className="flex items-center gap-4">
        {rightContent}
      </div>
    </header>
  );
}
