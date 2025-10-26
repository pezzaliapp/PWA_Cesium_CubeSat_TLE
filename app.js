/* CubeSat Orbit — CesiumJS TLE viewer (compat v6 — Sun & Terminator standalone)
 * MIT 2025
 */
'use strict';

if (typeof window.satellite === 'undefined') {
  document.getElementById('status').textContent = 'Errore: satellite.js non caricato';
  console.error('satellite.js global not found');
}

const elTLE = document.getElementById('tle');
const elMinutes = document.getElementById('minutes');
const elStep = document.getElementById('step');
const elSim = document.getElementById('simulate');
const elPlay = document.getElementById('play');
const elReset = document.getElementById('reset');
const elStatus = document.getElementById('status');
const elInstall = document.getElementById('btnInstall');
const elLog = document.getElementById('log');

// ------- Install prompt -------
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  elInstall.hidden = false;
});
elInstall?.addEventListener('click', async ()=>{
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  elInstall.hidden = true;
});

// ------- Service Worker -------
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
}

// ------- Cesium Viewer -------
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

// Entities
let satEntity = null;
let pathEntity = null;
let sunPoint = null;
let terminator = null;

// Logger
function log(msg){ elLog.textContent = (elLog.textContent + '\\n' + msg).slice(-3000); }

// === Approximate Sun position (no Cesium internal API) ===
function sunPositionECEF(julianDate){
  // JD -> centuries from J2000
  const JD = Cesium.JulianDate.toDate(julianDate).getTime() / 86400000.0 + 2440587.5;
  const T = (JD - 2451545.0) / 36525.0;
  const L0 = Cesium.Math.toRadians((280.46646 + 36000.76983 * T) % 360);
  const M = Cesium.Math.toRadians((357.52911 + 35999.05029 * T) % 360);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C = Cesium.Math.toRadians((1.914602 - 0.004817 * T - 0.000014 * T*T) * Math.sin(M)
              + (0.019993 - 0.000101 * T) * Math.sin(2*M)
              + 0.000289 * Math.sin(3*M));
  const trueLong = L0 + C;
  const omega = Cesium.Math.toRadians(125.04 - 1934.136 * T);
  const lambda = trueLong - Cesium.Math.toRadians(0.00569) - Cesium.Math.toRadians(0.00478) * Math.sin(omega);
  const eps = Cesium.Math.toRadians(23.439 - 0.00000036 * T);
  const x = Math.cos(lambda);
  const y = Math.cos(eps) * Math.sin(lambda);
  const z = Math.sin(eps) * Math.sin(lambda);
  return new Cesium.Cartesian3(x, y, z);
}

function ensureSunEntities(){
  if (!sunPoint){
    sunPoint = viewer.entities.add({
      name: 'Subsolar point',
      position: Cesium.Cartesian3.fromDegrees(0,0,0),
      point: { pixelSize: 10, color: Cesium.Color.YELLOW, outlineColor: Cesium.Color.WHITE, outlineWidth: 1 },
      label: { text: '☀︎', fillColor: Cesium.Color.YELLOW, pixelOffset: new Cesium.Cartesian2(0,-18),
               verticalOrigin: Cesium.VerticalOrigin.BOTTOM, scale: 1.2 }
    });
  }
  if (!terminator){
    terminator = viewer.entities.add({
      name: 'Terminator',
      polyline: { positions: [], width: 1.5, material: Cesium.Color.WHITE.withAlpha(0.35) }
    });
  }
}

function updateSunAndTerminator(){
  ensureSunEntities();
  const now = viewer.clock.currentTime;
  const sunVec = sunPositionECEF(now);
  const dir = Cesium.Cartesian3.normalize(sunVec, new Cesium.Cartesian3());
  const ellipsoid = Cesium.Ellipsoid.WGS84;
  const sub = ellipsoid.scaleToGeodeticSurface(dir, new Cesium.Cartesian3());
  if (sub && sunPoint){
    const subCarto = ellipsoid.cartesianToCartographic(sub);
    sunPoint.position = Cesium.Cartesian3.fromRadians(subCarto.longitude, subCarto.latitude, 0);
  }

  // terminatore
  if (terminator && sub){
    const pts = [];
    const N = 240;
    const up = Cesium.Cartesian3.normalize(sub, new Cesium.Cartesian3());
    let tmp = new Cesium.Cartesian3(1,0,0);
    if (Math.abs(Cesium.Cartesian3.dot(up, tmp)) > 0.9) tmp = new Cesium.Cartesian3(0,1,0);
    const u = Cesium.Cartesian3.normalize(Cesium.Cartesian3.cross(up, tmp, new Cesium.Cartesian3()), new Cesium.Cartesian3());
    const v = Cesium.Cartesian3.cross(up, u, new Cesium.Cartesian3());
    const R = 6378137.0;
    for (let k=0;k<N;k++){
      const ang = 2*Math.PI*k/N;
      const dirk = new Cesium.Cartesian3(
        u.x*Math.cos(ang) + v.x*Math.sin(ang),
        u.y*Math.cos(ang) + v.y*Math.sin(ang),
        u.z*Math.cos(ang) + v.z*Math.sin(ang)
      );
      pts.push(new Cesium.Cartesian3(dirk.x*R, dirk.y*R, dirk.z*R));
    }
    terminator.polyline.positions = pts;
  }
}

// === buildPositionsFromTLE (tua originale) ===
function buildPositionsFromTLE(tleLine1, tleLine2, minutes=120, stepSec=30){
  const satrec = satellite.twoline2satrec(tleLine1.trim(), tleLine2.trim());
  const start = Cesium.JulianDate.now();
  const positions = new Cesium.SampledPositionProperty();
  for (let t=0; t<=minutes*60; t+=stepSec){
    const time = Cesium.JulianDate.addSeconds(start, t, new Cesium.JulianDate());
    const jsDate = Cesium.JulianDate.toDate(time);
    const gmst = satellite.gstime(jsDate);
    const prop = satellite.propagate(satrec, jsDate);
    if (!prop.position) continue;
    const gd = satellite.eciToGeodetic(prop.position, gmst);
    const cart = Cesium.Cartesian3.fromRadians(gd.longitude, gd.latitude, gd.height*1000);
    positions.addSample(time, cart);
  }
  return positions;
}

// === Simulate button (tuo codice invariato) ===
elSim.addEventListener('click', ()=>{
  try {
    const lines = elTLE.value.split('\\n').map(s=>s.trim()).filter(Boolean);
    if (lines.length < 2) throw new Error('Inserisci almeno due righe TLE valide.');
    const l1 = lines[lines.length-2];
    const l2 = lines[lines.length-1];
    const minutes = Math.max(1, parseInt(elMinutes.value||'120',10));
    const stepSec = Math.max(1, parseInt(elStep.value||'30',10));

    if (satEntity) { viewer.entities.remove(satEntity); satEntity = null; }
    if (pathEntity) { viewer.entities.remove(pathEntity); pathEntity = null; }

    const positions = buildPositionsFromTLE(l1, l2, minutes, stepSec);

    satEntity = viewer.entities.add({
      name: 'CubeSat',
      position: positions,
      point: { pixelSize: 8, color: Cesium.Color.CYAN, outlineColor: Cesium.Color.WHITE, outlineWidth: 2 },
      label: {
        text: 'CubeSat',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        pixelOffset: new Cesium.Cartesian2(0, -20),
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        eyeOffset: new Cesium.Cartesian3(0,0,-10)
      },
      path: {
        show: true,
        leadTime: 0,
        trailTime: minutes*60,
        resolution: stepSec,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.2,
          color: Cesium.Color.CYAN
        }),
        width: 2
      }
    });

    const start = positions._property._times[0];
    const stop = positions._property._times[positions._property._times.length-1];
    viewer.clock.startTime = start.clone();
    viewer.clock.currentTime = start.clone();
    viewer.clock.stopTime = stop.clone();
    viewer.clock.shouldAnimate = true;

    viewer.trackedEntity = satEntity;
    elStatus.textContent = 'Stato: simulazione pronta ✅';
    log('Simulazione impostata. Usa Play/Pause o trascina la timeline.');
  } catch (e) {
    elStatus.textContent = 'Errore: ' + e.message;
    log(e.stack || e.message);
  }
});

elPlay.addEventListener('click', ()=>{
  viewer.clock.shouldAnimate = !viewer.clock.shouldAnimate;
});

elReset.addEventListener('click', ()=>{
  viewer.clock.currentTime = viewer.clock.startTime.clone();
});

// === Update Sun/Terminator ===
viewer.clock.onTick.addEventListener(()=>{ updateSunAndTerminator(); });
