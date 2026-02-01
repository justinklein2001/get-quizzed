'use client';

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NavBar } from "@/components/NavBar";
import { Database, Server, Code, Lock } from "lucide-react";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background font-sans text-foreground">
      {/* Header / Navigation */}
      <NavBar
        currentApp="quizzed"
        rightContent={
          <>
            <Link href="/dashboard">
              <Button variant="ghost" size="sm">
                Dashboard
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="secondary" size="sm">
                <Lock className="mr-2 h-4 w-4" /> Admin Login
              </Button>
            </Link>
          </>
        }
      />

      {/* Hero Section */}
      <main className="flex flex-1 flex-col items-center justify-center px-4 text-center py-20">
        <div className="max-w-3xl space-y-6">
          <h1 className="text-5xl font-bold tracking-tight sm:text-7xl">
            Get Quizzed!
          </h1>
          <h2 className="text-3xl tracking-tight sm:text-5xl">
            Keep technical & communication skills sharp.
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            A serverless RAG application that generates personalized interview questions based on my resume, technical notes, and LeetCode history.
          </p>

          <div className="flex items-center justify-center gap-2 text-sm text-green-400/90 font-mono bg-green-900/10 py-1 px-3 rounded-full w-fit mx-auto border border-green-900/30">
            <Lock className="h-3 w-3" />
            <span>Secured: API & Generation only accessible via Admin Auth</span>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center mt-8">
            <Link href="/dashboard">
              <Button size="lg" className="h-12 px-8 text-lg">
                View Architecture & Demo
              </Button>
            </Link>
            <Link href="https://get-smart.justinklein.ca" target="_blank">
               <Button variant="secondary" size="lg" className="h-12 px-8 text-lg">
                View Knowledge Base
              </Button>
            </Link>
            <Link href="https://github.com/justinklein2001/get-quizzed" target="_blank">
               <Button variant="outline" size="lg" className="h-12 px-8 text-lg">
                View Source Code
              </Button>
            </Link>
          </div>
        </div>

        {/* Tech Stack Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-20 max-w-5xl w-full">
          <Card className="bg-card/50 border-border hover:border-primary/50 transition-colors">
            <CardHeader>
              <Database className="h-10 w-10 text-blue-400 mb-2" />
              <CardTitle>Vector Search</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm">
              Built with <strong>LanceDB</strong> on S3. Uses <strong>Amazon Titan v2</strong> embeddings to semantic search across markdown notes and JSON data.
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-border hover:border-primary/50 transition-colors">
            <CardHeader>
              <Server className="h-10 w-10 text-orange-400 mb-2" />
              <CardTitle>Serverless RAG</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm">
              Powered by <strong>AWS Lambda</strong> (Node.js 22) and <strong>Bedrock</strong> (Claude 3.5 Sonnet) for high-performance, low-cost generation.
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-border hover:border-primary/50 transition-colors">
             <CardHeader>
              <Code className="h-10 w-10 text-green-400 mb-2" />
              <CardTitle>Infrastructure as Code</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm">
              Fully provisioned via <strong>Terraform</strong>. CI/CD pipeline deploys frontend to S3/CloudFront and backend to Lambda.
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full py-6 text-center text-sm text-muted-foreground border-t border-border">
        <p>Built by Justin Klein. Deployed on AWS.</p>
      </footer>
    </div>
  );
}
