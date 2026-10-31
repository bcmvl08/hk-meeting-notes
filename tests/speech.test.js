import assert from "node:assert/strict";
import test from "node:test";

import {
  appendDictationLine,
  bestTranscriptFromEvent,
  formatDictationLine,
  formatDictationStamp,
  getSpeechRecognitionCtor,
  speechLocale,
} from "../js/speech.js";

test("speechLocale maps meeting language to Hong Kong locales", () => {
  assert.equal(speechLocale("zh"), "zh-HK");
  assert.equal(speechLocale("en"), "en-HK");
  assert.equal(speechLocale("mixed"), "zh-HK");
  assert.equal(speechLocale("unknown"), "zh-HK");
});

test("formatDictationStamp uses Hong Kong time, not the machine zone", () => {
  // 01:05:07Z is 09:05:07 in Asia/Hong_Kong (UTC+8, no DST).
  const stamp = formatDictationStamp(new Date("2026-10-29T01:05:07.000Z"));
  assert.equal(stamp, "[09:05:07]");
});

test("formatDictationLine builds timestamped paste lines", () => {
  const at = new Date("2026-10-29T06:30:00.000Z"); // 14:30:00 HKT
  assert.equal(formatDictationLine("  下週發佈。 ", { at }), "[14:30:00] 下週發佈。");
  assert.equal(
    formatDictationLine("Agreed.", { speaker: "Benny", at }),
    "[14:30:00] Benny: Agreed.",
  );
  assert.equal(formatDictationLine("   ", { at }), "");
});

test("appendDictationLine joins with one newline, or a blank line after VTT", () => {
  assert.equal(appendDictationLine("", "[01:00:00] Hello"), "[01:00:00] Hello");
  assert.equal(
    appendDictationLine("[01:00:00] Hello\n", "[01:00:05] Next"),
    "[01:00:00] Hello\n[01:00:05] Next",
  );
  const vttTail = "00:00:35.500 --> 00:00:42.000\nChris: 檢查匯出。";
  assert.equal(
    appendDictationLine(vttTail, "[14:30:00] Benny: 補充"),
    `${vttTail}\n\n[14:30:00] Benny: 補充`,
  );
});

test("bestTranscriptFromEvent splits final and interim text", () => {
  const event = {
    resultIndex: 0,
    results: [
      { isFinal: true, 0: { transcript: "決定發佈" } },
      { isFinal: false, 0: { transcript: "下週" } },
    ],
  };
  assert.deepEqual(bestTranscriptFromEvent(event), {
    finalText: "決定發佈",
    interimText: "下週",
  });
});

test("getSpeechRecognitionCtor reads standard or webkit constructors", () => {
  assert.equal(getSpeechRecognitionCtor({}), null);
  function Fake() {}
  assert.equal(getSpeechRecognitionCtor({ SpeechRecognition: Fake }), Fake);
  assert.equal(getSpeechRecognitionCtor({ webkitSpeechRecognition: Fake }), Fake);
});
