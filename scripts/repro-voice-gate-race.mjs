import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const puppeteerRoot =
  process.env.PUPPETEER_CORE ||
  "/tmp/interrogate-hk-meeting-notes/adv-1/.adv-repro/node_modules/puppeteer-core";
const require = createRequire(import.meta.url);
const puppeteer = require(puppeteerRoot);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const chrome = process.env.CHROME_PATH || "/usr/local/bin/google-chrome";

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const file = url.pathname === "/" ? "/index.html" : url.pathname;
  const full = path.join(root, file);
  if (!full.startsWith(`${root}${path.sep}`) || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
    res.writeHead(404);
    res.end("missing");
    return;
  }
  const ext = path.extname(full);
  const type =
    ext === ".html"
      ? "text/html"
      : ext === ".js"
        ? "text/javascript"
        : ext === ".css"
          ? "text/css"
          : "application/octet-stream";
  res.writeHead(200, { "Content-Type": type });
  res.end(fs.readFileSync(full));
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});

let exitCode = 1;
try {
  const page = await browser.newPage();
  page.on("pageerror", (error) => {
    console.error(`PAGE ${error.message}`);
  });

  await page.evaluateOnNewDocument(() => {
    window.__sessions = [];
    class FakeSpeechRecognition {
      constructor() {
        this.continuous = false;
        this.interimResults = false;
        this.lang = "";
        this.onstart = null;
        this.onresult = null;
        this.onerror = null;
        this.onend = null;
        this._started = false;
        this._stopped = false;
        this._aborted = false;
        this._startFired = false;
        window.__sessions.push(this);
      }
      start() {
        this._started = true;
        setTimeout(() => {
          if (this._aborted || this._stopped) return;
          this._startFired = true;
          if (typeof this.onstart === "function") this.onstart();
        }, 250);
      }
      stop() {
        this._stopped = true;
        setTimeout(() => {
          if (typeof this.onend === "function") this.onend();
        }, 400);
      }
      abort() {
        this._aborted = true;
        this._stopped = true;
        setTimeout(() => {
          if (typeof this.onend === "function") this.onend();
        }, 0);
      }
    }
    window.SpeechRecognition = FakeSpeechRecognition;
    window.webkitSpeechRecognition = FakeSpeechRecognition;

    window.readSession = (sessionIndex) => {
      const session = window.__sessions[sessionIndex];
      const button = document.getElementById("voice-btn");
      return {
        started: session._started,
        startFired: session._startFired,
        stopped: session._stopped,
        aborted: session._aborted,
        onresultNull: session.onresult == null,
        pressed: button.getAttribute("aria-pressed"),
        paste: document.getElementById("paste").value,
        view: document.body.dataset.view,
      };
    };

    window.deliverPhrase = (sessionIndex, phrase) => {
      const session = window.__sessions[sessionIndex];
      if (typeof session.onresult === "function") {
        session.onresult({
          resultIndex: 0,
          results: [{ isFinal: true, 0: { transcript: phrase }, length: 1 }],
        });
      }
      return window.readSession(sessionIndex);
    };
  });

  await page.goto(`http://127.0.0.1:${port}/#/`, { waitUntil: "networkidle0" });
  const report = {
    gate: await gateRace(page),
    stop: await userStop(page),
    navigate: await leaveList(page),
    switchMeeting: await switchMeeting(page),
  };
  console.log(JSON.stringify(report, null, 2));

  const live =
    report.gate.after.startFired &&
    !report.gate.after.stopped &&
    !report.gate.after.aborted &&
    report.gate.after.pressed === "true";
  const gateClean =
    report.gate.immediate.startFired === false &&
    report.gate.immediate.aborted === true &&
    report.gate.immediate.onresultNull === true &&
    !report.gate.immediate.paste.includes("GATETOKEN") &&
    report.gate.after.aborted === true &&
    report.gate.after.pressed !== "true" &&
    report.gate.after.startFired === false;
  const stopKeeps =
    report.stop.stopped === true &&
    report.stop.aborted === false &&
    report.stop.paste.includes("STOPTOKEN");
  const navDrops =
    report.navigate.aborted === true && !report.navigate.paste.includes("NAVTOKEN");
  const switchDrops =
    report.switchMeeting.aborted === true &&
    report.switchMeeting.paste.includes("SWITCHTOKEN") === false;

  if (live) {
    console.log("REPRO: recognition still live after gate withdraw");
  } else if (gateClean && stopKeeps && navDrops && switchDrops) {
    console.log("recognition aborted; no live session");
    exitCode = 0;
  } else {
    console.log("FAIL: recognition was not aborted on every withdraw path");
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

process.exit(exitCode);

async function gateRace(page) {
  await openNewMeeting(page);
  await armVoice(page);
  const index = await startUntilPending(page);
  const immediate = await page.evaluate((sessionIndex, phrase) => {
    const consent = document.getElementById("consent");
    consent.checked = false;
    consent.dispatchEvent(new Event("change", { bubbles: true }));
    const cloud = document.getElementById("voice-cloud");
    cloud.checked = false;
    cloud.dispatchEvent(new Event("change", { bubbles: true }));
    return window.deliverPhrase(sessionIndex, phrase);
  }, index, "GATETOKEN");
  await delay(600);
  const after = await page.evaluate((sessionIndex) => window.readSession(sessionIndex), index);
  return { immediate, after };
}

async function userStop(page) {
  await page.reload({ waitUntil: "networkidle0" });
  await openNewMeeting(page);
  await armVoice(page);
  const index = await startUntilListening(page);
  await page.click("#voice-btn");
  return page.evaluate(
    (sessionIndex, phrase) => window.deliverPhrase(sessionIndex, phrase),
    index,
    "STOPTOKEN",
  );
}

async function leaveList(page) {
  await page.reload({ waitUntil: "networkidle0" });
  await openNewMeeting(page);
  await armVoice(page);
  const index = await startUntilListening(page);
  await page.click("#back-link");
  await page.waitForFunction(() => document.body.dataset.view === "list");
  return page.evaluate(
    (sessionIndex, phrase) => window.deliverPhrase(sessionIndex, phrase),
    index,
    "NAVTOKEN",
  );
}

async function switchMeeting(page) {
  await page.reload({ waitUntil: "networkidle0" });
  await openNewMeeting(page);
  const hashA = await page.evaluate(() => location.hash);
  await page.click("#back-link");
  await page.waitForFunction(() => document.body.dataset.view === "list");
  await openNewMeeting(page);
  const hashB = await page.evaluate(() => location.hash);
  await page.evaluate((hash) => {
    location.hash = hash;
  }, hashA);
  await page.waitForFunction(
    (hash) => location.hash === hash && document.body.dataset.view === "editor",
    {},
    hashA,
  );
  await armVoice(page);
  const index = await startUntilListening(page);
  await page.evaluate((hash) => {
    location.hash = hash;
  }, hashB);
  await page.waitForFunction(
    (hash) => location.hash === hash && document.getElementById("paste").value === "",
    {},
    hashB,
  );
  return page.evaluate(
    (sessionIndex, phrase) => window.deliverPhrase(sessionIndex, phrase),
    index,
    "SWITCHTOKEN",
  );
}

async function openNewMeeting(page) {
  const onList = await page.evaluate(() => document.body.dataset.view === "list");
  if (!onList) {
    await page.click("#back-link");
    await page.waitForFunction(() => document.body.dataset.view === "list");
  }
  await page.click("#new-meeting");
  await page.waitForFunction(() => document.body.dataset.view === "editor");
  await page.waitForSelector("#voice-btn");
}

async function armVoice(page) {
  for (const id of ["consent", "voice-cloud"]) {
    const checked = await page.$eval(`#${id}`, (el) => el.checked);
    if (!checked) await page.click(`#${id}`);
  }
  await page.waitForFunction(() => document.getElementById("voice-btn").disabled === false);
}

async function startUntilPending(page) {
  const index = await page.evaluate(() => window.__sessions.length);
  await page.click("#voice-btn");
  await page.waitForFunction(
    (sessionIndex) => {
      const session = window.__sessions[sessionIndex];
      return Boolean(session && session._started && !session._startFired);
    },
    {},
    index,
  );
  return index;
}

async function startUntilListening(page) {
  const index = await startUntilPending(page);
  await page.waitForFunction(
    (sessionIndex) => window.__sessions[sessionIndex]._startFired === true,
    {},
    index,
  );
  return index;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
