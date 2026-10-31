/**
 * Optional browser voice dictation helpers.
 * Recognition stays in the browser API; this module does no network I/O.
 */

export function getSpeechRecognitionCtor(globalObj = globalThis) {
  if (!globalObj) return null;
  return globalObj.SpeechRecognition || globalObj.webkitSpeechRecognition || null;
}

/** Map meeting language to a SpeechRecognition locale (Hong Kong defaults). */
export function speechLocale(language) {
  switch (language) {
    case "en":
      return "en-HK";
    case "mixed":
      return "zh-HK";
    case "zh":
    default:
      return "zh-HK";
  }
}

/** Format a clock time as [HH:MM:SS] in Asia/Hong_Kong (HKT). */
export function formatDictationStamp(date = new Date()) {
  const when = date instanceof Date ? date : new Date(date);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Hong_Kong",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(when);
  const get = (type) => parts.find((part) => part.type === type)?.value ?? "00";
  return `[${get("hour")}:${get("minute")}:${get("second")}]`;
}

/**
 * Build one paste line from a final recognition result.
 * Empty or whitespace-only input returns "".
 */
export function formatDictationLine(text, { speaker = "", at = new Date() } = {}) {
  const body = String(text || "").replace(/\s+/g, " ").trim();
  if (!body) return "";
  const stamp = formatDictationStamp(at);
  const who = String(speaker || "").trim();
  if (who) return `${stamp} ${who}: ${body}`;
  return `${stamp} ${body}`;
}

/**
 * Append a line to existing paste text.
 * After WebVTT/SRT blocks (which use -->), insert a blank line so the new
 * cue is not glued onto the previous cue when parsed.
 */
export function appendDictationLine(existing, line) {
  const next = String(line || "").trim();
  if (!next) return String(existing || "");
  const base = String(existing || "").replace(/\s+$/u, "");
  if (!base) return next;
  if (/-->/.test(base)) return `${base}\n\n${next}`;
  return `${base}\n${next}`;
}

/** Pull the best transcript string from a SpeechRecognitionEvent-like object. */
export function bestTranscriptFromEvent(event) {
  const results = event?.results;
  if (!results || !results.length) return { finalText: "", interimText: "" };
  let finalText = "";
  let interimText = "";
  for (let i = event.resultIndex || 0; i < results.length; i += 1) {
    const result = results[i];
    const alt = result?.[0];
    const piece = String(alt?.transcript || "").trim();
    if (!piece) continue;
    if (result.isFinal) finalText = finalText ? `${finalText} ${piece}` : piece;
    else interimText = interimText ? `${interimText} ${piece}` : piece;
  }
  return { finalText, interimText };
}
