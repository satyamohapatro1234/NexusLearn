"use client";

/**
 * MasteryDashboard - Student skill tracking using BKT Brain from OATutor
 * Shows per-topic mastery probability, history, and recommendations
 */

import { useState, useEffect } from "react";
import { Brain, TrendingUp, Star, Zap, RefreshCw, Trophy } from "lucide-react";
import {
  loadSkills,
  getMasteryPercent,
  getMasteryColor,
  getMasteryLabel,
  isMastered,
  type SkillRecord,
} from "@/lib/bkt";

export default function MasteryDashboard() {
  const [skills, setSkills] = useState<Record<string, SkillRecord>>({});

  useEffect(() => {
    setSkills(loadSkills());
    // Poll for updates
    const interval = setInterval(() => setSkills(loadSkills()), 2000);
    return () => clearInterval(interval);
  }, []);

  const skillList = Object.values(skills).sort(
    (a, b) => b.model.probMastery - a.model.probMastery
  );

  const masteredCount = skillList.filter((s) => isMastered(s.model)).length;
  const avgMastery =
    skillList.length > 0
      ? Math.round(
          (skillList.reduce((sum, s) => sum + s.model.probMastery, 0) /
            skillList.length) *
            100
        )
      : 0;

  const clearAll = () => {
    localStorage.removeItem("nexuslearn_bkt_skills");
    setSkills({});
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
            {skillList.length}
          </div>
          <div className="text-xs text-indigo-500 dark:text-indigo-400 mt-0.5">Topics Practiced</div>
        </div>
        <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {masteredCount}
          </div>
          <div className="text-xs text-emerald-500 dark:text-emerald-400 mt-0.5">Topics Mastered</div>
        </div>
        <div className="bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
            {avgMastery}%
          </div>
          <div className="text-xs text-purple-500 dark:text-purple-400 mt-0.5">Avg Mastery</div>
        </div>
      </div>

      {/* Skills list */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
            <Brain className="w-4 h-4 text-indigo-500" />
            Skill Mastery (BKT)
          </div>
          {skillList.length > 0 && (
            <button
              onClick={clearAll}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
            >
              <RefreshCw className="w-3 h-3" /> Reset
            </button>
          )}
        </div>

        {skillList.length === 0 ? (
          <div className="text-center py-8 text-slate-400 dark:text-slate-500">
            <Brain className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No skills tracked yet.</p>
            <p className="text-xs mt-1">Answer questions or run code to start tracking.</p>
          </div>
        ) : (
          skillList.map((skill) => {
            const pct = getMasteryPercent(skill.model);
            const color = getMasteryColor(skill.model);
            const label = getMasteryLabel(skill.model);
            const mastered = isMastered(skill.model);

            return (
              <div
                key={skill.skillId}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 shadow-sm"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {mastered && <Trophy className="w-3.5 h-3.5 text-amber-400" />}
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate max-w-[160px]">
                      {skill.topicName}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: color + "20",
                        color: color,
                      }}
                    >
                      {label}
                    </span>
                    <span className="text-xs font-bold" style={{ color }}>
                      {pct}%
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: color,
                    }}
                  />
                </div>

                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-xs text-slate-400">
                    {skill.attempts} attempt{skill.attempts !== 1 ? "s" : ""}
                  </span>
                  <span className="text-xs text-slate-400">
                    {new Date(skill.lastSeen).toLocaleDateString()}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
