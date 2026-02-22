'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { DictationButton } from '@/components/DictationButton';
import { Loader2, CheckCircle2, Lock, AlertCircle, ArrowRight, Copy } from 'lucide-react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { cn } from '@/lib/utils';

type Step = 'S' | 'T' | 'A' | 'R';
const STEPS: Step[] = ['S', 'T', 'A', 'R'];

const STEP_LABELS = {
  'S': 'Situation',
  'T': 'Task',
  'A': 'Action',
  'R': 'Result'
};

const STEP_DESCRIPTIONS = {
  'S': 'Set the scene. What was the specific situation?',
  'T': 'What was your specific responsibility or goal?',
  'A': 'What specific steps did YOU take? (Use "I" statements)',
  'R': 'What was the measurable outcome?'
};

interface STARDrillProps {
  questions: any[];
  date: string;
}

export function STARDrill({ questions, date }: STARDrillProps) {
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [localQuestions, setLocalQuestions] = useState(questions);
  const [inputs, setInputs] = useState<Record<string, string>>({}); // Key: "qIndex-step"

  const activeQuestion = localQuestions[activeQuestionIndex];

  // Helper to check if a step is locked
  const isStepLocked = (qIndex: number, step: Step) => {
    if (step === 'S') return false; // S is always open
    const q = localQuestions[qIndex];
    if (step === 'T') return !q.userProgress?.S?.score || q.userProgress.S.score < 8;
    if (step === 'A') return !q.userProgress?.T?.score || q.userProgress.T.score < 8;
    if (step === 'R') return !q.userProgress?.A?.score || q.userProgress.A.score < 8;
    return true;
  };

  const getInputValue = (qIndex: number, step: Step) => {
    // Return local input if typing, otherwise saved answer
    const key = `${qIndex}-${step}`;
    if (inputs[key] !== undefined) return inputs[key];
    return localQuestions[qIndex].userProgress?.[step]?.answer || '';
  };

  const setInputValue = (qIndex: number, step: Step, val: string) => {
    setInputs(prev => ({ ...prev, [`${qIndex}-${step}`]: val }));
  };

  const validateStep = async (step: Step) => {
    const userAnswer = getInputValue(activeQuestionIndex, step);
    if (!userAnswer.trim()) return;

    setSubmitting(true);
    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.accessToken?.toString();

      const response = await fetch(process.env.NEXT_PUBLIC_API_URL + '/validate-star', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          date,
          questionIndex: activeQuestionIndex,
          step,
          userAnswer,
          question: activeQuestion.question
        })
      });

      if (!response.ok) throw new Error("Validation failed");
      const result = await response.json();

      // Update local state
      const newQuestions = [...localQuestions];
      if (!newQuestions[activeQuestionIndex].userProgress) {
        newQuestions[activeQuestionIndex].userProgress = { S: null, T: null, A: null, R: null };
      }
      newQuestions[activeQuestionIndex].userProgress[step] = {
        answer: userAnswer,
        score: result.score,
        feedback: result.feedback,
        better_version: result.better_version
      };
      setLocalQuestions(newQuestions);

    } catch (e) {
      console.error(e);
      alert("Failed to validate. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUseSuggestion = (step: Step, suggestion: string) => {
    setInputValue(activeQuestionIndex, step, suggestion);
  };

  return (
    <div className="space-y-6">
      {/* Navigation Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {localQuestions.map((q, i) => {
            // Calculate completion status
            const isComplete = q.userProgress?.R?.score >= 8;
            return (
                <Button
                    key={i}
                    variant={activeQuestionIndex === i ? "default" : "outline"}
                    className={cn(
                        "whitespace-nowrap flex items-center gap-2",
                        activeQuestionIndex === i ? "bg-orange-600 hover:bg-orange-500" : ""
                    )}
                    onClick={() => setActiveQuestionIndex(i)}
                >
                    Q{i + 1}
                    {isComplete && <CheckCircle2 className="h-3 w-3 text-green-500" />}
                </Button>
            );
        })}
      </div>

      {/* Active Question Card */}
      <Card className="border-orange-500/20 bg-card/50">
        <CardHeader>
          <div className="flex justify-between items-start">
             <div>
                <span className="text-xs font-bold text-orange-400 uppercase tracking-wider mb-1 block">
                    {activeQuestion.category || "Behavioral Question"}
                </span>
                <CardTitle className="text-xl">{activeQuestion.question}</CardTitle>
             </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-8">
            {STEPS.map((step) => {
                const isLocked = isStepLocked(activeQuestionIndex, step);
                const progress = activeQuestion.userProgress?.[step];
                const score = progress?.score;
                const isPassed = score >= 8;
                const currentVal = getInputValue(activeQuestionIndex, step);

                return (
                    <div key={step} className={cn("relative pl-12 transition-opacity", isLocked ? "opacity-40" : "opacity-100")}>
                        {/* Connecting Line */}
                        {step !== 'R' && (
                             <div className="absolute left-[15px] top-8 bottom-[-32px] w-0.5 bg-border/50" />
                        )}
                        
                        {/* Step Indicator */}
                        <div className={cn(
                            "absolute left-0 top-1 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors",
                            isLocked 
                                ? "border-muted-foreground/30 text-muted-foreground/50 bg-background" 
                                : isPassed 
                                    ? "border-green-500 bg-green-500/10 text-green-500"
                                    : "border-orange-500 bg-orange-500/10 text-orange-500"
                        )}>
                            {isLocked ? <Lock className="h-3 w-3" /> : (isPassed ? <CheckCircle2 className="h-4 w-4" /> : step)}
                        </div>

                        {/* Content */}
                        <div className="space-y-3">
                            <div>
                                <h4 className="font-semibold text-sm">{STEP_LABELS[step]}</h4>
                                <p className="text-xs text-muted-foreground">{STEP_DESCRIPTIONS[step]}</p>
                            </div>

                            {!isLocked && (
                                <div className="space-y-3">
                                    {(!progress || !isPassed) ? (
                                        <div className="space-y-3">
                                            <DictationButton
                                                placeholder={`Type your ${STEP_LABELS[step]} here...`}
                                                value={currentVal}
                                                onTranscriptChange={(val) => setInputValue(activeQuestionIndex, step, val)}
                                                ringColor="orange"
                                            />
                                            
                                            <div className="flex justify-between items-center">
                                                 <div className="text-xs text-muted-foreground">
                                                     {progress?.feedback && (
                                                         <span className="text-red-400 flex items-center gap-1">
                                                             <AlertCircle className="h-3 w-3" /> 
                                                             Score: {score}/10 - Needs Improvement
                                                         </span>
                                                     )}
                                                 </div>
                                                 <Button 
                                                    size="sm" 
                                                    onClick={() => validateStep(step)}
                                                    disabled={submitting || !currentVal.trim()}
                                                >
                                                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Validate & Continue"}
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="p-3 bg-green-950/20 rounded border border-green-500/20 text-sm">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="font-bold text-green-400">Score: {score}/10</span>
                                                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => {
                                                    // Allow editing again? Maybe reset score in local state?
                                                    // For now, strict forward progression.
                                                }}>
                                                    Edit
                                                </Button>
                                            </div>
                                            <p className="text-foreground/90 italic">"{progress.answer}"</p>
                                            <p className="text-green-200/80 text-xs mt-2">{progress.feedback}</p>
                                        </div>
                                    )}

                                    {/* Feedback / Improvement Display (Only if failed) */}
                                    {progress && !isPassed && (
                                        <div className="bg-orange-950/30 rounded border border-orange-500/20 p-4 space-y-3 animate-in fade-in slide-in-from-top-2">
                                            <div>
                                                <span className="text-xs font-bold text-orange-400 uppercase">Coach's Feedback</span>
                                                <p className="text-sm text-orange-100 mt-1">{progress.feedback}</p>
                                            </div>
                                            
                                            {progress.better_version && (
                                                <div className="bg-background/40 p-3 rounded border border-orange-500/10">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className="text-xs font-bold text-blue-400 uppercase">Suggested Rephrase</span>
                                                        <Button 
                                                            variant="ghost" 
                                                            size="sm" 
                                                            className="h-6 text-xs gap-1 hover:text-blue-400 hover:bg-blue-400/10"
                                                            onClick={() => handleUseSuggestion(step, progress.better_version)}
                                                        >
                                                            <Copy className="h-3 w-3" /> Use This
                                                        </Button>
                                                    </div>
                                                    <p className="text-sm italic text-muted-foreground">"{progress.better_version}"</p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </CardContent>
      </Card>
    </div>
  );
}
