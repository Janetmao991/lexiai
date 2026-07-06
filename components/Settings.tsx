
import React, { useState } from 'react';
import { X, KeyRound, Eye, EyeOff, Check, ExternalLink } from 'lucide-react';

interface SettingsProps {
  onClose: () => void;
}

const KEY_STORAGE = 'lexiai_api_key';
const MODEL_STORAGE = 'lexiai_model';

const MODELS = [
  { id: 'gemini-3-flash-preview', label: 'Gemini Flash', hint: 'Fast, works on the free tier (recommended)' },
  { id: 'gemini-3-pro-preview', label: 'Gemini Pro', hint: 'Highest quality — requires a paid API key' },
];

export const Settings: React.FC<SettingsProps> = ({ onClose }) => {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(KEY_STORAGE) || '');
  const [model, setModel] = useState(() => localStorage.getItem(MODEL_STORAGE) || MODELS[0].id);
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);

  const envKeyPresent = Boolean(process.env.API_KEY);

  const handleSave = () => {
    if (apiKey.trim()) localStorage.setItem(KEY_STORAGE, apiKey.trim());
    else localStorage.removeItem(KEY_STORAGE);
    localStorage.setItem(MODEL_STORAGE, model);
    setSaved(true);
    setTimeout(onClose, 700);
  };

  return (
    <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-8 space-y-6 animate-fade-in-up" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center">
          <h3 className="text-2xl font-serif font-bold">Settings</h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-900"><X /></button>
        </div>

        <div className="space-y-3">
          <label className="block text-xs font-bold uppercase tracking-wider text-stone-400">
            <KeyRound className="w-3.5 h-3.5 inline mr-1" /> Gemini API Key
          </label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder={envKeyPresent ? 'Using the key from .env.local' : 'Paste your API key'}
              className="w-full p-4 pr-12 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-stone-900 font-mono text-sm"
            />
            <button
              onClick={() => setShowKey(!showKey)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-900"
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-xs text-stone-400 leading-relaxed">
            Stored only in this browser — never uploaded anywhere.{' '}
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-stone-700 underline inline-flex items-center gap-0.5">
              Get a free key <ExternalLink className="w-3 h-3" />
            </a>
          </p>
        </div>

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
