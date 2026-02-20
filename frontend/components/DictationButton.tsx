'use client';

import 'regenerator-runtime/runtime';
import React, { useEffect, useState, useRef } from 'react';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';
import { Button } from '@/components/ui/button';
import { Mic, MicOff } from 'lucide-react';

interface DictationButtonProps {
  onTranscriptChange: (text: string) => void;
  placeholder: string;
  ringColor: string;
}

export const DictationButton = ({ onTranscriptChange, placeholder, ringColor }: DictationButtonProps) => {
  const {
    transcript,
    listening,
    browserSupportsSpeechRecognition,
    resetTranscript
  } = useSpeechRecognition();
  
  const [textValue, setTextValue] = useState("");
  const [isActive, setIsActive] = useState(false);
  const baseTextRef = useRef("");
  const isStarting = useRef(false);

  // Sync internal state with transcript when active
  useEffect(() => {
    if (isActive && listening) {
        let cleanTranscript = transcript
            .replace(/\s*period\s*/gi, ". ")
            .replace(/\s*comma\s*/gi, ", ")
            .replace(/\s*question mark\s*/gi, "? ")
            .replace(/\s*exclamation mark\s*/gi, "! ")
            .replace(/\s*new line\s*/gi, "\n");
            
        const newText = (baseTextRef.current + " " + cleanTranscript).replace(/\s\s+/g, ' ').trim();
        setTextValue(newText);
        onTranscriptChange(newText);
    }
  }, [transcript, listening, isActive, onTranscriptChange]);

  // Cleanup when listening stops globally
  useEffect(() => {
    if (isStarting.current && listening) {
      isStarting.current = false;
    }

    // Only turn off if we are not starting, and listening is false
    if (!listening && isActive && !isStarting.current) {
        setIsActive(false);
    }
  }, [listening, isActive]);

  if (!browserSupportsSpeechRecognition) {
    return (
       <textarea 
          className={`w-full min-h-[100px] p-3 rounded-md bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-${ringColor}-500/50`}
          placeholder={placeholder}
          onChange={(e) => {
              setTextValue(e.target.value);
              onTranscriptChange(e.target.value);
          }}
          value={textValue}
       />
    );
  }

  const toggleListening = () => {
      if (isActive) {
          SpeechRecognition.stopListening();
          setIsActive(false);
          isStarting.current = false;
      } else {
          // Start listening
          // Capture current text as base
          baseTextRef.current = textValue;
          resetTranscript();
          setIsActive(true);
          isStarting.current = true;
          SpeechRecognition.startListening({ continuous: true });
      }
  };

  return (
      <div className="relative w-full">
          <textarea
              className={`w-full min-h-25 p-3 pr-12 rounded-md bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-${ringColor}-500/50`}
              placeholder={isActive ? "Listening..." : placeholder}
              value={textValue}
              onChange={(e) => {
                  setTextValue(e.target.value);
                  onTranscriptChange(e.target.value);
              }}
          />
          <Button
              variant={isActive ? "destructive" : "ghost"}
              size="icon"
              className="absolute right-2 bottom-2 h-8 w-8"
              onClick={toggleListening}
              title={isActive ? "Stop Dictation" : "Start Dictation"}
          >
              {isActive ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4 text-muted-foreground" />}
          </Button>
           {isActive && (
              <span className="absolute right-12 bottom-3 text-xs text-red-500 animate-pulse">
                  Recording...
              </span>
          )}
      </div>
  );
};
