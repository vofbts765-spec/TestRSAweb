import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, query, where, onSnapshot, addDoc, serverTimestamp, getDocs, limit } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const $ = id => document.getElementById(id);
const app = initializeApp(firebaseConfig), auth = getAuth(app), db = getFirestore(app);
let authMode="register", currentUser=null, myProfile=null, privateKey=null, peer=null, stopMessages=null, stopChats=null, pendingDisplayName="";
const encoder = new TextEncoder(), decoder = new TextDecoder();

function toast(msg){$("toast").textContent=msg;$("toast").classList.remove("hidden");setTimeout(()=>$("toast").classList.add("hidden"),3000)}
function show(el,yes=true){$(el).classList.toggle("hidden",!yes)}
function makeCode(){return "SC-"+crypto.getRandomValues(new Uint8Array(3)).reduce((s,b)=>s+b.toString(16).padStart(2,"0"),"").toUpperCase()}
function b64(bytes){return btoa(String.fromCharCode(...new Uint8Array(bytes)))}
function unb64(s){return Uint8Array.from(atob(s),c=>c.charCodeAt(0))}
function keyStoreName(uid){return "securechat-rsa-private-"+uid}

async function createKeys(){
  const pair=await crypto.subtle.generateKey({name:"RSA-OAEP",modulusLength:3072,publicExponent:new Uint8Array([1,0,1]),hash:"SHA-256"},true,["encrypt","decrypt"]);
  const pub=await crypto.subtle.exportKey("jwk",pair.publicKey);
  // MVP storage: private JWK stays in this browser's localStorage. For production, encrypt it
  // with a separately entered recovery passphrase and store it in IndexedDB.
  const priv=await crypto.subtle.exportKey("jwk",pair.privateKey);
  localStorage.setItem(keyStoreName(currentUser.uid),JSON.stringify(priv));
  privateKey=pair.privateKey;
  return pub;
}
async function importPrivate(){
  const raw=localStorage.getItem(keyStoreName(currentUser.uid));
  if(!raw) return null;
  const jwk=JSON.parse(raw);
  return crypto.subtle.importKey("jwk",jwk,{name:"RSA-OAEP",hash:"SHA-256"},false,["decrypt"]);
}
async function ensureProfile(displayName=""){
  const ref=doc(db,"users",currentUser.uid), snap=await getDoc(ref);
  let data=snap.exists()?snap.data():null;
  if(!data){
    data={uid:currentUser.uid,name:displayName||currentUser.email.split("@")[0],code:makeCode(),publicKey:null,createdAt:serverTimestamp()};
    await setDoc(ref,data);
  }
  myProfile=data;
  privateKey=await importPrivate();
  if(!privateKey){
    const pub=await createKeys();
    await setDoc(ref,{publicKey:pub},{merge:true});
    myProfile.publicKey=pub;
  } else if(!data.publicKey){
    const pub=await createKeys(); await setDoc(ref,{publicKey:pub},{merge:true}); myProfile.publicKey=pub;
  }
  $("myName").textContent=data.name; $("myAvatar").textContent=(data.name||"U")[0].toUpperCase(); $("myCode").textContent=data.code;
  $("keyStatus").textContent="RSA-3072 key ready on this device";
}
function renderAuth(){show("authView",true);show("appView",false);show("account",false)}
async function enterApp(user, displayName=""){currentUser=user;show("authView",false);show("appView",true);show("account",true);$("account").textContent=user.email;await ensureProfile(displayName);pendingDisplayName="";listenChats()}
$("authForm").addEventListener("submit",async e=>{
  e.preventDefault();const email=$("email").value.trim(),password=$("password").value,name=$("displayName").value.trim();
  try{
    if(authMode==="register"){if(!name)throw Error("Please enter your display name.");pendingDisplayName=name;await createUserWithEmailAndPassword(auth,email,password)}
    else await signInWithEmailAndPassword(auth,email,password);
  }catch(err){toast(err.message)}
});
document.querySelectorAll(".tab").forEach(btn=>btn.addEventListener("click",()=>{authMode=btn.dataset.tab;document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===btn));$("nameLabel").classList.toggle("hidden",authMode==="login");$("displayName").classList.toggle("hidden",authMode==="login");$("displayName").required=authMode==="register";$("authSubmit").textContent=authMode==="register"?"Create account":"Sign in"}));
onAuthStateChanged(auth,async user=>{if(user){try{await enterApp(user,pendingDisplayName)}catch(e){toast("Setup error: "+e.message)}}else{currentUser=null;renderAuth()}});
$("logoutBtn").onclick=()=>signOut(auth);
$("copyId").onclick=async()=>{await navigator.clipboard.writeText(myProfile.code);toast("Chat ID copied")};
$("newChatBtn").onclick=$("emptyNewChat").onclick=()=>{$("peerIdInput").value="";show("peerPreview",false);show("openChatBtn",false);$("newChatDialog").showModal()};
let foundPeer=null;
$("findPeerBtn").onclick=async()=>{
  const code=$("peerIdInput").value.trim().toUpperCase();if(!code)return;
  try{const q=query(collection(db,"users"),where("code","==",code),limit(1)),res=await getDocs(q);
    if(res.empty){foundPeer=null;toast("No user found with this ID.");return}
    foundPeer=res.docs[0].data();if(foundPeer.uid===currentUser.uid){toast("That is your own ID.");return}
    if(!foundPeer.publicKey){toast("This user has not generated encryption keys yet.");return}
    $("peerPreview").innerHTML=`<b>${escapeHtml(foundPeer.name)}</b><small>${escapeHtml(foundPeer.code)}</small>`;
    show("peerPreview",true);show("openChatBtn",true);
  }catch(e){toast(e.message)}
};
$("openChatBtn").onclick=()=>{if(foundPeer){openChat(foundPeer);$("newChatDialog").close()}};
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function chatId(a,b){return [a,b].sort().join("_")}
function listenChats(){
  if(stopChats)stopChats();
  const q=query(collection(db,"messages"),where("participants","array-contains",currentUser.uid));
  stopChats=onSnapshot(q,async snap=>{
    const peers=new Map();
    snap.docs.forEach(d=>{const m=d.data(),id=m.senderId===currentUser.uid?m.receiverId:m.senderId;if(!peers.has(id))peers.set(id,m)});
    $("chatList").innerHTML="";
    if(!peers.size){$("chatList").innerHTML='<p class="muted small">No conversations yet.</p>';return}
    for(const [uid,m] of peers){let p;try{p=(await getDoc(doc(db,"users",uid))).data()}catch{continue}if(!p)continue;
      const el=document.createElement("div");el.className="chat-item"+(peer?.uid===uid?" active":"");el.innerHTML=`<div class="avatar">${escapeHtml((p.name||"U")[0].toUpperCase())}</div><div><b>${escapeHtml(p.name)}</b><small>${escapeHtml(p.code)}</small></div>`;el.onclick=()=>openChat(p);$("chatList").append(el)}
  },e=>toast("Chat list: "+e.message));
}
async function openChat(p){
  peer=p;show("emptyState",false);show("chatView",true);$("peerName").textContent=p.name;$("peerCode").textContent=p.code;$("peerAvatar").textContent=(p.name||"U")[0].toUpperCase();
  if(stopMessages)stopMessages();
  const q=query(collection(db,"messages"),where("participants","array-contains",currentUser.uid));
  stopMessages=onSnapshot(q,async snap=>{
    const relevant=snap.docs.map(d=>({id:d.id,...d.data()})).filter(m=>(m.senderId===currentUser.uid&&m.receiverId===p.uid)||(m.senderId===p.uid&&m.receiverId===currentUser.uid)).sort((a,b)=>(a.createdAt?.toMillis?.()||0)-(b.createdAt?.toMillis?.()||0));
    $("messages").innerHTML="";
    for(const m of relevant){
      let text="[Unable to decrypt this message on this device]";
      try{text=await decryptMessage(m)}catch(err){console.warn(err)}
      const div=document.createElement("div");div.className="bubble "+(m.senderId===currentUser.uid?"mine":"theirs");div.innerHTML=`${escapeHtml(text)}<time>${m.createdAt?.toDate?.().toLocaleTimeString?.([], {hour:"2-digit",minute:"2-digit"})||"Sending…"}</time>`;$("messages").append(div);
    }
    $("messages").scrollTop=$("messages").scrollHeight;
  },e=>toast("Message error: "+e.message));
}
async function encryptMessage(text,recipient){
  const aes=await crypto.subtle.generateKey({name:"AES-GCM",length:256},true,["encrypt","decrypt"]);
  const raw=await crypto.subtle.exportKey("raw",aes),iv=crypto.getRandomValues(new Uint8Array(12));
  const cipher=await crypto.subtle.encrypt({name:"AES-GCM",iv},aes,encoder.encode(text));
  const recipientPub=await crypto.subtle.importKey("jwk",recipient.publicKey,{name:"RSA-OAEP",hash:"SHA-256"},false,["encrypt"]);
  const ownPub=await crypto.subtle.importKey("jwk",myProfile.publicKey,{name:"RSA-OAEP",hash:"SHA-256"},false,["encrypt"]);
  const [wrappedForRecipient,wrappedForSender]=await Promise.all([crypto.subtle.encrypt({name:"RSA-OAEP"},recipientPub,raw),crypto.subtle.encrypt({name:"RSA-OAEP"},ownPub,raw)]);
  return {ciphertext:b64(cipher),iv:b64(iv),wrappedForRecipient:b64(wrappedForRecipient),wrappedForSender:b64(wrappedForSender)};
}
async function decryptMessage(m){
  if(!privateKey)throw Error("Private key is not available on this device.");
  const wrapped=m.senderId===currentUser.uid?m.wrappedForSender:m.wrappedForRecipient;
  const raw=await crypto.subtle.decrypt({name:"RSA-OAEP"},privateKey,unb64(wrapped));
  const aes=await crypto.subtle.importKey("raw",raw,{name:"AES-GCM"},false,["decrypt"]);
  const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:unb64(m.iv)},aes,unb64(m.ciphertext));
  return decoder.decode(plain);
}
$("sendForm").addEventListener("submit",async e=>{
  e.preventDefault();const text=$("messageInput").value.trim();if(!text||!peer)return;
  const btn=$("sendForm").querySelector("button");btn.disabled=true;
  try{const enc=await encryptMessage(text,peer);await addDoc(collection(db,"messages"),{...enc,senderId:currentUser.uid,receiverId:peer.uid,participants:[currentUser.uid,peer.uid],createdAt:serverTimestamp()});$("messageInput").value=""}
  catch(err){toast("Could not send: "+err.message)}finally{btn.disabled=false}
});
