"use client";

import * as React from "react";
import { unstable_rethrow } from "next/navigation";

import {
  SNAP_MINUTES,
  WEEKDAYS,
  type IanaTimeZone,
  type Profile,
  type SnapMinutes,
  type TimeWindow,
  type Weekday,
  type WorkingHours,
} from "@momentum/core/types";
import { Input } from "@momentum/ui/components/input";
import { Label } from "@momentum/ui/components/label";
import { PageContainer } from "@momentum/ui/components/page-container";
import { PageHeader } from "@momentum/ui/components/page-header";
import { Separator } from "@momentum/ui/components/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@momentum/ui/components/select";
import { toast } from "@momentum/ui/components/toast";

import { ThemeToggle } from "@/components/theme-toggle";
import { updateProfileSettings } from "@/features/settings/actions";
import { TimeWindowList } from "@/features/settings/components/time-window-list";
import { TimezoneField } from "@/features/settings/components/timezone-field";
import { WorkingHoursEditor } from "@/features/settings/components/working-hours-editor";
import { WEEKDAY_NAMES } from "@/features/settings/weekday-names";
import { failure, type ActionError, type ActionResult } from "@/lib/actions/result";
import { reportError } from "@/lib/report-error";

/** The week starts the product offers; the type permits any day, the control three. */
const WEEK_STARTS: readonly Weekday[] = [1, 0, 6];

/** What the page needs from the profile the server already loaded. */
export interface SettingsDefaults {
  displayName: string;
  timezone: IanaTimeZone;
  weekStart: Weekday;
  snapMinutes: SnapMinutes;
  workingHours: WorkingHours;
  focusWindows: readonly TimeWindow[];
}

type SettingsKey = keyof SettingsDefaults;

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-4 md:grid-cols-3">
      <div>
        <h2 className="text-sm font-medium">{title}</h2>
        {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <div className="flex max-w-md flex-col gap-4 md:col-span-2">{children}</div>
    </section>
  );
}

/**
 * Settings, with every control persisted as it is committed.
 *
 * One field, one write. Each control calls `commit(key, value)`, which shows
 * the new value at once, sends a patch naming only that field, and — because
 * there is no list to overlay — settles the plain way rather than through
 * `useOptimisticAction`: on success the field takes the server's value (the
 * stored windows may have been merged), on failure it goes back to what it
 * was and the message is shown (Domain Rule 11). "Failure" is a returned
 * `{ ok: false }` *or* a rejected call; both take the same path, and either
 * way the field is released. Only the control that started the write is
 * disabled while it is in flight (docs/ARCHITECTURE.md §8).
 *
 * The theme is the one control that never reaches the server: the shell owns
 * it, in the browser.
 *
 * There is no Notifications section. Nothing sends a reminder or a summary
 * yet, and a switch that saves nothing is worse than none: it reads as a
 * setting and reverts on reload. It arrives with the feature that owns it.
 */
export function SettingsView({ defaults }: { defaults: SettingsDefaults }) {
  const { settings, pending, commit } = useSettings(defaults);

  return (
    <PageContainer>
      <PageHeader title="Settings" description="Profile, week shape, and appearance." />

      <Section title="Profile" description="How Momentum addresses you.">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="display-name">Display name</Label>
          <DisplayNameField
            value={settings.displayName}
            disabled={pending("displayName")}
            onCommit={(name) => commit("displayName", name)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="timezone">Timezone</Label>
          <TimezoneField
            id="timezone"
            value={settings.timezone}
            disabled={pending("timezone")}
            onCommit={(zone) => commit("timezone", zone)}
          />
        </div>
      </Section>

      <Separator />

      <Section
        title="Week"
        description="Every date boundary in Momentum resolves in these settings, not the server's."
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="week-start">Week starts on</Label>
          <Select
            value={String(settings.weekStart)}
            disabled={pending("weekStart")}
            onValueChange={(value) => {
              const day = WEEKDAYS.find((candidate) => String(candidate) === value);
              if (day !== undefined) commit("weekStart", day);
            }}
          >
            <SelectTrigger id="week-start">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WEEK_STARTS.map((day) => (
                <SelectItem key={day} value={String(day)}>
                  {WEEKDAY_NAMES[day]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="snap">Calendar snapping</Label>
          <Select
            value={String(settings.snapMinutes)}
            disabled={pending("snapMinutes")}
            onValueChange={(value) => {
              const minutes = SNAP_MINUTES.find((candidate) => String(candidate) === value);
              if (minutes !== undefined) commit("snapMinutes", minutes);
            }}
          >
            <SelectTrigger id="snap">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SNAP_MINUTES.map((minutes) => (
                <SelectItem key={minutes} value={String(minutes)}>
                  {minutes} minutes
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Section>

      <Separator />

      <Section title="Working hours" description="Available time is measured against these.">
        <WorkingHoursEditor
          value={settings.workingHours}
          weekStart={settings.weekStart}
          disabled={pending("workingHours")}
          onChange={(next) => commit("workingHours", next)}
        />
      </Section>

      <Separator />

      <Section
        title="Focus windows"
        description="Find Time prefers these when it ranks suggestions."
      >
        <TimeWindowList
          id="focus-windows"
          label="Focus"
          windows={settings.focusWindows}
          emptyLabel="None"
          disabled={pending("focusWindows")}
          onChange={(next) => commit("focusWindows", next)}
        />
      </Section>

      <Separator />

      <Section title="Appearance" description="Light and dark are both first-class.">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Theme</span>
          <ThemeToggle />
        </div>
      </Section>
    </PageContainer>
  );
}

/* -------------------------------------------------------------------------- */
/* Persistence                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The page's state and the one way it changes.
 *
 * `commit` is keyed by a single field on purpose. A patch that could carry
 * several would invite a "save" button that batched them, and then a slow
 * save of one field could overwrite an edit to another made while it was in
 * flight. One key per write means two in-flight writes touch two columns and
 * neither can clobber the other.
 */
function useSettings(defaults: SettingsDefaults) {
  const [settings, setSettings] = React.useState<SettingsDefaults>(defaults);
  const [pendingKeys, setPendingKeys] = React.useState<ReadonlySet<SettingsKey>>(() => new Set());
  const [, startTransition] = React.useTransition();

  const commit = React.useCallback(
    <K extends SettingsKey>(key: K, value: SettingsDefaults[K]) => {
      const previous = settings[key];

      setSettings((current) => withKey(current, key, value));
      setPendingKeys((current) => new Set(current).add(key));

      startTransition(async () => {
        let result: ActionResult<Profile>;
        try {
          result = await updateProfileSettings({ [key]: value });
        } catch (thrown) {
          /*
           * The action reports failure by returning, but the *call* can still
           * reject before it has an answer to return: offline, a 5xx, an
           * aborted request, an action id gone stale after a deploy. React
           * re-throws a rejection out of the transition at the next render, so
           * the page's error boundary would replace the whole surface over one
           * field — and because this hook keeps its own `pendingKeys`, the key
           * would never be deleted and the control would stay disabled with no
           * write behind it.
           *
           * `unstable_rethrow` first, because `redirect()` and `notFound()`
           * travel as thrown values: those are control flow, not failure, and
           * swallowing one would strand the user on a page they were being
           * moved off. What is left is a transport failure or a bug inside the
           * action — still reported, it just no longer blanks the page on its
           * way to being seen — and it takes the same path as a returned
           * `{ ok: false }`, in the server's own `unavailable` wording so there
           * is one message for "could not reach the server" whichever side
           * noticed (Domain Rule 11).
           */
          unstable_rethrow(thrown);
          reportError(thrown, { source: "useSettings" });
          result = failure(
            "unavailable",
            "Momentum could not reach the server. Your change was not saved.",
          );
        }

        if (result.ok) {
          // The server's answer, not the request: the stored windows may have
          // been merged, and the field should show what was actually saved.
          setSettings((current) => withKey(current, key, fromProfile(result.data)[key]));
        } else {
          toast.error(messageOf(result.error));
          setSettings((current) => withKey(current, key, previous));
        }

        setPendingKeys((current) => {
          const next = new Set(current);
          next.delete(key);
          return next;
        });
      });
    },
    [settings],
  );

  const pending = React.useCallback((key: SettingsKey) => pendingKeys.has(key), [pendingKeys]);

  return { settings, pending, commit };
}

function withKey<K extends SettingsKey>(
  current: SettingsDefaults,
  key: K,
  value: SettingsDefaults[K],
): SettingsDefaults {
  const next: SettingsDefaults = { ...current };
  next[key] = value;
  return next;
}

/** The subset of the profile this page edits, in the page's own shape. */
function fromProfile(profile: Profile): SettingsDefaults {
  return {
    displayName: profile.displayName,
    timezone: profile.timezone,
    weekStart: profile.weekStart,
    snapMinutes: profile.snapMinutes,
    workingHours: profile.workingHours,
    focusWindows: profile.focusWindows,
  };
}

/**
 * The first field-level message when there is one, otherwise the summary.
 *
 * A validation failure inside a window carries its message on the field
 * (`workingHours.1.0.end`), and the summary for that case is a generic "check
 * the highlighted fields" — but nothing on this page is highlighted, so the
 * field's own sentence is the one worth showing.
 */
function messageOf(error: ActionError): string {
  const field = Object.values(error.fieldErrors ?? {}).flat()[0];
  return field ?? error.message;
}

/* -------------------------------------------------------------------------- */
/* Fields                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The display name, committed when the user is done with it — blur or Enter —
 * and only when it changed. Committing per keystroke would be one write per
 * character, and a blur that changed nothing is not a save.
 */
function DisplayNameField({
  value,
  disabled,
  onCommit,
}: {
  value: string;
  disabled: boolean;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = React.useState(value);
  const [editing, setEditing] = React.useState(false);
  /*
   * Escape leaves the field by calling `blur()`, which dispatches
   * *synchronously* — before React has re-rendered with the reset draft — so
   * the `onBlur` that runs next is still the closure holding the text the user
   * just abandoned, and committing from it would persist exactly the edit
   * Escape threw away. A ref is the state the blur can read at the moment it
   * runs rather than at the render that built the handler. Cleared on focus so
   * a flag left behind by anything else can never swallow a real commit.
   */
  const abandoning = React.useRef(false);

  return (
    <Input
      id="display-name"
      value={editing ? draft : value}
      disabled={disabled}
      maxLength={80}
      onFocus={() => {
        abandoning.current = false;
        setEditing(true);
        setDraft(value);
      }}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          // Abandon the edit rather than committing half of it.
          abandoning.current = true;
          setDraft(value);
          setEditing(false);
          event.currentTarget.blur();
        }
      }}
      onBlur={() => {
        setEditing(false);
        if (abandoning.current) {
          abandoning.current = false;
          return;
        }
        const next = draft.trim();
        if (next !== value) onCommit(next);
      }}
    />
  );
}
