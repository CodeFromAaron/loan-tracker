import { format, parseISO, isBefore } from "date-fns";

const LS_KEY = "money_owed_aud_v1";
let editingId = null;
let role = "me"; // "me" or "mother"
const PIN_CODE = "2003";

const $ = sel => document.querySelector(sel);
const entriesEl = $("#entries");
const emptyEl = $("#empty");
const form = $("#entryForm");
const personSelect = $("#person");
const personOther = $("#personOther");
const amountInput = $("#amount");
const dateInput = $("#dueDate");
const statusInput = $("#status");
const paidAmountInput = $("#paidAmount"); // paid amount in AUD
const saveBtn = $("#saveBtn");
const clearBtn = $("#clearBtn");
const exportCsv = $("#exportCsv");
const importCsv = $("#importCsv");
const fileInput = $("#fileInput");

// archived UI elements
const toggleArchivedBtn = document.getElementById("toggleArchived");
const archivedSection = document.getElementById("archivedSection");
const archivedEntriesEl = document.getElementById("archivedEntries");
const archivedEmptyEl = document.getElementById("archivedEmpty");
const clearArchivedBtn = document.getElementById("clearArchived");
let showingArchived = false;

// PIN overlay elements
const pinOverlay = document.getElementById("pinOverlay");
const pinInput = document.getElementById("pinInput");
const pinSubmit = document.getElementById("pinSubmit");
const pinClear = document.getElementById("pinClear");
const pinHint = document.getElementById("pinHint");
const pinMsg = document.getElementById("pinMsg");

function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,8) }

function load(){
  const raw = localStorage.getItem(LS_KEY);
  try{
    return raw ? JSON.parse(raw) : [];
  }catch(e){ return [] }
}

function saveAll(arr){ localStorage.setItem(LS_KEY, JSON.stringify(arr)) }

function render(){
  const data = load().slice().sort((a,b)=> new Date(a.dueDate) - new Date(b.dueDate));
  // show active (not archived) in main list
  const active = data.filter(d=>!d.archived);
  entriesEl.innerHTML = "";
  if(!active.length){ emptyEl.style.display = "block"; } else { emptyEl.style.display = "none"; }
  active.forEach(item=> entriesEl.appendChild(renderEntryItem(item)));

  // archived list
  const archived = data.filter(d=>d.archived);
  archivedEntriesEl.innerHTML = "";
  if(!archived.length){ archivedEmptyEl.style.display = "block"; } else { archivedEmptyEl.style.display = "none"; }
  archived.forEach(item=> archivedEntriesEl.appendChild(renderArchivedItem(item)));

  // update thermometer every render
  renderThermometer();
}

function renderEntryItem(item){
  const li = document.createElement("li");
  li.className = "entry";
  li.dataset.id = item.id;

  const left = document.createElement("div"); left.className = "left";
  const avatar = document.createElement("div"); avatar.className = "avatar";
  avatar.textContent = (item.person||"–").slice(0,2).toUpperCase();
  const meta = document.createElement("div"); meta.className = "meta";
  const who = document.createElement("div"); who.className="who"; who.textContent = item.person;
  const due = document.createElement("div"); due.className="due";
  const dueDate = item.dueDate ? format(parseISO(item.dueDate),"yyyy-MM-dd") : "No date";
  const overdue = item.status !== "paid" && isBefore(parseISO(item.dueDate), new Date());
  due.textContent = `Due: ${dueDate}` + (overdue ? " • overdue" : "");
  if(overdue) due.style.color = "var(--danger)";
  meta.appendChild(who); meta.appendChild(due);
  left.appendChild(avatar); left.appendChild(meta);

  const right = document.createElement("div"); right.className = "controls";
  const amt = document.createElement("div"); amt.className = "amount"; amt.textContent = `AUD ${Number(item.amount).toFixed(2)}`;
  const badge = document.createElement("div"); badge.className = "badge " + (item.status==="paid"? "paid":"owed"); badge.textContent = item.status==="paid"?"Paid":"Owed";
  right.appendChild(amt);

  // progress bar
  const progressWrap = document.createElement("div"); progressWrap.className = "progress-wrap";
  const totalAmt = Number(item.amount) || 0;
  const paidAmt = Math.max(0, Math.min(totalAmt, Number(item.paidAmount) || (item.status === "paid" ? totalAmt : 0)));
  const percent = totalAmt > 0 ? Math.round((paidAmt / totalAmt) * 100) : 0;
  const bar = document.createElement("div"); bar.className = "progress-bar";
  const barInner = document.createElement("div"); barInner.className = "progress-inner";
  barInner.style.width = percent + "%";
  barInner.textContent = (percent > 12) ? `AUD ${paidAmt.toFixed(2)}` : (percent > 6 ? percent + "%" : "");
  bar.appendChild(barInner);
  progressWrap.appendChild(bar);

  right.appendChild(progressWrap);
  right.appendChild(badge);

  // for unpaid items, add a "Pay All" quick action to mark fully paid
  if(item.status !== "paid"){
    const payAllBtn = document.createElement("button");
    payAllBtn.className = "ctrl-btn";
    payAllBtn.textContent = "Pay All";
    payAllBtn.title = "Mark this loan as fully paid";
    payAllBtn.addEventListener("click", (e)=>{
      e.stopPropagation();
      payAll(item.id);
    });
    right.appendChild(payAllBtn);
  } else {
    // archive button for paid items
    const archiveBtn = document.createElement("button");
    archiveBtn.className = "ctrl-btn";
    archiveBtn.textContent = "Archive";
    archiveBtn.addEventListener("click", (e)=>{
      e.stopPropagation();
      archiveItem(item.id);
    });
    right.appendChild(archiveBtn);
  }

  li.appendChild(left); li.appendChild(right);

  // tap/edit
  li.addEventListener("click", e=>{
    if(role === "mother" || role === "me"){
      startEdit(item.id);
    }
  });

  // long press toggle
  let hold;
  const startHold = (ev)=>{
    ev.preventDefault();
    hold = setTimeout(()=> togglePaid(item.id), 500);
  };
  const cancelHold = ()=>{ clearTimeout(hold); }
  li.addEventListener("touchstart", startHold);
  li.addEventListener("touchend", cancelHold);
  li.addEventListener("mousedown", startHold);
  li.addEventListener("mouseup", cancelHold);
  li.addEventListener("mouseleave", cancelHold);

  return li;
}

function renderArchivedItem(item){
  const li = document.createElement("li");
  li.className = "entry";
  li.dataset.id = item.id;

  const left = document.createElement("div"); left.className = "left";
  const avatar = document.createElement("div"); avatar.className = "avatar";
  avatar.textContent = (item.person||"–").slice(0,2).toUpperCase();
  const meta = document.createElement("div"); meta.className = "meta";
  const who = document.createElement("div"); who.className="who"; who.textContent = item.person;
  const due = document.createElement("div"); due.className="due";
  due.textContent = `Paid: ${item.updatedAt ? format(parseISO(item.updatedAt),"yyyy-MM-dd") : (item.createdAt ? format(parseISO(item.createdAt),"yyyy-MM-dd") : "")}`;
  meta.appendChild(who); meta.appendChild(due);
  left.appendChild(avatar); left.appendChild(meta);

  const right = document.createElement("div"); right.className = "controls";
  const amt = document.createElement("div"); amt.className = "amount"; amt.textContent = `AUD ${Number(item.amount).toFixed(2)}`;
  right.appendChild(amt);

  const restoreBtn = document.createElement("button");
  restoreBtn.className = "ctrl-btn";
  restoreBtn.textContent = "Restore";
  restoreBtn.addEventListener("click", (e)=>{
    e.stopPropagation();
    restoreItem(item.id);
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "ctrl-btn";
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", (e)=>{
    e.stopPropagation();
    deleteArchived(item.id);
  });

  right.appendChild(restoreBtn);
  right.appendChild(deleteBtn);

  li.appendChild(left); li.appendChild(right);
  return li;
}

function startEdit(id){
  const data = load();
  const item = data.find(x=>x.id===id);
  if(!item) return;
  editingId = id;
  // set select and other field appropriately
  if(item.person === "Aaron" || item.person === "Nicola" || item.person === "Friend"){
    personSelect.value = item.person;
    personOther.value = "";
    personOther.style.display = "none";
  }else{
    personSelect.value = "Other";
    personOther.style.display = "block";
    personOther.value = item.person;
  }
  amountInput.value = item.amount;
  dateInput.value = item.dueDate;
  statusInput.value = item.status;
  if(paidAmountInput) paidAmountInput.value = (typeof item.paidAmount !== "undefined") ? Number(item.paidAmount).toFixed(2) : "0.00";
  saveBtn.textContent = "Update";
}

function clearForm(){
  editingId = null;
  form.reset();
  saveBtn.textContent = "Add";
}

form.addEventListener("submit", e=>{
  e.preventDefault();
  // resolve person from select + other field
  let person = (personSelect.value || "").trim();
  if(person === "Other"){
    person = (personOther.value || "").trim();
  }
  const amount = parseFloat(amountInput.value.replace(/[^0-9.-]/g,"")) || 0;
  const dueDate = dateInput.value;
  let status = statusInput.value;
  if(!person || !dueDate) return;
  const data = load();

  // Read paid input value from form; for new items this is the initial paid amount,
  // for edits this value is treated as an incremental payment to add onto existing paidAmount.
  let inputPaid = 0;
  if(paidAmountInput){
    inputPaid = parseFloat(paidAmountInput.value || "0") || 0;
  }
  inputPaid = Math.max(0, inputPaid);

  let shouldCelebrate = false;

  if(editingId){
    const idx = data.findIndex(x=>x.id===editingId);
    if(idx>-1){
      const prev = data[idx];
      // compute new paidAmount by adding the inputPaid to existing paidAmount (clamped)
      const prevPaid = Number(prev.paidAmount) || 0;
      let newPaid = prevPaid + inputPaid;
      if(amount && newPaid > amount) newPaid = amount;
      // if status explicitly set to paid in the form, ensure paidAmount is full amount
      if(status === "paid") newPaid = amount;
      // if after adding payments we reached the loan amount, mark as paid
      if(amount && Math.abs(newPaid - amount) < 0.005) status = "paid";

      // determine if we should celebrate (transition from not-paid to paid)
      if(prev.status !== "paid" && status === "paid") shouldCelebrate = true;

      data[idx] = {...data[idx],
        person,
        amount: Number(amount).toFixed(2),
        dueDate,
        status,
        paidAmount: Number(newPaid).toFixed(2),
        updatedAt: new Date().toISOString(),
        archived: (data[idx].archived || false)
      };
      // do not auto-archive; user archives explicitly
    }
  }else{
    // new item; paid amount is the inputPaid clamped to amount
    let initialPaid = inputPaid;
    if(amount && initialPaid > amount) initialPaid = amount;
    if(status === "paid") initialPaid = amount;
    if(amount && Math.abs(initialPaid - amount) < 0.005) status = "paid";
    if(status === "paid") shouldCelebrate = true;
    data.push({
      id: uid(),
      person,
      amount: Number(amount).toFixed(2),
      dueDate,
      status,
      paidAmount: Number(initialPaid).toFixed(2),
      createdAt: new Date().toISOString(),
      archived: false
    });
  }
  saveAll(data);
  clearForm();
  render();
  if(shouldCelebrate) playMoneyRain();
});

clearBtn.addEventListener("click", ()=>{ clearForm(); });

// show/hide custom person input based on select
personSelect && personSelect.addEventListener("change", ()=>{
  if(personSelect.value === "Other"){
    personOther.style.display = "block";
    personOther.focus();
  }else{
    personOther.style.display = "none";
    personOther.value = "";
  }
});

function togglePaid(id){
  const data = load();
  const idx = data.findIndex(x=>x.id===id);
  if(idx===-1) return;
  const wasPaid = data[idx].status === "paid";
  const newStatus = wasPaid ? "owed" : "paid";
  data[idx].status = newStatus;
  // when toggling fully paid/unpaid, update paidAmount accordingly
  const amt = Number(data[idx].amount) || 0;
  data[idx].paidAmount = newStatus === "paid" ? Number(amt).toFixed(2) : "0.00";
  data[idx].updatedAt = new Date().toISOString();
  // do not auto-archive on toggle; user must archive explicitly
  saveAll(data);
  render();
  if(!wasPaid && newStatus === "paid"){
    playMoneyRain();
  }
}

/* Mark an individual loan fully paid immediately (set paidAmount to amount, status to paid). */
function payAll(id){
  const data = load();
  const idx = data.findIndex(x=>x.id===id);
  if(idx===-1) return;
  const amt = Number(data[idx].amount) || 0;
  const wasPaid = data[idx].status === "paid";
  data[idx].paidAmount = Number(amt).toFixed(2);
  data[idx].status = "paid";
  data[idx].updatedAt = new Date().toISOString();
  saveAll(data);
  render();
  if(!wasPaid){
    playMoneyRain();
  }
}

// archive a paid item (sets archived flag)
function archiveItem(id){
  const data = load();
  const idx = data.findIndex(x=>x.id===id);
  if(idx===-1) return;
  if(data[idx].status !== "paid") return;
  data[idx].archived = true;
  data[idx].updatedAt = new Date().toISOString();
  saveAll(data);
  render();
}

// restore archived item back to active
function restoreItem(id){
  const data = load();
  const idx = data.findIndex(x=>x.id===id);
  if(idx===-1) return;
  data[idx].archived = false;
  data[idx].updatedAt = new Date().toISOString();
  saveAll(data);
  render();
}

// permanently delete archived item
function deleteArchived(id){
  let data = load();
  data = data.filter(x=> x.id !== id);
  saveAll(data);
  render();
}

// clear all archived items (confirmation)
clearArchivedBtn && clearArchivedBtn.addEventListener("click", ()=>{
  if(!confirm("Delete all archived items permanently?")) return;
  const data = load().filter(x=> !x.archived);
  saveAll(data);
  render();
});

toggleArchivedBtn && toggleArchivedBtn.addEventListener("click", ()=>{
  showingArchived = !showingArchived;
  if(showingArchived){
    archivedSection.style.display = "block";
    toggleArchivedBtn.classList.add("active");
  }else{
    archivedSection.style.display = "none";
    toggleArchivedBtn.classList.remove("active");
  }
});

// simple falling money celebration
function playMoneyRain({count = 24, duration = 2500} = {}){
  const container = document.getElementById("moneyContainer");
  if(!container) return;
  const colours = ["#16a34a","#34d399","#059669","#10b981"];
  const symbols = ["$","$","$","$"];
  const els = [];
  for(let i=0;i<count;i++){
    const el = document.createElement("div");
    el.className = "money-item";
    // random horizontal start
    el.style.left = (Math.random()*100) + "%";
    el.style.fontSize = (12 + Math.random()*20) + "px";
    el.style.opacity = (0.7 + Math.random()*0.3);
    el.style.transform = `translateY(-10vh) rotate(${Math.random()*360}deg)`;
    el.style.color = colours[Math.floor(Math.random()*colours.length)];
    el.textContent = symbols[Math.floor(Math.random()*symbols.length)];
    container.appendChild(el);
    // force reflow then add animate class
    // using setTimeout ensures CSS animation runs
    setTimeout(()=> el.classList.add("money-animate"), 20 + i*30);
    els.push(el);
  }
  // cleanup after duration + buffer
  setTimeout(()=>{
    els.forEach(el=> el.remove());
  }, duration + 800);
}

/* Thermometer: show cumulative paid vs total loan amounts.
   This function updates the right-side thermometer fill and triggers
   celebration when total paid reaches total amount. */
let _lastThermoFull = false;
function renderThermometer(){
  const data = load();
  const active = data.filter(d=>!d.archived);
  const totalAmount = active.reduce((s,i)=> s + (Number(i.amount)||0), 0);
  const totalPaid = active.reduce((s,i)=> s + (Number(i.paidAmount)||0), 0);

  // When there are no loans, treat thermometer as full (considered fully paid)
  const percent = totalAmount > 0 ? Math.min(100, Math.round((totalPaid / totalAmount) * 100)) : 100;

  const fill = document.getElementById("thermoFill");
  const label = document.getElementById("thermoLabel");
  const pct = document.getElementById("thermoPercent");
  const shell = document.getElementById("thermometer");
  const emojiEl = document.getElementById("thermoEmoji");

  if(fill) fill.style.height = percent + "%";
  if(label) label.textContent = `AUD ${totalPaid.toFixed(2)} / AUD ${totalAmount.toFixed(2)}`;
  if(pct) pct.textContent = `${percent}%`;

  const isFull = percent >= 100;

  // show or hide celebratory emoji
  if(emojiEl){
    if(isFull){
      // show a party emoji when full; prefer celebratory emoji
      emojiEl.textContent = totalAmount > 0 ? "🥳" : "🎉";
      emojiEl.classList.add("pop");
      // remove pop after a moment so it can animate again on next transition
      setTimeout(()=> emojiEl.classList.remove("pop"), 1200);
    }else{
      emojiEl.textContent = "";
      emojiEl.classList.remove("pop");
    }
  }

  if(isFull && !_lastThermoFull){
    // only play the burst/celebration when there is an actual total amount (>0)
    if(totalAmount > 0 && shell){
      shell.classList.add("thermo-complete");
      const burst = document.createElement("div");
      burst.className = "thermo-burst";
      shell.appendChild(burst);
      setTimeout(()=> {
        burst.remove();
        shell.classList.remove("thermo-complete");
      }, 1200);
      // celebrate with money rain
      playMoneyRain({count:32, duration:2600});
    }
  }
  _lastThermoFull = isFull;
}

/* Thermometer minimize/restore handling (persisted) */
const THERMO_LS = "money_owed_thermo_collapsed_v1";
const thermoEl = document.getElementById("thermometer");
const thermoToggleBtn = document.getElementById("thermoToggle");

function isThermoCollapsed(){ return localStorage.getItem(THERMO_LS) === "1"; }
function setThermoCollapsed(val){
  if(!thermoEl || !thermoToggleBtn) return;
  if(val){
    thermoEl.classList.add("collapsed");
    thermoToggleBtn.setAttribute("aria-pressed","true");
    thermoToggleBtn.textContent = "+";
    localStorage.setItem(THERMO_LS, "1");
  }else{
    thermoEl.classList.remove("collapsed");
    thermoToggleBtn.setAttribute("aria-pressed","false");
    thermoToggleBtn.textContent = "—";
    localStorage.removeItem(THERMO_LS);
  }
}

if(thermoToggleBtn){
  thermoToggleBtn.addEventListener("click", (e)=>{
    e.stopPropagation();
    const next = !isThermoCollapsed();
    setThermoCollapsed(next);
  });
}

// apply persisted state on load
setTimeout(()=> {
  if(isThermoCollapsed()) setThermoCollapsed(true);
}, 40);

function setRole(r){
  role = r;
  // UI toggles removed — role is stored for app logic only
}

exportCsv.addEventListener("click", ()=>{
  const data = load();
  if(!data.length){ alert("No entries to export."); return; }
  const rows = [["id","person","amount","dueDate","status","paidAmount","archived","createdAt","updatedAt"]];
  data.forEach(d=> rows.push([d.id, d.person, d.amount, d.dueDate, d.status, (typeof d.paidAmount !== "undefined" ? d.paidAmount : (d.paidPercent||0)), d.archived ? "1" : "0", d.createdAt||"", d.updatedAt||""]));
  const csv = rows.map(r=> r.map(cell=> `"${String(cell||"").replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], {type:"text/csv"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "money_owed_aud.csv";
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
});

importCsv.addEventListener("click", ()=> fileInput.click());
fileInput.addEventListener("change", async (e)=>{
  const f = e.target.files && e.target.files[0];
  if(!f) return;
  const txt = await f.text();
  const rows = txt.split(/\r?\n/).map(r=>r.trim()).filter(Boolean).map(r=> parseCsvRow(r));
  // Expecting header; find header row if present
  let start = 0;
  const header = rows[0].map(h=>h.toLowerCase());
  const hasHeader = header.includes("person") || header.includes("amount");
  if(hasHeader) start = 1;
  const data = load();
  for(let i=start;i<rows.length;i++){
    // expecting columns: id,person,amount,dueDate,status,paidAmount,createdAt,updatedAt
    const [id,person,amount,dueDate,status,paidAmount,createdAt,updatedAt] = rows[i];
    if(!person || !amount) continue;
    let pa = parseFloat(paidAmount) || 0;
    pa = Math.max(0, pa);
    const amtNum = Number(amount) || 0;
    if(pa > amtNum) pa = amtNum;
    const st = (amtNum > 0 && Math.abs(pa - amtNum) < 0.005) ? "paid" : (status || "owed");
    data.push({
      id: id || uid(),
      person: person,
      amount: Number(amount).toFixed(2),
      dueDate: dueDate || new Date().toISOString().slice(0,10),
      status: st,
      paidAmount: Number(pa).toFixed(2),
      createdAt: createdAt || new Date().toISOString(),
      updatedAt: updatedAt || "",
      archived: false
    });
  }
  saveAll(data);
  render();
  fileInput.value = "";
});

function parseCsvRow(row){
  // simple CSV parser for quoted fields
  const out = [];
  let cur = "", inQuotes = false;
  for(let i=0;i<row.length;i++){
    const ch = row[i];
    if(inQuotes){
      if(ch === '"' && row[i+1] === '"'){ cur += '"'; i++; continue; }
      if(ch === '"'){ inQuotes = false; continue; }
      cur += ch;
    }else{
      if(ch === ','){ out.push(cur); cur = ""; continue; }
      if(ch === '"'){ inQuotes = true; continue; }
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/* PIN gating and initialization */
function showAppUnlocked(unlocked){
  const app = document.getElementById("app");
  if(unlocked){
    pinOverlay.setAttribute("aria-hidden","true");
    app.removeAttribute("aria-hidden");
    render();
  }else{
    pinOverlay.setAttribute("aria-hidden","false");
    app.setAttribute("aria-hidden","true");
  }
}

pinSubmit && pinSubmit.addEventListener("click", ()=>{
  const val = String(pinInput.value || "").trim();
  const roleSelect = document.getElementById("roleSelect");
  const chosenRole = roleSelect ? roleSelect.value : "me";

  // require exact PIN; trim whitespace and ensure defined string comparison
  if(val === PIN_CODE){
    pinMsg.textContent = "";
    setRole(chosenRole);
    // persist session-level unlocked state so page reloads in same tab stay unlocked
    try { sessionStorage.setItem("money_owed_session_unlocked_v1", "1"); } catch(e){}
    showAppUnlocked(true);
  }else{
    pinMsg.textContent = "Incorrect PIN";
    pinInput.value = "";
    pinInput.focus();
  }
});

pinInput && pinInput.addEventListener("keydown", (e)=>{
  if(e.key === "Enter") pinSubmit.click();
});

pinClear && pinClear.addEventListener("click", ()=>{
  pinInput.value = "";
  pinMsg.textContent = "";
  pinInput.focus();
});

pinHint && pinHint.addEventListener("click", ()=>{
  // show a gentle hint for Mum
  pinMsg.textContent = "Hint: When was Marnie born?";
  pinInput.focus();
});

/* Session unlock key so the app remains unlocked for the browser tab session */
const SESSION_UNLOCK = "money_owed_session_unlocked_v1";

// init with a helpful sample if empty, but only render after unlock (or if session already unlocked)
(function init(){
  if(!localStorage.getItem(LS_KEY)){
    const sample = [{
      id: uid(),
      person: "Aaron",
      amount: "150.00",
      dueDate: new Date(Date.now()+7*24*3600*1000).toISOString().slice(0,10),
      status: "owed",
      paidAmount: "0.00",
      createdAt: new Date().toISOString()
    }];
    saveAll(sample);
  }

  // If sessionStorage indicates we've already unlocked this tab, restore unlocked state
  let sessionUnlocked = false;
  try { sessionUnlocked = sessionStorage.getItem(SESSION_UNLOCK) === "1"; } catch(e){ sessionUnlocked = false; }

  if(sessionUnlocked){
    // default role remains 'me' unless user chooses; reveal app immediately
    showAppUnlocked(true);
  }else{
    // Start locked
    showAppUnlocked(false);
    // focus input for quick access
    setTimeout(()=> pinInput && pinInput.focus(), 100);
  }
})();