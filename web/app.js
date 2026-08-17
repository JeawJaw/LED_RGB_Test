"use strict";

const BAUD_RATE = 115200;
const state = { r:0, g:166, b:255, brightness:100, driver:"ncp5623" };
let port = null, reader = null, writer = null, connected = false;
let writeQueue = Promise.resolve();

const $ = id => document.getElementById(id);
const channels = {
  r:{ slider:$("sliderR"), input:$("valueR") },
  g:{ slider:$("sliderG"), input:$("valueG") },
  b:{ slider:$("sliderB"), input:$("valueB") }
};
const presets = [
  ["แดง",255,0,0],["ส้ม",255,96,0],["เหลือง",255,210,0],["เขียวเหลือง",154,205,50],
  ["เขียว",0,255,0],["เขียวมิ้น",0,255,173],["Teal",0,128,128],["ฟ้า",0,190,255],
  ["น้ำเงิน",10,30,255],["ม่วง",160,50,255],["ชมพู",255,50,160],["ขาว",255,255,255]
];

const clamp = value => Math.min(255, Math.max(0, Math.round(Number(value) || 0)));
const clampBrightness = value => Math.min(100, Math.max(0, Math.round(Number(value) || 0)));
const hex = () => `#${[state.r,state.g,state.b].map(v => v.toString(16).padStart(2,"0")).join("")}`.toUpperCase();

function updateUi() {
  const color = hex();
  const scale = state.brightness / 100;
  $("colorPreview").style.backgroundColor = `rgb(${Math.round(state.r*scale)},${Math.round(state.g*scale)},${Math.round(state.b*scale)})`;
  $("colorPicker").value = color;
  $("hexValue").textContent = color;
  for (const key of ["r","g","b"]) {
    channels[key].slider.value = state[key]; channels[key].input.value = state[key];
    $(`preview${key.toUpperCase()}`).textContent = state[key];
  }
  $("sliderBrightness").value = state.brightness;
  $("valueBrightness").value = state.brightness;
  $("driverSelect").value = state.driver;
  channels.r.slider.style.background = "linear-gradient(90deg,rgb(0,0,0),rgb(255,0,0))";
  channels.g.slider.style.background = "linear-gradient(90deg,rgb(0,0,0),rgb(0,255,0))";
  channels.b.slider.style.background = "linear-gradient(90deg,rgb(0,0,0),rgb(0,0,255))";
  $("sliderBrightness").style.background = "linear-gradient(90deg,#090b0f,#fff)";
}

function setRgb(r,g,b,send=true) {
  state.r=clamp(r); state.g=clamp(g); state.b=clamp(b); updateUi(); if (send) sendState();
}
function setBrightness(value,send=true) {
  state.brightness=clampBrightness(value); updateUi(); if (send) sendState();
}
function setDriver(value,send=true) {
  state.driver=value === "lp5817" ? "lp5817" : "ncp5623"; updateUi(); if (send) sendState();
}

function sendState() {
  const payload = { cmd:"set_rgb", driver:state.driver, r:state.r, g:state.g, b:state.b, brightness:state.brightness };
  const line = `${JSON.stringify(payload)}\n`;
  $("jsonOutput").textContent = line.trim();
  if (!writer) return;
  const activeWriter=writer, bytes=new TextEncoder().encode(line);
  writeQueue=writeQueue.then(async()=>{ if(writer===activeWriter) await activeWriter.write(bytes); })
    .catch(error=>setStatus(`ส่งข้อมูลไม่สำเร็จ: ${error.message}`));
}

function setStatus(message) { $("statusText").textContent=message; }

async function readLoop() {
  const decoder=new TextDecoder(); let buffer="";
  try {
    while (port?.readable) {
      reader=port.readable.getReader();
      try {
        while (true) {
          const {value,done}=await reader.read(); if(done) break;
          buffer+=decoder.decode(value,{stream:true}); const lines=buffer.split("\n"); buffer=lines.pop()||"";
          for(const line of lines) if(line.trim()) $("deviceReply").textContent=line.trim();
        }
      } finally { reader.releaseLock(); reader=null; }
    }
  } catch(error) { if(connected) setStatus(`หยุดรับข้อมูล: ${error.message}`); }
}

async function connect() {
  try {
    port=await navigator.serial.requestPort(); await port.open({baudRate:BAUD_RATE}); writer=port.writable.getWriter(); connected=true;
    $("connectionBadge").classList.add("online"); $("connectionBadge").lastElementChild.textContent="CONNECTED";
    $("connectButton").classList.add("disconnect"); $("connectButton").textContent="ตัดการเชื่อมต่อ";
    setStatus("เชื่อมต่อ USB CDC แล้ว"); readLoop(); setTimeout(sendState,120);
  } catch(error) { setStatus(`เชื่อมต่อไม่สำเร็จ: ${error.message}`); }
}
async function disconnect() {
  try { await reader?.cancel(); writer?.releaseLock(); writer=null; await port?.close(); } catch {}
  finally {
    port=null; connected=false; $("connectionBadge").classList.remove("online"); $("connectionBadge").lastElementChild.textContent="DISCONNECTED";
    $("connectButton").classList.remove("disconnect"); $("connectButton").textContent="⚡ เชื่อมต่อ USB"; setStatus("ตัดการเชื่อมต่อแล้ว");
  }
}

for(const key of ["r","g","b"]) {
  const update=event=>setRgb(key==="r"?event.target.value:state.r,key==="g"?event.target.value:state.g,key==="b"?event.target.value:state.b);
  channels[key].slider.addEventListener("input",update); channels[key].input.addEventListener("input",update);
}
$("sliderBrightness").addEventListener("input",event=>setBrightness(event.target.value));
$("valueBrightness").addEventListener("input",event=>setBrightness(event.target.value));
$("driverSelect").addEventListener("change",event=>setDriver(event.target.value));
$("colorPicker").addEventListener("input",event=>{const value=event.target.value;setRgb(parseInt(value.slice(1,3),16),parseInt(value.slice(3,5),16),parseInt(value.slice(5,7),16));});
for(const [name,r,g,b] of presets) {
  const button=document.createElement("button"); button.className="preset-swatch"; button.type="button"; button.title=name;
  button.setAttribute("aria-label",name); button.style.backgroundColor=`rgb(${r},${g},${b})`; button.addEventListener("click",()=>setRgb(r,g,b)); $("presets").appendChild(button);
}
$("connectButton").addEventListener("click",()=>connected?disconnect():connect());
if(!("serial" in navigator)) { $("browserWarning").classList.remove("d-none"); $("connectButton").disabled=true; }
navigator.serial?.addEventListener("disconnect",event=>{if(event.target===port)disconnect();});
updateUi();
