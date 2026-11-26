import test from "node:test";
import assert from "node:assert/strict";
import { cleanChatMessage, cleanPlayerName, createRoomState, normalizeRoomOptions, roomSnapshot } from "../src/room-utils.js";

test("room modes always map to the requested player count", () => {
  assert.equal(normalizeRoomOptions({ mode: "1v1" }).maxPlayers, 2);
  assert.equal(normalizeRoomOptions({ mode: "2v2" }).maxPlayers, 4);
  assert.equal(normalizeRoomOptions({ mode: "3free" }).maxPlayers, 3);
  assert.equal(normalizeRoomOptions({ mode: "4free" }).maxPlayers, 4);
});

test("invalid room options safely fall back", () => {
  assert.deepEqual(normalizeRoomOptions({ mode: "hacked", target: 999 }), { mode: "1v1", target: 101, maxPlayers: 2 });
});

test("names and chat are bounded and strip markup/control characters", () => {
  assert.equal(cleanPlayerName("  <Ahmed>\n "), "Ahmed");
  assert.equal(cleanPlayerName("x".repeat(30)).length, 18);
  assert.equal(cleanChatMessage("<script>hello</script>"), "scripthello/script");
  assert.equal(cleanChatMessage("y".repeat(400)).length, 300);
});

test("room snapshot exposes only public player fields and bounded recent chat", () => {
  const room = createRoomState("123456", { mode: "3free", target: 151 });
  room.players.push({ id: "p1", name: "Ali", connected: true, joinedAt: 10, lastChatAt: 99 });
  room.chat = Array.from({ length: 40 }, (_, i) => ({ id: String(i), text: "hi" }));
  const snapshot = roomSnapshot(room);
  assert.equal(snapshot.maxPlayers, 3);
  assert.equal(snapshot.chat.length, 30);
  assert.equal("lastChatAt" in snapshot.players[0], false);
});
