/* CubeSat Orbit — CesiumJS TLE viewer (PWA shell)
 * v5 Minimal Clean — MIT 2025
 */
'use strict';

if (typeof window.satellite === 'undefined') {
  document.getElementById('status').textContent = 'Errore: satellite.js non caricato';
  console.error('satellite.js global not found');
}

// --- UI elements ---
const elTLE = document.getElementById('tle');
const elMinutes = document.getElementById('minutes');
const elStep = document.getElementById('step');
const elSim = document.getElementById('simulate');
const elPlay = document.getElementById('play');
const elReset = document.getElementById('reset');
const elStatus = document.getElementById('status');
const elInstall = document.getElementById('btnInstall');
const elLog = document.getElementById('log');

// --- Install prompt (PWA) ---
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  elInstall.hidden = false;
});
elInstall?.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  elInstall.hidden = true;
});

// --- Service Worker ---
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js').catch(() => {});
}

// --- Cesium Viewer (no Ion token) ---
Cesium.Ion.defaultAccessToken = undefined;

const viewer = new Cesium.Viewer('viewer', {
  imageryProvider: new Cesium.UrlTemplateImageryProvider({
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    credit: '© OpenStreetMap contributors'
  }),
  terrainProvider: new Cesium.EllipsoidTerrainProvider(),
  animation: true,
  timeline: true,
  baseLayerPicker: false,
  geocoder: false,
  homeButton: true,
  sceneModePicker: true,
  navigationHelpButton: false,
  fullscreenButton: false,
});

viewer.scene.globe.enableLighting = true;
viewer.clock.clockStep = Cesium.ClockStep.SYSTEM_CLOCK_MULTIPLIER;
viewer.clock.multiplier = 60;
viewer.clock.shouldAnimate = false;

// --- Entities ---
let satEntity = null;

// --- Logger ---
function log(msg) {
  elLog.textContent = (elLog.textContent + '\n' + msg).slice(-3000);
}

// --- Build sampled positions from TLE ---
function buildPositionsFromTLE(tleLine1, tleLine2, minutes = 120, stepSec = 30) {
  const satrec = satellite.twoline2satrec(tleLine1.trim(), tleLine2.trim());
  const start = Cesium.JulianDate.now();
  const positions = new Cesium.SampledPositionProperty();

  for (let t = 0; t <= minutes * 60; t += stepSec) {
    const time = Cesium.JulianDate.addSeconds(start, t, new Cesium.JulianDate());
    const jsDate = Cesium.JulianDate.toDate(time);
    const gmst = satellite.gstime(jsDate);
    const prop = satellite.propagate(satrec, jsDate);
    if (!prop.position) continue;
    const pos = satellite.eciToGeodetic(prop.position, gmst);
    const cart = Cesium.Cartesian3.fromRadians(pos.longitude, pos.latitude, pos.height * 1000);
    positions.addSample(time, cart);
  }
  return positions;
}

// --- Simulate Button ---
elSim.addEventListener('click', () => {
  try {
    const lines = elTLE.value.split('\n').map(s => s.trim()).filter(Boolean);
    if (lines.length < 2) throw new Error('Inserisci almeno due righe TLE valide.');

    const l1 = lines[lines.length - 2];
    const l2 = lines[lines.length - 1];
    const minutes = Math.max(1, parseInt(elMinutes.value || '120', 10));
    const stepSec = Math.max(1, parseInt(elStep.value || '30', 10));

    if (satEntity) { viewer.entities.remove(satEntity); satEntity = null; }

    const positions = buildPositionsFromTLE(l1, l2, minutes, stepSec);

    satEntity = viewer.entities.add({
      name: 'Satellite',
      position: positions,
      point: { pixelSize: 7, color: Cesium.Color.CYAN, outlineColor: Cesium.Color.WHITE, outlineWidth: 2 },
      path: {
        show: true,
        leadTime: 0,
        trailTime: minutes * 60,
        resolution: stepSec,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.2,
          color: Cesium.Color.CYAN
        }),
        width: 2
      }
    });

    const start = positions._property._times[0];
    const stop = positions._property._times[positions._property._times.length - 1];
    viewer.clock.startTime = start.clone();
    viewer.clock.currentTime = start.clone();
    viewer.clock.stopTime = stop.clone();
    viewer.clock.shouldAnimate = true;
    viewer.trackedEntity = satEntity;

    elStatus.textContent = 'Simulazione pronta ✅';
    log('Simulazione impostata.');
  } catch (e) {
    elStatus.textContent = 'Errore: ' + e.message;
    log(e.stack || e.message);
  }
});

// --- Play / Reset ---
elPlay.addEventListener('click', () => {
  viewer.clock.shouldAnimate = !viewer.clock.shouldAnimate;
});

elReset.addEventListener('click', () => {
  viewer.clock.currentTime = viewer.clock.startTime.clone();
});
