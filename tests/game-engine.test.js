import test from "node:test";
import assert from "node:assert/strict";
import { makeSet, getLegalEnds, placeTile, drawUntilPlayable, resolveBlockedRound } from "../src/game-engine.js";

test("double-six set contains 28 unique tiles",()=>{
  const set=makeSet();
  assert.equal(set.length,28);
  assert.equal(new Set(set.map(t=>t.id)).size,28);
});

test("a tile can be deliberately oriented at either legal end",()=>{
  const board=[{id:"2-5",a:2,b:5}];
  assert.deepEqual(getLegalEnds(board,{id:"2-6",a:2,b:6}),["left"]);
  assert.deepEqual(placeTile(board,{id:"2-6",a:2,b:6},"left").map(t=>[t.a,t.b]),[[6,2],[2,5]]);
  assert.deepEqual(placeTile(board,{id:"5-1",a:1,b:5},"right").map(t=>[t.a,t.b]),[[2,5],[5,1]]);
});

test("automatic draw stops immediately when a playable tile appears",()=>{
  const board=[{id:"3-4",a:3,b:4}];
  const hand=[{id:"1-1",a:1,b:1}];
  const pile=[{id:"0-2",a:0,b:2},{id:"4-6",a:4,b:6},{id:"2-2",a:2,b:2}];
  const result=drawUntilPlayable(hand,pile,board,()=>0);
  assert.equal(result.drawn.length,2);
  assert.equal(result.playable.length,1);
  assert.equal(result.boneyard.length,1);
});

test("blocked round waits for empty boneyard and no legal moves",()=>{
  const players=[{id:"a",hand:[{a:1,b:1}]},{id:"b",hand:[{a:6,b:6}]}];
  const board=[{a:2,b:3}];
  assert.equal(resolveBlockedRound(players,board,[{a:0,b:0}]),null);
  const result=resolveBlockedRound(players,board,[]);
  assert.deepEqual(result.winnerIds,["a"]);
  assert.equal(result.pointsAwarded,12);
});
