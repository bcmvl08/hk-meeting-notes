import { parseTranscript } from "./parse.js";

export const SAMPLE_ID = "sample-demo-community-weekly";

export const SAMPLE_VTT = [
  "WEBVTT",
  "",
  "NOTE fictional sample for hk-meeting-notes. Not a real recording.",
  "",
  "00:00:01.000 --> 00:00:08.000",
  "Benny: 各位，今次 Zoom 已顯示正在錄音和轉錄，大家都知悉。我們先過議程：頁面風格、待辦負責人、下週發佈。",
  "",
  "00:00:08.500 --> 00:00:14.000",
  "Ada: Agenda is short. I will own the README, including how to turn on GitHub Pages from the main branch root.",
  "",
  "00:00:14.500 --> 00:00:21.000",
  "Chris: 手機版我負責。頁面要像紙本，窄螢幕可以單欄。我星期五前看完。",
  "",
  "00:00:21.500 --> 00:00:28.000",
  "Benny: 決定：筆記只放在瀏覽器本地，不設後端。轉錄必須來自已披露的錄音。",
  "",
  "00:00:28.500 --> 00:00:35.000",
  "Ada: Agreed. Action item: I will send the Pages checklist to Benny by 2026-10-10.",
  "",
  "00:00:35.500 --> 00:00:42.000",
  "Chris: 我負責行動項目：檢查匯出 Markdown 和列印。截止 2026-10-11。",
  "",
].join("\n");

export function createSampleMeeting(now = Date.now()) {
  const parsed = parseTranscript(SAMPLE_VTT, "demo-meeting.vtt");
  return {
    id: SAMPLE_ID,
    title: "示範：社區站週會",
    datetime: "2026-10-08T15:00",
    platform: "zoom",
    language: "mixed",
    attendees: "Benny、Ada、Chris",
    consent: true,
    transcript: SAMPLE_VTT,
    transcriptFormat: parsed.format,
    cues: parsed.cues,
    agenda: ["- 頁面紙本風格，窄螢幕單欄", "- 待辦由誰負責", "- 下週用 GitHub Pages 從 main 根目錄發佈"].join("\n"),
    discussion: [
      "- Benny：Zoom 已顯示正在錄音和轉錄，與會者知悉。筆記只放在瀏覽器，不設後端。",
      "- Ada：README 要寫怎樣開啟 GitHub Pages，以及怎樣匯入轉錄。",
      "- Chris：手機版維持紙本單欄，並檢查 Markdown 匯出和列印。",
    ].join("\n"),
    decisions: [
      "- 不設後端，會議內容只留在這個瀏覽器的 localStorage。",
      "- 只匯入已向與會者披露錄音或轉錄的會議，不做秘密錄音。",
    ].join("\n"),
    actions: [
      {
        id: "sample-action-readme",
        task: "撰寫 README：怎樣從 main 根目錄開啟 GitHub Pages，以及怎樣匯入 Zoom / Teams 轉錄，並把檢查清單交給 Benny",
        owner: "Ada",
        due: "2026-10-10",
      },
      {
        id: "sample-action-mobile",
        task: "檢查手機版單欄、Markdown 匯出和列印",
        owner: "Chris",
        due: "2026-10-11",
      },
    ],
    isSample: true,
    createdAt: now,
    updatedAt: now,
  };
}
