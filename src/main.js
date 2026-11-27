import "./style.css";
import { getLegalEnds } from "./game-engine.js";
import { RoomVoice } from "./voice.js";

const app = document.querySelector("#app");
const state = {
  name:"", mode:"1v1", target:101, room:"", screen:"lobby",
  hand:[], board:[], pile:[], selected:null, drawNote:"",
  playerId:"", roomInfo:null, socket:null, socketStatus:"connecting", chat:[], voice:null, voiceStatus:"off", reconnectTimer:null, reconnectAttempts:0, intentionalLeave:false
};
const modes = [{id:"1v1",label:"واحد ضد واحد",players:2},{id:"2v2",label:"اتنين ضد اتنين",players:4},{id:"3free",label:"٣ لاعيبة — فردي",players:3},{id:"4free",label:"٤ لاعيبة — فردي",players:4}];
const el = (tag,cls,text) => { const n=document.createElement(tag); if(cls)n.className=cls; if(text!==undefined)n.textContent=text; return n; };
const currentPlayer = () => state.roomInfo?.players?.find(p=>p.id===state.playerId);

async function requestRoom(method, body) {
  const response = await fetch("/api/rooms", { method, headers:{"content-type":"application/json"}, body:body?JSON.stringify(body):undefined });
  const data = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(data.error || "تعذر الاتصال بالسيرفر");
  return data;
}
async function createRoom() {
  const data = await requestRoom("POST",{name:state.name,mode:state.mode,target:state.target});
  state.room=data.code;sessionStorage.setItem("domino:lastRoom",state.room);sessionStorage.setItem("domino:name",state.name);
  await enterRoom();
}
async function joinRoom(code) {
  const response=await fetch(`/api/rooms/${code}`);
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(data.error||"الغرفة غير موجودة");
  if(data.players?.length>=data.maxPlayers && !data.players.some(p=>p.id===sessionStorage.getItem(`domino:${code}`))) throw new Error("الغرفة مكتملة");
  state.room=code; state.roomInfo=data; state.mode=data.mode; state.target=data.target;sessionStorage.setItem("domino:lastRoom",state.room);sessionStorage.setItem("domino:name",state.name);
  await enterRoom();
}
async function enterRoom() {
  state.screen="room"; state.chat=state.roomInfo?.chat||[]; state.intentionalLeave=false; state.hand=[]; state.board=state.roomInfo?.match?.board||[];
  state.playerId=sessionStorage.getItem(`domino:${state.room}`)||"";
  openRoomSocket();
}
function scheduleReconnect(delay) {
  if (state.intentionalLeave || state.screen!=="room" || state.reconnectTimer) return;
  state.socketStatus="reconnecting"; renderRoom();
  state.reconnectTimer=setTimeout(()=>{
    state.reconnectTimer=null;
    if(state.screen==="room"&&!state.intentionalLeave)openRoomSocket();
  },delay);
}
function openRoomSocket() {
  const scheme=location.protocol==="https:"?"wss:":"ws:";
  const query=new URLSearchParams({name:state.name});
  if(state.playerId)query.set("playerId",state.playerId);
  const socket=new WebSocket(`${scheme}//${location.host}/ws/${state.room}?${query}`);
  state.socket=socket; state.socketStatus="connecting";
  state.voice=new RoomVoice({roomCode:state.room,getSocket:()=>state.socket,getPlayerId:()=>state.playerId,onStatus:value=>{state.voiceStatus=value;if(state.screen==="room")renderRoom()}});
  renderRoom();
  socket.addEventListener("open",()=>{
    if(state.socket!==socket)return;
    state.socketStatus="connected";state.reconnectAttempts=0;renderRoom();
  });
  socket.addEventListener("message",event=>{
    if(state.socket!==socket)return;
    let message;try{message=JSON.parse(event.data)}catch{return}
    if(message.type==="welcome"){
      state.playerId=message.playerId;sessionStorage.setItem(`domino:${state.room}`,state.playerId);
      state.roomInfo=message.room;state.chat=message.room.chat||[];state.hand=message.yourHand||[];state.board=message.room.match?.board||[];state.voice?.syncPeers(message.room.players).catch(()=>{});
    } else if(message.type==="room") {state.roomInfo=message.room;state.hand=message.yourHand||state.hand;state.board=message.room.match?.board||[];state.voice?.syncPeers(message.room.players).catch(()=>{});}
    else if(message.type==="error") alert(message.message);
    else if(message.type==="chat") state.chat=[...state.chat,message.message].slice(-30);
    else if(message.type==="voice-signal") state.voice?.handleSignal(message.from,message.signal).catch(()=>{});
    renderRoom();
  });
  socket.addEventListener("close",()=>{
    if(state.socket!==socket||state.screen!=="room"||state.intentionalLeave)return;
    state.socketStatus="disconnected";
    state.voice?.close();state.voice=null;state.voiceStatus="off";
    const delay=Math.min(1000*Math.pow(2,state.reconnectAttempts++),15000);
    scheduleReconnect(delay);
  });
  socket.addEventListener("error",()=>{
    if(state.socket!==socket)return;
    state.socketStatus="error";renderRoom();
  });
}
document.addEventListener("visibilitychange",()=>{
  if(!document.hidden&&state.screen==="room"&&state.socket?.readyState!==WebSocket.OPEN&&!state.reconnectTimer){
    scheduleReconnect(0);
  }
});
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
  const create=el("button","primary-btn","اعمل قعدة جديدة");create.addEventListener("click",async()=>{if(!state.name.trim())return name.focus();create.disabled=true;create.textContent="بنجهز القعدة...";try{await createRoom()}catch(error){alert(error.message);create.disabled=false;create.textContent="اعمل قعدة جديدة"}});
  const join=el("button","secondary-btn","ادخل برقم غرفة");join.addEventListener("click",async()=>{if(!state.name.trim())return name.focus();const code=prompt("اكتب رقم الغرفة");if(!code)return;if(!/^\d{6}$/.test(code))return alert("رقم الغرفة لازم يكون ٦ أرقام");join.disabled=true;try{await joinRoom(code)}catch(error){alert(error.message);join.disabled=false}});
  actions.append(create,join);panel.append(actions);
  const foot=el("div","footnote","الغرف واللعب والشات والصوت جاهزين للتجربة — استمتع بالقعدة ☕");
  shell.append(brand,hero,panel,foot);app.append(shell);
}
const pipMap={0:[],1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
function pipFace(value){return '<span class="pip-face">'+Array.from({length:9},(_,i)=>'<i class="'+(pipMap[value].includes(i)?'on':'')+'"></i>').join('')+'</span>'}
function tileNode(tile,clickable=false){
  const n=el("button","domino-tile"+(clickable?" hand-tile":" board-tile"));n.type="button";n.setAttribute("aria-label",tile.a+" و "+tile.b);
  n.innerHTML=pipFace(tile.a)+'<i class="tile-divider"></i>'+pipFace(tile.b);
  if(clickable){
    n.draggable=true;
    n.addEventListener("dragstart",e=>{state.selected=tile.id;e.dataTransfer?.setData("text/plain",tile.id);if(e.dataTransfer)e.dataTransfer.effectAllowed="move";n.classList.add("dragging")});
    n.addEventListener("dragend",()=>n.classList.remove("dragging"));
    let ghost=null;
    n.addEventListener("pointerdown",e=>{if(e.pointerType!=="touch")return;state.selected=tile.id;n.setPointerCapture(e.pointerId);ghost=n.cloneNode(true);ghost.classList.add("tile-drag-ghost");document.body.append(ghost);ghost.style.left=(e.clientX-24)+"px";ghost.style.top=(e.clientY-44)+"px"});
    n.addEventListener("pointermove",e=>{if(e.pointerType==="touch"&&ghost){ghost.style.left=(e.clientX-24)+"px";ghost.style.top=(e.clientY-44)+"px"}});
    n.addEventListener("pointerup",e=>{if(e.pointerType!=="touch")return;ghost?.remove();ghost=null;const target=document.elementFromPoint(e.clientX,e.clientY)?.closest(".chain");if(target)playSelected(endAtPoint(target,e.clientX))});
    n.addEventListener("pointercancel",()=>{ghost?.remove();ghost=null});
  }
  return n;
}
function endAtPoint(container,clientX){
  const tiles=container.querySelectorAll(".board-tile");
  if(!tiles.length){
    const rect=container.getBoundingClientRect();
    return clientX < rect.left + rect.width/2 ? "left" : "right";
  }
  // Aim for the nearest open end, even when the chain has scrolled past the viewport midpoint.
  const leftEdge=tiles[0].getBoundingClientRect().left;
  const rightEdge=tiles[tiles.length-1].getBoundingClientRect().right;
  return Math.abs(clientX-leftEdge)<=Math.abs(clientX-rightEdge) ? "left" : "right";
}
function enableBoardDrop(container){
  container.addEventListener("dragover",e=>{e.preventDefault();container.classList.add("drop-ready");if(e.dataTransfer)e.dataTransfer.dropEffect="move"});
  container.addEventListener("dragleave",e=>{if(!container.contains(e.relatedTarget))container.classList.remove("drop-ready")});
  container.addEventListener("drop",e=>{
    e.preventDefault();container.classList.remove("drop-ready");
    const id=e.dataTransfer?.getData("text/plain");
    if(id){state.selected=id;playSelected(endAtPoint(container,e.clientX))}
  });
}
function startDemo(){
 const all=shuffle(makeSet());state.hand=all.splice(0,7);state.pile=all;state.board=[];state.selected=null;
}
function sendReaction(text){
 if(state.socket?.readyState!==WebSocket.OPEN)return;
 state.socket.send(JSON.stringify({type:"reaction",text}));
}
function sendChat(input){
 const text=input.value.trim();if(!text)return;
 if(state.socket?.readyState!==WebSocket.OPEN)return alert("الاتصال بالغرفة مش شغال");
 state.socket.send(JSON.stringify({type:"chat",text}));input.value="";
}
function renderRoom(){
 app.replaceChildren();
 const room=el("main","room-shell");
 const top=el("header","room-top");
 const brand=el("div","brand compact");brand.innerHTML='<span class="brand-mark">٦|٦</span><b>DOMINO <i>EL CAFÉ</i></b>';
 const topRight=el("div","room-top-right");
 topRight.append(el("span","room-code",`غرفة #${state.room}`),el("span",`connection ${state.socketStatus}`,state.socketStatus==="connected"?"متصل":"الاتصال: "+state.socketStatus));
 top.append(brand,topRight);
 const table=el("section","game-table");table.append(el("div","table-label","ترابيزة القهوة"));
 const players=state.roomInfo?.players||[];
 const match=state.roomInfo?.match;
 const opponents=el("div","opponents");
 players.filter(p=>p.id!==state.playerId).forEach(p=>{
   const node=el("div","opponent"+(match?.currentPlayerId===p.id?" active-turn":""));
   node.append(el("span","avatar","😎"),el("b","",p.name),el("small","",`${p.handCount??0} حجر · ${p.connected?"متصل":"خرج مؤقتًا"}`));
   const muted=state.voice?.isPeerMuted(p.id)??false;
   const speaker=el("button","peer-audio-btn",muted?"🔇":"🔊");
   speaker.type="button";speaker.title=muted?"تشغيل صوت اللاعب":"كتم صوت اللاعب";speaker.setAttribute("aria-label",speaker.title);
   speaker.addEventListener("click",()=>{state.voice?.togglePeerMute(p.id);renderRoom()});
   node.append(speaker);
   opponents.append(node);
 });
 if(!players.length)opponents.append(el("small","","بنستقبل اللاعبين..."));
 table.append(opponents);
 const chain=el("div","chain");
 enableBoardDrop(chain);
 if(state.board.length)state.board.forEach(t=>chain.append(tileNode(t)));
 else chain.append(el("div","empty-board","اسحب الحجر إلى الترابيزة لتحديد مكانه"));
 table.append(chain);
 const current=players.find(p=>p.id===match?.currentPlayerId);
 const voiceHint=state.voiceStatus==="direct-only"?"الصوت مباشر فقط — بعض الشبكات قد تحتاج TURN":state.voiceStatus==="on"?"الصوت شغال":state.voiceStatus==="muted"?"المايك مكتوم":state.voiceStatus==="background-muted"?"المايك مكتوم بالخلفية":"";
 const statusText=match?.status==="match_over"?"الماتش انتهى! 🏆":match?.status==="round_over"?(match.roundResult?.blocked?"قفلة!":"لاعب خلّص أحجاره!")+" الجولة التالية بعد 5 ثواني":match?(match.currentPlayerId===state.playerId?"دورك يا بطل! اختار الحجر والطرف":"الدور على "+(current?.name||"لاعب آخر")):"مستنيين اكتمال عدد اللاعبين";
 table.append(el("div","turn-status",voiceHint||statusText));
 if(match?.turnDeadline&&match.status==="playing"){
   const clock=el("div","turn-clock","40 ثانية");
   clock.dataset.deadline=String(match.turnDeadline);
   table.append(clock);
 }
 if(match?.roundResult){
   const result=match.roundResult;
   table.append(el("div","round-result",`${result.blocked?"قفلة":"نهاية الجولة"} — الفائز: ${result.winners.join(" و ")} — ${result.points} نقطة`));
 }
 if(match?.scores){
   const scoreLine=Object.entries(match.scores).map(([id,score])=>`${state.mode==="2v2"?(id==="0"?"فريق أ":"فريق ب"):(players.find(p=>p.id===id)?.name||id)}: ${score}`).join("  ·  ");
   table.append(el("div","score-line",scoreLine));
 }
 const handArea=el("section","hand-area");
 handArea.append(el("div","hand-title",`أحجارك: ${state.hand.length}  ·  المخزون: ${match?.boneyardCount??"—"}`));
 const hand=el("div","hand");
 state.hand.forEach(t=>{
   const n=tileNode(t,true);
   if(state.selected===t.id)n.classList.add("chosen");
   if(!match||match.status!=="playing"||match.currentPlayerId!==state.playerId)n.disabled=true;
   hand.append(n);
 });
 handArea.append(hand);
 const reactions=el("div","reaction-tray");["😂","🔥","😎","👏","اشطة عليك","العب يا اسطا"].forEach(value=>{const b=el("button","reaction-btn",value);b.addEventListener("click",()=>sendReaction(value));reactions.append(b)});handArea.append(reactions);
 const chat=el("section","chat-panel");chat.append(el("div","chat-heading","دردشة القهوة ☕"));
 const log=el("div","chat-log");
 state.chat.slice(-30).forEach(item=>{const line=el("div",item.reaction?"chat-line reaction-line":"chat-line");line.append(el("b","",item.name+": "),el("span","",item.text));log.append(line)});
 chat.append(log);
 const form=el("form","chat-form");const input=el("input","chat-input");input.placeholder="قول للشلة حاجة...";input.maxLength=300;
 const send=el("button","primary-btn","إرسال");send.type="submit";
 form.addEventListener("submit",e=>{e.preventDefault();sendChat(input)});form.append(input,send);chat.append(form);
 const tools=el("div","room-tools");
 const landscape=el("button","secondary-btn","ملء الشاشة + أفقي");
 landscape.addEventListener("click",async()=>{try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();await screen.orientation?.lock?.("landscape")}catch{alert("لف الموبايل بالعرض يدويًا — المتصفح مش بيدعم قفل الاتجاه هنا")}});
 const mic=el("button","secondary-btn",state.voice?.enabled?(state.voice.muted?"تشغيل المايك":"كتم المايك"):"تشغيل الصوت");
 mic.disabled=!state.playerId||state.socket?.readyState!==WebSocket.OPEN;
 mic.addEventListener("click",async()=>{try{if(!state.voice.enabled)await state.voice.enable();else state.voice.toggleMute();renderRoom()}catch(error){alert(error.message)}});
 const copy=el("button","secondary-btn","نسخ رقم الغرفة");
 copy.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(state.room);copy.textContent="اتنسخ ✓"}catch{alert("رقم الغرفة: "+state.room)}});
 const back=el("button","ghost-btn","خروج من اللعبة");
 back.addEventListener("click",()=>{
   if(!confirm("هتخرج من اللعبة والغرفة نهائيًا. متأكد؟"))return;
   state.intentionalLeave=true;
   if(state.reconnectTimer)clearTimeout(state.reconnectTimer);
   state.reconnectTimer=null;
   state.voice?.close();state.voice=null;
   if(state.socket?.readyState===WebSocket.OPEN)state.socket.send(JSON.stringify({type:"leave"}));
   state.socket?.close();state.socket=null;
   sessionStorage.removeItem(`domino:${state.room}`);
   sessionStorage.removeItem("domino:lastRoom");
   state.screen="lobby";state.roomInfo=null;state.playerId="";state.hand=[];state.board=[];state.chat=[];state.room="";
   renderLobby();
 });
 tools.append(landscape,mic,copy,back);
 room.append(top,table,handArea,chat,tools);app.append(room);log.scrollTop=log.scrollHeight;
}
function playSelected(end){
 const tile=state.hand.find(t=>t.id===state.selected);
 if(!tile)return;
 if(!getLegalEnds(state.board,tile).includes(end))return alert("الحجر ده مش راكب في الناحية دي");
 if(state.socket?.readyState!==WebSocket.OPEN)return alert("الاتصال بالسيرفر مقطوع");
 state.socket.send(JSON.stringify({type:"play",tileId:tile.id,end}));
 state.selected=null;
}
setInterval(()=>{
 const clock=document.querySelector(".turn-clock");
 if(clock){const left=Math.max(0,Math.ceil((Number(clock.dataset.deadline)-Date.now())/1000));clock.textContent=left+" ثانية";}
},250);
const savedName=sessionStorage.getItem("domino:name");
const savedRoom=sessionStorage.getItem("domino:lastRoom");
if(savedName&&savedRoom){state.name=savedName;joinRoom(savedRoom).catch(()=>{sessionStorage.removeItem("domino:lastRoom");renderLobby()})}
else renderLobby();
