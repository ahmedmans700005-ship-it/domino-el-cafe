import "./style.css";
import { makeSet, shuffle, getLegalEnds, placeTile, drawUntilPlayable } from "./game-engine.js";

const app = document.querySelector("#app");
const state = {
  name:"", mode:"1v1", target:101, room:"", screen:"lobby",
  hand:[], board:[], pile:[], selected:null, drawNote:"",
  playerId:"", roomInfo:null, socket:null, socketStatus:"connecting", chat:[]
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
  state.room=data.code;
  await enterRoom();
}
async function joinRoom(code) {
  const response=await fetch(`/api/rooms/${code}`);
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(data.error||"الغرفة غير موجودة");
  if(data.players?.length>=data.maxPlayers && !data.players.some(p=>p.id===sessionStorage.getItem(`domino:${code}`))) throw new Error("الغرفة مكتملة");
  state.room=code; state.roomInfo=data;
  await enterRoom();
}
async function enterRoom() {
  state.screen="room"; state.chat=state.roomInfo?.chat||[]; startDemo();
  const savedId=sessionStorage.getItem(`domino:${state.room}`)||"";
  const scheme=location.protocol==="https:"?"wss:":"ws:";
  const query=new URLSearchParams({name:state.name});
  if(savedId)query.set("playerId",savedId);
  const socket=new WebSocket(`${scheme}//${location.host}/ws/${state.room}?${query}`);
  state.socket=socket; state.socketStatus="connecting"; renderRoom();
  socket.addEventListener("open",()=>{state.socketStatus="connected";renderRoom()});
  socket.addEventListener("message",event=>{
    let message;try{message=JSON.parse(event.data)}catch{return}
    if(message.type==="welcome"){
      state.playerId=message.playerId;sessionStorage.setItem(`domino:${state.room}`,state.playerId);
      state.roomInfo=message.room;state.chat=message.room.chat||[];
    } else if(message.type==="room") state.roomInfo=message.room;
    else if(message.type==="chat") state.chat=[...state.chat,message.message].slice(-30);
    renderRoom();
  });
  socket.addEventListener("close",()=>{state.socketStatus="disconnected";renderRoom()});
  socket.addEventListener("error",()=>{state.socketStatus="error";renderRoom()});
}
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
  const foot=el("div","footnote","الغرف والشات الفوري متصلان بالسيرفر عند النشر — اللعب والصوت قيد الاستكمال");
  shell.append(brand,hero,panel,foot);app.append(shell);
}
function tileNode(tile,clickable=false){
  const n=el("button","domino-tile"+(clickable?" hand-tile":""));n.type="button";n.setAttribute("aria-label",`${tile.a} و ${tile.b}`);
  n.innerHTML=`<span>${dots(tile.a)}</span><i></i><span>${dots(tile.b)}</span>`;
  if(clickable){
    n.addEventListener("click",()=>{state.selected=state.selected===tile.id?null:tile.id;renderRoom()});
    n.addEventListener("pointerdown",e=>{if(e.pointerType==="touch")n.setPointerCapture(e.pointerId)});
    n.addEventListener("pointerup",e=>{
      if(e.pointerType!=="touch"||!state.selected)return;
      const target=document.elementFromPoint(e.clientX,e.clientY)?.closest("[data-end]");
      if(target)playSelected(target.dataset.end);
    });
  }
  return n;
}
function dots(n){return "●".repeat(n)||"·"}
function startDemo(){
 const all=shuffle(makeSet());state.hand=all.splice(0,7);state.pile=all;state.board=[];state.selected=null;
}
function sendChat(input){
 const text=input.value.trim();if(!text)return;
 if(state.socket?.readyState!==WebSocket.OPEN)return alert("الاتصال بالغرفة مش شغال");
 state.socket.send(JSON.stringify({type:"chat",text}));input.value="";
}
function renderRoom(){
 app.replaceChildren();const room=el("main","room-shell");
 const top=el("header","room-top");const brand=el("div","brand compact");brand.innerHTML='<span class="brand-mark">٦|٦</span><b>DOMINO <i>EL CAFÉ</i></b>';
 const topRight=el("div","room-top-right");topRight.append(el("span","room-code",`غرفة #${state.room}`),el("span",`connection ${state.socketStatus}`,state.socketStatus==="connected"?"متصل":"الاتصال: "+state.socketStatus));top.append(brand,topRight);
 const table=el("section","game-table");table.append(el("div","table-label","ترابيزة القهوة"));
 const players=state.roomInfo?.players||[];
 const opponents=el("div","opponents");
 players.filter(p=>p.id!==state.playerId).forEach(p=>{const node=el("div","opponent");node.append(el("span","avatar","😎"),el("b","",p.name),el("small",p.connected?"online":"offline",p.connected?"متصل":"خرج مؤقتًا"));opponents.append(node)});
 if(!players.length)opponents.append(el("small","", "بنستقبل اللاعبين..."));
 table.append(opponents);
 const chain=el("div","chain");if(state.board.length){state.board.forEach(t=>chain.append(tileNode(t)))}else chain.append(el("div","empty-board","ترابيزة اللعب هتبدأ هنا بعد اكتمال نظام المباراة"));table.append(chain);
 const status=el("div","turn-status",state.roomInfo?.status==="full"?"اكتمل عدد اللاعبين — تجهيز الجولة":state.selected?"اختار الطرف اللي هتركب عليه":"مستنيين باقي الشلة");
 table.append(status);
 const ends=el("div","end-actions");["left","right"].forEach(end=>{const b=el("button","end-btn",end==="left"?"⬅️ الشمال":"اليمين ➡️");b.dataset.end=end;b.addEventListener("click",()=>playSelected(end));ends.append(b)});table.append(ends);
 const handArea=el("section","hand-area");handArea.append(el("div","hand-title",`معاك ${state.hand.length} أحجار — تجربة محلية`));
 const hand=el("div","hand");state.hand.forEach(t=>{const n=tileNode(t,true);if(state.selected===t.id)n.classList.add("chosen");hand.append(n)});handArea.append(hand);
 const chat=el("section","chat-panel");chat.append(el("div","chat-heading","دردشة القهوة ☕"));
 const log=el("div","chat-log");state.chat.slice(-30).forEach(item=>{const line=el("div","chat-line");line.append(el("b","",item.name+": "),el("span","",item.text));log.append(line)});chat.append(log);
 const form=el("form","chat-form");const input=el("input","chat-input");input.placeholder="قول للشلة حاجة...";input.maxLength=300;const send=el("button","primary-btn","إرسال");send.type="submit";form.addEventListener("submit",e=>{e.preventDefault();sendChat(input)});form.append(input,send);chat.append(form);
 const tools=el("div","room-tools");const copy=el("button","secondary-btn","نسخ رقم الغرفة");copy.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(state.room);copy.textContent="اتنسخ ✓"}catch{alert("رقم الغرفة: "+state.room)}});const back=el("button","ghost-btn","خروج للقائمة");back.addEventListener("click",()=>{state.socket?.close();state.socket=null;state.screen="lobby";state.roomInfo=null;renderLobby()});tools.append(copy,back);
 room.append(top,table,handArea,chat,tools);app.append(room);log.scrollTop=log.scrollHeight;
}
function playSelected(end){
 const tile=state.hand.find(t=>t.id===state.selected);if(!tile)return;
 if(!getLegalEnds(state.board,tile).includes(end)){alert("الحجر ده مش راكب في الناحية دي");return}
 state.board=placeTile(state.board,tile,end);state.hand=state.hand.filter(t=>t.id!==tile.id);state.selected=null;state.drawNote="";
 renderRoom();
}
renderLobby();
