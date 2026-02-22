'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, CheckCircle2, AlertCircle, Copy, Code, Terminal } from 'lucide-react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { cn } from '@/lib/utils';
import Editor from '@monaco-editor/react';

interface TechnicalCodingDrillProps {
  questions: any[];
  date: string;
}

export function TechnicalCodingDrill({ questions, date }: TechnicalCodingDrillProps) {
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  
  // Local state for questions and answers
  const [localQuestions, setLocalQuestions] = useState(questions);
  const [codeInputs, setCodeInputs] = useState<Record<string, string>>({});

  const activeQuestion = localQuestions[activeQuestionIndex];

  // Initialize input with starter code if empty
  const getCodeValue = (index: number) => {
    if (codeInputs[index] !== undefined) return codeInputs[index];
    // Use saved answer if available, else starter code, else empty
    return localQuestions[index].userProgress?.answer || localQuestions[index].starter_code || '// Write your code here...';
  };

  const setCodeValue = (index: number, val: string) => {
    setCodeInputs(prev => ({ ...prev, [index]: val }));
  };

  const validateCode = async () => {
    const userAnswer = getCodeValue(activeQuestionIndex);
    if (!userAnswer.trim()) return;

    setSubmitting(true);
    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.accessToken?.toString();

      const response = await fetch(process.env.NEXT_PUBLIC_API_URL + '/validate-code', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          date,
          questionIndex: activeQuestionIndex,
          userAnswer,
          question: activeQuestion.description,
          language: activeQuestion.language || 'typescript'
        })
      });

      if (!response.ok) throw new Error("Validation failed");
      const result = await response.json();

      // Update local state
      const newQuestions = [...localQuestions];
      newQuestions[activeQuestionIndex].userProgress = {
        answer: userAnswer,
        score: result.score,
        feedback: result.feedback,
        better_solution: result.better_solution
      };
      setLocalQuestions(newQuestions);

    } catch (e) {
      console.error(e);
      alert("Failed to validate code. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUseSolution = (solution: string) => {
    // Strip markdown code blocks if present in the AI response
    let cleanCode = solution;
    const match = solution.match(/```(?:typescript|javascript|python)?\s*([\s\S]*?)\s*```/);
    if (match) {
        cleanCode = match[1];
    }
    setCodeValue(activeQuestionIndex, cleanCode);
  };

  const progress = activeQuestion.userProgress;
  const isPassed = progress?.score >= 8;

  return (
    <div className="space-y-6">
      {/* Navigation Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {localQuestions.map((q, i) => {
            const qPassed = q.userProgress?.score >= 8;
            return (
                <Button
                    key={i}
                    variant={activeQuestionIndex === i ? "default" : "outline"}
                    className={cn(
                        "whitespace-nowrap flex items-center gap-2",
                        activeQuestionIndex === i ? "bg-indigo-600 hover:bg-indigo-500" : ""
                    )}
                    onClick={() => setActiveQuestionIndex(i)}
                >
                    <Code className="h-4 w-4" /> Challenge {i + 1}
                    {qPassed && <CheckCircle2 className="h-3 w-3 text-green-500" />}
                </Button>
            );
        })}
      </div>

      <div className="flex flex-col gap-6 h-[800px]">
          {/* Top Panel: Requirements & Feedback */}
          <Card className="border-indigo-500/20 bg-card/50 flex flex-col max-h-[300px] overflow-hidden">
             <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                       <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                          {activeQuestion.language || 'TypeScript'}
                       </span>
                       <CardTitle className="text-lg">{activeQuestion.title}</CardTitle>
                    </div>
                </div>
                <CardDescription className="text-sm mt-1 line-clamp-2 hover:line-clamp-none transition-all cursor-help" title="Click to expand description">
                    {activeQuestion.description}
                </CardDescription>
             </CardHeader>
             
             <CardContent className="px-4 pb-4 space-y-4">
                {!progress ? (
                    <div className="text-xs text-muted-foreground">
                        Write your solution below. Click "Run Tests" to validate.
                    </div>
                ) : (
                    <div className="space-y-2 animate-in fade-in slide-in-from-top-2 overflow-y-auto max-h-[200px]">
                        <div className={cn(
                            "p-3 rounded border text-xs flex items-start gap-3",
                            isPassed 
                                ? "bg-green-950/20 border-green-500/30 text-green-100" 
                                : "bg-red-950/20 border-red-500/30 text-red-100"
                        )}>
                            {isPassed ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" /> : <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />}
                            <div>
                                <span className="font-bold block mb-1">Score: {progress.score}/10</span>
                                <p>{progress.feedback}</p>
                            </div>
                        </div>

                        {progress.better_solution && (
                             <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-indigo-400 uppercase">Suggested Solution</span>
                                    <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        className="h-5 text-[10px] gap-1 hover:text-indigo-400 hover:bg-indigo-400/10 px-2"
                                        onClick={() => handleUseSolution(progress.better_solution)}
                                    >
                                        <Copy className="h-3 w-3" /> Copy
                                    </Button>
                                </div>
                                <div className="bg-black/40 p-2 rounded border border-indigo-500/10 font-mono text-[10px] overflow-x-auto whitespace-pre-wrap max-h-[100px]">
                                    {progress.better_solution}
                                </div>
                             </div>
                        )}
                    </div>
                )}
             </CardContent>
          </Card>

          {/* Bottom Panel: Code Editor */}
          <Card className="border-indigo-500/20 bg-[#1e1e1e] overflow-hidden flex flex-col h-[600px] shadow-inner">
              <div className="flex-1 relative overflow-hidden">
                  <Editor
                    height="100%"
                    defaultLanguage="typescript"
                    language={activeQuestion.language || 'typescript'}
                    theme="vs-dark"
                    value={getCodeValue(activeQuestionIndex)}
                    onChange={(val) => setCodeValue(activeQuestionIndex, val || '')}
                    options={{
                        minimap: { enabled: false },
                        fontSize: 14,
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                        tabSize: 2,
                        padding: { top: 16, bottom: 16 }
                    }}
                  />
              </div>
              <div className="p-2 border-t border-white/10 bg-[#252526] flex justify-center shrink-0 z-10">
                 <Button 
                    className="bg-indigo-600 hover:bg-indigo-500 text-white"  
                    size="sm"
                    onClick={validateCode}
                    disabled={submitting}
                 >
                    {submitting ? (
                        <>
                           <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analyzing...
                        </>
                    ) : (
                        <>
                           <Terminal className="mr-2 h-4 w-4" /> Run Tests
                        </>
                    )}
                 </Button>
             </div>
          </Card>
      </div>
    </div>
  );
}
