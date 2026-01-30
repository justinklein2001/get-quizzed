'use client';

import { useEffect, useState } from 'react';
import { getCurrentUser, fetchAuthSession, signOut } from 'aws-amplify/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { configureAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, Lock, ShieldCheck, Terminal, Database, Cloud } from 'lucide-react';

configureAuth();

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [quizData, setQuizData] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    checkUser();
    fetchHistory();
  }, []);

  async function fetchHistory() {
    try {
      const res = await fetch(process.env.NEXT_PUBLIC_API_URL + '/history');
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch (e) {
      console.error("Failed to fetch history", e);
    }
  }

  async function checkUser() {
    try {
      await getCurrentUser();
      setIsAdmin(true);
    } catch (err) {
      setIsAdmin(false);
    } finally {
      setLoading(false);
    }
  }

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  const generateDailyQuiz = async () => {
    setGenerating(true);
    setError('');
    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.accessToken?.toString();
      
      const response = await fetch(process.env.NEXT_PUBLIC_API_URL + '/generate', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ topic: "Daily Drill" })
      });

      if (!response.ok) {
        let errorMessage = `API Error: ${response.statusText}`;
        try {
          const errorData = await response.json();
          if (errorData.error) errorMessage = errorData.error;
        } catch (ignored) {
          // If JSON parsing fails, stick with the generic statusText
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      setQuizData(data);
      fetchHistory(); 
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to generate quiz');
    } finally {
      setGenerating(false);
    }
  };

  const renderHeatmap = () => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d.toISOString().split('T')[0];
    });

    return (
      <Card className="mb-8 border-border/50 bg-card/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider text-center">
            7-Day Consistency Log
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-w-2xl mx-auto">
            <div className="grid grid-cols-7 gap-2 sm:gap-4 w-full">
            {days.map(date => {
              const entry = history.find(h => h.date === date);
              const dateObj = new Date(date);
              // Use UTC methods to prevent timezone shifts
              const dayLabel = dateObj.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
              
              return (
                <div key={date} className="flex flex-col items-center gap-2">
                  <div
                    title={`${date}: ${entry ? 'Completed' : 'Missed'}`}
                    onClick={() => entry && setQuizData(entry)}
                    className={`
                      w-full aspect-square rounded-md cursor-pointer transition-all hover:scale-105
                      flex items-center justify-center
                      ${entry 
                        ? 'bg-green-500 hover:bg-green-400 shadow-[0_0_12px_rgba(34,197,94,0.4)] ring-2 ring-green-500/20' 
                        : 'bg-muted hover:bg-muted-foreground/20 border border-border/50'}
                    `}
                  >
                    {entry && <ShieldCheck className="w-1/2 h-1/2 text-green-950/50" />}
                  </div>
                  <span className="text-[10px] text-muted-foreground uppercase">{dayLabel}</span>
                </div>
              );
            })}
          </div>
          </div>
          <div className="mt-6 flex items-center justify-between text-xs text-muted-foreground border-t border-border/50 pt-4 max-w-2xl mx-auto">
            <span>Last 7 Days</span>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1"><div className="w-3 h-3 bg-muted rounded-sm"/> Missed</span>
              <span className="flex items-center gap-1"><div className="w-3 h-3 bg-green-500 rounded-sm"/> Drilled</span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background font-sans text-foreground">
      {/* HEADER */}
      <header className="flex w-full items-center justify-between px-8 py-6 border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <Link href="https://justinklein.ca" target="_blank" className="text-xl font-bold tracking-tight hover:opacity-80 transition-opacity">
          Justin Klein <span className="text-muted-foreground font-normal">| Portfolio</span>
        </Link>
        
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="sm">Home</Button>
          </Link>
          {isAdmin ? (
             <Button variant="outline" size="sm" onClick={handleSignOut}>
               Sign Out
             </Button>
          ) : (
             <Button variant="secondary" size="sm" onClick={() => router.push('/login')}>
               <Lock className="mr-2 h-4 w-4"/> Admin Access
             </Button>
          )}
        </div>
      </header>

      <main className="flex-1 container mx-auto p-8 max-w-5xl space-y-8 pt-12">
        {/* PAGE TITLE */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {isAdmin ? "Justin's Training Dojo" : "Training Log & Demo"}
            </h1>
            <p className="text-muted-foreground mt-2">
              {isAdmin 
                ? "Consistency breeds mastery. Let's attack today's technical gaps." 
                : "Review my daily technical drills and consistency. Click a green square to see the details."}
            </p>
          </div>
        </div>

        {/* HEATMAP */}
        {renderHeatmap()}

        {/* RECRUITER VIEW: ARCHITECTURE */}
        {!isAdmin && !quizData && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cloud className="h-5 w-5"/> AWS Serverless Architecture
                </CardTitle>
                <CardDescription>
                  How this application processes data securely and cost-effectively.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center justify-center p-8 bg-card rounded-lg m-4 border-2 border-dashed">
                <div className="text-center space-y-4 max-w-2xl">
                  <div className="flex justify-center gap-8 mb-8 text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                          <Database className="h-12 w-12"/>
                          <span className="text-xs">LanceDB (S3)</span>
                      </div>
                      <div className="h-0.5 w-16 bg-zinc-300 self-center opacity-20"/>
                      <div className="flex flex-col items-center gap-2">
                          <Terminal className="h-12 w-12"/>
                          <span className="text-xs">AWS Lambda</span>
                      </div>
                      <div className="h-0.5 w-16 bg-zinc-300 self-center opacity-20"/>
                       <div className="flex flex-col items-center gap-2">
                          <ShieldCheck className="h-12 w-12"/>
                          <span className="text-xs">Cognito Auth</span>
                      </div>
                  </div>
                  <h3 className="font-semibold text-lg">Retrieval Augmented Generation (RAG) Flow</h3>
                  <ul className="text-left space-y-2 text-sm text-muted-foreground list-disc pl-5">
                      <li><strong>Ingestion:</strong> Markdown notes, Resume, and LeetCode JSON are vectorized (Titan v2) and stored in S3 (LanceDB format).</li>
                      <li><strong>Retrieval:</strong> Lambda downloads the lightweight vector DB on cold start.</li>
                      <li><strong>Generation:</strong> Relevant context is retrieved and sent to Claude 3.5 Sonnet to generate unique questions.</li>
                      <li><strong>Security:</strong> All expensive API calls are protected behind Cognito Admin/Group authorization.</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card>
               <CardHeader>
                <CardTitle>Sample LeetCode Problem</CardTitle>
               </CardHeader>
               <CardContent>
                  <div className="p-4 bg-muted rounded-md text-sm font-mono">
                      <p className="font-bold text-green-400 mb-2">[Easy] Two Sum</p>
                      <p>Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.</p>
                  </div>
               </CardContent>
            </Card>

            <Card>
               <CardHeader>
                <CardTitle>Sample Resume Question</CardTitle>
               </CardHeader>
               <CardContent>
                   <div className="p-4 bg-muted rounded-md text-sm font-mono">
                      <p className="font-bold text-blue-400 mb-2">Topic: Scalability</p>
                      <p>"I see you implemented a serverless backend. How did you handle cold starts and what optimization techniques did you apply to the Lambda functions?"</p>
                  </div>
               </CardContent>
            </Card>
          </div>
        )}

        {/* RESULTS DISPLAY */}
        {quizData && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">Training Log: {quizData.date}</h2>
              <Button variant="ghost" onClick={() => setQuizData(null)}>Close View</Button>
            </div>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-purple-400">LeetCode Challenge</CardTitle>
                <CardDescription>{quizData.leetcode.title}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-slate-900 text-slate-200 p-4 rounded-md font-mono text-sm overflow-auto border border-slate-800">
                  {JSON.stringify(quizData.leetcode, null, 2)}
                </div>
                <div className="bg-blue-900/20 p-4 rounded-md border border-blue-900/50">
                  <h4 className="font-semibold text-blue-300 mb-2">AI Strategy Question:</h4>
                  <p className="text-blue-200">{quizData.leetcode.ai_question?.question}</p>
                  {quizData.leetcode.ai_question?.options && (
                    <ul className="mt-2 list-disc pl-5 text-sm text-blue-300">
                      {quizData.leetcode.ai_question.options.map((opt: string, i: number) => (
                        <li key={i}>{opt}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-orange-400">Resume Deep Dive</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-orange-900/20 p-4 rounded-md border border-orange-900/50">
                  <h4 className="font-semibold text-orange-300 mb-2">AI Interviewer Asks:</h4>
                  <p className="text-orange-200">{quizData.resume.ai_question?.question}</p>
                    {quizData.resume.ai_question?.options && (
                    <ul className="mt-2 list-disc pl-5 text-sm text-orange-300">
                      {quizData.resume.ai_question.options.map((opt: string, i: number) => (
                        <li key={i}>{opt}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-indigo-400">Technical Knowledge</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                  <div className="bg-indigo-900/20 p-4 rounded-md border border-indigo-900/50">
                  <h4 className="font-semibold text-indigo-300 mb-2">AI Knowledge Check:</h4>
                  <p className="text-indigo-200">{quizData.technical.ai_question?.question}</p>
                    {quizData.technical.ai_question?.options && (
                    <ul className="mt-2 list-disc pl-5 text-sm text-indigo-300">
                      {quizData.technical.ai_question.options.map((opt: string, i: number) => (
                        <li key={i}>{opt}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </CardContent>
            </Card>

            <Button variant="outline" onClick={() => setQuizData(null)} className="w-full">Back to Log</Button>
          </div>
        )}

        {/* ADMIN ACTION */}
        {isAdmin && !quizData && (
          <Card className="border-green-800/50 bg-green-900/10">
            <CardHeader>
              <CardTitle className="text-green-400">Daily Drill</CardTitle>
              <CardDescription>Generate a new set of questions based on your unpracticed topics.</CardDescription>
            </CardHeader>
            <CardContent>
              {error && <p className="text-red-600 mb-4 text-sm">{error}</p>}
              <Button size="lg" onClick={generateDailyQuiz} disabled={generating} className="w-full sm:w-auto">
                {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Terminal className="mr-2 h-4 w-4"/>}
                {generating ? "Generating with Claude..." : "Generate New Quiz"}
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}