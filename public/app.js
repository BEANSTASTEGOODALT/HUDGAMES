const $=s=>document.querySelector(s),S={games:[],user:null,friends:[],active:null,mode:"login"};
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function api(url,opt={}){const r=await fetch(url,{credentials:"same-origin",headers:{"Content-Type":"application/json",...(opt.headers||{})},...opt});const t=r.headers.get("content-type")||"";const b=t.includes("json")?await r.json():await r.text();if(!r.ok)throw Error(b.error||b||"Request failed");return b}
function go(v){document.querySelectorAll(".view").forEach(x=>x.classList.add("hidden"));$("#"+v).classList.remove("hidden");document.querySelectorAll(".nav").forEach(x=>x.classList.toggle("active",x.dataset.view===v));if(v==="friends")loadFriends();if(v==="messages")loadConversations();if(v==="favorites")loadFavorites();if(v==="library")loadLibrary();window.scrollTo(0,0)}
function card(g){return `<article class="card" data-id="${esc(g.id)}"><div class="cover">${g.cover?`<img src="${esc(g.cover)}">`:esc((g.name||"?")[0].toUpperCase())}</div><div class="card-body"><div class="card-title">${esc(g.name)}</div><div class="card-meta">${g.offline?'<span class="offline">● Offline available</span>':"Game"}</div></div></article>`}
function bindCards(root){root.querySelectorAll("[data-id]").forEach(x=>x.onclick=()=>showGame(x.dataset.id))}
function render(){for(const [id,list] of [["home-games",S.games.slice(0,8)],["browse-games",S.games]]){$("#"+id).innerHTML=list.map(card).join("");bindCards($("#"+id))}$("#count").textContent=`${S.games.length.toLocaleString()} games`}
async function init(){try{S.user=(await api("/api/me")).user;account();S.games=(await api("/api/games")).games;render();}catch(e){console.error(e)}connection()}
function account(){$("#account").textContent=S.user?S.user.displayName+" · Sign out":"Sign in";$("#auth-top").textContent=S.user?"Account":"Sign in"}
function auth(mode="login"){S.mode=mode;$("#auth-title").textContent=mode==="login"?"Sign in":"Create account";$("#auth-submit").textContent=mode==="login"?"Sign in":"Create account";$("#display-label").classList.toggle("hidden",mode==="login");$("#switch-auth").textContent=mode==="login"?"Create an account":"I already have an account";$("#auth-error").textContent="";$("#auth-dialog").showModal()}
$("#auth-top").onclick=()=>S.user?logout():auth();$("#account").onclick=()=>S.user?logout():auth();$("#close-auth").onclick=()=>$("#auth-dialog").close();$("#switch-auth").onclick=()=>auth(S.mode==="login"?"register":"login");
async function logout(){if(confirm("Sign out of HUDGAMES?")){await api("/api/logout",{method:"POST",body:"{}"});S.user=null;account()}}
$("#auth-form").onsubmit=async e=>{e.preventDefault();try{const b=await api("/api/"+S.mode,{method:"POST",body:JSON.stringify({username:$("#username").value,password:$("#password").value,displayName:$("#display-name").value})});S.user=b.user;account();$("#auth-dialog").close()}catch(x){$("#auth-error").textContent=x.message}};
async function showGame(id){try{const g=(await api("/api/games/"+encodeURIComponent(id))).game;go("detail");$("#game-detail").innerHTML=`<div class="detail-hero"><small>GAME DETAILS</small><h1>${esc(g.name)}</h1></div><p class="muted">${esc(g.description||"Ready when you are.")}</p><div class="actions"><button class="primary" id="play">▶ Play</button>${g.offline?'<button id="download">↓ Download</button>':""}<button id="favorite">${g.favorite?"♥ Saved":"♡ Favourite"}</button></div><p class="muted">${g.offline?"Offline download available":"Online play"}</p>`;$("#play").onclick=()=>play(g);$("#favorite").onclick=async()=>{if(!S.user)return auth();await api("/api/favorites/"+encodeURIComponent(g.id),{method:"POST",body:"{}"});showGame(g.id)};if($("#download"))$("#download").onclick=()=>download(g)}catch(e){alert(e.message)}}

// HUDGAMES_SEPARATE_GAME_ORIGIN

async function play(g) {
    if (S.user) {
        api("/api/activity", {
            method: "POST",
            body: JSON.stringify({ gameId: g.id })
        }).catch(() => {});
    }

    const gameUrl = new URL(
        "/api/games/" + encodeURIComponent(g.id) + "/play",
        location.origin
    );

    window.open(gameUrl.href, "_blank", "noopener,noreferrer");
}

const dbOpen=()=>new Promise((ok,no)=>{const r=indexedDB.open("hudgames-offline",1);r.onupgradeneeded=()=>r.result.createObjectStore("games",{keyPath:"id"});r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});
async function offlineGet(id){try{const d=await dbOpen();return await new Promise((ok,no)=>{const r=d.transaction("games").objectStore("games").get(id);r.onsuccess=()=>ok(r.result?.blob||null);r.onerror=()=>no(r.error)})}catch{return null}}
async function download(g){try{const r=await fetch("/api/games/"+encodeURIComponent(g.id)+"/play");if(!r.ok)throw Error("Download failed.");const blob=await r.blob(),d=await dbOpen();await new Promise((ok,no)=>{const tx=d.transaction("games","readwrite");tx.objectStore("games").put({id:g.id,name:g.name,blob});tx.oncomplete=ok;tx.onerror=()=>no(tx.error)});alert(g.name+" saved on this device for offline use.")}catch(e){alert(e.message)}}
async function loadLibrary(){if(!S.user){$("#library-games").innerHTML='<div class="empty">Sign in to save favourites.</div>';return}const f=(await api("/api/favorites")).games;const d=await offlineList();const map=new Map([...f,...d.map(x=>({id:x.id,name:x.name,offline:true}))].map(x=>[x.id,x]));$("#library-games").innerHTML=[...map.values()].map(card).join("");bindCards($("#library-games"))}
async function offlineList(){try{const d=await dbOpen();return await new Promise((ok,no)=>{const r=d.transaction("games").objectStore("games").getAll();r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)})}catch{return[]}}
async function loadFavorites(){if(!S.user){$("#favorite-games").innerHTML='<div class="empty">Sign in to save favourites.</div>';return}const g=(await api("/api/favorites")).games;$("#favorite-games").innerHTML=g.map(card).join("")||'<div class="empty">No favourites yet.</div>';bindCards($("#favorite-games"))}
async function loadFriends(){if(!S.user){$("#friend-list").innerHTML='<div class="empty">Sign in to add friends.</div>';return}try{const [f,r]=await Promise.all([api("/api/friends"),api("/api/requests")]);S.friends=f.friends;$("#requests").innerHTML=r.requests.map(x=>`<div class="request"><div class="friend-info">${esc(x.display_name)} · ${esc(x.friend_code)}</div><button class="small" data-accept="${esc(x.id)}">Accept</button><button class="small" data-decline="${esc(x.id)}">Decline</button></div>`).join("")||'<p class="muted">No pending requests.</p>';$("#friend-list").innerHTML=S.friends.map(x=>`<div class="friend"><i class="dot ${x.online?"on":""}"></i><div class="friend-info"><b>${esc(x.displayName)}</b><div class="status ${x.playingName&&x.online?"playing":""}">${x.online?(x.playingName?"Playing "+esc(x.playingName):"Online"):"Offline"}</div></div><button class="small" data-message="${esc(x.id)}">Message</button></div>`).join("")||'<div class="empty">No friends yet.</div>';$("#requests").querySelectorAll("[data-accept]").forEach(b=>b.onclick=()=>requestAction(b.dataset.accept,"accept"));$("#requests").querySelectorAll("[data-decline]").forEach(b=>b.onclick=()=>requestAction(b.dataset.decline,"decline"));$("#friend-list").querySelectorAll("[data-message]").forEach(b=>b.onclick=()=>{S.active=b.dataset.message;go("messages");loadConversations()})}catch(e){$("#friend-list").textContent=e.message}}
async function requestAction(id,a){await api(`/api/requests/${id}/${a}`,{method:"POST",body:"{}"});loadFriends()}
$("#add-friend").onclick=async()=>{try{await api("/api/friends/request",{method:"POST",body:JSON.stringify({friendCode:$("#friend-code").value})});$("#friend-result").textContent="Friend request sent.";$("#friend-code").value=""}catch(e){$("#friend-result").textContent=e.message}};
async function loadConversations(){if(!S.user){$("#conversations").innerHTML='<p class="empty">Sign in to chat.</p>';return}const f=(await api("/api/friends")).friends;S.friends=f;$("#conversations").innerHTML=f.map(x=>`<button class="conversation ${S.active===x.id?"active":""}" data-convo="${esc(x.id)}">${esc(x.displayName)} ${x.online?"●":""}</button>`).join("")||'<p class="muted">Add friends to chat.</p>';$("#conversations").querySelectorAll("[data-convo]").forEach(b=>b.onclick=()=>{S.active=b.dataset.convo;loadChat();loadConversations()});if(S.active)loadChat()}
async function loadChat(){const f=S.friends.find(x=>x.id===S.active);if(!f)return;try{const m=(await api("/api/messages/"+encodeURIComponent(f.id))).messages;$("#chat").innerHTML=`<div class="chat-head">${esc(f.displayName)}</div><div id="chat-log" class="chat-log">${m.map(x=>`<div class="bubble ${x.from_id===S.user.id?"mine":""}">${esc(x.body)}<br/><small>${new Date(x.created).toLocaleString()}</small></div>`).join("")}</div><form id="compose" class="compose"><input id="message-text" maxlength="2000" placeholder="Write a message…"><button class="primary">Send</button></form>`;$("#compose").onsubmit=async e=>{e.preventDefault();const i=$("#message-text"),body=i.value.trim();if(!body)return;i.value="";await api("/api/messages/"+encodeURIComponent(f.id),{method:"POST",body:JSON.stringify({body})});loadChat()};$("#chat-log").scrollTop=$("#chat-log").scrollHeight}catch(e){$("#chat").textContent=e.message}}
$("#search").oninput=()=>{const q=$("#search").value.toLowerCase().trim(),box=$("#suggestions");if(!q){box.innerHTML="";return}const hits=S.games.filter(g=>g.name.toLowerCase().includes(q)).slice(0,8);box.innerHTML=hits.map(g=>`<button data-pick="${esc(g.id)}">${esc(g.name)}</button>`).join("")||"<button>No games found</button>";box.querySelectorAll("[data-pick]").forEach(b=>b.onclick=()=>{box.innerHTML="";$("#search").value="";showGame(b.dataset.pick)})};
$("#sort").onchange=()=>{const a=[...S.games],v=$("#sort").value;if(v==="az")a.sort((x,y)=>x.name.localeCompare(y.name));if(v==="za")a.sort((x,y)=>y.name.localeCompare(x.name));$("#browse-games").innerHTML=a.map(card).join("");bindCards($("#browse-games"))};
function connection(){$("#network").textContent=navigator.onLine?"● Online":"● Offline mode"}window.addEventListener("online",connection);window.addEventListener("offline",connection);
document.querySelectorAll("[data-view]").forEach(b=>b.onclick=()=>go(b.dataset.view));document.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
if("serviceWorker"in navigator)navigator.serviceWorker.register("/sw.js").catch(()=>{});
setInterval(()=>{if(S.user){api("/api/activity",{method:"POST",body:JSON.stringify({gameId:null})}).catch(()=>{});if(!$("#friends").classList.contains("hidden"))loadFriends();if(!$("#messages").classList.contains("hidden")&&S.active)loadChat()}},30000);
init();



/* HUDGAMES quality-of-life patch */
(function () {
  const dailyOrder = (items) => {
    const day = new Date().toISOString().slice(0, 10);
    return [...items].sort((a, b) => {
      const score = (g) => {
        let h = 2166136261;
        const value = day + ":" + String(g.id);
        for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619);
        return h >>> 0;
      };
      return score(a) - score(b);
    });
  };

  // The imported Drive catalogue has no trustworthy added-date field.
  // Use a daily rotating discovery selection instead of falsely calling
  // the first eight catalogue entries "Recently added".
  render = function () {
    const featured = dailyOrder(S.games).slice(0, 8);
    const browse = [...S.games];
    const sort = $("#sort");
    if (sort && sort.value === "az") browse.sort((a, b) => String(a.name || a.title || "").localeCompare(String(b.name || b.title || "")));
    if (sort && sort.value === "za") browse.sort((a, b) => String(b.name || b.title || "").localeCompare(String(a.name || a.title || "")));
    $("#home-games").innerHTML = featured.map(card).join("");
    $("#browse-games").innerHTML = browse.map(card).join("");
    bindCards($("#home-games"));
    bindCards($("#browse-games"));
    $("#count").textContent = `${S.games.length.toLocaleString()} games`;
  };

  // Profile dialog with the user's actual friend code and a working copy action.
  function profileDialog() {
    let dialog = $("#profile-dialog");
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.id = "profile-dialog";
      dialog.innerHTML = `
        <button class="close" id="profile-close" aria-label="Close">×</button>
        <small>YOUR HUDGAMES ACCOUNT</small>
        <h2 id="profile-name"></h2>
        <p class="muted">Your friend code</p>
        <div class="friend-code-row"><code id="profile-code"></code><button class="small" id="copy-code">Copy</button></div>
        <p id="copy-status" class="muted"></p>
        <button class="primary profile-signout" id="profile-signout">Sign out</button>`;
      document.body.appendChild(dialog);
      $("#profile-close").onclick = () => dialog.close();
      $("#copy-code").onclick = async () => {
        const code = $("#profile-code").textContent;
        try {
          await navigator.clipboard.writeText(code);
          $("#copy-status").textContent = "Friend code copied.";
        } catch {
          const field = document.createElement("textarea");
          field.value = code;
          document.body.appendChild(field);
          field.select();
          document.execCommand("copy");
          field.remove();
          $("#copy-status").textContent = "Friend code copied.";
        }
      };
      $("#profile-signout").onclick = async () => {
        if (!confirm("Sign out of HUDGAMES?")) return;
        await api("/api/logout", { method: "POST", body: "{}" });
        S.user = null;
        S.friends = [];
        dialog.close();
        account();
        go("home");
        render();
      };
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) dialog.close();
      });
    }
    $("#profile-name").textContent = S.user.displayName || S.user.username;
    $("#profile-code").textContent = S.user.friendCode || "Unavailable";
    $("#copy-status").textContent = "";
    return dialog;
  }

  account = function () {
    const label = S.user ? (S.user.displayName || S.user.username) : "Sign in";
    $("#account").textContent = label;
    $("#auth-top").textContent = S.user ? "Account" : "Sign in";
  };

  $("#account").onclick = () => {
    if (!S.user) return auth();
    profileDialog().showModal();
  };
  $("#auth-top").onclick = () => {
    if (!S.user) return auth();
    profileDialog().showModal();
  };

  // Add a clear "Add to library" action. The existing favorites table is the
  // persistent account library; locally downloaded games remain listed too.
  showGame = async function (id) {
    try {
      const g = (await api("/api/games/" + encodeURIComponent(id))).game;
      go("detail");
      $("#game-detail").innerHTML = `
        <div class="detail-hero"><small>GAME DETAILS</small><h1>${esc(g.name)}</h1></div>
        <p class="muted">${esc(g.description || "Ready when you are.")}</p>
        <div class="actions">
          <button class="primary" id="play">▶ Play</button>
          <button id="library-toggle">${g.favorite ? "✓ In your library — Remove" : "+ Add to library"}</button>
          ${g.offline ? '<button id="download">↓ Download for offline</button>' : ""}
        </div>
        <p class="muted">${g.offline ? "Offline download available" : "Online play"}</p>`;
      $("#play").onclick = () => play(g);
      $("#library-toggle").onclick = async () => {
        if (!S.user) return auth();
        try {
          await api("/api/favorites/" + encodeURIComponent(g.id), { method: "POST", body: "{}" });
          await showGame(g.id);
        } catch (error) { alert(error.message); }
      };
      if ($("#download")) $("#download").onclick = () => download(g);
    } catch (error) { alert(error.message); }
  };

  // Refresh library after sign-in and give useful empty states.
  loadLibrary = async function () {
    if (!S.user) {
      $("#library-games").innerHTML = '<div class="empty">Sign in to build your library.</div>';
      return;
    }
    try {
      const [favourites, offline] = await Promise.all([api("/api/favorites"), offlineList()]);
      const map = new Map();
      for (const game of favourites.games) map.set(String(game.id), game);
      for (const game of offline) {
        const previous = map.get(String(game.id)) || {};
        map.set(String(game.id), { ...previous, id: String(game.id), name: previous.name || game.name, offline: true });
      }
      const games = [...map.values()];
      $("#library-games").innerHTML = games.map(card).join("") || '<div class="empty">Your library is empty. Open a game and choose “Add to library”.</div>';
      bindCards($("#library-games"));
    } catch (error) {
      $("#library-games").innerHTML = `<div class="empty">${esc(error.message)}</div>`;
    }
  };

  // Make autocomplete readable, searchable across name/title, and keyboard-friendly.
  const search = $("#search");
  const suggestions = $("#suggestions");
  if (suggestions) suggestions.classList.add("suggestions");
  search.oninput = () => {
    const q = search.value.trim().toLocaleLowerCase();
    if (!q) { suggestions.innerHTML = ""; suggestions.classList.remove("open"); return; }
    const hits = S.games
      .filter(g => String(g.name || g.title || "").toLocaleLowerCase().includes(q))
      .slice(0, 9);
    suggestions.innerHTML = hits.map(g => `
      <button type="button" data-pick="${esc(g.id)}">
        <span class="suggestion-title">${esc(g.name || g.title || "Untitled")}</span>
        <span class="suggestion-subtitle">Open game</span>
      </button>`).join("") || '<div class="suggestion-empty">No matching games</div>';
    suggestions.classList.add("open");
    suggestions.querySelectorAll("[data-pick]").forEach(button => {
      button.onclick = () => {
        const id = button.dataset.pick;
        suggestions.innerHTML = "";
        suggestions.classList.remove("open");
        search.value = "";
        showGame(id);
      };
    });
  };
  document.addEventListener("click", event => {
    if (!event.target.closest(".search")) suggestions.classList.remove("open");
  });

  // Put the current user's friend code directly on the Friends page as well.
  const friendsHeading = $("#friends h1");
  if (friendsHeading && !$("#my-friend-code")) {
    const panel = document.createElement("div");
    panel.className = "panel own-code-panel";
    panel.id = "my-friend-code";
    panel.innerHTML = '<div><h3>Your friend code</h3><p class="muted">Share this code so friends can add you.</p><code id="friends-code-value">Sign in to view your code</code></div><button class="small" id="friends-copy-code">Copy code</button>';
    friendsHeading.insertAdjacentElement("afterend", panel);
    $("#friends-copy-code").onclick = async () => {
      if (!S.user || !S.user.friendCode) return;
      try {
        await navigator.clipboard.writeText(S.user.friendCode);
        $("#friends-copy-code").textContent = "Copied!";
      } catch {
        $("#friends-code-value").textContent = S.user.friendCode;
      }
    };
  }

  const originalLoadFriends = loadFriends;
  loadFriends = async function () {
    await originalLoadFriends();
    const value = $("#friends-code-value");
    if (value) value.textContent = S.user?.friendCode || "Sign in to view your code";
  };

  // Presence heartbeats must not clear the currently-playing game.
  // Explicit gameId:null is still sent when the player is closed.
  const heartbeat = () => {
    if (S.user) api("/api/activity", { method: "POST", body: "{}" }).catch(() => {});
  };
  window.addEventListener("focus", heartbeat);
  window.addEventListener("online", heartbeat);

  // Re-run the new account label after initial /api/me has completed.
  const oldInit = init;
  init = async function () {
    await oldInit();
    account();
    if (S.user) {
      const value = $("#friends-code-value");
      if (value) value.textContent = S.user.friendCode || "Unavailable";
    }
  };
  // oldInit was already invoked by the original script; its asynchronous
  // account() call will resolve to this updated function binding.
})();

