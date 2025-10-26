/* Cesium TLE PWA v3b — fixed sun code using ICRF->ECEF transform */
'use strict';

const elTLE = document.getElementById('tle');
const elMinutes = document.getElementById('minutes');
const elStep = document.getElementById('step');
const elSim = document.getElementById('simulate');
const elPlay = document.getElementById('play');
const elReset = document.getElementById('reset');
const elStatus = document.getElementById('status');
const elInstall = document.getElementById('btnInstall');
const elLog = document.getElementById('log');
const telemetryEl = document.getElementById('telemetry');
const sunEl = document.getElementById('suninfo');

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

Cesium.Ion.defaultAccessToken = undefined;
const viewer = new Cesium.Viewer('viewer', {
  imageryProvider: new Cesium.UrlTemplateImageryProvider({
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', credit: '© OpenStreetMap contributors'
  }),
  terrainProvider: new Cesium.EllipsoidTerrainProvider(),
  animation: true, timeline: true, baseLayerPicker: false, geocoder: false,
  homeButton: true, sceneModePicker: true, navigationHelpButton: false, fullscreenButton: false,
});
viewer.scene.globe.enableLighting = true;
viewer.scene.requestRenderMode = false; // continuous rendering
viewer.clock.clockStep = Cesium.ClockStep.TICK_DEPENDENT;
viewer.clock.clockRange = Cesium.ClockRange.LOOP_STOP;
viewer.clock.multiplier = 60;
viewer.clock.shouldAnimate = false;

if (typeof window.satellite === 'undefined') {
  elStatus.textContent = 'Errore: satellite.js non caricato';
  console.error('satellite.js global not found');
}

let satEntity = null;
let terminator = null;
let sunPoint = null;

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
  // Sun position in Earth inertial frame (ICRF)
  const sunIcrf = Cesium.Simon1994PlanetaryPositions.computeSunPositionInEarthInertialFrame(now);
  // Transform to Earth-fixed (ECEF) if possible
  const icrfToFixed = Cesium.Transforms.computeIcrfToFixedMatrix(now);
  let sunFixed = sunIcrf;
  if (icrfToFixed) {
    sunFixed = Cesium.Matrix3.multiplyByVector(icrfToFixed, sunIcrf, new Cesium.Cartesian3());
  }
  const dir = Cesium.Cartesian3.normalize(sunFixed, new Cesium.Cartesian3());
  const ellipsoid = Cesium.Ellipsoid.WGS84;
  const sub = ellipsoid.scaleToGeodeticSurface(dir, new Cesium.Cartesian3());
  const subCarto = ellipsoid.cartesianToCartographic(sub);
  sunPoint.position = Cesium.Cartesian3.fromRadians(subCarto.longitude, subCarto.latitude, 0);
  const lonDeg = Cesium.Math.toDegrees(subCarto.longitude).toFixed(2);
  const latDeg = Cesium.Math.toDegrees(subCarto.latitude).toFixed(2);
  sunEl.textContent = `Subsolare: ${latDeg}°, ${lonDeg}°`;

  // Terminator approximation: great circle orthogonal to Sun vector
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
    const p = new Cesium.Cartesian3(dirk.x*R, dirk.y*R, dirk.z*R);
    pts.push(p);
  }
  terminator.polyline.positions = pts;
}

function updateTelemetry(){
  if (!satEntity) { telemetryEl.textContent = 'Altitudine: -\nVelocità: -\nPeriodo: -\nLat/Lon: -'; return; }
  const t = viewer.clock.currentTime;
  const pos = satEntity.position.getValue(t);
  if (!pos){ return; }
  const carto = Cesium.Cartographic.fromCartesian(pos);
  const lat = Cesium.Math.toDegrees(carto.latitude);
  const lon = Cesium.Math.toDegrees(carto.longitude);
  const alt = carto.height;
  const t2 = Cesium.JulianDate.addSeconds(t, 1, new Cesium.JulianDate());
  const p2 = satEntity.position.getValue(t2);
  let vel = '-';
  if (p2){
    const d = Cesium.Cartesian3.distance(pos, p2);
    vel = d.toFixed(1)+' m/s';
  }
  telemetryEl.textContent = `Altitudine: ${(alt/1000).toFixed(1)} km\nVelocità: ${vel}\nPeriodo: ~ (da TLE)\nLat/Lon: ${lat.toFixed(2)}°, ${lon.toFixed(2)}°`;
}

viewer.clock.onTick.addEventListener(()=>{
  updateSunAndTerminator();
  updateTelemetry();
});

elSim.addEventListener('click', ()=>{
  elLog.textContent += '\nSimulazione avviata…';
  elLog.textContent += '\nSimulazione avviata…';
  try {
    const lines = elTLE.value.split('\n').map(s=>s.trim()).filter(Boolean);
    if (lines.length < 2) throw new Error('Inserisci almeno due righe TLE valide.');
    const l1 = lines[lines.length-2];
    const l2 = lines[lines.length-1];
    const minutes = Math.max(1, parseInt(elMinutes.value||'120',10));
    const stepSec = Math.max(1, parseInt(elStep.value||'30',10));
    if (satEntity) { viewer.entities.remove(satEntity); satEntity = null; }
    const positions = buildPositionsFromTLE(l1, l2, minutes, stepSec);
    satEntity = viewer.entities.add({
      name: 'CubeSat',
      position: positions,
      point: { pixelSize: 8, color: Cesium.Color.CYAN, outlineColor: Cesium.Color.WHITE, outlineWidth: 2 },
      path: { show:true, leadTime:0, trailTime:minutes*60, resolution:stepSec,
        material: new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.2, color: Cesium.Color.CYAN }), width: 2 }
    });
    const startNow = Cesium.JulianDate.now();
    const stopNow  = Cesium.JulianDate.addSeconds(startNow, minutes*60, new Cesium.JulianDate());
    // Motore clock
    viewer.clock.startTime   = startNow.clone();
    viewer.clock.stopTime    = stopNow.clone();
    viewer.clock.currentTime = startNow.clone();
    viewer.clock.clockRange  = Cesium.ClockRange.LOOP_STOP;
    viewer.clock.multiplier  = 60;
    viewer.clock.shouldAnimate = true;
    // UI clock (clockViewModel)
    const vm = viewer.clockViewModel;
    vm.startTime   = startNow.clone();
    vm.stopTime    = stopNow.clone();
    vm.currentTime = startNow.clone();
    vm.multiplier  = 60;
    vm.shouldAnimate = true;
    viewer.trackedEntity = satEntity;
    elStatus.textContent = 'Stato: simulazione pronta ✅';
    elLog.textContent += '\nSimulazione pronta. Animazione ON';
  } catch (e) {
    elStatus.textContent = 'Errore: ' + e.message;
    elLog.textContent += '\\n'+(e.stack||e.message);
  }
});
elPlay.addEventListener('click', ()=>{
  const vm = viewer.clockViewModel;
  vm.multiplier   = 60;
  vm.shouldAnimate = !vm.shouldAnimate;
  viewer.clock.multiplier   = vm.multiplier;
  viewer.clock.shouldAnimate = vm.shouldAnimate;
  viewer.scene.requestRender();
});
elReset.addEventListener('click', ()=>{
  const vm = viewer.clockViewModel;
  vm.currentTime = vm.startTime.clone();
  viewer.clock.currentTime = vm.currentTime.clone();
  viewer.scene.requestRender();
});
