import type { QuestMetric } from "@momentum/core/types";

/**
 * Every string the progression surface can show.
 *
 * One file, for the reason `features/habits/copy.ts` is one file: Domain Rule 7
 * is a rule about *language*, and a rule about language can only be enforced
 * where the language lives. `copy.test.ts` reads this module and the feature's
 * own source and fails on the vocabulary the rule forbids — "lazy",
 * "unproductive", "failure", "behind", "streak lost", "missed".
 *
 * The vocabulary this surface does use: a quest is **open** until it is
 * **done**; a cap is **reached**, never exceeded or breached; an achievement is
 * **not yet unlocked**, never failed. Nothing here tells the user what kind of
 * person their week made them.
 */

export const PROGRESS_COPY = {
  title: "Progress",
  description: "What your work has added up to.",

  level: {
    label: (level: number) => `Level ${level}`,
    intoLevel: (into: number, span: number) => `${into} / ${span} XP`,
    toNext: (remaining: number, level: number) => `${remaining} XP to level ${level + 1}`,
    coins: "Coins",
    coinsHint: "Earned from quests and weekly goals. They buy appearance, nothing else.",
  },

  quests: {
    dailyTitle: "Today",
    weeklyTitle: "This week",
    emptyTitle: "No quests yet",
    emptyDescription: "Quests arrive each morning, in your own timezone.",
    claim: "Claim",
    claimed: "Done",
    open: "Open",
    reward: (xp: number, coins: number) => (coins > 0 ? `${xp} XP · ${coins} coins` : `${xp} XP`),
    claimedAnnouncement: (title: string) => `Claimed ${title}.`,
  },

  goals: {
    title: "Weekly goals",
    emptyTitle: "No goal set for this week",
    emptyDescription: "A goal is a promise to yourself, and it is optional.",
    add: "Set a goal",
    addTitle: "Set a weekly goal",
    metricLabel: "Measure",
    targetLabel: "Target",
    titleLabel: "Name (optional)",
    titlePlaceholder: "Three hours at the desk",
    save: "Set goal",
    cancel: "Cancel",
    remove: "Remove",
    reward: (xp: number, coins: number) => `${xp} XP · ${coins} coins when you reach it`,
    tooBig: "That is more than a week should ask of you. Try a smaller number.",
  },

  achievements: {
    title: "Achievements",
    locked: "Not yet unlocked",
    unlockedOn: (date: string) => `Unlocked ${date}`,
  },

  cosmetics: {
    title: "Appearance",
    description: "Coins buy how Momentum looks. Never what it can do.",
    buy: "Buy",
    equip: "Wear",
    unequip: "Take off",
    equipped: "Worn",
    owned: "Owned",
    price: (coins: number) => `${coins} coins`,
    cannotAfford: (price: number, coins: number) => `${price} coins — you have ${coins}`,
    notYet: "Not for sale yet",
    notYetHint: "It arrives with the collection that draws it.",
  },

  history: {
    title: "Recent XP",
    emptyTitle: "Nothing yet",
    emptyDescription: "Completing a task, finishing a focus session or keeping a habit earns XP.",
    total: (total: number) => `${total} XP in total`,
  },

  caps: {
    title: "Limits in the last 24 hours",
    description:
      "So that a long list of small things cannot outpace real work, each source has a maximum in any 24 hours. Reaching one never removes anything you have earned.",
    line: (source: string, awarded: number, cap: number) => `${source}: ${awarded} of ${cap} XP`,
    sources: {
      task: "Tasks",
      habit_completion: "Habits",
      focus_session: "Focus",
    } as Record<string, string>,
  },

  celebration: {
    levelUp: (level: number) => `Level ${level}`,
    levelUpDescription: "Earned across everything you have finished.",
    goal: "Weekly goal reached",
  },
} as const;

/** A metric, as a phrase. Used where a quest or goal has no title of its own. */
export const METRIC_LABELS: Record<QuestMetric, string> = {
  tasks_completed: "Tasks completed",
  priority_tasks_completed: "Priority tasks completed",
  focus_minutes: "Focused minutes",
  habits_completed: "Habits completed",
  habit_days: "Days with a habit",
  blocks_completed: "Scheduled blocks completed",
};

/** "3 of 5 tasks completed" — the one place a progress phrase is built. */
export function progressLabel(metric: QuestMetric, value: number, target: number): string {
  return `${value} of ${target} · ${METRIC_LABELS[metric].toLowerCase()}`;
}
