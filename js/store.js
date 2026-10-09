import { newId } from "./parse.js";
import { createSampleMeeting } from "./sample.js";

export const STORAGE_KEY = "hk-meeting-notes.v1";

const PLATFORMS = new Set(["zoom", "teams", "other"]);
const LANGUAGES = new Set(["zh", "en", "mixed"]);

export function nowHKTLocal(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((part) => [part.type, part.value]));
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}`;
}

export function blankMeeting() {
  const now = Date.now();
  return {
    id: newId(),
    title: "",
    datetime: nowHKTLocal(),
    platform: "zoom",
    language: "mixed",
    attendees: "",
    consent: false,
    transcript: "",
    transcriptFormat: "",
    cues: [],
    agenda: "",
    discussion: "",
    decisions: "",
    actions: [],
    isSample: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) {
      const meetings = [createSampleMeeting()];
      const saved = write({ version: 1, meetings });
      return {
        ok: saved.ok,
        corrupt: false,
        seeded: true,
        meetings,
        error: saved.error || null,
      };
    }
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data) || !Array.isArray(data.meetings)) {
      return { ok: false, corrupt: true, seeded: false, meetings: [], error: null };
    }
    return {
      ok: true,
      corrupt: false,
      seeded: false,
      meetings: data.meetings.map(normalise),
      error: null,
    };
  } catch (error) {
    return { ok: false, corrupt: true, seeded: false, meetings: [], error };
  }
}

export function saveMeetings(meetings) {
  return write({ version: 1, meetings });
}

function write(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

function normalise(meeting) {
  const source = meeting && typeof meeting === "object" ? meeting : {};
  return {
    id: clip(source.id, 80) || newId(),
    title: clip(source.title, 200),
    datetime: clip(source.datetime, 16),
    platform: PLATFORMS.has(source.platform) ? source.platform : "other",
    language: LANGUAGES.has(source.language) ? source.language : "mixed",
    attendees: clip(source.attendees, 500),
    consent: Boolean(source.consent),
    transcript: clip(source.transcript, 1_500_000),
    transcriptFormat: clip(source.transcriptFormat, 16),
    cues: Array.isArray(source.cues)
      ? source.cues.slice(0, 5000).map((cue) => ({
          start: clip(cue?.start, 16),
          end: clip(cue?.end, 16),
          speaker: clip(cue?.speaker, 80),
          text: clip(cue?.text, 10000),
        }))
      : [],
    agenda: clip(source.agenda, 100000),
    discussion: clip(source.discussion, 100000),
    decisions: clip(source.decisions, 100000),
    actions: Array.isArray(source.actions)
      ? source.actions.slice(0, 200).map((item) => ({
          id: clip(item?.id, 80) || newId(),
          task: clip(item?.task, 2000),
          owner: clip(item?.owner, 80),
          due: /^\d{4}-\d{2}-\d{2}$/.test(String(item?.due || "")) ? String(item.due) : "",
        }))
      : [],
    isSample: Boolean(source.isSample),
    createdAt: Number(source.createdAt) || Date.now(),
    updatedAt: Number(source.updatedAt) || Date.now(),
  };
}

function clip(value, max) {
  const text = String(value ?? "");
  return text.length > max ? text.slice(0, max) : text;
}
