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
import { Button } from "@momentum/ui/components/button";
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
import { Switch } from "@momentum/ui/components/switch";
import { toast } from "@momentum/ui/components/toast";

import { ThemeToggle } from "@/components/theme-toggle";
import { updateProfileSettings } from "@/features/settings/actions";
import { TimeWindowList } from "@/features/settings/components/time-window-list";
import { TimezoneField } from "@/features/settings/components/timezone-field";
import { WorkingHoursEditor } from "@/features/settings/components/working-hours-editor";
import { WEEKDAY_NAMES } from "@/features/settings/weekday-names";
import { failure, type ActionError, type ActionResult } from "@/lib/actions/result";
import { useFocusNotificationPreference } from "@/lib/notifications/focus-notification";
import { reportError } from "@/lib/report-error";

/** The type permits any weekday; the control offers three. */
const WEEK_STARTS: readonly Weekday[] = [1, 0, 6];

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
 * Every control is persisted as it is committed: one field, one write, only
 * that control disabled while in flight. Theme and the focus-end notification
 * never reach the server; the latter is per-device because the browser's
 * permission is.
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

      <Separator />

      <Section title="Notifications" description="Browser notifications, on this device.">
        <FocusNotificationSwitch />
      </Section>

      <Separator />

      <Section title="Data" description="Everything you have entered, as one JSON file.">
        <div>
          <Button asChild variant="outline">
            <a href="/api/export" download>
              Download your data
            </a>
          </Button>
        </div>
      </Section>
    </PageContainer>
  );
}

/**
 * `commit` is keyed by a single field on purpose: two in-flight writes touch
 * two columns and neither can clobber the other.
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
          // A rejected call would be re-thrown out of the transition and blank
          // the page, leaving the key pending forever. `unstable_rethrow`
          // first: `redirect()` and `notFound()` are thrown control flow.
          unstable_rethrow(thrown);
          reportError(thrown, { source: "useSettings" });
          result = failure(
            "unavailable",
            "Momentum could not reach the server. Your change was not saved.",
          );
        }

        if (result.ok) {
          // The server's answer, not the request: stored windows may have been merged.
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

/** The first field-level message when there is one: nothing on this page is highlighted. */
function messageOf(error: ActionError): string {
  const field = Object.values(error.fieldErrors ?? {}).flat()[0];
  return field ?? error.message;
}

/** Committed on blur or Enter, and only when changed. */
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
  // Escape's `blur()` dispatches synchronously, before React re-renders with
  // the reset draft, so `onBlur` still holds the abandoned text. A ref is what
  // the blur can read at the moment it runs.
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

/**
 * The note below the switch is always laid out, empty when there is nothing to
 * say: the server renders "unsupported", the client corrects it on hydration,
 * and the correction must not move the section.
 */
function FocusNotificationSwitch() {
  const { supported, enabled, permission, setEnabled } = useFocusNotificationPreference();

  const note = !supported
    ? "This browser does not support notifications."
    : permission === "denied"
      ? "Notifications are blocked for Momentum in this browser's settings."
      : null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="focus-end-notification">Notify me when a focus session ends</Label>
        <Switch
          id="focus-end-notification"
          checked={enabled}
          disabled={!supported}
          aria-describedby={note ? "focus-end-notification-note" : undefined}
          onCheckedChange={(next) => {
            setEnabled(next).catch((thrown: unknown) =>
              reportError(thrown, { source: "FocusNotificationSwitch" }),
            );
          }}
        />
      </div>
      <p id="focus-end-notification-note" className="min-h-4 text-xs text-muted-foreground">
        {note}
      </p>
    </div>
  );
}
