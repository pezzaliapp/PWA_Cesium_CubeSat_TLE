/* CubeSat Orbit — CesiumJS TLE viewer (PWA shell) + Sun/Terminator */
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

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
}

// ------- Cesium Viewer (no Ion token) -------
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

// *** Manteniamo il TUO clock che ti funziona ***
viewer.clock.clockStep = Cesium.ClockStep.SYSTEM_CLOCK_MULTIPLIER;
viewer.clock.multiplier = 60; // 1 sec reale = 60 sec simulati
viewer.clock.shouldAnimate = false;

// Entities
let satEntity = null;
let pathEntity = null;
let sunPoint = null;
let terminator = null;

// Log helper
function log(msg){
  elLog.textContent = (elLog.textContent + '\n' + msg).slice(-4000);
}

// ---------------- Sun + Terminator ----------------
function ensureSunEntities(){
  if (!sunPoint){
    sunPoint = viewer.entities.add({
      name: 'Subsolar point',
      position: Cesium.Cartesian3.fromDegrees(0,0,0),
      point: { pixelSize: 10, color: Cesium.Color.YELLOW, outlineColor: Cesium.Color.WHITE, outlineWidth: 1 },
      label: { text: '☀︎', fillColor: Cesium.Color.YELLOW, pixelOffset: new Cesium.Cartesian2(0,-18), verticalOrigin: Cesium.VerticalOrigin.BOTTOM, scale: 1.2 }
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
  // Sole in ICRF -> Earth-fixed
  const sunIcrf = Cesium.Simon1994PlanetaryPositions.computeSunPositionInEarthInertialFrame(now);
  const icrfToFixed = Cesium.Transforms.computeIcrfToFixedMatrix(now);
  let sunFixed = sunIcrf;
  if (icrfToFixed) sunFixed = Cesium.Matrix3.multiplyByVector(icrfToFixed, sunIcrf, new Cesium.Cartesian3());

  const dir = Cesium.Cartesian3.normalize(sunFixed, new Cesium.Cartesian3());
  const ellipsoid = Cesium.Ellipsoid.WGS84;
  const sub = ellipsoid.scaleToGeodeticSurface(dir, new Cesium.Cartesian3());
  const subCarto = ellipsoid.cartesianToCartographic(sub);
  // aggiorna marker subsolare
  sunPoint.position = Cesium.Cartesian3.fromRadians(subCarto.longitude, subCarto.latitude, 0);

  // terminatore = grande cerchio ortogonale al Sole
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

// ---------------- TLE → positions ----------------
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
    const gd = satellite.eciToGeodetic(prop.position, gmst); // rad, km
    const cart = Cesium.Cartesian3.fromRadians(gd.longitude, gd.latitude, gd.height*1000);
    positions.addSample(time, cart);
  }
  return positions;
}

// ---------------- Telemetria semplice ----------------
function updateTelemetry(){
  if (!satEntity) return;
  const t = viewer.clock.currentTime;
  const pos = satEntity.position.getValue(t);
  if (!pos) return;
  const carto = Cesium.Cartographic.fromCartesian(pos);
  const lat = Cesium.Math.toDegrees(carto.latitude).toFixed(2);
  const lon = Cesium.Math.toDegrees(carto.longitude).toFixed(2);
  const alt = (carto.height/1000).toFixed(1);
  // stampa minimale nello "status"
  elStatus.textContent = `Stato: simulazione pronta ✅  |  Alt: ${alt} km  Lat/Lon: ${lat}°, ${lon}°`;
}

// ---------------- Tick ----------------
viewer.clock.onTick.addEventListener(()=>{
  updateSunAndTerminator();
  updateTelemetry();
});

// ---------------- UI: Simula/Play/Reset ----------------
elSim.addEventListener('click', ()=>{
  try {
    const lines = elTLE.value.split('\n').map(s=>s.trim()).filter(Boolean);
    if (lines.length < 2) throw new Error('Inserisci almeno due righe TLE valide.');
    const l1 = lines[lines.length-2];
    const l2 = lines[lines.length-1];
    const minutes = Math.max(1, parseInt(elMinutes.value||'120',10));
    const stepSec = Math.max(1, parseInt(elStep.value||'30',10));

    // pulizia
    if (satEntity) { viewer.entities.remove(satEntity); satEntity = null; }
    if (pathEntity) { viewer.entities.remove(pathEntity); pathEntity = null; }

    const positions = buildPositionsFromTLE(l1, l2, minutes, stepSec);

    satEntity = viewer.entities.add({
      name: 'CubeSat',
      position: positions,
      point: { pixelSize: 8, color: Cesium.Color.CYAN, outlineColor: Cesium.Color.WHITE, outlineWidth: 2 },
      path: {
        show: true, leadTime: 0, trailTime: minutes*60, resolution: stepSec,
        material: new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.2, color: Cesium.Color.CYAN }),
        width: 2
      }
    });

    // segui il satellite e fai partire l’animazione (lasciando il tuo clock)
    viewer.trackedEntity = satEntity;
    viewer.clock.shouldAnimate = true;

    elStatus.textContent = 'Stato: simulazione pronta ✅';
    log('Simulazione pronta. Animazione ON');
  } catch (e) {
    elStatus.textContent = 'Errore: ' + e.message;
    log(e.stack || e.message);
  }
});

elPlay.addEventListener('click', ()=>{
  viewer.clock.shouldAnimate = !viewer.clock.shouldAnimate;
  if (viewer.animation && viewer.animation.viewModel) {
    try { viewer.animation.viewModel.setShuttleRingValue && viewer.animation.viewModel.setShuttleRingValue(1.0); } catch(e) {}
    try { viewer.animation.viewModel.playForwardViewModel && viewer.animation.viewModel.playForwardViewModel.command(); } catch(e) {}
  }
});

elReset.addEventListener('click', ()=>{
  // reset “soft”: riporta l’orologio all'istante reale (coerente con SYSTEM_CLOCK_MULTIPLIER)
  viewer.clock.currentTime = Cesium.JulianDate.now();
  viewer.scene.requestRender();
});
