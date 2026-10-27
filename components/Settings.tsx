
import React, { useState } from 'react';
import { X, KeyRound, Eye, EyeOff, Check, ExternalLink, Languages } from 'lucide-react';
import { GLOSS_STORAGE, GLOSS_LANGS } from '../services/claudeService';
import { CLAUDE_MODELS, CLAUDE_MODEL_STORAGE } from '../services/claude';
import { statsService } from '../services/statsService';

interface SettingsProps {
  onClose: () => void;
}

const CLAUDE_KEY_STORAGE = 'lexiai_claude_key';
const GEMINI_KEY_STORAGE = 'lexiai_api_key'; // voice features only

const MODELS = CLAUDE_MODELS;
const MODEL_STORAGE = CLAUDE_MODEL_STORAGE;

/** One masked key field with a show/hide toggle. */
const KeyField: React.FC<{ label: string; value: string; onChange: (v: string) => void; envPresent: boolean; children: React.ReactNode }> =
  ({ label, value, onChange, envPresent, children }) => {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-3">
      <label className="block text-xs font-bold uppercase tracking-wider text-stone-400">
        <KeyRound className="w-3.5 h-3.5 inline mr-1" /> {label}
      </label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={envPresent ? 'Using the key from .env.local' : 'Paste your API key'}
          className="w-full p-4 pr-12 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-stone-900 font-mono text-sm"
        />
        <button
          onClick={() => setShow(!show)}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-900"
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      <p className="text-xs text-stone-400 leading-relaxed">{children}</p>
    </div>
  );
};

export const Settings: React.FC<SettingsProps> = ({ onClose }) => {
  const [claudeKey, setClaudeKey] = useState(() => localStorage.getItem(CLAUDE_KEY_STORAGE) || '');
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem(GEMINI_KEY_STORAGE) || '');
  const [model, setModel] = useState(() => localStorage.getItem(MODEL_STORAGE) || MODELS[0].id);
  const [gloss, setGloss] = useState(() => localStorage.getItem(GLOSS_STORAGE) || '');
  const [saved, setSaved] = useState(false);


  const handleSave = () => {
    for (const [storage, value] of [[CLAUDE_KEY_STORAGE, claudeKey], [GEMINI_KEY_STORAGE, geminiKey]]) {
      if (value.trim()) localStorage.setItem(storage, value.trim());
      else localStorage.removeItem(storage);
    }
    localStorage.setItem(MODEL_STORAGE, model);
    statsService.setGlossLang(gloss); // local + cloud, so phone and desktop agree
    setSaved(true);
    setTimeout(onClose, 700);
  };

  return (
    <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-8 space-y-6 animate-fade-in-up max-h-[calc(100dvh-2rem)] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center">
          <h3 className="text-2xl font-serif font-bold">Settings</h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-900"><X /></button>
        </div>

        <KeyField label="Claude API Key" value={claudeKey} onChange={setClaudeKey} envPresent={Boolean(process.env.ANTHROPIC_API_KEY)}>
          Powers lookups, feedback and chat. Stored only in this browser — never uploaded anywhere.{' '}
          <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" className="text-stone-700 underline inline-flex items-center gap-0.5">
            Get a key <ExternalLink className="w-3 h-3" />
          </a>
        </KeyField>

        <KeyField label="Gemini API Key (voice)" value={geminiKey} onChange={setGeminiKey} envPresent={Boolean(process.env.API_KEY)}>
          Only for voice: transcribing your speech and natural-sounding read-aloud. Optional — without it the browser's own voice is used.{' '}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-stone-700 underline inline-flex items-center gap-0.5">
            Get a free key <ExternalLink className="w-3 h-3" />
          </a>
        </KeyField>

        <div className="space-y-3">
          <label className="block text-xs font-bold uppercase tracking-wider text-stone-400">AI Model</label>
          {MODELS.map(m => (
            <button
              key={m.id}
              onClick={() => setModel(m.id)}
              className={`w-full text-left p-4 rounded-xl border transition-all ${
                model === m.id ? 'border-stone-900 bg-stone-50 ring-1 ring-stone-900' : 'border-stone-200 hover:border-stone-400'
              }`}
            >
              <p className="font-bold text-stone-900 text-sm">{m.label}</p>
              <p className="text-xs text-stone-400">{m.hint}</p>
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <label className="block text-xs font-bold uppercase tracking-wider text-stone-400">
            <Languages className="w-3.5 h-3.5 inline mr-1" /> Definition gloss
          </label>
          <div className="flex flex-wrap gap-2">
            {GLOSS_LANGS.map(g => (
              <button
                key={g.id}
                onClick={() => setGloss(g.id)}
                className={`px-3.5 py-2 rounded-lg border text-sm transition-all ${
                  gloss === g.id ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 text-stone-600 hover:border-stone-400'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-stone-400 leading-relaxed">
            Adds a short native-language gloss under each English definition. Off keeps definitions English-only. Synced to all your signed-in devices.
          </p>
        </div>

        <button
          onClick={handleSave}
          className="w-full py-4 bg-stone-900 text-white rounded-xl font-bold hover:bg-black transition-colors flex items-center justify-center gap-2"
        >
          {saved ? <><Check className="w-4 h-4" /> Saved</> : 'Save Settings'}
        </button>
      </div>
    </div>
  );
};
