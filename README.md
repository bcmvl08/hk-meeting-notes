# 會議紀錄 Meeting notes

本地優先的靜態網頁。把已經向與會者披露的 Zoom 或 Teams 轉錄，整理成會議紀錄：議程、討論、決定、待辦。內容寫在這個瀏覽器的 `localStorage`，沒有後端，沒有帳號，也不會上傳。

A local-first static site. Turn a Zoom or Teams transcript into meeting notes — agenda, discussion, decisions, and action items — after participants were told that recording or transcription was on. Notes stay in this browser’s `localStorage`. There is no backend, no account, and no upload.

## 私隱 Privacy

只可使用「與會者已知悉正在錄音或轉錄」的會議。Zoom 和 Teams 在錄音或轉錄開啟時都會向會中的人顯示提示。秘密錄音不要放進來。

本站不會連接 Zoom、Teams 或任何付費 API，也不會把音訊或轉錄上傳到本站伺服器。你通常從 Zoom 或 Teams 下載或複製轉錄，再貼上或上傳。可選的「語音輸入」用瀏覽器內建語音辨識，把文字寫進貼上欄；部分瀏覽器（例如 Chrome）會把麥克風音訊送到其供應商。使用前要勾選披露確認，以及明白語音可能由瀏覽器供應商處理。

Use a transcript only when people in the meeting were told that recording or transcription was on. Both Zoom and Teams show an on-screen notice when that happens. Do not bring a secret recording here.

This site does not connect to Zoom, Teams, or any paid API, and it does not upload audio or transcripts to a site server. Usually you download or copy a Zoom or Teams transcript, then paste or upload it. Optional voice input uses the browser’s built-in speech recognition and writes text into the paste box; some browsers (for example Chrome) send microphone audio to their vendor. Before using it, tick the disclosure confirmation and the note that the vendor may process the audio.

## 公開網頁，私人瀏覽器 Public page, private browser

GitHub Pages 上的這個介面是公開的，任何人都可以打開。會議內容只存在你當時使用的那個瀏覽器，除非你自己下載 Markdown 或複製。換電腦、無痕視窗，或清除這個網站的資料之後，紀錄就不會在。

The GitHub Pages interface is public. Anyone can open it. Meeting notes stay in the browser you used unless you download Markdown or copy them. They are not on another computer, in a private window, or in a browser after you clear site data for this origin.

儲存鍵是 `hk-meeting-notes.v1`。第一次打開會放入一份虛構示範會議，讓頁面不是空白。示範可以刪除。

The storage key is `hk-meeting-notes.v1`. The first visit stores one fictional sample meeting so the page is not blank. You can delete it.

## 啟用 GitHub Pages Enable GitHub Pages

網站檔案在儲存庫根目錄（`index.html`）。請用「從分支發佈、資料夾是根目錄」，不要改成 GitHub Actions，除非你自己想換。

The site files live at the repository root (`index.html`). Publish with “Deploy from a branch” and the root folder.

1. 把這份變更合併到 `main`。草稿 PR 合併之前，Pages 不會出現這個版本。Merge this change into `main`. A draft pull request does not update the live site.
2. 打開儲存庫的 **Settings → Pages**。Open the repository **Settings → Pages**.
3. **Build and deployment** 選 **Deploy from a branch**。Under **Build and deployment**, choose **Deploy from a branch**.
4. **Branch** 選 `main`，資料夾選 `/ (root)`，然後 Save。Set **Branch** to `main` and the folder to `/ (root)`, then Save.
5. 等 GitHub 顯示網址，通常是 <https://bcmvl08.github.io/hk-meeting-notes/>。第一次可能要一兩分鐘。Wait until GitHub shows the site URL, usually <https://bcmvl08.github.io/hk-meeting-notes/>. The first time can take a minute or two.

根目錄有一個空的 `.nojekyll`，讓 Pages 直接送出這些檔案，不經 Jekyll。

An empty `.nojekyll` file is in the root so Pages serves the files as they are, without Jekyll.

## 怎樣匯入 How to import

先在本站按「新會議」，填標題、香港時間、平台、語言。與會者可以留空。日期時間請用香港時間填，頁面不會跟電腦時區換算。

勾選「與會者已知悉錄音或轉錄已開啟」之後，才可以貼上、上傳，或用語音輸入。接受 `.txt`、`.vtt`、`.srt`、`.json`。`.docx` 不支援；請改下載 WebVTT，或把文字貼上。單檔上限約 2 MB。

語音輸入（支援的瀏覽器，例如 Chromium）：再勾選「明白瀏覽器語音辨識可能把音訊送到供應商」，按「語音輸入」，對著麥克風說。最終句子會以 `[時:分:秒]` 寫進貼上欄；若「與會者」欄有名字，會用第一個名字當說話者。停止後按「匯入」。語言跟隨會議的「語言」欄（中文／混合 → `zh-HK`，English → `en-HK`）。不支援的瀏覽器會隱藏語音按鈕。

Create a meeting and fill in the title, Hong Kong time, platform, and language. Attendees are optional. Enter the clock time in Hong Kong time; the page does not convert it from your computer’s zone.

The import button stays off until you tick the confirmation that participants were told recording or transcription was on. Paste text, use voice input, or upload `.txt`, `.vtt`, `.srt`, or `.json`. `.docx` is not supported; download WebVTT or paste the text. One file, about 2 MB at most.

Voice input (supported browsers such as Chromium): also tick that you understand browser speech recognition may send audio to its vendor, press **Voice**, and speak. Final phrases land in the paste box as `[HH:MM:SS]` lines; if Attendees has names, the first name is used as the speaker. Stop, then press **Import**. Language follows the meeting Language field (Chinese / mixed → `zh-HK`, English → `en-HK`). Unsupported browsers hide the voice button.

匯入之後可以改議程、討論、決定，以及待辦的負責人與截止日期。「從轉錄整理草稿」會用簡單規則抽出像決定、待辦的句子，不是人工智能摘要，請自己核對。筆記會自動寫進這個瀏覽器。

After import, edit the agenda, discussion, decisions, and each action item’s owner and due date. “Draft from transcript” uses plain rules to lift decision-like and action-like lines. It is not an AI summary. Check it. Notes save themselves in this browser.

下載 Markdown，或複製到剪貼簿。Markdown 含筆記和轉錄摘錄。列印會用適合紙張的版面。

Download Markdown or copy it. The file includes the notes and a transcript excerpt. Print uses a paper layout.

### Zoom

本站不能代你登入 Zoom。請用主持人（或有權限的人）已經下載的檔案。該場會必須已經向與會者披露錄音或轉錄。

This site cannot sign in to Zoom for you. Use a file the host, or someone else allowed to download it, already saved. People in that meeting must already have been told about the recording or transcript.

雲端錄音（主持人已開雲端錄音和音訊轉錄；會中會看到錄音提示）：

Cloud recording, when the host turned on cloud recording and audio transcription. Zoom shows a recording notice in the meeting.

1. 用瀏覽器登入 Zoom，打開 <https://zoom.us/recording>。Sign in on the web and open <https://zoom.us/recording>.
2. 選該場會議。Open that meeting.
3. 下載 **Audio Transcript**，格式通常是 `.vtt`。Download **Audio Transcript**. It is usually a `.vtt` file.
4. 回到本站，勾選確認，上傳該檔或貼上內容。Return here, tick the confirmation, and upload or paste it.

本地錄音資料夾（Zoom 設定裡的本機錄音位置）有時會有 `audio_transcript.vtt`，或曾儲存字幕時的 `meeting_saved_closed_caption.txt`。這兩個也可以匯入。按鈕和檔名會隨 Zoom 版本變動；若畫面上沒有轉錄檔，代表該場沒有產生轉錄，本站也無法替你產生。

A local recording folder (the path in Zoom’s recording settings) sometimes contains `audio_transcript.vtt`, or `meeting_saved_closed_caption.txt` if captions were saved. Those can be imported too. Names move between Zoom versions. If there is no transcript file, that meeting did not produce one, and this site cannot create it.

### Teams

本站不能代你登入 Teams。會議中有人開始轉錄時，Teams 會顯示橫額，與會者看得到。會後：

This site cannot sign in to Teams for you. When someone starts transcription, Teams shows a banner the participants can see. Afterwards:

1. 在行事曆打開該會議，進入 **Recap／重點回顧**。Open the meeting on the calendar and open **Recap**.
2. 打開 **Transcript／轉錄** → **Download／下載** → 選 **WebVTT（.vtt）**。Open **Transcript**, then **Download**, and choose **WebVTT (.vtt)**.
3. 上傳到本站。Upload it here.

若機構關掉了下載，本站沒有權杖，也沒有辦法繞過。請改為在有權限的畫面複製文字，再貼上。

If your organisation turned downloads off, this site has no token and no way around that. Copy the text from a screen you are allowed to open, and paste it.

### 純文字同 JSON Plain text and JSON

純文字可以是：

Plain text can look like this:

```text
Ada: 下週發佈。
Benny: Agreed.
```

或帶時間的一行：`[00:01:02] Benny: 好。`

Or one timestamped line: `[00:01:02] Benny: 好。`

簡單 JSON 可以是句子陣列，或包在 `utterances`、`cues`、`segments`、`results`、`entries`、`transcript` 裡。數字時間當作秒。需要準確時間軸時，請用 `"00:01:02.000"` 這種字串。

Simple JSON can be an array of lines, or an object with `utterances`, `cues`, `segments`, `results`, `entries`, or `transcript`. Numeric times are seconds. For an exact timestamp, prefer a string such as `"00:01:02.000"`.

```json
[
  {"speaker": "Ada", "text": "We will publish on Friday.", "start": "00:10:00.000"}
]
```

`samples/demo-meeting.vtt` 是虛構範例，可以拿來試上傳。頁面初次打開時的示範會議用的是同一段對話。

`samples/demo-meeting.vtt` is a fictional file you can upload as a trial. The sample meeting on a first visit uses the same conversation.

## 本機預覽 Preview on your computer

不要直接雙擊 `index.html`（瀏覽器會擋住模組腳本）。在儲存庫根目錄執行：

Do not double-click `index.html`. Browsers block module scripts on `file://`. From the repository root:

```bash
python3 -m http.server 4173
```

然後打開 <http://127.0.0.1:4173/>。

Then open <http://127.0.0.1:4173/>.

檢查轉錄解析：

Check the transcript parser:

```bash
node --test tests/*.test.js
```

## 不做的事 Out of scope

- 不錄影、不擷取他人的會議畫面，也不代開 Zoom／Teams 雲端錄音。No video capture, no capture of other people’s meeting screens, and no Zoom/Teams cloud recording on your behalf.
- 可選語音輸入只把辨識文字寫進貼上欄；本站不保存麥克風音訊檔。Optional voice input only writes recognised text into the paste box; this site does not keep microphone audio files.
- 不代你登入 Zoom 或 Teams，也不保存權杖。No Zoom or Teams sign-in, and no tokens.
- 沒有雲端同步。要留底，請下載 Markdown。No cloud sync. Download Markdown if you want a copy.
- 不是裝置端 Whisper 模型；長會議請仍用 Zoom／Teams 下載的轉錄。Not an on-device Whisper model; for long meetings, keep using Zoom/Teams transcript downloads.
