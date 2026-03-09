/**
 * Bayesian Knowledge Tracing (BKT) Brain
 * Ported from OATutor (CAHLR/OATutor) - open source
 * Tracks student mastery probability per skill/topic
 */

export interface BKTModel {
  probMastery: number;    // P(mastered) - starts low
  probSlip: number;       // P(wrong | mastered) - typically 0.1
  probGuess: number;      // P(correct | not mastered) - typically 0.3
  probTransit: number;    // P(learns from this attempt) - typically 0.09
}

export interface SkillRecord {
  skillId: string;
  topicName: string;
  model: BKTModel;
  attempts: number;
  lastSeen: number;
}

// Default BKT parameters (tuned from OATutor classroom data)
const DEFAULT_BKT: BKTModel = {
  probMastery: 0.1,
  probSlip: 0.1,
  probGuess: 0.3,
  probTransit: 0.09,
};

const MASTERY_THRESHOLD = 0.95;

// Core BKT update - exact OATutor algorithm
export function updateBKT(model: BKTModel, isCorrect: boolean): BKTModel {
  let numerator: number;
  let masteryAndGuess: number;

  if (isCorrect) {
    numerator = model.probMastery * (1 - model.probSlip);
    masteryAndGuess = (1 - model.probMastery) * model.probGuess;
  } else {
    numerator = model.probMastery * model.probSlip;
    masteryAndGuess = (1 - model.probMastery) * (1 - model.probGuess);
  }

  const probMasteryGivenObservation = numerator / (numerator + masteryAndGuess);
  const newProbMastery =
    probMasteryGivenObservation +
    (1 - probMasteryGivenObservation) * model.probTransit;

  return { ...model, probMastery: newProbMastery };
}

export function isMastered(model: BKTModel): boolean {
  return model.probMastery >= MASTERY_THRESHOLD;
}

export function getMasteryPercent(model: BKTModel): number {
  return Math.round(model.probMastery * 100);
}

export function getMasteryLabel(model: BKTModel): string {
  const p = model.probMastery;
  if (p < 0.3) return "Beginner";
  if (p < 0.6) return "Learning";
  if (p < 0.8) return "Developing";
  if (p < 0.95) return "Proficient";
  return "Mastered";
}

export function getMasteryColor(model: BKTModel): string {
  const p = model.probMastery;
  if (p < 0.3) return "#ef4444";  // red
  if (p < 0.6) return "#f97316";  // orange
  if (p < 0.8) return "#eab308";  // yellow
  if (p < 0.95) return "#22c55e"; // green
  return "#6366f1";               // indigo - mastered
}

// Skill store (localStorage persisted)
const STORAGE_KEY = "nexuslearn_bkt_skills";

export function loadSkills(): Record<string, SkillRecord> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveSkills(skills: Record<string, SkillRecord>): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(skills));
}

export function getOrCreateSkill(
  skills: Record<string, SkillRecord>,
  skillId: string,
  topicName: string
): SkillRecord {
  if (skills[skillId]) return skills[skillId];
  return {
    skillId,
    topicName,
    model: { ...DEFAULT_BKT },
    attempts: 0,
    lastSeen: Date.now(),
  };
}

export function recordAttempt(
  skills: Record<string, SkillRecord>,
  skillId: string,
  topicName: string,
  isCorrect: boolean
): Record<string, SkillRecord> {
  const skill = getOrCreateSkill(skills, skillId, topicName);
  const updatedModel = updateBKT(skill.model, isCorrect);
  const updated = {
    ...skills,
    [skillId]: {
      ...skill,
      model: updatedModel,
      attempts: skill.attempts + 1,
      lastSeen: Date.now(),
    },
  };
  saveSkills(updated);
  return updated;
}
