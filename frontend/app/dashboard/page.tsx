'use client';

import 'regenerator-runtime/runtime';
import { useEffect, useState } from 'react';
import { getCurrentUser, fetchAuthSession, signOut } from 'aws-amplify/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { configureAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, Lock, ShieldCheck, Terminal, Database, Cloud, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NavBar } from '@/components/NavBar';
import { DictationButton } from '@/components/DictationButton';

configureAuth();

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [quizData, setQuizData] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  // Selection State
  const [selectedLcOption, setSelectedLcOption] = useState<number | null>(null);
  const [selectedResumeOption, setSelectedResumeOption] = useState<number | null>(null);
  const [selectedTechOption, setSelectedTechOption] = useState<number | null>(null);

  // Open Ended State
  const [resumeAnswer, setResumeAnswer] = useState('');
  const [resumeFeedback, setResumeFeedback] = useState<any>(null);
  const [resumeSubmitting, setResumeSubmitting] = useState(false);

  const [techAnswer, setTechAnswer] = useState('');
  const [techFeedback, setTechFeedback] = useState<any>(null);
  const [techSubmitting, setTechSubmitting] = useState(false);

  const getAnswerIndex = (answerStr: string) => {
    if (!answerStr) return -1;
    const firstChar = answerStr.trim().charAt(0).toUpperCase();
    return firstChar.charCodeAt(0) - 65; // 'A' -> 0, 'B' -> 1
  };

  useEffect(() => {
    checkUser();
    fetchHistory();
  }, []);

  useEffect(() => {
    // Reset selections and answers when quizData changes
    if (quizData) {
      setSelectedLcOption(null);
      setSelectedResumeOption(null);
      setSelectedTechOption(null);

      if (quizData.resume?.open_ended?.user_answer) {
        setResumeAnswer(quizData.resume.open_ended.user_answer);
        setResumeFeedback(quizData.resume.open_ended.feedback);
      } else {
        setResumeAnswer('');
        setResumeFeedback(null);
      }

      if (quizData.technical?.open_ended?.user_answer) {
        setTechAnswer(quizData.technical.open_ended.user_answer);
        setTechFeedback(quizData.technical.open_ended.feedback);
      } else {
        setTechAnswer('');
        setTechFeedback(null);
      }
    }
  }, [quizData]);

  async function fetchHistory() {
    setHistoryLoading(true);
    try {
      const res = await fetch(process.env.NEXT_PUBLIC_API_URL + '/history');
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch (e) {
      console.error("Failed to fetch history", e);
    } finally {
      setHistoryLoading(false);
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

  const generateDailyQuiz = async (force: boolean = false) => {
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
        body: JSON.stringify({ topic: "Daily Drill", force })
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

  const submitAnswer = async (type: 'resume' | 'technical', answer: string, question: string, context: any) => {
    if (!answer.trim()) return;
    
    const setSubmitting = type === 'resume' ? setResumeSubmitting : setTechSubmitting;
    const setFeedback = type === 'resume' ? setResumeFeedback : setTechFeedback;
    
    setSubmitting(true);
    try {
        const session = await fetchAuthSession();
        const token = session.tokens?.accessToken?.toString();

        const response = await fetch(process.env.NEXT_PUBLIC_API_URL + '/submit', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                date: quizData.date,
                question,
                userAnswer: answer,
                type: type === 'resume' ? 'Resume Experience' : 'Technical Knowledge',
                context: context
            }) 
        });
        
        if (!response.ok) throw new Error("Failed to submit");
        const data = await response.json();
        setFeedback(data);

    } catch (e) {
        console.error(e);
        alert("Failed to submit answer. Please try again.");
    } finally {
        setSubmitting(false);
    }
  };

  const renderHeatmap = () => {
    if (historyLoading) {
      return (
        <Card className="mb-8 border-border/50 bg-card/50">
          <CardContent className="py-8 flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      );
    }

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

  const isTodayCompleted = history.some(h => h.date === new Date().toISOString().split('T')[0]);

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
      <NavBar
        currentApp="quizzed"
        className="sticky top-0 z-50"
        rightContent={
          <>
            <Link href="/">
              <Button variant="ghost" size="sm">
                Home
              </Button>
            </Link>
            {isAdmin ? (
              <Button variant="outline" size="sm" onClick={handleSignOut}>
                Sign Out
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => router.push('/login')}
              >
                <Lock className="mr-2 h-4 w-4" /> Admin Access
              </Button>
            )}
          </>
        }
      />

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
                  <div className="flex flex-col md:flex-row justify-center items-center gap-8 mb-8 text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                          <Database className="h-12 w-12"/>
                          <span className="text-xs">LanceDB (S3)</span>
                      </div>
                      <div className="h-8 w-0.5 md:h-0.5 md:w-16 bg-zinc-300 self-center opacity-20"/>
                      <div className="flex flex-col items-center gap-2">
                          <Terminal className="h-12 w-12"/>
                          <span className="text-xs">AWS Lambda</span>
                      </div>
                      <div className="h-8 w-0.5 md:h-0.5 md:w-16 bg-zinc-300 self-center opacity-20"/>
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
            
            {/* LEETCODE SECTION */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-purple-400">LeetCode Challenge</CardTitle>
                    {quizData.leetcode.problem?.url && (
                      <Link href={quizData.leetcode.problem.url} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-purple-400">
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </Link>
                    )}
                  </div>
                  {quizData.leetcode.problem?.difficulty && (
                    <span className={`px-2 py-1 rounded text-xs font-bold border ${
                      quizData.leetcode.problem.difficulty === 'Easy' ? 'border-green-500/50 text-green-400 bg-green-500/10' :
                      quizData.leetcode.problem.difficulty === 'Medium' ? 'border-yellow-500/50 text-yellow-400 bg-yellow-500/10' :
                      'border-red-500/50 text-red-400 bg-red-500/10'
                    }`}>
                      {quizData.leetcode.problem.difficulty}
                    </span>
                  )}
                </div>
                <CardDescription>{quizData.leetcode.problem?.title}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Problem Description */}
                <div className="space-y-4">
                  <div className="text-sm text-foreground/90 whitespace-pre-wrap">
                    {quizData.leetcode.problem?.description || quizData.leetcode.problem?.question || "No description available."}
                  </div>
                  
                  {/* Examples */}
                  {quizData.leetcode.problem?.examples && (
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-muted-foreground">Examples:</h4>
                      {Array.isArray(quizData.leetcode.problem.examples) ? (
                         quizData.leetcode.problem.examples.map((ex: any, i: number) => (
                          <div key={i} className="bg-muted/50 p-3 rounded-md border border-border/50 font-mono text-xs">
                            <div className="flex gap-2">
                              <span className="font-bold text-blue-400">Input:</span>
                              <span>{ex.input}</span>
                            </div>
                            <div className="flex gap-2">
                              <span className="font-bold text-green-400">Output:</span>
                              <span>{ex.output}</span>
                            </div>
                            {ex.explanation && (
                               <div className="flex gap-2 mt-1 text-muted-foreground">
                                <span className="italic">Note:</span>
                                <span>{ex.explanation}</span>
                              </div>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="bg-muted/50 p-3 rounded-md border border-border/50 font-mono text-xs">
                           {JSON.stringify(quizData.leetcode.problem.examples)}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Constraints */}
                  {quizData.leetcode.problem?.constraints && (
                     <div className="space-y-2">
                       <h4 className="text-sm font-semibold text-muted-foreground">Constraints:</h4>
                       <ul className="list-disc pl-5 text-xs font-mono text-muted-foreground">
                         {Array.isArray(quizData.leetcode.problem.constraints) 
                            ? quizData.leetcode.problem.constraints.map((c: string, i: number) => <li key={i}>{c}</li>)
                            : <li>{JSON.stringify(quizData.leetcode.problem.constraints)}</li>
                         }
                       </ul>
                     </div>
                  )}
                </div>

                <div className="h-px bg-border/50" />

                {/* AI Question */}
                <div className="bg-blue-900/10 p-4 rounded-md border border-blue-900/30">
                  <h4 className="font-semibold text-blue-400 mb-2 text-sm">Strategy Check</h4>
                  <p className="text-blue-200/90 text-sm mb-3">{quizData.leetcode.ai_question?.question}</p>
                  {quizData.leetcode.ai_question?.options && (
                    <div className="grid grid-cols-1 gap-2">
                      {quizData.leetcode.ai_question.options.map((opt: string, i: number) => {
                        const correctIndex = getAnswerIndex(quizData.leetcode.ai_question.answer);
                        const isRevealed = selectedLcOption !== null;
                        let variantClass = "border-blue-900/30 hover:bg-blue-900/20 hover:text-blue-300";
                        
                        if (isRevealed) {
                          if (i === correctIndex) variantClass = "bg-green-600/20 border-green-500 text-green-400 hover:bg-green-600/30";
                          else if (selectedLcOption === i) variantClass = "bg-red-600/20 border-red-500 text-red-400 hover:bg-red-600/30";
                          else variantClass = "opacity-50";
                        } else if (selectedLcOption === i) {
                          variantClass = "bg-blue-600 hover:bg-blue-500 border-transparent text-white";
                        }

                        return (
                          <Button 
                            key={i} 
                            variant={"outline"}
                            className={cn(
                              "justify-start h-auto py-2 text-left text-xs whitespace-normal transition-all",
                              variantClass
                            )}
                            onClick={() => !isRevealed && setSelectedLcOption(i)}
                            disabled={isRevealed}
                          >
                            {opt}
                          </Button>
                        );
                      })}
                    </div>
                  )}
                  {selectedLcOption !== null && quizData.leetcode.ai_question?.explanation && (
                    <div className="mt-4 p-3 bg-blue-950/30 rounded border border-blue-500/20 text-xs text-blue-200">
                      <span className="font-bold text-blue-400">Explanation: </span>
                      {quizData.leetcode.ai_question.explanation}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* RESUME DEEP DIVE */}
            <Card>
              <CardHeader>
                <CardTitle className="text-orange-400">Resume Deep Dive</CardTitle>
                <CardDescription>Generated based on your experience context.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                
                {/* MCQ */}
                <div className="space-y-3">
                   <h4 className="font-semibold text-sm flex items-center gap-2">
                     <span className="w-2 h-2 rounded-full bg-orange-500"/>
                     Multiple Choice
                   </h4>
                   <p className="text-sm text-foreground/90">{quizData.resume.mcq?.question}</p>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                      {quizData.resume.mcq?.options?.map((opt: string, i: number) => {
                        const correctIndex = getAnswerIndex(quizData.resume.mcq.answer);
                        const isRevealed = selectedResumeOption !== null;
                        let variantClass = "";

                        if (isRevealed) {
                          if (i === correctIndex) variantClass = "bg-green-600 hover:bg-green-500 text-white ring-2 ring-green-400";
                          else if (selectedResumeOption === i) variantClass = "bg-red-600 hover:bg-red-500 text-white";
                          else variantClass = "opacity-50";
                        } else if (selectedResumeOption === i) {
                          variantClass = "bg-orange-600 hover:bg-orange-500 text-white";
                        }

                        return (
                          <Button 
                            key={i} 
                            variant={isRevealed && i === correctIndex ? "default" : (selectedResumeOption === i ? "default" : "secondary")}
                            className={cn(
                              "justify-start h-auto py-2 text-xs text-left whitespace-normal",
                              variantClass
                            )}
                            onClick={() => !isRevealed && setSelectedResumeOption(i)}
                            disabled={isRevealed}
                          >
                            {opt}
                          </Button>
                        );
                      })}
                   </div>
                   {selectedResumeOption !== null && quizData.resume.mcq?.explanation && (
                    <div className="mt-4 p-3 bg-orange-950/30 rounded border border-orange-500/20 text-xs text-orange-200">
                      <span className="font-bold text-orange-400">Explanation: </span>
                      {quizData.resume.mcq.explanation}
                    </div>
                  )}
                </div>

                <div className="h-px bg-border/50" />

                {/* Open Ended */}
                <div className="space-y-3">
                   <h4 className="font-semibold text-sm flex items-center gap-2">
                     <span className="w-2 h-2 rounded-full bg-orange-500"/>
                     Open-Ended Scenario
                   </h4>
                   <div className="bg-muted/30 p-4 rounded-lg border border-border/50">
                     <p className="text-sm font-medium mb-4">{quizData.resume.open_ended?.question}</p>
                     
                     {!resumeFeedback ? (
                       <>
                         <DictationButton 
                            placeholder="Type or dictate your answer..." 
                            onTranscriptChange={setResumeAnswer}
                            ringColor="orange"
                         />
                         <div className="flex justify-end mt-2">
                            <Button 
                              size="sm" 
                              onClick={() => submitAnswer('resume', resumeAnswer, quizData.resume.open_ended.question, quizData.resume.open_ended)}
                              disabled={resumeSubmitting || !resumeAnswer.trim()}
                            >
                              {resumeSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit Answer"}
                            </Button>
                         </div>
                       </>
                     ) : (
                       <div className="space-y-4">
                          <div className="p-3 bg-background/50 rounded text-sm italic border border-border/30">
                             <p className="font-bold text-muted-foreground text-xs mb-1">Your Answer:</p>
                             "{resumeAnswer}"
                          </div>
                          <div className="p-4 bg-orange-950/30 rounded border border-orange-500/20 text-sm space-y-2">
                              <div className="flex items-center justify-between">
                                  <span className="font-bold text-orange-400">Score: {resumeFeedback.score}</span>
                              </div>
                              <p className="text-orange-100">{resumeFeedback.feedback}</p>
                              {resumeFeedback.improvement_tips && (
                                <ul className="list-disc pl-5 text-xs text-orange-200/80">
                                   {resumeFeedback.improvement_tips.map((tip: string, i: number) => <li key={i}>{tip}</li>)}
                                </ul>
                              )}
                          </div>
                       </div>
                     )}
                   </div>
                </div>

              </CardContent>
            </Card>

            {/* TECHNICAL KNOWLEDGE */}
            <Card>
              <CardHeader>
                <CardTitle className="text-indigo-400">Technical Knowledge</CardTitle>
                <CardDescription>System design and concept verification.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                
                 {/* MCQ */}
                 <div className="space-y-3">
                   <h4 className="font-semibold text-sm flex items-center gap-2">
                     <span className="w-2 h-2 rounded-full bg-indigo-500"/>
                     Multiple Choice
                   </h4>
                   <p className="text-sm text-foreground/90">{quizData.technical.mcq?.question}</p>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                      {quizData.technical.mcq?.options?.map((opt: string, i: number) => {
                        const correctIndex = getAnswerIndex(quizData.technical.mcq.answer);
                        const isRevealed = selectedTechOption !== null;
                        let variantClass = "";

                        if (isRevealed) {
                          if (i === correctIndex) variantClass = "bg-green-600 hover:bg-green-500 text-white ring-2 ring-green-400";
                          else if (selectedTechOption === i) variantClass = "bg-red-600 hover:bg-red-500 text-white";
                          else variantClass = "opacity-50";
                        } else if (selectedTechOption === i) {
                          variantClass = "bg-indigo-600 hover:bg-indigo-500 text-white";
                        }

                        return (
                          <Button 
                            key={i} 
                            variant={isRevealed && i === correctIndex ? "default" : (selectedTechOption === i ? "default" : "secondary")}
                            className={cn(
                              "justify-start h-auto py-2 text-xs text-left whitespace-normal",
                              variantClass
                            )}
                            onClick={() => !isRevealed && setSelectedTechOption(i)}
                            disabled={isRevealed}
                          >
                            {opt}
                          </Button>
                        );
                      })}
                   </div>
                   {selectedTechOption !== null && quizData.technical.mcq?.explanation && (
                    <div className="mt-4 p-3 bg-indigo-950/30 rounded border border-indigo-500/20 text-xs text-indigo-200">
                      <span className="font-bold text-indigo-400">Explanation: </span>
                      {quizData.technical.mcq.explanation}
                    </div>
                  )}
                </div>

                <div className="h-px bg-border/50" />

                {/* Open Ended */}
                <div className="space-y-3">
                   <h4 className="font-semibold text-sm flex items-center gap-2">
                     <span className="w-2 h-2 rounded-full bg-indigo-500"/>
                     Open-Ended Scenario
                   </h4>
                   <div className="bg-muted/30 p-4 rounded-lg border border-border/50">
                     <p className="text-sm font-medium mb-4">{quizData.technical.open_ended?.question}</p>
                     
                     {!techFeedback ? (
                       <>
                        <DictationButton 
                            placeholder="Explain your reasoning..." 
                            onTranscriptChange={setTechAnswer}
                            ringColor="indigo"
                         />
                         <div className="flex justify-end mt-2">
                            <Button 
                              size="sm"
                              onClick={() => submitAnswer('technical', techAnswer, quizData.technical.open_ended.question, quizData.technical.open_ended)}
                              disabled={techSubmitting || !techAnswer.trim()}
                            >
                              {techSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit Answer"}
                            </Button>
                         </div>
                       </>
                     ) : (
                       <div className="space-y-4">
                          <div className="p-3 bg-background/50 rounded text-sm italic border border-border/30">
                             <p className="font-bold text-muted-foreground text-xs mb-1">Your Answer:</p>
                             "{techAnswer}"
                          </div>
                          <div className="p-4 bg-indigo-950/30 rounded border border-indigo-500/20 text-sm space-y-2">
                              <div className="flex items-center justify-between">
                                  <span className="font-bold text-indigo-400">Score: {techFeedback.score}</span>
                              </div>
                              <p className="text-indigo-100">{techFeedback.feedback}</p>
                              {techFeedback.improvement_tips && (
                                <ul className="list-disc pl-5 text-xs text-indigo-200/80">
                                   {techFeedback.improvement_tips.map((tip: string, i: number) => <li key={i}>{tip}</li>)}
                                </ul>
                              )}
                          </div>
                       </div>
                     )}
                   </div>
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
              <div className="flex flex-col sm:flex-row gap-4">
                <Button size="lg" onClick={() => generateDailyQuiz(false)} disabled={generating || isTodayCompleted} className="w-full sm:w-auto">
                  {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Terminal className="mr-2 h-4 w-4"/>}
                  {generating ? "Generating..." : "Generate New Quiz"}
                </Button>
                
                {isTodayCompleted && (
                   <Button size="lg" variant="secondary" onClick={() => generateDailyQuiz(true)} disabled={generating} className="w-full sm:w-auto bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 border border-yellow-500/50">
                    <Loader2 className={`mr-2 h-4 w-4 ${generating ? 'animate-spin' : 'hidden'}`}/>
                    Regenerate Today's Quiz
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}