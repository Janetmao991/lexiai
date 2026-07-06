
import React from 'react';
import { UserStats, WordEntry, MasteryLevel } from '../types';
import { DAILY_QUESTS, ACHIEVEMENTS, levelForXp, xpForLevel, titleForLevel } from '../services/statsService';
import { srsService, MASTERY_META } from '../services/srsService';
import { X, Flame, CheckCircle2, Circle } from 'lucide-react';

interface ProgressPanelProps {
  stats: UserStats;
  words: WordEntry[];
  onClose: () => void;
}

export const ProgressPanel: React.FC<ProgressPanelProps> = ({ stats, words, onClose }) => {
  const level = levelForXp(stats.xp);
  const levelStart = xpForLevel(level);
  const levelEnd = xpForLevel(level + 1);
  const levelPct = Math.min(100, Math.round(((stats.xp - levelStart) / (levelEnd - levelStart)) * 100));

  const masteryCounts: Record<MasteryLevel, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  words.forEach(w => { masteryCounts[srsService.masteryLevel(w)] += 1; });

  return (
    <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white w-full max-w-lg rounded-2xl shadow-2xl p-8 space-y-8 animate-fade-in-up max-h-[85vh] overflow-y-auto scrollbar-hide"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center">
          <h3 className="text-2xl font-serif font-bold">Your Progress</h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-900"><X /></button>
        </div>

        {/* Level + streak */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-stone-50 rounded-xl p-5 border border-stone-100 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-stone-400">Level {level}</p>
            <p className="text-xl font-serif font-bold text-stone-900">{titleForLevel(level)}</p>
            <div className="h-2 bg-stone-200 rounded-full overflow-hidden">
              <div className="h-full bg-stone-900 rounded-full transition-all" style={{ width: `${levelPct}%` }} />
            </div>
            <p className="text-xs text-stone-400 font-mono">{stats.xp} XP · {levelEnd - stats.xp} to next</p>
          </div>
          <div className="bg-stone-50 rounded-xl p-5 border border-stone-100 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-stone-400">Streak</p>
            <p className="text-xl font-serif font-bold text-stone-900 flex items-center gap-2">
              <Flame className={`w-5 h-5 ${stats.streakCurrent > 0 ? 'text-orange-500' : 'text-stone-300'}`} />
              {stats.streakCurrent} {stats.streakCurrent === 1 ? 'day' : 'days'}
            </p>
            <p className="text-xs text-stone-400 font-mono">Best: {stats.streakBest} days</p>
          </div>
        </div>

        {/* Daily quests */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-stone-400">Today's Quests</h4>
          {DAILY_QUESTS.map(q => {
            const progress = stats.daily[q.metric] as number;
            const done = stats.daily.completedQuests.includes(q.id);
            return (
              <div key={q.id} className={`flex items-center gap-3 p-3 rounded-xl border ${done ? 'bg-emerald-50/50 border-emerald-100' : 'bg-white border-stone-100'}`}>
                {done ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" /> : <Circle className="w-5 h-5 text-stone-300 shrink-0" />}
                <div className="flex-1">
                  <p className={`text-sm font-medium ${done ? 'text-emerald-900' : 'text-stone-700'}`}>{q.label}</p>
                  <p className="text-xs text-stone-400 font-mono">{Math.min(progress, q.target)} / {q.target} · +{q.bonusXp} XP</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Mastery distribution */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-stone-400">Word Mastery</h4>
          <div className="grid grid-cols-4 gap-2">
            {([1, 2, 3, 4] as MasteryLevel[]).map(lv => (
              <div key={lv} className="bg-stone-50 rounded-xl p-3 border border-stone-100 text-center space-y-1">
                <p className="text-lg">{MASTERY_META[lv].icon}</p>
                <p className="text-lg font-serif font-bold text-stone-900">{masteryCounts[lv]}</p>
                <p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">{MASTERY_META[lv].label}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-stone-400">Collected → Reviewing (3 reviews) → Can Write (practice ≥ 80) → Can Speak (speaking practice)</p>
        </div>

        {/* Achievements */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-stone-400">Achievements</h4>
          <div className="grid grid-cols-4 gap-2">
            {ACHIEVEMENTS.map(a => {
              const unlocked = Boolean(stats.achievements[a.id]);
              return (
                <div
                  key={a.id}
                  title={`${a.label}: ${a.description}`}
                  className={`rounded-xl p-3 border text-center space-y-1 ${unlocked ? 'bg-amber-50/60 border-amber-200' : 'bg-stone-50 border-stone-100 opacity-40 grayscale'}`}
                >
                  <p className="text-xl">{a.icon}</p>
                  <p className="text-[10px] font-bold leading-tight text-stone-600">{a.label}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
