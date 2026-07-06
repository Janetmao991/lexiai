
import React, { useState, useRef, useEffect } from 'react';
import { WordEntry, PodcastScript } from '../types';
import { generatePodcastScript, generatePodcastAudio } from '../services/geminiService';
import { Mic2, Play, Pause, Loader2, RotateCcw } from 'lucide-react';

interface PodcastProps {
  words: WordEntry[];
  onGenerated?: () => void;
}

export const Podcast: React.FC<PodcastProps> = ({ words, onGenerated }) => {
  const [selectedWords, setSelectedWords] = useState<string[]>([]);
  const [step, setStep] = useState<'SELECT' | 'GENERATING' | 'PLAYING'>('SELECT');
  const [script, setScript] = useState<PodcastScript | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const toggleWord = (word: string) => {
    if (selectedWords.includes(word)) {
      setSelectedWords(selectedWords.filter(w => w !== word));
    } else {
      if (selectedWords.length < 5) {
        setSelectedWords([...selectedWords, word]);
      }
    }
  };

  const handleGenerate = async () => {
    if (selectedWords.length < 2) return;
    setStep('GENERATING');

    try {
        const generatedScript = await generatePodcastScript(selectedWords);
        setScript(generatedScript);
        const audioBuffer = await generatePodcastAudio(generatedScript);
        const wavBlob = pcmToWav(audioBuffer);
        const url = URL.createObjectURL(wavBlob);
        setAudioUrl(url);
        setStep('PLAYING');
        onGenerated?.();
    } catch (e) {
        console.error(e);
        setStep('SELECT');
        alert(`Failed to generate podcast: ${(e as Error)?.message || 'Please try again.'}`);
    }
  };

  const pcmToWav = (buffer: ArrayBuffer) => {
      const numOfChan = 1;
      const length = buffer.byteLength;
      const bufferHeader = new ArrayBuffer(44);
      const view = new DataView(bufferHeader);
      const sampleRate = 24000;
      
      writeString(view, 0, 'RIFF');
      view.setUint32(4, 36 + length, true);
      writeString(view, 8, 'WAVE');
      writeString(view, 12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, numOfChan, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * 2, true);
      view.setUint16(32, numOfChan * 2, true);
      view.setUint16(34, 16, true);
      writeString(view, 36, 'data');
      view.setUint32(40, length, true);

      return new Blob([view, buffer], { type: "audio/wav" });
  };

  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  const handleReset = () => {
    setStep('SELECT');
    setScript(null);
    setAudioUrl(null);
    setSelectedWords([]);
    setIsPlaying(false);
  };

  // Advanced Highlighter: Handles phrases and case-insensitive matching
  const highlightTargetWords = (text: string) => {
    if (!selectedWords.length) return text;
    
    // Sort selected words by length descending to match longer phrases first
    const sortedWords = [...selectedWords].sort((a, b) => b.length - a.length);
    const pattern = new RegExp(`(${sortedWords.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
    
    const parts = text.split(pattern);
    return parts.map((part, i) => {
      const isMatch = sortedWords.some(sw => sw.toLowerCase() === part.toLowerCase());
      if (isMatch) {
        return (
          <span key={i} className="bg-emerald-50 text-emerald-900 px-1.5 py-0.5 rounded font-bold border-b-2 border-emerald-500 shadow-sm transition-all inline-block hover:bg-emerald-100">
            {part}
          </span>
        );
      }
      return part;
    });
  };

  if (words.length === 0) {
      return (
          <div className="text-center py-20 text-stone-400">
              <p>Save words to your notebook to create podcasts.</p>
          </div>
      );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="border-b border-stone-200 pb-6">
        <h2 className="text-3xl font-serif font-bold text-stone-800 flex items-center gap-3">
            <Mic2 className="w-8 h-8 text-stone-900" />
            AI Podcast Studio
        </h2>
        <p className="text-stone-500 mt-2 font-serif">
            Create a custom dialogue to hear your vocabulary in a natural conversation.
        </p>
      </div>

      {step === 'SELECT' && (
          <div className="animate-fade-in">
              <div className="bg-white p-8 rounded-xl border border-stone-200 shadow-sm mb-8">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="font-bold text-stone-800 font-serif text-xl">Select 2 to 5 words</h3>
                      <span className={`text-sm font-bold ${selectedWords.length >= 2 && selectedWords.length <= 5 ? 'text-emerald-600' : 'text-stone-400'}`}>
                          {selectedWords.length} selected
                      </span>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {words.map(w => (
                          <button
                            key={w.word}
                            onClick={() => toggleWord(w.word)}
                            disabled={!selectedWords.includes(w.word) && selectedWords.length >= 5}
                            className={`p-3 rounded-lg text-left border transition-all ${
                                selectedWords.includes(w.word)
                                ? 'bg-stone-900 text-white border-stone-900 shadow-md'
                                : 'bg-stone-50 text-stone-600 border-stone-100 hover:border-stone-300'
                            } ${!selectedWords.includes(w.word) && selectedWords.length >= 5 ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                              <span className="font-serif font-bold capitalize">{w.word}</span>
                          </button>
                      ))}
                  </div>

                  <div className="mt-8 flex justify-end">
                      <button
                        onClick={handleGenerate}
                        disabled={selectedWords.length < 2}
                        className="px-8 py-3 bg-stone-900 text-white rounded-full font-medium hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all shadow-lg"
                      >
                          <Mic2 className="w-4 h-4" /> Generate Episode
                      </button>
                  </div>
              </div>
          </div>
      )}

      {step === 'GENERATING' && (
          <div className="flex flex-col items-center justify-center py-24 text-center animate-fade-in">
              <div className="relative mb-6">
                <Loader2 className="w-16 h-16 animate-spin text-stone-200" />
                <Mic2 className="w-8 h-8 text-stone-900 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              </div>
              <h3 className="text-2xl font-serif font-bold text-stone-800 mb-2">Producing your episode...</h3>
              <p className="text-stone-500 max-w-md mx-auto">
                  Our AI hosts, Alex and Jamie, are looking over your words and preparing their script.
              </p>
          </div>
      )}

      {step === 'PLAYING' && script && audioUrl && (
          <div className="animate-fade-in space-y-6">
              <div className="bg-stone-900 text-white p-8 rounded-2xl shadow-xl flex flex-col md:flex-row items-center gap-8">
                  <div className="flex-1 space-y-2 text-center md:text-left">
                      <span className="inline-block px-3 py-1 bg-stone-800 rounded-full text-xs font-bold uppercase tracking-wider text-stone-400 mb-2">Now Playing</span>
                      <h3 className="text-3xl font-serif font-bold">{script.title}</h3>
                      <p className="text-stone-400 font-serif italic">Topic: {script.topic}</p>
                  </div>
                  
                  <div className="flex items-center gap-4">
                      <audio 
                        ref={audioRef} 
                        src={audioUrl} 
                        onPlay={() => setIsPlaying(true)} 
                        onPause={() => setIsPlaying(false)}
                        onEnded={() => setIsPlaying(false)}
                        className="hidden"
                      />
                      
                      <button 
                        onClick={() => {
                            if (audioRef.current) {
                                if (isPlaying) audioRef.current.pause();
                                else audioRef.current.play();
                            }
                        }}
                        className="w-16 h-16 bg-white text-stone-900 rounded-full flex items-center justify-center hover:bg-stone-200 transition-colors shadow-lg"
                      >
                          {isPlaying ? <Pause className="fill-current w-6 h-6" /> : <Play className="fill-current w-6 h-6 ml-1" />}
                      </button>
                  </div>
              </div>

              <div className="bg-white p-8 rounded-xl border border-stone-200 shadow-sm">
                  <div className="flex justify-between items-center mb-6 border-b border-stone-50 pb-4">
                      <h4 className="font-bold text-stone-400 text-sm uppercase tracking-wider">Transcript</h4>
                      <button onClick={handleReset} className="text-stone-500 hover:text-stone-900 flex items-center gap-1 text-sm font-medium">
                          <RotateCcw className="w-3 h-3" /> Create New
                      </button>
                  </div>

                  <div className="space-y-8">
                      {script.dialogue.map((turn, i) => (
                          <div key={i} className="flex gap-6 items-start group">
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-sm shadow-sm ${
                                  turn.speaker === 'Alex' ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-700'
                              }`}>
                                  {turn.speaker[0]}
                              </div>
                              <div className="space-y-2">
                                  <p className="text-[10px] font-bold uppercase text-stone-400 tracking-[0.2em]">{turn.speaker}</p>
                                  <p className="font-serif text-lg leading-relaxed text-stone-800 whitespace-pre-wrap">
                                      {highlightTargetWords(turn.text)}
                                  </p>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
