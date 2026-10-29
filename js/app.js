import {
  LANGUAGE_LABELS,
  PLATFORM_LABELS,
  draftNotes,
  formatLabel,
  formatWhen,
  markdownFilename,
  newId,
  parseTranscript,
  toMarkdown,
} from "./parse.js";
import { SAMPLE_ID, createSampleMeeting } from "./sample.js";
import {
  appendDictationLine,
  bestTranscriptFromEvent,
  formatDictationLine,
  getSpeechRecognitionCtor,
  speechLocale,
} from "./speech.js";
import { blankMeeting, loadState, saveMeetings } from "./store.js";

const MAX_FILE_BYTES = 2 * 1024 * 1024;

const byId = (id) => document.getElementById(id);

let meetings = [];
let currentId = null;
let hydrating = false;
let storageCorrupt = false;
let saveTimer = 0;
let pickedFile = null;
let pendingFocus = null;
let fileToken = 0;
let recognition = null;
let voiceListening = false;
let voiceSupported = false;

window.__NOTES_BOOTED = true;

function init() {
  byId("boot-error").hidden = true;
  const state = loadState();
  meetings = state.meetings;
  storageCorrupt = Boolean(state.corrupt);
  if (!state.ok) showStorageProblem(state);
  bind();
  if (state.seeded && state.ok) {
    byId("list-message").dataset.seeded = "true";
  }
  render();
  window.addEventListener("hashchange", () => {
    flushSave();
    render();
  });
  window.addEventListener("beforeunload", flushSave);
  window.addEventListener("pagehide", flushSave);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushSave();
  });
  window.addEventListener("beforeprint", buildPrintSheet);
}

function bind() {
  byId("new-meeting").addEventListener("click", onNew);
  byId("restore-sample").addEventListener("click", onRestoreSample);
  byId("clear-all").addEventListener("click", onClearAll);
  byId("storage-reset").addEventListener("click", onStorageReset);
  byId("meta-form").addEventListener("submit", (event) => event.preventDefault());
  byId("notes-form").addEventListener("submit", (event) => event.preventDefault());
  for (const id of ["title", "when", "platform", "language", "attendees", "agenda", "discussion", "decisions"]) {
    const field = byId(id);
    field.addEventListener("input", onEdit);
    field.addEventListener("change", onEdit);
  }
  byId("title").addEventListener("input", syncHeading);
  byId("consent").addEventListener("change", onVoiceGateChange);
  byId("voice-cloud").addEventListener("change", onVoiceGateChange);
  byId("language").addEventListener("change", () => {
    if (voiceListening) restartVoiceForLanguage();
  });
  byId("paste").addEventListener("input", () => {
    if (hydrating) return;
    fileToken += 1;
    pickedFile = null;
    byId("file").value = "";
    byId("file-name").textContent = "";
    refreshImportButton();
  });
  byId("file").addEventListener("change", onFile);
  byId("voice-btn").addEventListener("click", onVoiceToggle);
  byId("import-btn").addEventListener("click", onImport);
  byId("draft-btn").addEventListener("click", onDraft);
  byId("clear-transcript").addEventListener("click", onClearTranscript);
  setupVoiceSupport();
  byId("add-action").addEventListener("click", () => {
    addActionRow({ id: newId(), task: "", owner: "", due: "" }, { focus: true });
    scheduleSave();
  });
  byId("download-md").addEventListener("click", downloadMarkdown);
  byId("copy-md").addEventListener("click", copyMarkdown);
  byId("print-btn").addEventListener("click", () => window.print());
  byId("delete-meeting").addEventListener("click", onDelete);
  byId("copy-close").addEventListener("click", () => byId("copy-dialog").close());
  byId("copy-dialog").addEventListener("click", (event) => {
    if (event.target === byId("copy-dialog")) byId("copy-dialog").close();
  });
}

function onEdit() {
  if (hydrating) return;
  syncHeading();
  scheduleSave();
}

function render() {
  const route = parseRoute();
  if (route.name === "editor") {
    const meeting = meetings.find((item) => item.id === route.id);
    if (!meeting) {
      currentId = null;
      showMissing();
      return;
    }
    currentId = meeting.id;
    showEditor(meeting);
    return;
  }
  currentId = null;
  showList();
}

function showList() {
  stopVoice({ silent: true });
  document.body.dataset.view = "list";
  byId("editor-view").hidden = true;
  byId("list-view").hidden = false;
  const count = meetings.length;
  const seeded = byId("list-message").dataset.seeded === "true";
  byId("list-message").textContent = count
    ? `這個瀏覽器有 ${count} 份紀錄（${count} in this browser）。${
        seeded ? " 已放入一份虛構示範。A fictional sample is included." : ""
      }`
    : "這個瀏覽器還沒有會議紀錄。No meetings in this browser yet.";
  byId("list-empty").hidden = count !== 0;
  renderCards();
  document.title = "會議紀錄 Meeting notes";
  window.scrollTo(0, 0);
}

function showMissing() {
  stopVoice({ silent: true });
  document.body.dataset.view = "list";
  byId("editor-view").hidden = true;
  byId("list-view").hidden = false;
  byId("list-message").textContent =
    "找不到這份會議，可能已在這個瀏覽器刪除。This meeting is not in this browser.";
  byId("list-empty").hidden = meetings.length !== 0;
  renderCards();
  document.title = "會議紀錄 Meeting notes";
}

function showEditor(meeting) {
  document.body.dataset.view = "editor";
  byId("list-view").hidden = true;
  byId("editor-view").hidden = false;
  writeEditor(meeting, { resetImport: true, focus: pendingFocus });
  pendingFocus = null;
  window.scrollTo(0, 0);
}

function renderCards() {
  const list = byId("meeting-list");
  list.replaceChildren();
  const ordered = [...meetings].sort(compareMeetings);
  for (const meeting of ordered) {
    const link = document.createElement("a");
    link.className = "card";
    link.href = `#/m/${encodeURIComponent(meeting.id)}`;
    if (meeting.isSample) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = "示範 Demo";
      link.append(badge);
    }
    const title = document.createElement("span");
    title.className = "card-title";
    title.textContent = meeting.title.trim() || "未命名會議 Untitled";
    const meta = document.createElement("span");
    meta.className = "card-meta";
    const actions = meeting.actions.filter((item) => item.task.trim()).length;
    const bits = [
      formatWhen(meeting.datetime, { compact: true }),
      PLATFORM_LABELS[meeting.platform] || PLATFORM_LABELS.other,
      LANGUAGE_LABELS[meeting.language] || LANGUAGE_LABELS.mixed,
    ];
    if (actions) bits.push(`待辦 ${actions}`);
    meta.textContent = bits.join(" · ");
    const preview = document.createElement("span");
    preview.className = "card-preview";
    preview.textContent = previewLine(meeting);
    link.append(title, meta, preview);
    list.append(link);
  }
}

function showStorageProblem(state) {
  const box = byId("storage-banner");
  box.hidden = false;
  if (state.corrupt) {
    storageCorrupt = true;
    byId("storage-message").textContent =
      "這個瀏覽器裡的舊紀錄讀不出來，頁面沒有覆寫它。Unreadable notes were left untouched.";
    byId("storage-reset").hidden = false;
    return;
  }
  byId("storage-message").textContent =
    "這個瀏覽器未能儲存資料。你仍可整理筆記，但重新整理頁面可能會失去內容，請下載 Markdown。This browser could not store data. Download Markdown before you leave.";
  byId("storage-reset").hidden = true;
}

function writeEditor(meeting, { resetImport = false, focus = null } = {}) {
  hydrating = true;
  byId("title").value = meeting.title;
  byId("when").value = meeting.datetime;
  byId("platform").value = meeting.platform;
  byId("language").value = meeting.language;
  byId("attendees").value = meeting.attendees;
  byId("agenda").value = meeting.agenda;
  byId("discussion").value = meeting.discussion;
  byId("decisions").value = meeting.decisions;
  byId("sample-flag").hidden = !meeting.isSample;
  byId("sample-note").hidden = !meeting.isSample;
  const actionList = byId("action-list");
  actionList.replaceChildren();
  for (const action of meeting.actions) addActionRow(action);
  fillCues(meeting);
  byId("draft-btn").disabled = meeting.cues.length === 0;
  byId("clear-transcript").disabled = !(meeting.cues.length || meeting.transcript);
  if (meeting.isSample && meeting.cues.length) byId("transcript-details").open = true;
  if (resetImport) {
    stopVoice({ silent: true });
    byId("paste").value = "";
    byId("file").value = "";
    byId("file-name").textContent = "";
    byId("consent").checked = false;
    byId("voice-cloud").checked = false;
    pickedFile = null;
    setLive(byId("import-status"), "", "");
    if (voiceSupported) setLive(byId("voice-status"), "", "");
    else restoreUnsupportedVoiceMessage();
  }
  hydrating = false;
  refreshImportButton();
  syncHeading();
  if (focus === "title") byId("title").focus();
}

function addActionRow(action, { focus = false } = {}) {
  const row = document.createElement("div");
  row.className = "action-row";
  row.dataset.id = action.id || newId();

  const task = document.createElement("input");
  task.type = "text";
  task.className = "task";
  task.value = action.task || "";
  task.maxLength = 2000;
  task.placeholder = "要做的事 What to do";
  task.setAttribute("aria-label", "待辦 Task");

  const owner = document.createElement("input");
  owner.type = "text";
  owner.className = "owner";
  owner.value = action.owner || "";
  owner.maxLength = 80;
  owner.placeholder = "負責人 Owner";
  owner.setAttribute("aria-label", "負責人 Owner");

  const due = document.createElement("input");
  due.type = "date";
  due.className = "due";
  due.value = action.due || "";
  due.setAttribute("aria-label", "截止日期 Due");

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "ghost danger";
  remove.textContent = "移除 Remove";

  const onRowEdit = () => {
    if (!hydrating) scheduleSave();
  };
  task.addEventListener("input", onRowEdit);
  owner.addEventListener("input", onRowEdit);
  due.addEventListener("change", onRowEdit);
  remove.addEventListener("click", () => {
    row.remove();
    scheduleSave();
  });
  row.append(task, owner, due, remove);
  byId("action-list").append(row);
  if (focus) task.focus();
}

function fillCues(meeting) {
  const list = byId("cue-list");
  list.replaceChildren();
  const summary = byId("transcript-summary");
  const bits = ["轉錄 Transcript"];
  const format = formatLabel(meeting.transcriptFormat);
  if (format) bits.push(format);
  bits.push(String(meeting.cues.length));
  summary.textContent = bits.join(" · ");
  byId("transcript-details").hidden = meeting.cues.length === 0;
  for (const cue of meeting.cues) {
    const item = document.createElement("li");
    const time = document.createElement("span");
    time.className = "cue-time";
    time.textContent = cue.start ? cue.start.slice(0, 8) : "—";
    const who = document.createElement("span");
    who.className = "cue-who";
    who.textContent = cue.speaker || "—";
    const text = document.createElement("span");
    text.className = "cue-text";
    text.textContent = cue.text;
    item.append(time, who, text);
    list.append(item);
  }
}

function syncHeading() {
  const title = byId("title").value.trim() || "未命名會議 Untitled";
  byId("editor-heading").textContent = title;
  if (document.body.dataset.view === "editor") document.title = `會議紀錄 — ${title}`;
}

function refreshImportButton() {
  const ready = byId("consent").checked && (byId("paste").value.trim().length > 0 || pickedFile);
  byId("import-btn").disabled = !ready;
  refreshVoiceButton();
}

function voiceGatesOpen() {
  return byId("consent").checked && byId("voice-cloud").checked;
}

function onVoiceGateChange() {
  if (voiceListening && !voiceGatesOpen()) stopVoice();
  refreshImportButton();
}

function unsupportedVoiceMessage() {
  return "此瀏覽器不支援語音輸入。請貼上或上傳轉錄檔。Voice input is not supported here — paste or upload a transcript.";
}

function restoreUnsupportedVoiceMessage() {
  setLive(byId("voice-status"), unsupportedVoiceMessage(), "");
}

function setupVoiceSupport() {
  const Ctor = getSpeechRecognitionCtor();
  voiceSupported = Boolean(Ctor);
  const label = byId("voice-cloud-label");
  const btn = byId("voice-btn");
  if (!voiceSupported) {
    label.hidden = true;
    btn.hidden = true;
    restoreUnsupportedVoiceMessage();
    return;
  }
  label.hidden = false;
  btn.hidden = false;
  refreshVoiceButton();
}

function refreshVoiceButton() {
  const btn = byId("voice-btn");
  if (!voiceSupported) {
    btn.disabled = true;
    btn.setAttribute("aria-pressed", "false");
    btn.classList.remove("listening");
    btn.textContent = "語音輸入 Voice";
    return;
  }
  const canStart = byId("consent").checked && byId("voice-cloud").checked;
  btn.disabled = voiceListening ? false : !canStart;
  btn.setAttribute("aria-pressed", voiceListening ? "true" : "false");
  btn.classList.toggle("listening", voiceListening);
  btn.textContent = voiceListening ? "停止語音 Stop voice" : "語音輸入 Voice";
}

function onVoiceToggle() {
  if (!voiceSupported) return;
  if (voiceListening) {
    stopVoice();
    return;
  }
  if (!byId("consent").checked) {
    setLive(
      byId("voice-status"),
      "請先確認與會者已知悉錄音或轉錄已開啟。Confirm that participants were told recording or transcription was on.",
      "error",
    );
    return;
  }
  if (!byId("voice-cloud").checked) {
    setLive(
      byId("voice-status"),
      "請先確認你明白瀏覽器語音辨識可能把音訊送到供應商。Confirm you understand browser speech recognition may send audio to its vendor.",
      "error",
    );
    return;
  }
  startVoice();
}

function commitDictationText(text) {
  const body = String(text || "").trim();
  if (!body) return;
  const speaker = firstAttendeeName(byId("attendees").value);
  const line = formatDictationLine(body, { speaker, at: new Date() });
  byId("paste").value = appendDictationLine(byId("paste").value, line);
  // Keep a chosen Zoom/Teams file selected; Import still prefers the file.
  refreshImportButton();
}

function startVoice() {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor || !voiceGatesOpen()) return;
  stopVoice({ silent: true });
  const session = new Ctor();
  recognition = session;
  session.continuous = true;
  session.interimResults = true;
  session.lang = speechLocale(byId("language").value);
  session.onstart = () => {
    if (recognition !== session) return;
    voiceListening = true;
    refreshVoiceButton();
    setLive(
      byId("voice-status"),
      `正在聽（${session.lang}）…說完後按「停止語音」，再按匯入。Listening (${session.lang})… press Stop, then Import.`,
      "ok",
    );
  };
  session.onresult = (event) => {
    const { finalText, interimText } = bestTranscriptFromEvent(event);
    if (finalText) {
      commitDictationText(finalText);
      setLive(
        byId("voice-status"),
        pickedFile
          ? "已寫入貼上欄（仍保留已選檔案）。Added to paste; chosen file kept."
          : "已寫入貼上欄。可繼續說，或按停止後匯入。Added to paste. Keep talking, or stop and import.",
        "ok",
      );
    }
    if (interimText) {
      setLive(byId("voice-status"), `辨識中… ${interimText}`, "ok");
    }
  };
  session.onerror = (event) => {
    const code = event?.error || "error";
    if (code === "aborted") return;
    if (recognition === session) {
      recognition = null;
      voiceListening = false;
      refreshVoiceButton();
    }
    const hint =
      code === "not-allowed"
        ? "瀏覽器拒絕麥克風。請允許本頁使用麥克風後再試。Microphone permission denied."
        : code === "no-speech"
          ? "沒有聽到語音，可再按語音輸入。No speech heard — try again."
          : `語音輸入失敗（${code}）。Voice input failed (${code}).`;
    setLive(byId("voice-status"), hint, "error");
  };
  session.onend = () => {
    if (recognition === session) {
      recognition = null;
      voiceListening = false;
      refreshVoiceButton();
      if (byId("paste").value.trim()) {
        setLive(byId("voice-status"), "語音已停止。檢查貼上欄後按匯入。Voice stopped. Check paste, then Import.", "ok");
      }
    }
  };
  try {
    session.start();
  } catch {
    if (recognition === session) recognition = null;
    voiceListening = false;
    refreshVoiceButton();
    setLive(byId("voice-status"), "無法開始語音輸入。Could not start voice input.", "error");
  }
}

function stopVoice({ silent = false } = {}) {
  const session = recognition;
  recognition = null;
  voiceListening = false;
  refreshVoiceButton();
  if (!session) {
    if (!silent && voiceSupported) setLive(byId("voice-status"), "", "");
    return;
  }
  // Keep onresult until stop() finishes so the in-flight phrase is committed.
  try {
    session.onerror = null;
    const previousEnd = session.onend;
    session.onend = () => {
      session.onresult = null;
      session.onend = null;
      if (typeof previousEnd === "function") previousEnd();
      if (!silent) setLive(byId("voice-status"), "語音已停止。Voice stopped.", "ok");
    };
    session.stop();
  } catch {
    try {
      session.abort();
    } catch {
      /* ignore */
    }
    session.onresult = null;
    session.onend = null;
    if (!silent) setLive(byId("voice-status"), "語音已停止。Voice stopped.", "ok");
  }
}

function restartVoiceForLanguage() {
  if (!voiceListening) return;
  if (!voiceGatesOpen()) {
    stopVoice();
    return;
  }
  startVoice();
}

function firstAttendeeName(value) {
  const first = String(value || "")
    .split(/[,，、;/|]+/)
    .map((part) => part.trim())
    .find(Boolean);
  return first || "";
}

async function onFile() {
  if (hydrating) return;
  const token = ++fileToken;
  const file = byId("file").files?.[0];
  pickedFile = null;
  byId("file-name").textContent = "";
  if (!file) {
    refreshImportButton();
    return;
  }
  if (file.size > MAX_FILE_BYTES) {
    byId("file").value = "";
    setLive(byId("import-status"), "檔案超過 2 MB。This file is larger than 2 MB.", "error");
    refreshImportButton();
    return;
  }
  try {
    const text = await file.text();
    if (token !== fileToken) return;
    pickedFile = { name: file.name, text };
    byId("file-name").textContent = file.name;
    setLive(byId("import-status"), `已讀取 ${file.name}。File read. Press import.`, "ok");
  } catch {
    if (token !== fileToken) return;
    byId("file").value = "";
    setLive(byId("import-status"), "讀不到這個檔案。Could not read this file.", "error");
  }
  refreshImportButton();
}

function onImport() {
  flushSave();
  const meeting = current();
  if (!meeting) return;
  if (!byId("consent").checked) {
    setLive(
      byId("import-status"),
      "請先確認與會者已知悉錄音或轉錄已開啟。Confirm that participants were told recording or transcription was on.",
      "error",
    );
    return;
  }
  const source = pickedFile ? pickedFile.text : byId("paste").value;
  const filename = pickedFile ? pickedFile.name : "pasted.txt";
  if (!String(source || "").trim()) {
    setLive(byId("import-status"), "請貼上文字或選擇檔案。Paste text or choose a file.", "error");
    return;
  }
  if ((meeting.transcript || meeting.cues.length) && !confirmReplaceTranscript()) return;
  let parsed;
  try {
    parsed = parseTranscript(source, filename);
  } catch (error) {
    setLive(byId("import-status"), error.message || "匯入失敗。Import failed.", "error");
    return;
  }
  meeting.transcript = source;
  meeting.transcriptFormat = parsed.format;
  meeting.cues = parsed.cues;
  meeting.consent = true;
  meeting.updatedAt = Date.now();
  let drafted = false;
  if (isNotesEmpty(meeting)) {
    applyDraft(meeting, parsed.cues);
    drafted = true;
  }
  const index = meetings.findIndex((item) => item.id === meeting.id);
  meetings[index] = meeting;
  writeEditor(meeting, { resetImport: true });
  const saved = flushSave();
  byId("transcript-details").open = true;
  const warnings = parsed.warnings.length ? ` ${parsed.warnings.join(" ")}` : "";
  const draftNote = drafted ? " 已填入草稿，請核對。A draft was added — please check it." : " 筆記未有覆蓋。Notes were left as they were.";
  const saveNote = saved.ok ? "" : " 儲存失敗。Could not save.";
  setLive(
    byId("import-status"),
    `已匯入 ${filename}，${parsed.cues.length} 段（${formatLabel(parsed.format)}）。Imported ${parsed.cues.length} cues from ${filename}.${draftNote}${warnings}${saveNote}`,
    saved.ok ? "ok" : "error",
  );
}

function onDraft() {
  flushSave();
  const meeting = current();
  if (!meeting || !meeting.cues.length) return;
  if (!isNotesEmpty(meeting)) {
    const ok = confirm("用轉錄草稿取代現有筆記？\nReplace the current notes with a draft from the transcript?");
    if (!ok) return;
  }
  applyDraft(meeting, meeting.cues);
  meeting.updatedAt = Date.now();
  writeEditor(meeting, { resetImport: false });
  flushSave();
  setLive(byId("import-status"), "已填入草稿，請核對。Draft added — please check it.", "ok");
}

function onClearTranscript() {
  flushSave();
  const meeting = current();
  if (!meeting || !(meeting.transcript || meeting.cues.length)) return;
  const ok = confirm("清除轉錄？筆記會保留。\nClear the transcript? Notes stay.");
  if (!ok) return;
  meeting.transcript = "";
  meeting.transcriptFormat = "";
  meeting.cues = [];
  meeting.updatedAt = Date.now();
  writeEditor(meeting, { resetImport: true });
  flushSave();
  setLive(byId("import-status"), "已清除轉錄。Transcript cleared.", "ok");
}

function onNew() {
  flushSave();
  const meeting = blankMeeting();
  meetings.unshift(meeting);
  const saved = saveMeetings(meetings);
  if (!saved.ok) showStorageProblem({ corrupt: false, ok: false });
  pendingFocus = "title";
  go(`#/m/${meeting.id}`);
}

function onRestoreSample() {
  flushSave();
  const existing = meetings.find((item) => item.id === SAMPLE_ID);
  if (!existing) {
    meetings.unshift(createSampleMeeting());
    const saved = saveMeetings(meetings);
    if (!saved.ok) showStorageProblem({ corrupt: false, ok: false });
  }
  go(`#/m/${SAMPLE_ID}`);
}

function onDelete() {
  flushSave();
  const meeting = current();
  if (!meeting) return;
  const label = meeting.title.trim() || "未命名會議";
  const ok = confirm(`刪除「${label}」？只會從這個瀏覽器移除。\nDelete “${label}” from this browser?`);
  if (!ok) return;
  meetings = meetings.filter((item) => item.id !== meeting.id);
  saveMeetings(meetings);
  currentId = null;
  byId("list-message").dataset.seeded = "false";
  go("#/");
}

function onClearAll() {
  const ok = confirm(
    "清除這個瀏覽器裡的全部會議紀錄？此動作不能復原。\nClear every meeting stored in this browser? This cannot be undone.",
  );
  if (!ok) return;
  currentId = null;
  meetings = [];
  const saved = saveMeetings(meetings);
  if (!saved.ok) showStorageProblem({ corrupt: false, ok: false });
  byId("list-message").dataset.seeded = "false";
  go("#/");
}

function onStorageReset() {
  const ok = confirm("清除讀不出的資料，並放回示範會議？\nReplace unreadable saved data with the sample meeting?");
  if (!ok) return;
  meetings = [createSampleMeeting()];
  const saved = saveMeetings(meetings);
  storageCorrupt = !saved.ok;
  if (saved.ok) byId("storage-banner").hidden = true;
  else showStorageProblem({ corrupt: false, ok: false });
  currentId = null;
  byId("list-message").dataset.seeded = "true";
  go("#/");
}

function downloadMarkdown() {
  flushSave();
  const meeting = current();
  if (!meeting) return;
  const blob = new Blob([toMarkdown(meeting)], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = markdownFilename(meeting);
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  setSaveStatusText("已下載 Markdown。Markdown downloaded.", "ok");
}

async function copyMarkdown() {
  flushSave();
  const meeting = current();
  if (!meeting) return;
  const markdown = toMarkdown(meeting);
  try {
    await navigator.clipboard.writeText(markdown);
    setSaveStatusText("已複製。Copied.", "ok");
  } catch {
    byId("copy-fallback").value = markdown;
    byId("copy-dialog").showModal();
    byId("copy-fallback").focus();
    byId("copy-fallback").select();
    byId("copy-fallback").scrollTop = 0;
  }
}

function buildPrintSheet() {
  const sheet = byId("print-sheet");
  sheet.replaceChildren();
  if (document.body.dataset.view !== "editor") return;
  flushSave();
  const meeting = current();
  if (!meeting) return;
  const heading = document.createElement("h2");
  heading.textContent = meeting.title.trim() || "未命名會議 Untitled";
  const meta = document.createElement("p");
  meta.textContent = [
    formatWhen(meeting.datetime),
    PLATFORM_LABELS[meeting.platform] || PLATFORM_LABELS.other,
    LANGUAGE_LABELS[meeting.language] || LANGUAGE_LABELS.mixed,
  ].join(" · ");
  sheet.append(heading, meta);
  if (meeting.attendees.trim()) {
    const people = document.createElement("p");
    people.textContent = `與會者 Attendees：${meeting.attendees.trim()}`;
    sheet.append(people);
  }
  addPrintBlock(sheet, "議程 Agenda", meeting.agenda);
  addPrintBlock(sheet, "討論 Discussion", meeting.discussion);
  addPrintBlock(sheet, "決定 Decisions", meeting.decisions);
  const actions = document.createElement("section");
  const title = document.createElement("h3");
  title.textContent = "待辦 Action items";
  const list = document.createElement("ul");
  const items = meeting.actions.filter((item) => item.task.trim() || item.owner.trim() || item.due);
  if (!items.length) {
    const empty = document.createElement("li");
    empty.textContent = "（未填）";
    list.append(empty);
  } else {
    for (const item of items) {
      const row = document.createElement("li");
      const owner = item.owner.trim() ? ` — ${item.owner.trim()}` : "";
      const due = item.due ? ` · ${item.due}` : "";
      row.textContent = `${item.task.trim() || "（未寫任務）"}${owner}${due}`;
      list.append(row);
    }
  }
  actions.append(title, list);
  const foot = document.createElement("p");
  foot.className = "print-foot";
  foot.textContent =
    "只收錄已向與會者說明正在錄音或轉錄的會議。Only transcripts from meetings where participants were told recording or transcription was on.";
  sheet.append(actions, foot);
}

function addPrintBlock(parent, title, value) {
  const section = document.createElement("section");
  const heading = document.createElement("h3");
  heading.textContent = title;
  const body = document.createElement("p");
  body.className = "print-copy";
  body.textContent = String(value || "").trim() || "（未填）";
  section.append(heading, body);
  parent.append(section);
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 250);
}

function flushSave() {
  clearTimeout(saveTimer);
  if (hydrating || !currentId) return { ok: true };
  const index = meetings.findIndex((item) => item.id === currentId);
  if (index < 0) return { ok: true };
  if (byId("editor-view").hidden) return { ok: true };
  meetings[index] = readMeetingFromDom(meetings[index]);
  const saved = saveMeetings(meetings);
  if (!saved.ok) showStorageProblem({ corrupt: false, ok: false });
  else if (!storageCorrupt) byId("storage-banner").hidden = true;
  setSaveStatusText(
    saved.ok
      ? "已儲存在這個瀏覽器。Saved in this browser."
      : "儲存失敗，請先下載 Markdown。Could not save. Download Markdown so you keep a copy.",
    saved.ok ? "ok" : "error",
  );
  return saved;
}

function readMeetingFromDom(existing) {
  return {
    ...existing,
    title: clip(byId("title").value, 200),
    datetime: byId("when").value.slice(0, 16),
    platform: choice(byId("platform").value, ["zoom", "teams", "other"], existing.platform),
    language: choice(byId("language").value, ["zh", "en", "mixed"], existing.language),
    attendees: clip(byId("attendees").value, 500),
    agenda: clip(byId("agenda").value, 100000),
    discussion: clip(byId("discussion").value, 100000),
    decisions: clip(byId("decisions").value, 100000),
    actions: readActions(),
    updatedAt: Date.now(),
  };
}

function readActions() {
  return [...document.querySelectorAll("#action-list .action-row")].map((row) => ({
    id: row.dataset.id || newId(),
    task: clip(row.querySelector(".task").value, 2000),
    owner: clip(row.querySelector(".owner").value, 80),
    due: row.querySelector(".due").value,
  }));
}

function applyDraft(meeting, cues) {
  const draft = draftNotes(cues);
  meeting.agenda = draft.agenda;
  meeting.discussion = draft.discussion;
  meeting.decisions = draft.decisions;
  meeting.actions = draft.actions;
}

function isNotesEmpty(meeting) {
  return (
    !String(meeting.agenda || "").trim() &&
    !String(meeting.discussion || "").trim() &&
    !String(meeting.decisions || "").trim() &&
    !(meeting.actions || []).some((item) => String(item.task || "").trim() || String(item.owner || "").trim())
  );
}

function confirmReplaceTranscript() {
  return confirm("用新的轉錄取代現有轉錄？已寫好的筆記不會自動覆蓋。\nReplace the saved transcript? Notes stay until you draft again.");
}

function current() {
  return meetings.find((item) => item.id === currentId) || null;
}

function parseRoute() {
  let hash = location.hash || "#/";
  try {
    hash = decodeURIComponent(hash);
  } catch {
    return { name: "list" };
  }
  const match = hash.match(/^#\/m\/([A-Za-z0-9_-]+)$/);
  if (!match) return { name: "list" };
  return { name: "editor", id: match[1] };
}

function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

function compareMeetings(a, b) {
  const left = a.datetime || "";
  const right = b.datetime || "";
  if (left !== right) return left < right ? 1 : -1;
  return (b.updatedAt || 0) - (a.updatedAt || 0);
}

function previewLine(meeting) {
  const source = meeting.decisions || meeting.discussion || meeting.agenda || "";
  const line = source
    .split("\n")
    .map((item) => item.replace(/^-\s*/, "").trim())
    .find(Boolean);
  if (!line) return "尚未寫筆記。No notes yet.";
  return line.length > 140 ? `${line.slice(0, 139)}…` : line;
}

function setSaveStatusText(message, state) {
  setLive(byId("save-status"), message, state);
}

function setLive(node, message, state) {
  node.textContent = message;
  if (state) node.dataset.state = state;
  else delete node.dataset.state;
}

function choice(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function clip(value, max) {
  const text = String(value ?? "");
  return text.length > max ? text.slice(0, max) : text;
}

init();
