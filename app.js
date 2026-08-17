"use strict";

const BAUD_RATE = 115200;
const state = { r: 0, g: 166, b: 255 };
let port = null;
let reader = null;
let writer = null;
let connected = false;
let writeQueue = Promise.resolve();

const $ = (id) => document.getElementById(id);
const channels = {
  r: { slider: $("sliderR"), input: $("valueR") },
  g: { slider: $("sliderG"), input: $("valueG") },
  b: { slider: $("sliderB"), input: $("valueB") }
};

const presets = [
  ["แดง",255,0,0],["ส้ม",255,96,0],["เหลือง",255,210,0],
  ["เขียว",0,255,0],["เขียวมิ้น",0,255,173],["ฟ้า",0,210,255],["น้ำเงิน",42,90,255],
  ["ม่วง",160,70,255],["ชมพู",255,70,160],["ขาว",255,255,255]
];

function clamp(value) { return Math.min(255, Math.max(0, Math.round(Number(value) || 0))); }
function hex() { return `#${[state.r,state.g,state.b].map(v => v.toString(16).padStart(2,"0")).join("")}`.toUpperCase(); }

function updateUi() {
  const color = hex();
  $("colorPreview").style.backgroundColor = color;
  $("colorPicker").value = color;
  $("hexValue").textContent = color;
  for (const key of ["r","g","b"]) {
    channels[key].slider.value = state[key];
    channels[key].input.value = state[key];
    $(`preview${key.toUpperCase()}`).textContent = state[key];
  }
  channels.r.slider.style.background = "linear-gradient(90deg,rgb(0,0,0),rgb(255,0,0))";
  channels.g.slider.style.background = "linear-gradient(90deg,rgb(0,0,0),rgb(0,255,0))";
  channels.b.slider.style.background = "linear-gradient(90deg,rgb(0,0,0),rgb(0,0,255))";
}

function setRgb(r,g,b,send = true) {
  state.r = clamp(r); state.g = clamp(g); state.b = clamp(b);
  updateUi();
  if (send) sendRgb();
}

function sendRgb() {
  const payload = { cmd:"set_rgb", r:state.r, g:state.g, b:state.b };
  const line = `${JSON.stringify(payload)}\n`;
  $("jsonOutput").textContent = line.trim();
  if (!writer) return;
  const activeWriter = writer;
  const bytes = new TextEncoder().encode(line);
  writeQueue = writeQueue.then(async () => {
    if (writer === activeWriter) await activeWriter.write(bytes);
  }).catch(error => setStatus(`ส่งข้อมูลไม่สำเร็จ: ${error.message}`));
}

function setStatus(message) 
{ 
  $("statusText").textContent = message; 
}

async function readLoop() {
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (port?.readable) {
      reader = port.readable.getReader();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream:true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) if (line.trim()) $("deviceReply").textContent = line.trim();
        }
      } finally {
        reader.releaseLock();
        reader = null;
      }
    }
  } catch (error) {
    if (connected) setStatus(`หยุดรับข้อมูล: ${error.message}`);
  }
}

async function connect() {
  try {
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: BAUD_RATE });
    writer = port.writable.getWriter();
    connected = true;
    $("connectionBadge").classList.add("online");
    $("connectionBadge").lastElementChild.textContent = "CONNECTED";
    $("connectButton").classList.add("disconnect");
    $("connectButton").textContent = "ตัดการเชื่อมต่อ";
    setStatus("เชื่อมต่อ USB CDC แล้ว");
    readLoop();
    setTimeout(sendRgb, 120);
  } catch (error) {
    setStatus(`เชื่อมต่อไม่สำเร็จ: ${error.message}`);
  }
}

async function disconnect() {
  try {
    await reader?.cancel();
    writer?.releaseLock();
    writer = null;
    await port?.close();
  } catch (_) {
    // A physically removed USB device may already be closed by the OS.
  } finally {
    port = null; connected = false;
    $("connectionBadge").classList.remove("online");
    $("connectionBadge").lastElementChild.textContent = "DISCONNECTED";
    $("connectButton").classList.remove("disconnect");
    $("connectButton").textContent = "⚡ เชื่อมต่อ USB";
    setStatus("ตัดการเชื่อมต่อแล้ว");
  }
}

for (const key of ["r","g","b"]) {
  channels[key].slider.addEventListener("input", event => setRgb(
    key === "r" ? event.target.value : state.r,
    key === "g" ? event.target.value : state.g,
    key === "b" ? event.target.value : state.b
  ));
  channels[key].input.addEventListener("input", event => setRgb(
    key === "r" ? event.target.value : state.r,
    key === "g" ? event.target.value : state.g,
    key === "b" ? event.target.value : state.b
  ));
}

$("colorPicker").addEventListener("input", event => {
  const value = event.target.value;
  setRgb(parseInt(value.slice(1,3),16), parseInt(value.slice(3,5),16), parseInt(value.slice(5,7),16));
});

for (const [name,r,g,b] of presets) {
  const button = document.createElement("button");
  button.className = "preset-swatch";
  button.type = "button";
  button.title = name;
  button.setAttribute("aria-label", name);
  button.style.backgroundColor = `rgb(${r},${g},${b})`;
  button.addEventListener("click", () => setRgb(r,g,b));
  $("presets").appendChild(button);
}

$("connectButton").addEventListener("click", () => connected ? disconnect() : connect());

if (!("serial" in navigator)) 
{
  $("browserWarning").classList.remove("d-none");
  $("connectButton").disabled = true;
}

navigator.serial?.addEventListener("disconnect", event => 
{
  if (event.target === port) disconnect();
});
updateUi();
