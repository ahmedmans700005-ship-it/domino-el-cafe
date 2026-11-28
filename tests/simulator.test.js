import test from "node:test";
import assert from "node:assert/strict";
import { simulateMatch, runSimulationBatch } from "../src/simulator.js";

test("the simulator completes every supported mode without corrupting the 28-tile set",()=>{
  for(const mode of ["1v1","2v2","3free","4free"]){
    const result=simulateMatch({mode,target:101,seed:1776});
    assert.equal(result.mode,mode);
    assert.ok(result.rounds>0);
    assert.ok(result.moves>0);
    assert.ok(result.integrityChecks>0);
    assert.ok(result.winner);
  }
});

test("the simulator is deterministic for the same seed",()=>{
  const a=simulateMatch({mode:"2v2",target:101,seed:2026});
  const b=simulateMatch({mode:"2v2",target:101,seed:2026});
  assert.deepEqual(a,b);
});

test("the simulator supports the 151-point target and bounded batches",()=>{
  const result=runSimulationBatch({mode:"4free",target:151,games:3,seed:99});
  assert.equal(result.games,3);
  assert.equal(result.completed,3);
  assert.equal(result.samples.length,3);
  assert.ok(result.totalMoves>0);
});
