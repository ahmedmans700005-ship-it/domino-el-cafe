import test from "node:test";
import assert from "node:assert/strict";
import { makeSet, getLegalEnds, placeTile, drawUntilPlayable, resolveBlockedRound } from "../src/game-engine.js";
import { createRoomState } from "../src/room-utils.js";
import { beginRound, chooseAutomaticMove, takeTurnTile, applyRoundResult, blockedWinners, calculateRoundAward } from "../src/match-engine.js";

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

function room(mode="1v1",count=2){
 const state=createRoomState("123456",{mode,target:101});
 state.players=Array.from({length:count},(_,i)=>({id:"p"+i,name:"P"+i,seat:i,hand:[],connected:true}));
 return state;
}

test("round deals seven tiles and leads with the highest available double",()=>{
 const r=room("1v1",2);beginRound(r,()=>0.25);
 assert.equal(r.players.reduce((n,p)=>n+p.hand.length,0),13);
 assert.equal(r.match.board.length,1);
 const opening=r.match.board[0];
 assert.equal(opening.a,opening.b);
 assert.equal(r.players.some(p=>p.hand.some(t=>t.id===opening.id)),false);
 const starterSeat=r.players.find(p=>p.id===r.match.lastMove.playerId).seat;
 assert.equal(r.match.currentPlayerId,r.players[(starterSeat+1)%r.players.length].id);
 assert.equal(r.match.boneyard.length,14);
});

test("3-player and 4-player rounds use seven tiles per player",()=>{
 for(const [mode,count,pile] of [["3free",3,7],["4free",4,0]]){
  const r=room(mode,count);beginRound(r,()=>0.13);
  assert.equal(r.players.reduce((n,p)=>n+p.hand.length,0),count*7-1); // opening double is placed immediately
  assert.equal(r.match.boneyard.length,pile);
 }
});

test("automatic move chooses a legal low-pip tile",()=>{
 const board=[{id:"2-4",a:2,b:4}];
 const hand=[{id:"1-2",a:1,b:2},{id:"4-6",a:4,b:6},{id:"0-0",a:0,b:0}];
 const move=chooseAutomaticMove(board,hand);
 assert.equal(move.tile.id,"1-2");
 assert.ok(getLegalEnds(board,move.tile).includes(move.end));
});

test("server move validation removes only the current player's tile",()=>{
 const r=room();beginRound(r,()=>0.33);
 const current=r.players.find(p=>p.id===r.match.currentPlayerId);
 const tile=current.hand.find(t=>getLegalEnds(r.match.board,t).length);
 if(tile){
  const before=current.hand.length;
  takeTurnTile(r,current.id,tile.id,getLegalEnds(r.match.board,tile)[0]);
  assert.equal(current.hand.length,before-1);
  assert.equal(r.match.consecutivePasses,0);
 }
});

test("round award accumulates points and ends match at target",()=>{
 const r=room();r.target=10;beginRound(r,()=>0.25);
 const winner=r.players[0];const loser=r.players[1];
 winner.hand=[];loser.hand=[{id:"2-3",a:2,b:3}];
 applyRoundResult(r,[winner.id],false);
 assert.equal(r.match.scores[winner.id],5);
 assert.equal(r.match.status,"round_over");
 r.match.scores[winner.id]=10;
 applyRoundResult(r,[winner.id],false);
 assert.equal(r.match.status,"match_over");
});


test("blocked 2v2 compares combined team hands and awards the opposing team's points",()=>{
 const r=room("2v2",4);
 r.match={board:[{id:"3-4",a:3,b:4}],boneyard:[],scores:{"0":0,"1":0},status:"playing"};
 r.players[0].hand=[{id:"0-0",a:0,b:0}];
 r.players[2].hand=[{id:"0-1",a:0,b:1}];
 r.players[1].hand=[{id:"5-5",a:5,b:5}];
 r.players[3].hand=[{id:"6-6",a:6,b:6}];
 const winners=blockedWinners(r);
 assert.deepEqual(winners,["p0","p2"]);
 assert.equal(calculateRoundAward(r,winners,true),22);
 applyRoundResult(r,winners,true);
 assert.equal(r.match.scores["0"],22);
 assert.equal(r.match.scores["1"],0);
});

test("a tied blocked 2v2 round awards no points to either team",()=>{
 const r=room("2v2",4);
 r.match={board:[{id:"3-4",a:3,b:4}],boneyard:[],scores:{"0":0,"1":0},status:"playing"};
 r.players.forEach((p,i)=>{p.hand=[{id:"0-"+i,a:0,b:1}]});
 const winners=blockedWinners(r);
 assert.equal(winners.length,4);
 assert.equal(calculateRoundAward(r,winners,true),0);
 applyRoundResult(r,winners,true);
 assert.equal(r.match.scores["0"],0);
 assert.equal(r.match.scores["1"],0);
});


test("a tied blocked individual round awards no points",()=>{
 const r=room("1v1",2);
 r.match={board:[{id:"3-4",a:3,b:4}],boneyard:[],scores:{p0:0,p1:0},status:"playing"};
 r.players[0].hand=[{id:"0-2",a:0,b:2}];
 r.players[1].hand=[{id:"1-1",a:1,b:1}];
 const winners=blockedWinners(r);
 assert.deepEqual(winners,["p0","p1"]);
 assert.equal(calculateRoundAward(r,winners,true),0);
 applyRoundResult(r,winners,true);
 assert.equal(r.match.scores.p0,0);
 assert.equal(r.match.scores.p1,0);
});
