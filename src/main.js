import "./style.css";
import { makeSet, shuffle, getLegalEnds, placeTile, drawUntilPlayable, resolveBlockedRound } from "./game-engine.js";

const app = document.querySelector("#app");
const state = { name:"", mode:"1v1", target:101, room:"", screen:"lobby", hand:[], board:[], pile:[], selected:null, turn:0 };
const modes = [{id:"1v1",label:"واحد ضد واحد",players:2},{id:"2v2",label:"اتنين ضد اتنين",players:4},{id:"3free",label:"٣ لاعيبة — فردي",players:3},{id:"4free",label:"٤ لاعيبة — فردي",players:4}];
const el = (tag,cls,text) => { const n=document.createElement(tag); if(cls)n.className=cls; if(text!==undefined)n.textContent=text; return n; };

function renderLobby(){
  app.replaceChildren();
  const shell=el("main","lobby-shell");
  const brand=el("div","brand"); brand.innerHTML='<span class="brand-mark">٦|٦</span><span><b>DOMINO <i>EL CAFÉ</i></b><small>القعدة اللي ناقصاك ☕</small></span>';
  const hero=el("section","hero"); hero.append(el("div","eyebrow","أهلاً بيك في القهوة")); hero.append(el("h1","","العبها على أصولها.")); hero.append(el("p","","دومينو أونلاين، شِلّة وضحك ومنافسة من أي مكان."));
  const panel=el("section","setup-panel"); panel.append(el("label","field-label","اسمك على الترابيزة"));
  const name=el("input","text-input"); name.placeholder="اكتب الاسم أو اللقب"; name.maxLength=18; name.value=state.name; name.addEventListener("input",()=>state.name=name.value); panel.append(name);
  panel.append(el("label","field-label","اختار نظام اللعب"));
  const modesBox=el("div","mode-grid");
  modes.forEach(m=>{const b=el("button","mode-card"+(state.mode===m.id?" active":""),m.label);b.type="button";b.addEventListener("click",()=>{state.mode=m.id;renderLobby()});modesBox.append(b)});
  panel.append(modesBox); panel.append(el("label","field-label","النهاية على كام نقطة؟"));
  const targets=el("div","target-row"); [101,151].forEach(v=>{const b=el("button","target-btn"+(state.target===v?" active":""),String(v));b.addEventListener("click",()=>{state.target=v;renderLobby()});targets.append(b)});panel.append(targets);
  const actions=el("div","lobby-actions");
  const create=el("button","primary-btn","اعمل قعدة جديدة");create.addEventListener("click",()=>{if(!state.name.trim())return name.focus();state.room=String(Math.floor(100000+Math.random()*900000));state.screen="room";renderRoom()});
  const join=el("button","secondary-btn","ادخل برقم غرفة");join.addEventListener("click",()=>{if(!state.name.trim())return name.focus();const code=prompt("اكتب رقم الغرفة");if(code&&/^\d{6}$/.test(code)){state.room=code;state.screen="room";renderRoom()}});
  actions.append(create,join);panel.append(actions);
  const foot=el("div","footnote","نسخة تأسيسية للواجهة — اللعب الجماعي والصوت المباشر قيد البناء");
  shell.append(brand,hero,panel,foot);app.append(shell);
}
function tileNode(tile,clickable=false){
  const n=el("button","domino-tile"+(clickable?" hand-tile":""));n.type="button";n.setAttribute("aria-label",`${tile.a} و ${tile.b}`);
  n.innerHTML=`<span>${dots(tile.a)}</span><i></i><span>${dots(tile.b)}</span>`;
  if(clickable)n.addEventListener("click",()=>{state.selected=state.selected===tile.id?null:tile.id;renderRoom()});
  return n;
}
function dots(n){return "●".repeat(n)||"·"}
function startDemo(){
 const all=shuffle(makeSet());state.hand=all.splice(0,7);state.pile=all;state.board=[];state.selected=null;
}
function renderRoom(){
 app.replaceChildren();const room=el("main","room-shell");
 const top=el("header","room-top");const brand=el("div","brand compact");brand.innerHTML='<span class="brand-mark">٦|٦</span><b>DOMINO <i>EL CAFÉ</i></b>';top.append(brand,el("span","room-code",`غرفة #${state.room}`));
 const table=el("section","game-table");table.append(el("div","table-label","ترابيزة القهوة"));
 const opponents=el("div","opponents");const m=modes.find(x=>x.id===state.mode);for(let i=1;i<m.players;i++){const p=el("div","opponent");p.innerHTML=`<span class="avatar">${["😎","🧔🏻","🤠"][i-1]||"🙂"}</span><b>لاعب ${i+1}</b><small>في انتظار الدخول</small>`;opponents.append(p)}table.append(opponents);
 const chain=el("div","chain");if(state.board.length){state.board.forEach(t=>chain.append(tileNode(t)))}else chain.append(el("div","empty-board","أول حجر هيبدأ القعدة هنا"));table.append(chain);
 const status=el("div","turn-status",state.selected?"اختار اتجاه التركيب: يمين ولا شمال؟":"دورك — اختار حجر من إيدك");table.append(status);
 const ends=el("div","end-actions");["left","right"].forEach(end=>{const b=el("button","end-btn",end==="left"?"⬅️ الشمال":"اليمين ➡️");b.addEventListener("click",()=>playSelected(end));ends.append(b)});table.append(ends);
 const handArea=el("section","hand-area");handArea.append(el("div","hand-title",`إيدك <span>${state.hand.length} أحجار</span>`));
 const hand=el("div","hand");state.hand.forEach(t=>{const n=tileNode(t,true);if(state.selected===t.id)n.classList.add("chosen");hand.append(n)});handArea.append(hand);
 const tools=el("div","room-tools");const draw=el("button","secondary-btn","اسحب لحد ما تلاقي حجر");draw.addEventListener("click",()=>{const result=drawUntilPlayable(state.hand,state.pile,state.board);state.hand=result.hand;state.pile=result.boneyard;renderRoom()});const restart=el("button","ghost-btn","تجربة جديدة");restart.addEventListener("click",()=>{startDemo();renderRoom()});tools.append(draw,restart);handArea.append(tools);
 room.append(top,table,handArea);app.append(room);
}
function playSelected(end){
 const tile=state.hand.find(t=>t.id===state.selected);if(!tile)return;
 if(!getLegalEnds(state.board,tile).includes(end)){alert("الحجر ده مش راكب في الناحية دي");return}
 state.board=placeTile(state.board,tile,end);state.hand=state.hand.filter(t=>t.id!==tile.id);state.selected=null;
 if(!state.hand.length){alert("قافل الجولة!");startDemo()}renderRoom();
}
renderLobby();
