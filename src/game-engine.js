// Pure double-six domino rules. UI and networking must call these functions.
export const makeSet = () => Array.from({ length: 7 }, (_, a) =>
  Array.from({ length: 7 - a }, (_, b) => ({ id: `${a}-${a+b}`, a, b: a+b }))
).flat();

export const shuffle = (items, random = Math.random) => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

export function getLegalEnds(board, tile) {
  if (!board.length) return ["left", "right"];
  const left = board[0].a;
  const right = board[board.length - 1].b;
  const ends = [];
  if (tile.a === left || tile.b === left) ends.push("left");
  if (tile.a === right || tile.b === right) ends.push("right");
  return ends;
}

export function orientForEnd(tile, end, board) {
  if (!board.length) return { ...tile };
  const target = end === "left" ? board[0].a : board[board.length - 1].b;
  if (tile.b === target) return { ...tile };
  if (tile.a === target) return { ...tile, a: tile.b, b: tile.a, flipped: true };
  throw new Error("Illegal placement");
}

export function placeTile(board, tile, end) {
  const oriented = orientForEnd(tile, end, board);
  if (!board.length) return [oriented];
  return end === "left" ? [ { ...oriented, a: oriented.b, b: oriented.a }, ...board ] : [...board, oriented];
}

// Draw automatically until a playable tile appears or the boneyard is empty.
// The returned tile remains in the player's hand for a deliberate placement choice.
export function drawUntilPlayable(hand, boneyard, board, random = Math.random) {
  const nextHand = [...hand];
  const pile = [...boneyard];
  const drawn = [];
  while (!nextHand.some(tile => getLegalEnds(board, tile).length) && pile.length) {
    const index = Math.floor(random() * pile.length);
    const [tile] = pile.splice(index, 1);
    nextHand.push(tile);
    drawn.push(tile);
  }
  return { hand: nextHand, boneyard: pile, drawn, playable: nextHand.filter(t => getLegalEnds(board, t).length) };
}

export function scoreHand(hand) {
  return hand.reduce((sum, tile) => sum + tile.a + tile.b, 0);
}

// A blocked round is only declared after the boneyard is empty and nobody has a legal move.
export function resolveBlockedRound(players, board, boneyard) {
  if (boneyard.length) return null;
  if (players.some(p => p.hand.some(tile => getLegalEnds(board, tile).length))) return null;
  const ranked = players.map(p => ({ id:p.id, count:p.hand.length, points:scoreHand(p.hand) }))
    .sort((x,y) => x.count-y.count || x.points-y.points);
  const winners = ranked.filter(p => p.count === ranked[0].count && p.points === ranked[0].points);
  return { winnerIds:winners.map(p=>p.id), ranking:ranked, pointsAwarded:players.filter(p=>!winners.some(w=>w.id===p.id)).reduce((s,p)=>s+scoreHand(p.hand),0) };
}
