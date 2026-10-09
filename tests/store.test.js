import assert from "node:assert/strict";
import test from "node:test";

const memory = new Map();
globalThis.localStorage = {
  getItem(key) {
    return memory.has(key) ? memory.get(key) : null;
  },
  setItem(key, value) {
    memory.set(key, String(value));
  },
  removeItem(key) {
    memory.delete(key);
  },
};

const { STORAGE_KEY, blankMeeting, loadState, nowHKTLocal, saveMeetings } = await import("../js/store.js");

test("Hong Kong local time is a datetime-local value", () => {
  assert.match(nowHKTLocal(new Date("2026-10-09T00:30:00Z")), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  assert.equal(nowHKTLocal(new Date("2026-10-08T16:00:00Z")), "2026-10-09T00:00");
});

test("a blank meeting starts undisclosed and unsaved-until-the-app-writes-it", () => {
  const meeting = blankMeeting();
  assert.equal(meeting.consent, false);
  assert.equal(meeting.isSample, false);
  assert.equal(meeting.platform, "zoom");
  assert.equal(meeting.language, "mixed");
  assert.deepEqual(meeting.actions, []);
  assert.match(meeting.datetime, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
});

test("storage seeds once, stays empty after a clear, and does not overwrite unreadable data", () => {
  memory.clear();
  const first = loadState();
  assert.equal(first.ok, true);
  assert.equal(first.seeded, true);
  assert.equal(first.meetings.length, 1);
  assert.equal(first.meetings[0].isSample, true);

  const second = loadState();
  assert.equal(second.seeded, false);
  assert.equal(second.meetings.length, 1);

  saveMeetings([]);
  const cleared = loadState();
  assert.equal(cleared.seeded, false);
  assert.deepEqual(cleared.meetings, []);

  memory.set(STORAGE_KEY, "{");
  const broken = loadState();
  assert.equal(broken.ok, false);
  assert.equal(broken.corrupt, true);
  assert.equal(memory.get(STORAGE_KEY), "{");
});
