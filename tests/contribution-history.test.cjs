"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "scripts.js"), "utf8");
const key = "line-break.contributions.v1";
const hash = number => number.toString(16).padStart(64, "0");

function browserStorage(initial) {
  const values = new Map(initial === undefined ? [] : [[key, initial]]);
  const reads = [], writes = [];
  return {
    values, reads, writes,
    getItem(name) { reads.push(name); return values.get(name) ?? null; },
    setItem(name, value) { writes.push([name, value]); values.set(name, value); }
  };
}

function factory(window = {}) {
  const sandbox = { window };
  vm.runInNewContext(source + "\nthis.createHistory = createExposureContributionHistory;", sandbox);
  return options => sandbox.createHistory(options);
}

const hashes = history => Array.from(history.hashes());

test("contribution fingerprints persist across reloads as only normalized hashes", () => {
  const storage = browserStorage();
  const create = factory({ localStorage: storage });
  const first = create();
  const uppercase = "ABCDEF".repeat(10) + "ABCD";
  assert.equal(first.remember(uppercase), uppercase.toLowerCase());
  first.remember(hash(2));
  first.remember(uppercase.toLowerCase());
  assert.deepEqual(JSON.parse(storage.values.get(key)), [uppercase.toLowerCase(), hash(2)]);
  const reloaded = factory({ localStorage: storage })();
  assert.deepEqual(hashes(reloaded), [uppercase.toLowerCase(), hash(2)]);
  assert.ok(storage.reads.every(name => name === key));
  assert.ok(storage.writes.every(([name, value]) => name === key && JSON.parse(value).every(entry => /^[0-9a-f]{64}$/.test(entry))));
  assert.equal(storage.values.size, 1);
});

test("each read and write merges contributions from other tabs without replacing older hashes", () => {
  const storage = browserStorage();
  const create = factory();
  const first = create({ storage }), second = create({ storage });
  first.remember(hash(1));
  assert.deepEqual(hashes(second), [hash(1)]);
  second.remember(hash(2));
  assert.deepEqual(hashes(first), [hash(1), hash(2)]);
  storage.values.set(key, JSON.stringify([hash(3)]));
  assert.deepEqual(hashes(first), [hash(1), hash(2), hash(3)], "the current tab retains hashes it already saw even if another writer omits them");
  first.remember(hash(4));
  assert.deepEqual(JSON.parse(storage.values.get(key)), [hash(1), hash(2), hash(3), hash(4)]);
  assert.deepEqual(hashes(second), [hash(1), hash(2), hash(3), hash(4)]);
});

test("corrupt storage and invalid stored entries cannot become photo identities", () => {
  const storage = browserStorage(JSON.stringify([hash(1), "B".repeat(64), hash(1), null, 5, false,
    "photo.jpg", "data:image/jpeg;base64,private", { hash: hash(2), name: "private-photo.jpg", visitorId: "private" }]));
  const history = factory()({ storage });
  assert.deepEqual(hashes(history), [hash(1), "b".repeat(64)]);
  assert.equal(storage.writes.length, 0, "reading history does not write back unrelated persisted content");
  history.remember(hash(3));
  assert.deepEqual(JSON.parse(storage.values.get(key)), [hash(1), "b".repeat(64), hash(3)]);
  storage.values.set(key, "{broken JSON");
  assert.deepEqual(hashes(history), [hash(1), "b".repeat(64), hash(3)]);
  history.remember(hash(4));
  assert.deepEqual(JSON.parse(storage.values.get(key)), [hash(1), "b".repeat(64), hash(3), hash(4)]);
  for (const value of ["null", "{}", JSON.stringify({ hashes: [hash(5)] }), '"not an array"']) {
    const invalid = browserStorage(value);
    assert.deepEqual(hashes(factory()({ storage: invalid })), []);
  }
});

test("invalid contributions are rejected before storage is accessed or changed", () => {
  const storage = browserStorage();
  const history = factory()({ storage });
  for (const value of [undefined, null, "", "a".repeat(63), "a".repeat(65), "g".repeat(64),
    " " + hash(1), hash(1) + " ", 5, [], [hash(1)], { sha256: hash(1), name: "private.jpg" }]) {
    assert.throws(() => history.remember(value), /fingerprint is invalid/);
  }
  assert.equal(storage.reads.length, 0);
  assert.equal(storage.writes.length, 0);
  assert.deepEqual(hashes(history), []);
});

test("blocked localStorage access falls back to memory without touching photos or changing development", () => {
  let accesses = 0;
  let available = false;
  const restored = browserStorage(JSON.stringify([hash(4)]));
  const window = {};
  Object.defineProperty(window, "localStorage", { get() {
    accesses++;
    if (!available) throw new Error("SecurityError");
    return restored;
  } });
  const create = factory(window);
  const history = create();
  assert.equal(accesses, 0, "storage is not accessed while the helper is created");
  history.remember(hash(1));
  history.remember(hash(2));
  assert.deepEqual(hashes(history), [hash(1), hash(2)]);
  assert.equal(accesses, 3);
  const supplied = browserStorage();
  const injected = create({ storage: supplied });
  injected.remember(hash(3));
  assert.deepEqual(hashes(injected), [hash(3)]);
  assert.equal(accesses, 3, "injected storage never reads the browser's blocked getter");
  available = true;
  assert.deepEqual(hashes(history), [hash(1), hash(2), hash(4)]);
  history.remember(hash(5));
  assert.deepEqual(JSON.parse(restored.values.get(key)), [hash(1), hash(2), hash(4), hash(5)],
    "restored persistence merges saved hashes and every contribution retained during the blocked period");
});

test("denied reads do not overwrite unknown saved history and quota failures preserve current memory", () => {
  let writes = 0;
  const denied = {
    getItem() { throw new Error("Read denied"); },
    setItem() { writes++; }
  };
  const deniedHistory = factory()({ storage: denied });
  deniedHistory.remember(hash(1));
  assert.deepEqual(hashes(deniedHistory), [hash(1)]);
  assert.equal(writes, 0, "an unreadable store may contain older hashes and must not be overwritten");
  const full = browserStorage(JSON.stringify([hash(2)]));
  full.setItem = () => { throw new Error("QuotaExceededError"); };
  const fullHistory = factory()({ storage: full });
  fullHistory.remember(hash(3));
  assert.deepEqual(hashes(fullHistory), [hash(2), hash(3)]);
  assert.deepEqual(JSON.parse(full.values.get(key)), [hash(2)]);
  const unavailable = factory()({ storage: null });
  unavailable.remember(hash(4));
  assert.deepEqual(hashes(unavailable), [hash(4)]);
});

test("older hashes are never arbitrarily truncated when many contributions are remembered", () => {
  const earlier = Array.from({ length: 5001 }, (_, index) => hash(index));
  const storage = browserStorage(JSON.stringify(earlier));
  const history = factory()({ storage });
  history.remember(hash(9000));
  const expected = [...earlier, hash(9000)];
  assert.deepEqual(hashes(history), expected);
  assert.deepEqual(JSON.parse(storage.values.get(key)), expected);
  assert.deepEqual(hashes(factory()({ storage })), expected);
});

test("returned arrays are independent snapshots and cannot mutate remembered identities", () => {
  const history = factory()({ storage: null });
  history.remember(hash(1));
  const first = history.hashes(), second = history.hashes();
  assert.notStrictEqual(first, second);
  first.push(hash(2));
  second.length = 0;
  assert.deepEqual(hashes(history), [hash(1)]);
  assert.equal(Object.isFrozen(history), true);
});
