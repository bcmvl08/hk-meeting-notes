/**
 * Read disclosed transcripts and turn notes into Markdown.
 * No network. No recording. Text the user already has, only.
 */

export class ParseError extends Error {
  constructor(message) {
    super(message);
    this.name = "ParseError";
  }
}

export const PLATFORM_LABELS = {
  zoom: "Zoom",
  teams: "Teams",
  other: "其他 Other",
};

export const LANGUAGE_LABELS = {
  zh: "中文 Chinese",
  en: "English",
  mixed: "中英混合 Mixed",
};

const MAX_CHARS = 1_500_000;
const MAX_CUES = 5000;

const STAMP = "(?:\\d{1,2}:)?\\d{1,2}:\\d{2}(?:[.,]\\d{1,3})?";
const TIME_LINE = new RegExp(`^(${STAMP})\\s*-->\\s*(${STAMP})`);
const STAMP_EXACT = /^(?:(\d+):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?$/;

const TEXT_KEYS = ["text", "content", "utterance", "transcript", "body", "message", "statement", "line"];
const SPEAKER_KEYS = [
  "speaker",
  "speaker_name",
  "speakerName",
  "speakerDisplayName",
  "name",
  "participant",
  "user_name",
  "userName",
  "displayName",
  "display_name",
];
const START_KEYS = ["start", "startTime", "start_time", "begin", "from", "offset", "ts"];
const END_KEYS = ["end", "endTime", "end_time", "to", "stop"];
const ARRAY_KEYS = [
  "cues",
  "segments",
  "utterances",
  "transcript",
  "results",
  "items",
  "entries",
  "messages",
  "paragraphs",
  "monologues",
];

const DECISION_RE =
  /(決定|決議|拍板|就咁定|(?<![不未])同意|\bdecision\b|\bagreed\b|we(?:'ll| will) go with|確認採用|定咗|拍板定)/i;
const DECISION_NEGATION_RE =
  /(唔同意|不同意|冇同意|没有同意|沒有同意|\bnot agree|\bdon't agree|\bdo not agree|\bhaven'?t agreed|\bhave not agreed|\bdidn'?t agree|\bdid not agree)/i;
const ACTION_RE =
  /(待辦|行動項目|行動項|action item|follow[- ]?up|負責|之後跟進|我嚟搞|我來跟|\bI will\b|\bI'll\b|\bwe will\b|\bTODO\b|to-do|截止)/i;
const AGENDA_RE = /(議程|\bagenda\b|今天討論|今日討論|先過|开場|開場)/i;
const DUE_RE = /\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/;

export function newId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function parseTranscript(text, filename = "") {
  const raw = String(text ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  if (raw.includes("\u0000")) {
    throw new ParseError("這不像文字檔。This file does not look like text.");
  }
  if (!raw.trim()) {
    throw new ParseError("沒有內容。Nothing to import.");
  }
  if (raw.length > MAX_CHARS) {
    throw new ParseError("檔案太大。This file is too large.");
  }
  const format = detectFormat(raw, filename);
  const parsed =
    format === "json"
      ? parseJson(raw)
      : format === "vtt" || format === "srt"
        ? parseTimed(raw)
        : parsePlain(raw);
  const result = finalise(parsed.cues, parsed.warnings);
  if (!result.cues.length) {
    throw new ParseError("沒有可讀的文字。No readable text.");
  }
  return { format, ...result };
}

export function detectFormat(text, filename = "") {
  const ext = extension(filename);
  if (ext === "json") return "json";
  if (ext === "vtt") return "vtt";
  if (ext === "srt") return "srt";
  const trimmed = text.trim();
  if (looksLikeJson(trimmed)) return "json";
  if (/^WEBVTT\b/im.test(text)) return "vtt";
  if (looksLikeSrt(text)) return "srt";
  if (looksLikeVtt(text)) return "vtt";
  return "text";
}

export function draftNotes(cues) {
  const agenda = [];
  const decisions = [];
  const actions = [];
  const groups = [];
  let current = null;

  for (const cue of cues || []) {
    const text = String(cue?.text || "").trim();
    if (!text) continue;
    const speaker = String(cue?.speaker || "").trim();
    if (AGENDA_RE.test(text)) agenda.push(text);
    if (DECISION_RE.test(text) && !DECISION_NEGATION_RE.test(text)) {
      decisions.push(speaker ? `${speaker}：${text}` : text);
    }
    if (ACTION_RE.test(text)) actions.push(actionFrom(speaker, text));
    if (!current || current.speaker !== speaker) {
      current = { speaker, texts: [text] };
      groups.push(current);
    } else {
      current.texts.push(text);
    }
  }

  const discussion = groups
    .map((group) => {
      const who = group.speaker || "（未記名 Unnamed）";
      return `- ${who}：${truncate(group.texts.join(" "), 320)}`;
    })
    .join("\n");

  return {
    agenda: unique(agenda).map((line) => `- ${line}`).join("\n"),
    discussion,
    decisions: unique(decisions).map((line) => `- ${line}`).join("\n"),
    actions,
  };
}

/** Escape HTML specials so Markdown viewers that parse HTML keep transcript text inert. */
export function escapeForMarkdown(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function toMarkdown(meeting) {
  const note = meeting || {};
  const lines = [];
  lines.push(`# ${escapeForMarkdown(note.title?.trim() || "未命名會議 Untitled")}`);
  lines.push("");
  lines.push(`- 日期時間 Date/time：${formatWhen(note.datetime)}`);
  lines.push(`- 平台 Platform：${PLATFORM_LABELS[note.platform] || PLATFORM_LABELS.other}`);
  lines.push(`- 語言 Language：${LANGUAGE_LABELS[note.language] || LANGUAGE_LABELS.mixed}`);
  lines.push(`- 與會者 Attendees：${escapeForMarkdown(String(note.attendees || "").trim() || "—")}`);
  lines.push("");
  lines.push(
    "> 只收錄已向與會者說明正在錄音或轉錄的會議。Only transcripts from meetings where participants were told recording or transcription was on.",
  );
  lines.push("");
  lines.push("## 議程 Agenda");
  lines.push("");
  lines.push(blockOrEmpty(note.agenda));
  lines.push("");
  lines.push("## 討論 Discussion");
  lines.push("");
  lines.push(blockOrEmpty(note.discussion));
  lines.push("");
  lines.push("## 決定 Decisions");
  lines.push("");
  lines.push(blockOrEmpty(note.decisions));
  lines.push("");
  lines.push("## 待辦 Action items");
  lines.push("");
  const actions = (Array.isArray(note.actions) ? note.actions : []).filter(
    (item) => String(item.task || "").trim() || String(item.owner || "").trim() || String(item.due || "").trim(),
  );
  if (!actions.length) {
    lines.push("_（未填）_");
  } else {
    for (const item of actions) {
      const task = escapeForMarkdown(String(item.task || "").trim() || "（未寫任務）");
      const owner = escapeForMarkdown(String(item.owner || "").trim());
      const due = escapeForMarkdown(String(item.due || "").trim());
      let extra = "";
      if (owner || due) extra = ` — ${owner || "未指派"}`;
      if (due) extra += ` — ${due}`;
      lines.push(`- [ ] ${task}${extra}`);
    }
  }
  lines.push("");
  const cues = Array.isArray(note.cues) ? note.cues : [];
  if (cues.length) {
    lines.push("## 轉錄摘錄 Transcript");
    lines.push("");
    for (const cue of cues) {
      const when = cue.start ? `\`${cue.start}\`` : "";
      const who = cue.speaker ? `**${escapeForMarkdown(cue.speaker)}**` : "";
      const prefix = [when, who].filter(Boolean).join(" ");
      lines.push(`- ${prefix ? `${prefix}：` : ""}${escapeForMarkdown(cue.text)}`);
    }
    lines.push("");
  }
  lines.push("---");
  lines.push("");
  lines.push("由 hk-meeting-notes 在本機整理。資料沒有上傳。Notes stayed in this browser; nothing was uploaded.");
  lines.push("");
  return lines.join("\n");
}

export function markdownFilename(meeting) {
  const datetime = String(meeting?.datetime || "");
  const date = /^\d{4}-\d{2}-\d{2}/.test(datetime) ? datetime.slice(0, 10) : "undated";
  const slug =
    String(meeting?.title || "meeting")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^\p{L}\p{N}-]+/gu, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "meeting";
  return `${date}-${slug}.md`;
}

export function formatWhen(datetime, { compact = false } = {}) {
  if (!datetime) return compact ? "未填時間" : "未填 Not set（香港時間 HKT）";
  const [date, timePart] = String(datetime).split("T");
  const time = (timePart || "").slice(0, 5);
  const main = `${date}${time ? ` ${time}` : ""}`;
  return compact ? `${main} HKT` : `${main}（香港時間 HKT）`;
}

export function formatLabel(format) {
  if (format === "vtt") return "WebVTT";
  if (format === "srt") return "SRT";
  if (format === "json") return "JSON";
  if (format === "text") return "純文字 Plain text";
  return "";
}

function parseTimed(text) {
  const blocks = text.split(/\n{2,}/);
  const cues = [];
  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length) continue;
    if (/^(NOTE|STYLE|REGION)\b/i.test(lines[0])) continue;
    if (/^WEBVTT\b/i.test(lines[0]) && !lines.some((line) => TIME_LINE.test(line))) continue;
    const timeIdx = lines.findIndex((line) => TIME_LINE.test(line));
    if (timeIdx === -1) {
      try {
        const plain = parsePlain(block);
        for (const cue of plain.cues) cues.push(cue);
      } catch {
      }
      continue;
    }
    const match = lines[timeIdx].match(TIME_LINE);
    const start = normaliseStamp(match[1]);
    const end = normaliseStamp(match[2]);
    const payload = lines.slice(timeIdx + 1).join("\n").trim();
    if (!payload) continue;
    for (const part of splitVoices(payload)) {
      if (!part.text) continue;
      cues.push({ start, end, speaker: part.speaker, text: part.text });
    }
  }
  if (!cues.length) {
    throw new ParseError("認不出字幕時間軸。Could not read cues from this subtitle file.");
  }
  return { cues, warnings: [] };
}

function parsePlain(text) {
  const cues = [];
  const warnings = [];
  let current = null;

  const flush = () => {
    if (current && String(current.text || "").trim()) {
      current.text = current.text.trim();
      cues.push(current);
    }
    current = null;
  };

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      flush();
      continue;
    }
    if (STAMP_EXACT.test(line)) {
      const stamp = normaliseStamp(line);
      if (current && !current.text.trim()) current.start = current.start || stamp;
      else {
        flush();
        current = { start: stamp, end: "", speaker: "", text: "" };
      }
      continue;
    }
    const bracket = line.match(/^\[([^\]]{1,80})\]\s*(.*)$/);
    if (bracket && STAMP_EXACT.test(bracket[1].trim())) {
      flush();
      const spoken = speakerSplit(bracket[2].trim());
      current = {
        start: normaliseStamp(bracket[1].trim()),
        end: "",
        speaker: spoken.speaker,
        text: spoken.text,
      };
      continue;
    }
    const spoken = speakerSplit(line);
    if (spoken.speaker) {
      flush();
      current = { start: "", end: "", speaker: spoken.speaker, text: spoken.text };
      continue;
    }
    if (!current) current = { start: "", end: "", speaker: "", text: "" };
    current.text = current.text ? `${current.text}\n${line}` : line;
  }
  flush();
  if (!cues.length) throw new ParseError("沒有可讀的文字。No readable text.");
  if (cues.every((cue) => !cue.start)) {
    warnings.push("沒有時間碼，已按段落讀入。No timestamps; read as paragraphs.");
  }
  return { cues, warnings };
}

function parseJson(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ParseError("JSON 格式不正確。This JSON could not be parsed.");
  }
  const cues = [];
  const warnings = [];
  collect(data, cues, warnings, 0);
  if (!cues.length) {
    throw new ParseError("JSON 裡找不到轉錄句子。No transcript lines found in this JSON.");
  }
  return { cues, warnings };
}

function collect(node, cues, warnings, depth) {
  if (depth > 8 || node == null) return;
  if (typeof node === "string") {
    const embedded = embeddedCues(node);
    cues.push(...embedded);
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      if (item && typeof item === "object") addObjectCue(item, cues, warnings, depth);
      else if (typeof item === "string" && item.trim()) cues.push(blankCue(item.trim()));
    }
    return;
  }
  if (typeof node !== "object") return;

  let found = false;
  for (const key of ARRAY_KEYS) {
    if (Array.isArray(node[key])) {
      found = true;
      collect(node[key], cues, warnings, depth + 1);
    } else if (typeof node[key] === "string" && node[key].trim()) {
      found = true;
      cues.push(...embeddedCues(node[key]));
    }
  }
  if (!found) addObjectCue(node, cues, warnings, depth);
}

function addObjectCue(obj, cues, warnings, depth) {
  if (Array.isArray(obj.alternatives) && obj.alternatives[0]) {
    const alt = obj.alternatives[0];
    const text = asString(pick(alt, TEXT_KEYS));
    if (text.trim()) {
      cues.push({
        start: stampFrom(pick(obj, START_KEYS) ?? pick(alt, START_KEYS)),
        end: stampFrom(pick(obj, END_KEYS) ?? pick(alt, END_KEYS)),
        speaker: cleanSpeaker(asString(pick(obj, SPEAKER_KEYS) ?? pick(alt, SPEAKER_KEYS))),
        text: cleanText(text),
      });
      return;
    }
  }
  const text = asString(pick(obj, TEXT_KEYS));
  if (text.trim()) {
    cues.push({
      start: stampFrom(pick(obj, START_KEYS)),
      end: stampFrom(pick(obj, END_KEYS)),
      speaker: cleanSpeaker(asString(pick(obj, SPEAKER_KEYS))),
      text: cleanText(text),
    });
    return;
  }
  for (const key of ARRAY_KEYS) {
    if (obj[key] != null) collect(obj[key], cues, warnings, depth + 1);
  }
}

function embeddedCues(text) {
  const inner = String(text || "").trim();
  if (!inner) return [];
  if (/^WEBVTT\b/im.test(inner) || looksLikeVtt(inner)) return parseTimed(inner).cues;
  if (looksLikeSrt(inner)) return parseTimed(inner).cues;
  return parsePlain(inner).cues;
}

function splitVoices(payload) {
  const voiceRe = /<v(?:\.[^>\s]*)?(?:\s+([^>]+))?>([\s\S]*?)(?:<\/v>|$)/gi;
  const matches = [...payload.matchAll(voiceRe)];
  if (matches.length && matches.some((match) => cleanText(match[2] || ""))) {
    return matches
      .map((match) => ({
        speaker: cleanSpeaker(match[1] || ""),
        text: cleanText(match[2] || ""),
      }))
      .filter((part) => part.text);
  }
  const spoken = speakerSplit(cleanText(payload));
  return [spoken];
}

function speakerSplit(line) {
  const match = String(line || "").match(/^([^:\n]{1,80}):\s*([\s\S]*)$/);
  if (!match || !plausibleSpeaker(match[1]) || !match[2].trim()) {
    return { speaker: "", text: cleanText(line) };
  }
  return { speaker: cleanSpeaker(match[1]), text: cleanText(match[2]) };
}

function plausibleSpeaker(name) {
  const value = String(name || "").trim();
  if (!value || value.length > 40) return false;
  if (/^https?$/i.test(value)) return false;
  if (STAMP_EXACT.test(value)) return false;
  if (/^\d+$/.test(value)) return false;
  if (value.includes("-->")) return false;
  if (value.split(/\s+/).filter(Boolean).length > 2) return false;
  if (/\d/.test(value) && !/^speaker\s*\d+$/i.test(value)) return false;
  if (/^(note|notes|warning|update|alert|important|ps|re|fwd|from|to)$/i.test(value)) return false;
  return true;
}

function cleanSpeaker(name) {
  return decodeEntities(String(name || ""))
    .replace(/<[^<>]*>/g, "")
    .replace(/\s+/g, " ")
    .replace(/[:：]\s*$/g, "")
    .trim()
    .slice(0, 80);
}

function cleanText(value) {
  return decodeEntities(String(value || "").replace(/<[^<>]*>/g, ""))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

function normaliseStamp(stamp) {
  const match = String(stamp || "").trim().match(STAMP_EXACT);
  if (!match) return "";
  const hour = match[1] != null ? Number(match[1]) : 0;
  const minute = Number(match[2]);
  const second = Number(match[3]);
  if (hour > 99 || minute > 59 || second > 59) return "";
  const milli = (match[4] || "000").padEnd(3, "0").slice(0, 3);
  return `${pad(hour)}:${pad(minute)}:${pad(second)}.${milli}`;
}

function stampFrom(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const totalMs = value >= 100000 ? Math.round(value) : Math.round(value * 1000);
    return msToStamp(totalMs);
  }
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) return stampFrom(Number(trimmed));
  const match = trimmed.match(new RegExp(STAMP));
  return match ? normaliseStamp(match[1] || match[0]) : "";
}

function msToStamp(totalMs) {
  const max = 99 * 3600000 + 59 * 60000 + 59 * 1000 + 999;
  let ms = Math.max(0, Math.round(totalMs));
  if (ms > max) ms = max;
  const hour = Math.floor(ms / 3600000);
  const minute = Math.floor((ms % 3600000) / 60000);
  const second = Math.floor((ms % 60000) / 1000);
  const milli = ms % 1000;
  return `${pad(hour)}:${pad(minute)}:${pad(second)}.${String(milli).padStart(3, "0")}`;
}

function finalise(cues, warnings) {
  const clean = [];
  const notes = [...(warnings || [])];
  for (const cue of cues || []) {
    const text = clip(cue.text, 10000).trim();
    if (!text) continue;
    clean.push({
      start: clip(cue.start, 16),
      end: clip(cue.end, 16),
      speaker: clip(cue.speaker, 80),
      text,
    });
    if (clean.length >= MAX_CUES) {
      notes.push(`只保留前 ${MAX_CUES} 段。Kept the first ${MAX_CUES} cues.`);
      break;
    }
  }
  return { cues: clean, warnings: unique(notes) };
}

function actionFrom(speaker, text) {
  const dueMatch = text.match(DUE_RE);
  const due = dueMatch
    ? `${dueMatch[1]}-${dueMatch[2].padStart(2, "0")}-${dueMatch[3].padStart(2, "0")}`
    : "";
  let owner = speaker;
  if (!owner) {
    const lead = text.match(/^(.{1,40}?)負責/);
    const named = text.match(/^([A-Z][\w .'-]{0,40}?) will\b/);
    if (lead) owner = lead[1].replace(/^我/, "").trim();
    else if (named) owner = named[1].trim();
  }
  return {
    id: newId(),
    task: text,
    owner: owner || "",
    due,
  };
}

function blankCue(text) {
  return { start: "", end: "", speaker: "", text };
}

function pick(obj, keys) {
  if (!obj || typeof obj !== "object") return undefined;
  for (const key of keys) {
    if (obj[key] != null && obj[key] !== "") return obj[key];
  }
  return undefined;
}

function asString(value) {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function looksLikeJson(text) {
  if (!(text.startsWith("{") || text.startsWith("["))) return false;
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

function looksLikeSrt(text) {
  return /\d{1,2}:\d{2}:\d{2},\d{1,3}\s*-->\s*\d{1,2}:\d{2}:\d{2},\d{1,3}/.test(text);
}

function looksLikeVtt(text) {
  return new RegExp(`^${STAMP}\\s*-->\\s*${STAMP}`, "m").test(text);
}

function extension(filename) {
  const base = String(filename || "")
    .trim()
    .toLowerCase()
    .split(/[/\\]/)
    .pop();
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot + 1);
}

function blockOrEmpty(value) {
  const text = String(value || "").trim();
  return text ? escapeForMarkdown(text) : "_（未填）_";
}

function truncate(value, max) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function unique(list) {
  return [...new Set(list)];
}

function clip(value, max) {
  const text = String(value ?? "");
  return text.length > max ? text.slice(0, max) : text;
}

function pad(value) {
  return String(value).padStart(2, "0");
}
