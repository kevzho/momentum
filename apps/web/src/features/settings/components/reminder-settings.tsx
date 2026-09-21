"use client";

import { isLocalTime, localTime } from "@momentum/core/time";

import { Input } from "@momentum/ui/components/input";
import { Label } from "@momentum/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@momentum/ui/components/select";
import { Switch } from "@momentum/ui/components/switch";

import { EVENT_LEAD_OPTIONS } from "@/features/reminders/schedule";
import { useReminderPreference } from "@/lib/notifications/reminders";
import { reportError } from "@/lib/report-error";

/**
 * Reminders, on this device: events before they start, a morning summary,
 * an evening note of what is still open. The controls below the switch are
 * shown only once it is on, and every value is per device, like the
 * permission it depends on.
 */
export function ReminderSettings() {
  const { supported, enabled, permission, preferences, setEnabled, update } =
    useReminderPreference();

  const note = !supported
    ? "This browser does not support notifications."
    : permission === "denied"
      ? "Notifications are blocked for Momentum in this browser's settings."
      : "Shown while Momentum is open in this browser, including as an installed app.";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="reminders">Remind me about events, tasks and course work</Label>
          <Switch
            id="reminders"
            checked={enabled}
            disabled={!supported}
            aria-describedby="reminders-note"
            onCheckedChange={(next) => {
              setEnabled(next).catch((thrown: unknown) =>
                reportError(thrown, { source: "ReminderSettings" }),
              );
            }}
          />
        </div>
        <p id="reminders-note" className="min-h-4 text-xs text-muted-foreground">
          {note}
        </p>
      </div>

      {enabled ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reminder-lead">Before an event</Label>
            <Select
              value={String(preferences.eventLeadMinutes)}
              onValueChange={(value) => {
                const lead = EVENT_LEAD_OPTIONS.find((option) => String(option) === value);
                if (lead !== undefined) update({ eventLeadMinutes: lead });
              }}
            >
              <SelectTrigger id="reminder-lead" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EVENT_LEAD_OPTIONS.map((minutes) => (
                  <SelectItem key={minutes} value={String(minutes)}>
                    {minutes} min before
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reminder-digest">Morning summary</Label>
            <Input
              id="reminder-digest"
              type="time"
              value={preferences.digestTime}
              onChange={(event) => {
                if (isLocalTime(event.target.value)) {
                  update({ digestTime: localTime(event.target.value) });
                }
              }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reminder-evening">Evening check</Label>
            <Input
              id="reminder-evening"
              type="time"
              value={preferences.eveningTime}
              onChange={(event) => {
                if (isLocalTime(event.target.value)) {
                  update({ eveningTime: localTime(event.target.value) });
                }
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
