/* ═══════════════════════════════════════════════════════════
   GEOVISION – main.js
   AI Vision | Spatial Mapping | Daet, Camarines Norte
═══════════════════════════════════════════════════════════ */

// ─── ANTHROPIC API HELPER ────────────────────────────────────────────────────
async function callAIVision(messages, systemPrompt = "") {
  try {
    const body = {
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: systemPrompt || SYSTEM_PROMPT,
      messages
    };
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    const textBlock = (data.content || []).find(b => b.type === "text");
    return textBlock ? textBlock.text : "AI VISION could not generate a response.";
  } catch (e) {
    return "⚠️ AI VISION is currently offline. Check your connection.";
  }
}

const SYSTEM_PROMPT = `You are AI VISION, the intelligent assistant for GeoVision — a spatial infrastructure and disaster risk platform focused on Daet, Camarines Norte, Philippines.

Your role:
1. Answer questions about geography, infrastructure, hazards, population, and community issues in Camarines Norte.
2. When analyzing a clicked location, provide: population estimate, flood risk, landslide risk, seismic risk, storm surge risk, active hazards, architectural solutions, and infrastructure recommendations.
3. For disaster/hazard questions, reference PHIVOLCS, PAGASA, NDRRMC, and UP-NOAH data.
4. Provide realistic, detailed architectural and engineering solutions for identified problems.
5. Include specific facts about Camarines Norte: population ~620,000 (2020 census), provincial capital Daet, major rivers: Daet River, Labo River, typhoon-prone (PAR), located near Philippine Fault Zone.
6. Keep responses concise but detailed. Use bullet points for solutions.
7. If an image is provided, describe what infrastructure or location it might show and assess its condition.
8. Always include a risk score 0-100 and risk breakdown (flood%, landslide%, seismic%, storm%) when analyzing locations.
Format location analyses as JSON when asked for structured data.`;

// ─── MAP SETUP ────────────────────────────────────────────────────────────────
const DAET_LAT = 14.1155;
const DAET_LNG = 122.9549;
const CAMNORTE_BOUNDS = [[13.8, 122.4],[14.7, 123.5]];

const map = L.map("map", {
  center: [DAET_LAT, DAET_LNG],
  zoom: 12,
  zoomControl: true
});

// Tile layers
const tiles = {
  streets: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
    maxZoom: 19
  }),
  satellite: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    attribution: "Esri Satellite",
    maxZoom: 19
  }),
  terrain: L.tileLayer("https://stamen-tiles-{s}.a.ssl.fastly.net/terrain/{z}/{x}/{y}.jpg", {
    attribution: "Stamen Terrain",
    maxZoom: 18
  })
};
tiles.streets.addTo(map);
let currentTile = "streets";

// ─── HAZARD OVERLAYS (Camarines Norte approximate zones) ─────────────────────
const hazardData = {
  flood: [
    { center:[14.1155,122.9549], radius:3200, color:"#ef4444", label:"Daet Flood Zone – High" },
    { center:[14.0700,122.9200], radius:2500, color:"#f97316", label:"Labo River Floodplain" },
    { center:[14.1800,122.9700], radius:2000, color:"#ef4444", label:"Talisay Coast Flood Zone" }
  ],
  landslide: [
    { center:[14.0200,122.8800], radius:2800, color:"#a16207", label:"Labo Highland Landslide Zone" },
    { center:[14.3000,123.0200], radius:2000, color:"#ca8a04", label:"San Lorenzo Ruins Slope Risk" }
  ],
  seismic: [
    { center:[14.1155,122.9549], radius:5000, color:"#7c3aed", label:"Philippine Fault Zone Proximity" }
  ],
  storm: [
    { center:[14.2500,123.1000], radius:4000, color:"#0ea5e9", label:"Pacific Storm Surge Zone" },
    { center:[14.1500,123.0500], radius:3000, color:"#38bdf8", label:"Coastal Storm Surge – Moderate" }
  ]
};

const hazardLayers = { flood:[], landslide:[], seismic:[], storm:[] };

function createHazardLayers() {
  Object.keys(hazardData).forEach(type => {
    hazardData[type].forEach(zone => {
      const circle = L.circle(zone.center, {
        radius: zone.radius,
        color: zone.color,
        fillColor: zone.color,
        fillOpacity: 0.18,
        weight: 1.5,
        dashArray: type === "seismic" ? "6,4" : null
      }).bindTooltip(`<span class="hazard-tooltip">${zone.label}</span>`, { permanent:false });
      hazardLayers[type].push(circle);
      circle.addTo(map);
    });
  });
}
createHazardLayers();

// Layer toggle controls
const layerMap = {
  "lyr-flood":     "flood",
  "lyr-landslide": "landslide",
  "lyr-seismic":   "seismic",
  "lyr-storm":     "storm"
};
Object.keys(layerMap).forEach(id => {
  const chk = document.getElementById(id);
  if (!chk) return;
  chk.addEventListener("change", () => {
    const type = layerMap[id];
    hazardLayers[type].forEach(l => chk.checked ? l.addTo(map) : map.removeLayer(l));
  });
});

// ─── VOLCANO MARKERS (PHIVOLCS data – static reference) ──────────────────────
const volcanoData = [
  { name:"Bulusan Volcano", lat:12.7697, lng:124.0575, status:"Active", alert:1, dist_from_daet:185 },
  { name:"Mayon Volcano",   lat:13.2570, lng:123.6850, status:"Active", alert:2, dist_from_daet:100 },
  { name:"Isarog (Dormant)",lat:13.6578, lng:123.3736, status:"Dormant",alert:0, dist_from_daet:55  },
  { name:"Labo (Caldera)",  lat:14.0290, lng:122.8520, status:"Potentially Active",alert:1, dist_from_daet:14 }
];

const volcanoIcon = L.divIcon({
  html:`<div style="font-size:20px;filter:drop-shadow(0 0 4px #ef4444)">🌋</div>`,
  className:"", iconSize:[24,24], iconAnchor:[12,12]
});

function addVolcanoMarkers() {
  volcanoData.forEach(v => {
    L.marker([v.lat, v.lng], { icon: volcanoIcon })
      .bindPopup(`
        <strong style="color:#ef4444;font-family:Orbitron,sans-serif">${v.name}</strong><br>
        Status: <em>${v.status}</em><br>
        Alert Level: ${v.alert}<br>
        ~${v.dist_from_daet} km from Daet
      `).addTo(map);
  });

  // Render volcano list in panel
  const list = document.getElementById("volcano-list");
  list.innerHTML = volcanoData.map(v => `
    <div class="volcano-item">
      <div class="v-name">🌋 ${v.name}</div>
      <div class="v-detail">Status: ${v.status} | Alert: ${v.alert}</div>
      <div class="v-detail">${v.dist_from_daet} km from Daet</div>
    </div>
  `).join("");
}

document.getElementById("lyr-volcano").addEventListener("change", (e) => {
  if (e.target.checked) addVolcanoMarkers();
  // For simplicity, reload page to remove (or manage layer group)
});

// ─── INFRASTRUCTURE MARKERS ───────────────────────────────────────────────────
const infraData = [
  { name:"Daet Rural Hospital",   lat:14.1186, lng:122.9555, type:"hospital",    icon:"🏥" },
  { name:"Camarines Norte Capitol",lat:14.1162,lng:122.9574, type:"government",  icon:"🏛" },
  { name:"Daet Public Market",    lat:14.1145, lng:122.9562, type:"market",      icon:"🏪" },
  { name:"CASURECO Power Plant",  lat:14.0900, lng:122.9100, type:"power",       icon:"⚡" },
  { name:"Daet Airport",          lat:14.1667, lng:122.9800, type:"transport",   icon:"✈️" },
  { name:"Daet Port",             lat:14.1350, lng:123.0200, type:"transport",   icon:"⚓" },
  { name:"Fire Station Daet",     lat:14.1170, lng:122.9540, type:"emergency",   icon:"🚒" },
  { name:"PLDT Tower Daet",       lat:14.1200, lng:122.9580, type:"telecom",     icon:"📡" }
];

const infraGroup = L.layerGroup();
infraData.forEach(p => {
  const iIcon = L.divIcon({
    html:`<div style="font-size:18px">${p.icon}</div>`,
    className:"", iconSize:[24,24], iconAnchor:[12,12]
  });
  L.marker([p.lat,p.lng], { icon:iIcon })
   .bindPopup(`<strong>${p.name}</strong><br><em>${p.type}</em>`)
   .addTo(infraGroup);
});

document.getElementById("lyr-infra").addEventListener("change", (e) => {
  e.target.checked ? infraGroup.addTo(map) : map.removeLayer(infraGroup);
});

// ─── COORDINATES DISPLAY ──────────────────────────────────────────────────────
map.on("mousemove", e => {
  document.getElementById("coords-display").textContent =
    `Lat: ${e.latlng.lat.toFixed(5)} | Lng: ${e.latlng.lng.toFixed(5)}`;
});

// ─── MAP CLICK → AI ANALYSIS ──────────────────────────────────────────────────
map.on("click", async (e) => {
  const { lat, lng } = e.latlng;
  openAnalysisModal();
  updateLocationPanel(lat, lng);

  const userMsg = `Analyze this location in Camarines Norte, Philippines:
Coordinates: ${lat.toFixed(5)}, ${lng.toFixed(5)}
Today's date: ${new Date().toLocaleDateString("en-PH", { year:"numeric",month:"long",day:"numeric" })}

Provide a comprehensive analysis including:
1. Estimated barangay/area name
2. Population estimate
3. Flood risk (0-100%)
4. Landslide risk (0-100%)
5. Seismic risk (0-100%)
6. Storm surge risk (0-100%)
7. Overall risk score (0-100)
8. Top 3 current problems in this area
9. Architectural and infrastructure solutions (be very detailed and realistic)
10. Emergency contacts relevant to this area
Format your response with clear section headers.`;

  const aiResponse = await callAIVision([{ role:"user", content:userMsg }]);
  renderAnalysis(aiResponse, lat, lng);
  updateRiskBars(aiResponse);
});

function openAnalysisModal() {
  const modal = document.getElementById("analysis-modal");
  modal.classList.remove("hidden");
  document.getElementById("analysis-content").innerHTML =
    `<div class="analysis-loading"><i class="fa fa-spinner fa-spin"></i> AI VISION is analyzing this location…</div>`;
}

function renderAnalysis(text, lat, lng) {
  const content = document.getElementById("analysis-content");
  const date = new Date().toLocaleString("en-PH");
  content.innerHTML = `
    <div class="analysis-section">
      <h3>📍 Location Analysis</h3>
      <p><strong>Coordinates:</strong> ${lat.toFixed(5)}, ${lng.toFixed(5)}</p>
      <p><strong>Date:</strong> ${date}</p>
    </div>
    <div class="analysis-section">
      <h3>🤖 AI VISION Report</h3>
      <p>${text.replace(/\n/g,"<br>")}</p>
    </div>
  `;
}

function updateRiskBars(text) {
  // Extract percentage numbers from AI text heuristically
  const extract = (label) => {
    const re = new RegExp(label + "[^0-9]*([0-9]+)", "i");
    const m = text.match(re);
    return m ? Math.min(parseInt(m[1]), 100) : Math.floor(Math.random()*60+20);
  };
  const flood    = extract("flood");
  const land     = extract("landslide");
  const seismic  = extract("seismic");
  const storm    = extract("storm");
  const overall  = Math.round((flood+land+seismic+storm)/4);

  document.getElementById("rb-flood").style.width   = flood+"%";
  document.getElementById("rb-land").style.width    = land+"%";
  document.getElementById("rb-seismic").style.width = seismic+"%";
  document.getElementById("rb-storm").style.width   = storm+"%";

  // Gauge arc
  const arc = document.getElementById("gauge-arc");
  const color = overall>70?"#ef4444":overall>40?"#f97316":"#22c55e";
  const dashoffset = 157 - (157 * overall/100);
  arc.style.strokeDashoffset = dashoffset;
  arc.style.stroke = color;
  arc.previousElementSibling.previousElementSibling && null;
  const scoreText = arc.nextElementSibling;
  if (scoreText) { scoreText.textContent = overall; scoreText.setAttribute("fill", color); }
}

function updateLocationPanel(lat, lng) {
  document.getElementById("loc-name").textContent = `📍 ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  document.getElementById("loc-details").classList.remove("hidden");
  document.getElementById("loc-pop").textContent  = "Fetching from AI…";
  document.getElementById("loc-flood").textContent= "Analyzing…";
  document.getElementById("loc-land").textContent = "Analyzing…";
  document.getElementById("loc-seismic").textContent= "Analyzing…";
  document.getElementById("loc-volc").textContent = `Nearest: Labo ~14km`;
}

document.getElementById("analysis-close").addEventListener("click", () => {
  document.getElementById("analysis-modal").classList.add("hidden");
});

// ─── SEARCH ──────────────────────────────────────────────────────────────────
const searchLocations = {
  "daet":           [14.1155, 122.9549, 13],
  "labo":           [14.0227, 122.8403, 13],
  "talisay":        [14.1733, 122.9840, 13],
  "basud":          [14.0664, 122.9837, 13],
  "jose panganiban":[14.2977, 122.9967, 13],
  "mercedes":       [14.1075, 123.0135, 13],
  "vinzons":        [14.1715, 122.9039, 13],
  "paracale":       [14.2847, 122.7888, 13],
  "san lorenzo":    [14.3050, 123.0203, 13],
  "capalonga":      [14.3286, 122.4944, 13],
  "santa elena":    [14.1844, 122.4217, 13]
};

async function doSearch(query) {
  const q = query.toLowerCase().trim();
  if (!q) return;

  const matched = Object.keys(searchLocations).find(k => q.includes(k));
  if (matched) {
    const [lat, lng, zoom] = searchLocations[matched];
    map.flyTo([lat, lng], zoom, { duration:1.5 });
    L.popup().setLatLng([lat, lng])
      .setContent(`<strong>${matched.toUpperCase()}</strong><br>Camarines Norte`)
      .openOn(map);
  } else {
    // Ask AI about the place
    const resp = await callAIVision([{
      role:"user",
      content:`Is "${query}" a barangay or place in Camarines Norte, Philippines? Give coordinates if known and a short description.`
    }]);
    addAIMessage(resp, "chat-messages");
  }
}

document.getElementById("search-btn").addEventListener("click", () =>
  doSearch(document.getElementById("search-input").value));
document.getElementById("search-input").addEventListener("keydown", e => {
  if (e.key === "Enter") doSearch(e.target.value);
});

// ─── TILE / VIEW CONTROLS ────────────────────────────────────────────────────
document.getElementById("btn-2d").addEventListener("click", () => {
  document.querySelectorAll(".ctrl-btn").forEach(b=>b.classList.remove("active"));
  document.getElementById("btn-2d").classList.add("active");
  tiles.streets.addTo(map);
});

document.getElementById("btn-satellite").addEventListener("click", () => {
  document.querySelectorAll(".ctrl-btn").forEach(b=>b.classList.remove("active"));
  document.getElementById("btn-satellite").classList.add("active");
  Object.values(tiles).forEach(t => map.removeLayer(t));
  tiles.satellite.addTo(map);
});

document.getElementById("btn-3d").addEventListener("click", () => {
  document.querySelectorAll(".ctrl-btn").forEach(b=>b.classList.remove("active"));
  document.getElementById("btn-3d").classList.add("active");
  // Attempt OSM Buildings 3D
  if (window.OSMBuildings) {
    try {
      const osmb = new OSMBuildings(map).load('https://{s}.data.osmbuildings.org/0.2/anonymous/tile/{z}/{x}/{y}.json');
    } catch(e) { console.log("OSM Buildings:", e); }
  }
  map.flyTo([DAET_LAT, DAET_LNG], 15);
});

document.getElementById("btn-street").addEventListener("click", () => {
  document.querySelectorAll(".ctrl-btn").forEach(b=>b.classList.remove("active"));
  document.getElementById("btn-street").classList.add("active");
  Object.values(tiles).forEach(t => map.removeLayer(t));
  tiles.streets.addTo(map);
  map.flyTo([DAET_LAT, DAET_LNG], 17);
});

// ─── FAB BUTTONS ─────────────────────────────────────────────────────────────
document.getElementById("fab-locate").addEventListener("click", () => {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(pos => {
    const { latitude:lat, longitude:lng } = pos.coords;
    map.flyTo([lat, lng], 14);
    L.marker([lat, lng]).bindPopup("📍 You are here").addTo(map).openPopup();
  }, () => {
    map.flyTo([DAET_LAT, DAET_LNG], 13);
  });
});

document.getElementById("fab-3d").addEventListener("click", () => {
  document.getElementById("btn-3d").click();
});

document.getElementById("fab-fullai").addEventListener("click", () => {
  openFullscreenAI();
});

// ─── AI CHAT PANEL ────────────────────────────────────────────────────────────
let sidebarChatHistory = [];

function addAIMessage(text, containerId = "chat-messages") {
  const container = document.getElementById(containerId);
  const div = document.createElement("div");
  div.className = "msg ai-msg";
  div.innerHTML = `<span class="msg-avatar">👁</span>
    <div class="msg-bubble">${text.replace(/\n/g,"<br>")}</div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function addUserMessage(text, containerId = "chat-messages", imgSrc = null) {
  const container = document.getElementById(containerId);
  const div = document.createElement("div");
  div.className = "msg user-msg";
  div.innerHTML = `<span class="msg-avatar">🙂</span>
    <div class="msg-bubble">
      ${text}
      ${imgSrc ? `<br><img src="${imgSrc}" class="msg-img" alt="uploaded"/>` : ""}
    </div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function addTypingIndicator(containerId = "chat-messages") {
  const container = document.getElementById(containerId);
  const div = document.createElement("div");
  div.className = "msg ai-msg typing-indicator";
  div.innerHTML = `<span class="msg-avatar">👁</span>
    <div class="msg-bubble"><span class="typing-dots"></span></div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return div;
}

async function sendSidebarMessage() {
  const input = document.getElementById("chat-input");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  addUserMessage(text);
  sidebarChatHistory.push({ role:"user", content:text });
  const typing = addTypingIndicator();
  const reply = await callAIVision(sidebarChatHistory.slice(-8));
  typing.remove();
  sidebarChatHistory.push({ role:"assistant", content:reply });
  addAIMessage(reply);
}

document.getElementById("chat-send").addEventListener("click", sendSidebarMessage);
document.getElementById("chat-input").addEventListener("keydown", e => {
  if (e.key === "Enter") sendSidebarMessage();
});

// Image upload in sidebar chat
document.getElementById("chat-img-upload").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (ev) => {
    const imgSrc = ev.target.result;
    const base64 = imgSrc.split(",")[1];
    addUserMessage("📷 Image uploaded for analysis", "chat-messages", imgSrc);
    const typing = addTypingIndicator();
    const reply = await callAIVision([{
      role:"user",
      content:[
        { type:"image", source:{ type:"base64", media_type:file.type, data:base64 }},
        { type:"text",  text:"Analyze this image. What infrastructure, location, or hazard does it show? Is this from Camarines Norte or the Philippines? What are the visible risks and what improvements could be made?" }
      ]
    }]);
    typing.remove();
    addAIMessage(reply);
  };
  reader.readAsDataURL(file);
  e.target.value = "";
});

// ─── FULLSCREEN AI MODAL ──────────────────────────────────────────────────────
let modalChatHistory = [];

function openFullscreenAI() {
  document.getElementById("ai-fullscreen-modal").classList.remove("hidden");
  const msgs = document.getElementById("ai-modal-messages");
  if (!msgs.children.length) {
    // copy sidebar messages
    msgs.innerHTML = document.getElementById("chat-messages").innerHTML;
  }
}

document.getElementById("ai-fullscreen-btn").addEventListener("click", openFullscreenAI);

document.getElementById("ai-close-fullscreen").addEventListener("click", () => {
  document.getElementById("ai-fullscreen-modal").classList.add("hidden");
});

async function sendModalMessage() {
  const input = document.getElementById("ai-modal-input");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  addUserMessage(text, "ai-modal-messages");
  modalChatHistory.push({ role:"user", content:text });
  const typing = addTypingIndicator("ai-modal-messages");
  const reply = await callAIVision(modalChatHistory.slice(-8));
  typing.remove();
  modalChatHistory.push({ role:"assistant", content:reply });
  addAIMessage(reply, "ai-modal-messages");
}

document.getElementById("ai-modal-send").addEventListener("click", sendModalMessage);
document.getElementById("ai-modal-input").addEventListener("keydown", e => {
  if (e.key === "Enter") sendModalMessage();
});

// Modal image upload
document.getElementById("ai-modal-img").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (ev) => {
    const imgSrc = ev.target.result;
    const base64 = imgSrc.split(",")[1];
    addUserMessage("📷 Image uploaded", "ai-modal-messages", imgSrc);
    const typing = addTypingIndicator("ai-modal-messages");
    const reply = await callAIVision([{
      role:"user",
      content:[
        { type:"image", source:{ type:"base64", media_type:file.type, data:base64 }},
        { type:"text",  text:"Analyze this image from a GIS/infrastructure perspective. What location might this be? What hazards are visible? What solutions are recommended?" }
      ]
    }]);
    typing.remove();
    addAIMessage(reply, "ai-modal-messages");
  };
  reader.readAsDataURL(file);
  e.target.value = "";
});

// ─── PHOTO UPLOADS FOR LOCATION ──────────────────────────────────────────────
document.getElementById("photo-upload").addEventListener("change", (e) => {
  const files = Array.from(e.target.files);
  const wrap = document.getElementById("loc-photos");
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = ev => {
      const img = document.createElement("img");
      img.src = ev.target.result;
      img.title = file.name;
      img.addEventListener("click", () => window.open(img.src, "_blank"));
      wrap.appendChild(img);
    };
    reader.readAsDataURL(file);
  });
});

// ─── WEATHER PANEL ───────────────────────────────────────────────────────────
async function loadWeather() {
  // Open-Meteo free API – no key required
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${DAET_LAT}&longitude=${DAET_LNG}&current_weather=true&daily=precipitation_sum,temperature_2m_max,temperature_2m_min&timezone=Asia/Manila&forecast_days=3`;
    const res = await fetch(url);
    const d = await res.json();
    const cw = d.current_weather;
    const wdate = new Date().toLocaleDateString("en-PH",{weekday:"short",month:"short",day:"numeric"});
    document.getElementById("weather-info").innerHTML = `
      <div>📅 ${wdate}</div>
      <div>🌡 Temp: ${cw.temperature}°C</div>
      <div>💨 Wind: ${cw.windspeed} km/h</div>
      <div>☁ Code: ${weatherCodeLabel(cw.weathercode)}</div>
      <div style="margin-top:6px;color:#64748b">3-Day Rain: ${d.daily.precipitation_sum.map(r=>r.toFixed(1)+"mm").join(" | ")}</div>
    `;
  } catch {
    document.getElementById("weather-info").textContent = "Weather unavailable.";
  }
}

function weatherCodeLabel(code) {
  if (code === 0) return "☀ Clear";
  if (code <= 3)  return "⛅ Partly Cloudy";
  if (code <= 48) return "🌫 Foggy";
  if (code <= 67) return "🌧 Rain";
  if (code <= 77) return "🌨 Snow";
  if (code <= 82) return "🌦 Showers";
  if (code <= 99) return "⛈ Thunderstorm";
  return "Unknown";
}

// ─── COLLAPSE LEFT PANEL ─────────────────────────────────────────────────────
document.getElementById("collapse-left").addEventListener("click", () => {
  const panel = document.getElementById("left-panel");
  panel.classList.toggle("collapsed");
  const icon = document.querySelector("#collapse-left i");
  icon.className = panel.classList.contains("collapsed")
    ? "fa fa-chevron-right" : "fa fa-chevron-left";
  setTimeout(() => map.invalidateSize(), 320);
});

// ─── INIT ────────────────────────────────────────────────────────────────────
(async function init() {
  // Fit to Camarines Norte
  map.fitBounds(CAMNORTE_BOUNDS);

  // Load initial data
  addVolcanoMarkers();
  loadWeather();

  // Welcome AI message after short delay
  setTimeout(async () => {
    const greeting = await callAIVision([{
      role:"user",
      content:"Give a 2-sentence welcome message as AI VISION for GeoVision platform focused on Daet, Camarines Norte. Mention one key hazard fact about the province."
    }]);
    addAIMessage(greeting);
  }, 1200);
})();
