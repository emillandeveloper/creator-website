const { test } = require("node:test");
const assert = require("node:assert/strict");
const { twitchLabels, leadingOptionIds, prepareOptions } = require("../dist/modules/level38/poll-domain");
const { pollInput } = require("../dist/modules/level38/validation");

test("Twitch questions/options enforce official boundaries for all four native poll types", () => {
  const base = { type: "CUSTOM", title: "x".repeat(60), durationSeconds: 15, options: [{ label: "a".repeat(25) }, { label: "Second choice" }] };
  assert.equal(pollInput(base).title.length, 60);
  for (const invalid of [{ ...base, title: "x".repeat(61) }, { ...base, options: [{ label: "x".repeat(26) }, { label: "Second" }] },
    { ...base, options: [{ label: "Only" }] }, { ...base, options: Array.from({ length: 6 }, (_, i) => ({ label: `Option ${i}` })) },
    { ...base, durationSeconds: 14 }, { ...base, durationSeconds: 1801 }]) assert.throws(() => pollInput(invalid));
  assert.equal(pollInput({ ...base, durationSeconds: 1800 }).durationSeconds, 1800);
  assert.deepEqual(pollInput({ ...base, type: "YES_NO", options: [] }).options, [{ label: "Yes" }, { label: "No" }]);
  assert.deepEqual(pollInput({ ...base, type: "NEXT_GAME", options: [{ gameId: "game-1" }, { gameId: "game-2" }] }).options, [{ gameId: "game-1" }, { gameId: "game-2" }]);
  assert.deepEqual(pollInput({ ...base, type: "NEXT_QUEST", options: [{ questId: "q1" }, { questId: "q2" }] }).options, [{ questId: "q1" }, { questId: "q2" }]);
});

test("native labels remain recognizable, deterministic and distinct at Twitch's 25-character limit", () => {
  const original = ["Final Fantasy VII Remake Intergrade", "Final Fantasy VII Rebirth", "Kingdom Hearts HD 1.5 + 2.5 ReMIX", "#43 Stop Hitting It, Tifa!", "#43 Stop Hitting It, Tifa!"];
  const labels = twitchLabels(original);
  assert.deepEqual(labels, twitchLabels(original)); assert.equal(new Set(labels).size, original.length);
  assert.ok(labels.every(label => [...label].length <= 25));
  assert.match(labels[0], /FF VII.*Intergrade|FF VII.*ntergrade/); assert.match(labels[1], /Rebirth/); assert.match(labels[3], /^#43 /);
  assert.equal(original[0], "Final Fantasy VII Remake Intergrade");
});

test("native leaders use authoritative Twitch counts while historical web counts remain intact", () => {
  const options = [{ id: "a", twitchVotes: 8, _count: { votes: 0 } }, { id: "b", twitchVotes: 3, _count: { votes: 9 } }];
  assert.deepEqual(leadingOptionIds({ source: "TWITCH", options }), ["a"]);
  assert.deepEqual(leadingOptionIds({ source: "WEB", options }), ["b"]);
  assert.deepEqual(leadingOptionIds({ source: "TWITCH", options: options.map(option => ({ ...option, twitchVotes: 0 })) }), []);
  assert.deepEqual(leadingOptionIds({ source: "TWITCH", options: options.map(option => ({ ...option, twitchVotes: 5 })) }), ["a", "b"]);
});

test("abbreviation suffixes cannot collide with an existing option's exact label", () => {
  const input = ['Final Fantasy', 'FF', 'FF #1', 'FF #1.1', 'ff #2'];
  const labels = twitchLabels(input);
  assert.equal(new Set(labels.map(label => label.toLowerCase())).size, input.length);
  assert.ok(labels.every(label => [...label].length <= 25));
  assert.deepEqual(labels, twitchLabels(input));
  assert.equal(labels[2], input[2]);
});

test("already-bounded CUSTOM and YES_NO labels reach Twitch exactly as entered", async () => {
  const custom = pollInput({type:'CUSTOM',title:'Which one?',options:[{label:'Final Fantasy'},{label:'FF'},{label:'FF #1'}]});
  const options = await prepareOptions({}, 'test-event', custom);
  assert.deepEqual(options.map(option=>option.twitchLabel), custom.options.map(option=>option.label));
  const yesNo = pollInput({type:'YES_NO',title:'Continue?',options:[]});
  assert.deepEqual((await prepareOptions({}, 'test-event', yesNo)).map(option=>option.twitchLabel), ['Yes','No']);
});
