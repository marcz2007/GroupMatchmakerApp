"use client";

import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  createSmartEvent,
  createPollEvent,
  SchedulingSlot,
  PollOptionInput,
} from "@grapple/shared";
import styles from "./newEvent.module.css";

type Mode = "smart" | "poll";

const DAYS = [
  { key: 0, short: "Sun", full: "Sunday" },
  { key: 1, short: "Mon", full: "Monday" },
  { key: 2, short: "Tue", full: "Tuesday" },
  { key: 3, short: "Wed", full: "Wednesday" },
  { key: 4, short: "Thu", full: "Thursday" },
  { key: 5, short: "Fri", full: "Friday" },
  { key: 6, short: "Sat", full: "Saturday" },
];

const DURATION_OPTIONS = [30, 60, 90, 120, 180];

interface PollOptionDraft {
  id: string;
  date: string; // yyyy-mm-dd
  time: string; // HH:mm
  durationMinutes: number;
}

function formatDuration(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatTime12(hours: number, minutes: number): string {
  const period = hours >= 12 ? "PM" : "AM";
  const displayHour = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
  const displayMin = minutes > 0 ? `:${String(minutes).padStart(2, "0")}` : "";
  return `${displayHour}${displayMin} ${period}`;
}

function toInputDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function toInputDateTime(d: Date): string {
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
}

function defaultStartDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function defaultEndDate(): Date {
  const d = defaultStartDate();
  d.setDate(d.getDate() + 7);
  return d;
}

function defaultDeadline(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(12, 0, 0, 0);
  return d;
}

function defaultPollOption(dayOffset: number): PollOptionDraft {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date: toInputDate(d),
    time: "18:00",
    durationMinutes: 120,
  };
}

function pollOptionToInput(
  option: PollOptionDraft
): PollOptionInput | null {
  if (!option.date || !option.time) return null;
  const [h, m] = option.time.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const start = new Date(`${option.date}T${option.time}:00`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + option.durationMinutes * 60000);
  return {
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
  };
}

export default function NewEventPage() {
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("smart");

  // Shared
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState<Date>(defaultDeadline);

  // Smart-specific
  const [dateRangeStart, setDateRangeStart] = useState<Date>(defaultStartDate);
  const [dateRangeEnd, setDateRangeEnd] = useState<Date>(defaultEndDate);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [slotHour, setSlotHour] = useState(18);
  const [slotMinute, setSlotMinute] = useState(0);
  const [duration, setDuration] = useState(60);
  const [minSyncedEnabled, setMinSyncedEnabled] = useState(false);
  const [minSyncedUsers, setMinSyncedUsers] = useState(3);

  // Poll-specific
  const [pollOptions, setPollOptions] = useState<PollOptionDraft[]>(() => [
    defaultPollOption(1),
    defaultPollOption(2),
    defaultPollOption(3),
  ]);
  const [minVotesEnabled, setMinVotesEnabled] = useState(false);
  const [minVotes, setMinVotes] = useState(3);

  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdEventId, setCreatedEventId] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<"idle" | "copied">("idle");

  const canCreateSmart =
    title.trim().length > 0 &&
    selectedDays.length > 0 &&
    dateRangeStart < dateRangeEnd;

  const validPollOptions = useMemo(
    () =>
      pollOptions
        .map(pollOptionToInput)
        .filter((o): o is PollOptionInput => o !== null),
    [pollOptions]
  );

  const canCreatePoll =
    title.trim().length > 0 && validPollOptions.length > 0;

  const canCreate = mode === "smart" ? canCreateSmart : canCreatePoll;

  const slotSummary = useMemo(() => {
    if (selectedDays.length === 0) return "No days selected";
    const dayNames = selectedDays
      .slice()
      .sort()
      .map((d) => DAYS[d].short)
      .join(", ");
    return `${dayNames} at ${formatTime12(slotHour, slotMinute)} (${formatDuration(duration)})`;
  }, [selectedDays, slotHour, slotMinute, duration]);

  const toggleDay = (day: number) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleTimeChange = (value: string) => {
    const [h, m] = value.split(":").map(Number);
    if (!isNaN(h) && !isNaN(m)) {
      setSlotHour(h);
      setSlotMinute(m);
    }
  };

  const updatePollOption = (id: string, patch: Partial<PollOptionDraft>) => {
    setPollOptions((prev) =>
      prev.map((o) => (o.id === id ? { ...o, ...patch } : o))
    );
  };

  const addPollOption = () => {
    setPollOptions((prev) => [...prev, defaultPollOption(prev.length + 1)]);
  };

  const removePollOption = (id: string) => {
    setPollOptions((prev) =>
      prev.length > 1 ? prev.filter((o) => o.id !== id) : prev
    );
  };

  const handleCreate = async () => {
    if (!canCreate || isCreating) return;
    setError(null);
    setIsCreating(true);

    try {
      if (mode === "smart") {
        const slots: SchedulingSlot[] = selectedDays
          .slice()
          .sort()
          .map((day) => ({
            day_of_week: day,
            start_time: `${String(slotHour).padStart(2, "0")}:${String(slotMinute).padStart(2, "0")}`,
            duration_minutes: duration,
          }));

        const result = await createSmartEvent({
          title: title.trim(),
          description: description.trim() || undefined,
          dateRangeStart: toInputDate(dateRangeStart),
          dateRangeEnd: toInputDate(dateRangeEnd),
          schedulingDeadline: deadline.toISOString(),
          slots,
          minSyncedUsers: minSyncedEnabled ? minSyncedUsers : undefined,
        });

        setCreatedEventId(result.event_room_id);
      } else {
        const result = await createPollEvent({
          title: title.trim(),
          description: description.trim() || undefined,
          schedulingDeadline: deadline.toISOString(),
          minVotes: minVotesEnabled ? minVotes : undefined,
          options: validPollOptions,
        });

        setCreatedEventId(result.event_room_id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create event");
    } finally {
      setIsCreating(false);
    }
  };

  const handleShareInvite = async () => {
    if (!createdEventId) return;
    const url = `${window.location.origin}/event/${createdEventId}`;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: title.trim(),
          text: `Join me for ${title.trim()} on Grapple`,
          url,
        });
        return;
      } catch {
        // fall through
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareStatus("copied");
      setTimeout(() => setShareStatus("idle"), 2000);
    } catch {
      // clipboard unavailable
    }
  };

  if (createdEventId) {
    return (
      <div className={styles.successContainer}>
        <div className={styles.successCard}>
          <div className={styles.successIcon}>🗓️</div>
          <h1 className={styles.successTitle}>
            {mode === "smart" ? "Smart event created!" : "Poll created!"}
          </h1>
          <p className={styles.successSubtitle}>
            {mode === "smart"
              ? "Share the invite link so people can sync their calendars. The app will find the best time automatically."
              : "Share the invite link so people can vote on the options. We'll pick the winner automatically."}
          </p>
          <button className={styles.primaryButton} onClick={handleShareInvite}>
            {shareStatus === "copied" ? "Link copied!" : "Share invite link"}
          </button>
          <button
            className={styles.secondaryButton}
            onClick={() => router.push(`/events/${createdEventId}`)}
          >
            Go to event room
          </button>
          <button
            className={styles.linkButton}
            onClick={() => router.push("/events")}
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.screenTitle}>Create an event</h1>
        <p className={styles.hint}>
          Pick how people decide when to meet.
        </p>
      </div>

      <section className={styles.section}>
        <div className={styles.label}>Voting mode</div>
        <div className={styles.modeToggle}>
          <button
            type="button"
            className={`${styles.modeButton} ${mode === "smart" ? styles.modeButtonSelected : ""}`}
            onClick={() => setMode("smart")}
          >
            <span className={styles.modeTitle}>Find best time</span>
            <span className={styles.modeSubtitle}>
              Day of week + time. App syncs calendars and picks the slot.
            </span>
          </button>
          <button
            type="button"
            className={`${styles.modeButton} ${mode === "poll" ? styles.modeButtonSelected : ""}`}
            onClick={() => setMode("poll")}
          >
            <span className={styles.modeTitle}>Poll specific dates</span>
            <span className={styles.modeSubtitle}>
              Pick exact date/times. Everyone votes on each one.
            </span>
          </button>
        </div>
      </section>

      <section className={styles.section}>
        <label className={styles.label} htmlFor="event-title">
          What&apos;s the event?
        </label>
        <input
          id="event-title"
          type="text"
          className={styles.input}
          placeholder="e.g. Pub quiz night"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
        />
      </section>

      <section className={styles.section}>
        <label className={styles.label} htmlFor="event-description">
          Details <span className={styles.optional}>(optional)</span>
        </label>
        <textarea
          id="event-description"
          className={styles.textarea}
          placeholder="Location, what to bring, etc."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={500}
        />
      </section>

      {mode === "smart" ? (
        <>
          <section className={styles.section}>
            <div className={styles.label}>Date range</div>
            <div className={styles.hint}>The window to search for the best time</div>
            <div className={styles.dateRangeRow}>
              <input
                type="date"
                className={styles.dateInput}
                value={toInputDate(dateRangeStart)}
                min={toInputDate(new Date())}
                onChange={(e) => {
                  const newStart = new Date(e.target.value);
                  setDateRangeStart(newStart);
                  if (newStart >= dateRangeEnd) {
                    const newEnd = new Date(newStart);
                    newEnd.setDate(newEnd.getDate() + 7);
                    setDateRangeEnd(newEnd);
                  }
                }}
              />
              <span className={styles.dateSeparator}>to</span>
              <input
                type="date"
                className={styles.dateInput}
                value={toInputDate(dateRangeEnd)}
                min={toInputDate(dateRangeStart)}
                onChange={(e) => setDateRangeEnd(new Date(e.target.value))}
              />
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.label}>Preferred days</div>
            <div className={styles.hint}>Which days of the week work?</div>
            <div className={styles.daysRow}>
              {DAYS.map((day) => {
                const isSelected = selectedDays.includes(day.key);
                return (
                  <button
                    key={day.key}
                    type="button"
                    className={`${styles.dayButton} ${isSelected ? styles.dayButtonSelected : ""}`}
                    onClick={() => toggleDay(day.key)}
                  >
                    {day.short}
                  </button>
                );
              })}
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.label}>Time &amp; duration</div>
            <div className={styles.hint}>What time and how long?</div>
            <div className={styles.timeDurationRow}>
              <input
                type="time"
                className={styles.timeInput}
                value={`${String(slotHour).padStart(2, "0")}:${String(slotMinute).padStart(2, "0")}`}
                onChange={(e) => handleTimeChange(e.target.value)}
              />
              <div className={styles.durationChips}>
                {DURATION_OPTIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={`${styles.durationChip} ${duration === d ? styles.durationChipSelected : ""}`}
                    onClick={() => setDuration(d)}
                  >
                    {formatDuration(d)}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={minSyncedEnabled}
                onChange={(e) => setMinSyncedEnabled(e.target.checked)}
              />
              <span>Finalize early once enough people have synced</span>
            </label>
            {minSyncedEnabled && (
              <div className={styles.minVotesRow}>
                <span className={styles.hint}>Minimum synced participants</span>
                <input
                  type="number"
                  className={styles.minVotesInput}
                  value={minSyncedUsers}
                  min={1}
                  max={100}
                  onChange={(e) =>
                    setMinSyncedUsers(Math.max(1, Number(e.target.value) || 1))
                  }
                />
              </div>
            )}
          </section>
        </>
      ) : (
        <>
          <section className={styles.section}>
            <div className={styles.label}>Date options</div>
            <div className={styles.hint}>
              Add the specific times participants will vote on.
            </div>
            <div className={styles.pollOptionsList}>
              {pollOptions.map((option, index) => (
                <div key={option.id} className={styles.pollOptionCard}>
                  <div className={styles.pollOptionHeader}>
                    <span className={styles.pollOptionIndex}>
                      Option {index + 1}
                    </span>
                    {pollOptions.length > 1 && (
                      <button
                        type="button"
                        className={styles.removeButton}
                        onClick={() => removePollOption(option.id)}
                        aria-label="Remove option"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className={styles.pollOptionRow}>
                    <input
                      type="date"
                      className={styles.dateInput}
                      value={option.date}
                      min={toInputDate(new Date())}
                      onChange={(e) =>
                        updatePollOption(option.id, { date: e.target.value })
                      }
                    />
                    <input
                      type="time"
                      className={styles.timeInput}
                      value={option.time}
                      onChange={(e) =>
                        updatePollOption(option.id, { time: e.target.value })
                      }
                    />
                  </div>
                  <div className={styles.durationChips}>
                    {DURATION_OPTIONS.map((d) => (
                      <button
                        key={d}
                        type="button"
                        className={`${styles.durationChip} ${option.durationMinutes === d ? styles.durationChipSelected : ""}`}
                        onClick={() =>
                          updatePollOption(option.id, { durationMinutes: d })
                        }
                      >
                        {formatDuration(d)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              className={styles.addOptionButton}
              onClick={addPollOption}
            >
              + Add another option
            </button>
          </section>

          <section className={styles.section}>
            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={minVotesEnabled}
                onChange={(e) => setMinVotesEnabled(e.target.checked)}
              />
              <span>Finalize early once an option hits a target</span>
            </label>
            {minVotesEnabled && (
              <div className={styles.minVotesRow}>
                <span className={styles.hint}>Minimum yes votes</span>
                <input
                  type="number"
                  className={styles.minVotesInput}
                  value={minVotes}
                  min={1}
                  max={100}
                  onChange={(e) =>
                    setMinVotes(Math.max(1, Number(e.target.value) || 1))
                  }
                />
              </div>
            )}
          </section>
        </>
      )}

      <section className={styles.section}>
        <div className={styles.label}>
          {mode === "smart" ? "Sync deadline" : "Voting deadline"}
        </div>
        <div className={styles.hint}>
          {mode === "smart"
            ? "When should the app pick the best time?"
            : "When should voting close?"}
        </div>
        <input
          type="datetime-local"
          className={styles.dateInput}
          value={toInputDateTime(deadline)}
          min={toInputDateTime(new Date())}
          onChange={(e) => setDeadline(new Date(e.target.value))}
        />
      </section>

      {mode === "smart" && selectedDays.length > 0 && (
        <div className={styles.summary}>
          <span className={styles.summaryIcon}>✨</span>
          <span>{slotSummary}</span>
        </div>
      )}

      {mode === "poll" && validPollOptions.length > 0 && (
        <div className={styles.summary}>
          <span className={styles.summaryIcon}>🗳️</span>
          <span>
            {validPollOptions.length} option
            {validPollOptions.length !== 1 ? "s" : ""} to vote on
          </span>
        </div>
      )}

      {error && <p className={styles.error}>{error}</p>}

      <button
        type="button"
        className={styles.createButton}
        onClick={handleCreate}
        disabled={!canCreate || isCreating}
      >
        {isCreating
          ? "Creating..."
          : mode === "smart"
          ? "Create smart event"
          : "Create poll"}
      </button>
    </div>
  );
}
