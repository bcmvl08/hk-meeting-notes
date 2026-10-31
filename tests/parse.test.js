import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  ParseError,
  draftNotes,
  markdownFilename,
  parseTranscript,
  toMarkdown,
} from "../js/parse.js";
import { SAMPLE_VTT, createSampleMeeting } from "../js/sample.js";

test("sample vtt file matches the embedded sample", () => {
  const disk = fs.readFileSync(new URL("../samples/demo-meeting.vtt", import.meta.url), "utf8");
  assert.equal(disk.replace(/\r\n/g, "\n"), SAMPLE_VTT);
});

test("sample meeting parses six disclosed cues and exports markdown", () => {
  const meeting = createSampleMeeting(1_700_000_000_000);
  assert.equal(meeting.isSample, true);
  assert.equal(meeting.transcriptFormat, "vtt");
  assert.deepEqual(
    meeting.cues.map((cue) => cue.speaker),
    ["Benny", "Ada", "Chris", "Benny", "Ada", "Chris"],
  );
  assert.equal(meeting.cues[0].start, "00:00:01.000");
  const markdown = toMarkdown(meeting);
  assert.match(markdown, /## 議程 Agenda/);
  assert.match(markdown, /## 討論 Discussion/);
  assert.match(markdown, /## 決定 Decisions/);
  assert.match(markdown, /## 待辦 Action items/);
  assert.match(markdown, /Ada/);
  assert.match(markdown, /2026-10-10/);
  assert.match(markdown, /已向與會者說明/);
  assert.equal(markdownFilename(meeting), "2026-10-08-示範-社區站週會.md");
});

test("draft pulls decisions, owners, and due dates from the sample", () => {
  const { cues } = parseTranscript(SAMPLE_VTT, "demo-meeting.vtt");
  const draft = draftNotes(cues);
  assert.match(draft.agenda, /議程|Agenda/);
  assert.match(draft.decisions, /決定/);
  assert.match(draft.decisions, /Agreed/);
  assert.ok(draft.actions.some((item) => item.owner === "Ada" && item.due === "2026-10-10"));
  assert.ok(draft.actions.some((item) => item.owner === "Chris" && item.due === "2026-10-11"));
});

test("parses WebVTT voice tags and entities", () => {
  const parsed = parseTranscript(
    "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n<v Ada>Hello &amp; welcome</v><v Ben>Yo</v>\n",
    "captions.vtt",
  );
  assert.equal(parsed.format, "vtt");
  assert.equal(parsed.cues.length, 2);
  assert.equal(parsed.cues[0].speaker, "Ada");
  assert.equal(parsed.cues[0].text, "Hello & welcome");
  assert.equal(parsed.cues[1].speaker, "Ben");
  assert.equal(parsed.cues[1].text, "Yo");
});

test("parses SRT timestamps and a Zoom-style speaker line", () => {
  const parsed = parseTranscript(
    "1\n00:00:01,000 --> 00:00:04,000\nMina: 早上好\n\n2\n00:00:04,500 --> 00:00:08,000\nTom: Morning\n",
    "meeting.srt",
  );
  assert.equal(parsed.format, "srt");
  assert.equal(parsed.cues[0].start, "00:00:01.000");
  assert.equal(parsed.cues[0].speaker, "Mina");
  assert.equal(parsed.cues[0].text, "早上好");
  assert.equal(parsed.cues[1].speaker, "Tom");
});

test("parses plain text, bracket timestamps, and does not treat URLs as speakers", () => {
  const parsed = parseTranscript(
    "Ada: 下週發佈。\n\n[00:01:02] Benny: 好。\n\nhttps://example.com/notes\n",
    "notes.txt",
  );
  assert.equal(parsed.format, "text");
  assert.equal(parsed.cues[0].speaker, "Ada");
  assert.equal(parsed.cues[1].speaker, "Benny");
  assert.equal(parsed.cues[1].start, "00:01:02.000");
  assert.equal(parsed.cues[1].text, "好。");
  assert.equal(parsed.cues[2].speaker, "");
  assert.match(parsed.cues[2].text, /example.com/);
});

test("keeps a bracket line that is not JSON", () => {
  const parsed = parseTranscript("[Benny] 你好", "notes.txt");
  assert.equal(parsed.format, "text");
  assert.match(parsed.cues[0].text, /Benny/);
});

test("parses simple JSON shapes", () => {
  const array = parseTranscript(
    JSON.stringify([{ name: "Lee", text: "收到", start: "00:01:02.000" }]),
    "transcript.json",
  );
  assert.equal(array.cues[0].speaker, "Lee");
  assert.equal(array.cues[0].start, "00:01:02.000");

  const utterances = parseTranscript(
    JSON.stringify({
      utterances: [{ speaker: "Mina", transcript: "Hello", start_time: 1.5, end_time: 3 }],
    }),
  );
  assert.equal(utterances.cues[0].speaker, "Mina");
  assert.equal(utterances.cues[0].start, "00:00:01.500");
  assert.equal(utterances.cues[0].end, "00:00:03.000");

  const results = parseTranscript(
    JSON.stringify({
      results: [{ speaker: "Lee", start: "00:00:02.000", alternatives: [{ transcript: "收到" }] }],
    }),
  );
  assert.equal(results.cues[0].text, "收到");

  const entries = parseTranscript(
    JSON.stringify({
      entries: [{ speakerDisplayName: "Ada", text: "Hi", startTime: "00:00:04.000" }],
    }),
  );
  assert.equal(entries.cues[0].speaker, "Ada");
  assert.equal(entries.cues[0].start, "00:00:04.000");

  const embedded = parseTranscript(JSON.stringify({ transcript: "Ada: 好\n\nBenny: 行" }), "notes.json");
  assert.deepEqual(
    embedded.cues.map((cue) => cue.speaker),
    ["Ada", "Benny"],
  );
});

test("rejects empty input, invalid JSON, binary files, and oversized text", () => {
  assert.throws(() => parseTranscript("   "), ParseError);
  assert.throws(() => parseTranscript("{", "bad.json"), /JSON/);
  assert.throws(() => parseTranscript("hi\u0000there"), /文字檔|text/);
  assert.throws(() => parseTranscript("a".repeat(1_500_001)), /太大|too large/);
  assert.throws(() => parseTranscript("WEBVTT\n\nNOTE only\n"), /字幕|cue/);
});

test("strips a byte order mark and accepts Windows newlines", () => {
  const parsed = parseTranscript("\uFEFFWEBVTT\r\n\r\n00:00:01.000 --> 00:00:02.000\r\nAda: 你好\r\n");
  assert.equal(parsed.format, "vtt");
  assert.equal(parsed.cues[0].speaker, "Ada");
  assert.equal(parsed.cues[0].text, "你好");
});

test("does not treat clock times or Note labels as speakers", () => {
  const timed = parseTranscript(
    "[22:38:10] I'll send the budget by 3:15\n[22:38:10] we agreed to meet at 10:30\n[22:38:10] Note: we will publish on Friday.\n",
    "pasted.txt",
  );
  assert.equal(timed.cues[0].speaker, "");
  assert.equal(timed.cues[0].text, "I'll send the budget by 3:15");
  assert.equal(timed.cues[1].speaker, "");
  assert.match(timed.cues[1].text, /10:30/);
  assert.equal(timed.cues[2].speaker, "");
  assert.match(timed.cues[2].text, /^Note:/);

  const named = parseTranscript("[00:01:02] Benny: 好。", "pasted.txt");
  assert.equal(named.cues[0].speaker, "Benny");
  assert.equal(named.cues[0].text, "好。");
});

test("draft skips negated agreement in Cantonese, Mandarin, and English", () => {
  const cues = [
    { speaker: "Ada", text: "我不同意呢個方案" },
    { speaker: "Ada", text: "我唔同意呢個方案" },
    { speaker: "Ada", text: "我哋冇同意延期" },
    { speaker: "Ada", text: "大家都沒有同意" },
    { speaker: "Ada", text: "We have not agreed on the budget" },
    { speaker: "Benny", text: "Agreed. 我們決定星期五發佈。" },
  ];
  const draft = draftNotes(cues);
  assert.equal(draft.decisions.includes("唔同意"), false);
  assert.equal(draft.decisions.includes("冇同意"), false);
  assert.equal(draft.decisions.includes("沒有同意"), false);
  assert.equal(draft.decisions.includes("not agreed"), false);
  assert.equal(draft.decisions.includes("不同意"), false);
  assert.match(draft.decisions, /決定星期五|Agreed/);
});

test("a 40k digit run imports within a linear budget", () => {
  const budgetMs = 200;
  const digits = timeParse("1".repeat(40_000), "pasted.txt");
  assert.equal(digits.parsed.format, "text");
  assert.equal(digits.parsed.cues.length, 1);
  assert.equal(digits.parsed.cues[0].text.length, 10_000);
  assert.ok(
    digits.ms < budgetMs,
    `40k digits took ${digits.ms.toFixed(1)}ms, budget ${budgetMs}ms`,
  );
});

test("a 40k angle-bracket run imports within a linear budget", () => {
  const budgetMs = 200;
  const angles = timeParse("<".repeat(40_000), "pasted.txt");
  assert.equal(angles.parsed.format, "text");
  assert.equal(angles.parsed.cues.length, 1);
  assert.equal(angles.parsed.cues[0].text.length, 10_000);
  assert.ok(
    angles.ms < budgetMs,
    `40k angle brackets took ${angles.ms.toFixed(1)}ms, budget ${budgetMs}ms`,
  );
});

function timeParse(text, filename) {
  const start = performance.now();
  const parsed = parseTranscript(text, filename);
  return { parsed, ms: performance.now() - start };
}

test("dictation after a VTT block becomes its own cue", () => {
  const vtt = `WEBVTT

00:00:35.500 --> 00:00:42.000
Chris: 我負責行動項目：檢查匯出 Markdown 和列印。截止 2026-10-11。

[22:36:55] Benny: 補充：Chris 負責場地
`;
  const parsed = parseTranscript(vtt, "pasted.txt");
  assert.equal(parsed.format, "vtt");
  assert.equal(parsed.cues.length, 2);
  assert.equal(parsed.cues[0].speaker, "Chris");
  assert.equal(parsed.cues[0].text.includes("補充"), false);
  assert.equal(parsed.cues[1].speaker, "Benny");
  assert.match(parsed.cues[1].text, /補充/);
});
