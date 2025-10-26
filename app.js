/* CubeSat Orbit — CesiumJS TLE viewer (PWA shell)
 * v5b — Telemetria + Maps link + label dinamica + micro-logger — MIT 2025
 */
'use strict';

if (typeof window.satellite === 'undefined') {
  document.getElementById('status').textContent = 'Errore: satellite.js non caricato';
  console.error('satellite.js global not found');
}

// --- UI refs ---
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

// ------- PWA Install Prompt -------
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
viewer.scene.globe.enableLighting = true;     // day/night shading
viewer.clock.clockStep = Cesium.ClockStep.SYSTEM_CLOCK_MULTIPLIER;
viewer.clock.multiplier = 60;
viewer.clock.shouldAnimate = false;

// Entities
let satEntity = null;

// Log helper
function log(msg){
  elLog.textContent = (elLog.textContent + '\n' + msg).slice(-3000);
}

// Build positions from TLE
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

// --- util: Sun subsolar position (ECI->ECEF approx, no rare Cesium APIs) ---
function sunECEF(jd){
  try{
    const JD = Cesium.JulianDate.toDate(jd).getTime()/86400000 + 2440587.5;
    const T  = (JD - 2451545.0)/36525.0;
    const L0 = (280.46646 + 36000.76983*T) % 360;
    const M  = (357.52911 + 35999.05029*T) % 360;
    const Mr = Cesium.Math.toRadians(M);
    const C = (1.914602 - 0.004817*T - 0.000014*T*T)*Math.sin(Mr)
            + (0.019993 - 0.000101*T)*Math.sin(2*Mr)
            + 0.000289*Math.sin(3*Mr);
    const lambda = Cesium.Math.toRadians((L0 + C) % 360);
    const eps = Cesium.Math.toRadians(23.439 - 0.00000036*T);
    const x = Math.cos(lambda), y = Math.cos(eps)*Math.sin(lambda), z = Math.sin(eps)*Math.sin(lambda);
    const m = Cesium.Transforms.computeIcrfToFixedMatrix(jd);
    return m ? Cesium.Matrix3.multiplyByVector(m,new Cesium.Cartesian3(x,y,z),new Cesium.Cartesian3())
             : new Cesium.Cartesian3(x,y,z);
  }catch(_){ return null; }
}

// Simulate
elSim.addEventListener('click', ()=>{
  try {
    const lines = elTLE.value.split('\n').map(s=>s.trim()).filter(Boolean);
    if (lines.length < 2) throw new Error('Inserisci almeno due righe TLE valide.');
    const l1 = lines[lines.length-2];
    const l2 = lines[lines.length-1];
    const minutes = Math.max(1, parseInt(elMinutes.value||'120',10));
    const stepSec = Math.max(1, parseInt(elStep.value||'30',10));

    if (satEntity) viewer.entities.remove(satEntity);

    const positions = buildPositionsFromTLE(l1, l2, minutes, stepSec);

    // Label dinamica: alt/vel in tempo reale (non invasiva)
    const labelText = new Cesium.CallbackProperty(function(){
      try{
        const t = viewer.clock.currentTime;
        const p1 = satEntity?.position?.getValue(t);
        if (!p1) return '';
        const c = Cesium.Cartographic.fromCartesian(p1);
        const alt = (c.height/1000).toFixed(0);
        const p2 = satEntity.position.getValue(Cesium.JulianDate.addSeconds(t,1,new Cesium.JulianDate()));
        let vel = '';
        if (p2) vel = (Cesium.Cartesian3.distance(p1,p2)).toFixed(0);
        return `${alt} km • ${vel} m/s`;
      }catch(_){ return ''; }
    }, false);

    satEntity = viewer.entities.add({
      name: 'Sat',
      position: positions,
      point: { pixelSize: 7, color: Cesium.Color.CYAN, outlineColor: Cesium.Color.WHITE, outlineWidth: 2 },
      label: {
        text: labelText,
        showBackground: true,
        backgroundColor: Cesium.Color.fromAlpha(Cesium.Color.BLACK, 0.5),
        fillColor: Cesium.Color.WHITE,
        font: '12px sans-serif',
        pixelOffset: new Cesium.Cartesian2(0, -18),
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      },
      path: {
        show: true,
        leadTime: 0,
        trailTime: minutes*60,
        resolution: stepSec,
        material: new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.2, color: Cesium.Color.CYAN }),
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

    elStatus.textContent = 'Simulazione pronta ✅';
    log('Simulazione impostata.');
  } catch (e) {
    elStatus.textContent = 'Errore: ' + e.message;
    log(e.stack || e.message);
  }
});

// Play / Reset
elPlay.addEventListener('click', ()=>{ viewer.clock.shouldAnimate = !viewer.clock.shouldAnimate; });
elReset.addEventListener('click', ()=>{ viewer.clock.currentTime = viewer.clock.startTime.clone(); });

// Telemetria + Sole + Maps link + micro-logger (non bloccanti)
(function(){
  const setText = (el, txt)=>{ if (el) el.textContent = txt; };
  if (telemetryEl) setText(telemetryEl, 'Altitudine: -\nVelocità: -\nPeriodo: -\nLat/Lon: -');
  if (sunEl)        setText(sunEl,        'Subsolare: -\nAzimut/Elev: -');

  // micro-logger FPS stimato (via postRender)
  let frameCount = 0;
  viewer.scene.postRender.addEventListener(()=>{ frameCount++; });
  setInterval(()=>{
    try{
      if (!viewer.clock) return;
      const simRate = viewer.clock.multiplier; // 60x
      const fps = frameCount/2; // aggiornamento ogni 2s
      frameCount = 0;
      const t = Cesium.JulianDate.toDate(viewer.clock.currentTime).toISOString().replace('T',' ').replace('Z',' UTC');
      log(`Tick: sim×${simRate}, ~${fps.toFixed(0)} FPS, t=${t}`);
    }catch(_){}
  }, 2000);

  viewer.clock.onTick.addEventListener(()=>{
    try{
      if (!satEntity) return;
      const t = viewer.clock.currentTime;
      const p1 = satEntity.position.getValue(t);
      if (!p1) return;

      const c = Cesium.Cartographic.fromCartesian(p1);
      const lat = Cesium.Math.toDegrees(c.latitude);
      const lon = Cesium.Math.toDegrees(c.longitude);
      const altKm = c.height/1000;

      // Velocità stimata
      const t2 = Cesium.JulianDate.addSeconds(t,1,new Cesium.JulianDate());
      const p2 = satEntity.position.getValue(t2);
      let velStr = '-';
      if (p2) velStr = Cesium.Cartesian3.distance(p1,p2).toFixed(1)+' m/s';

      // Link Maps/OSM
      const latFix = lat.toFixed(5), lonFix = lon.toFixed(5);
      const gmaps = `https://www.google.com/maps/@?api=1&map_action=map&center=${latFix},${lonFix}&zoom=4&basemap=satellite`;
      const osm   = `https://www.openstreetmap.org/?mlat=${latFix}&mlon=${lonFix}#map=4/${latFix}/${lonFix}`;

      if (telemetryEl){
        telemetryEl.innerHTML =
          `Altitudine: ${altKm.toFixed(1)} km<br>`+
          `Velocità: ${velStr}<br>`+
          `Periodo: ~ (da TLE)<br>`+
          `Lat/Lon: ${lat.toFixed(2)}°, ${lon.toFixed(2)}°<br>`+
          `<a href="${gmaps}" target="_blank" rel="noopener">Apri in Google Maps</a> · `+
          `<a href="${osm}" target="_blank" rel="noopener">OSM</a>`;
      }

      // Sole (subsolare)
      const s = sunECEF(t);
      if (s && sunEl){
        const dir = Cesium.Cartesian3.normalize(s,new Cesium.Cartesian3());
        const ell = Cesium.Ellipsoid.WGS84;
        const sub = ell.scaleToGeodeticSurface(dir,new Cesium.Cartesian3());
        if (sub){
          const sc = ell.cartesianToCartographic(sub);
          const slat = Cesium.Math.toDegrees(sc.latitude).toFixed(2);
          const slon = Cesium.Math.toDegrees(sc.longitude).toFixed(2);

          // Az/El del Sole dal sub-punto del satellite (opzionale, semplice)
          const obsECEF = Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, 0);
          const enu = Cesium.Transforms.eastNorthUpToFixedFrame(obsECEF);
          const inv = Cesium.Matrix4.inverse(enu, new Cesium.Matrix4());
          const sunPoint = new Cesium.Cartesian3(dir.x*1e7, dir.y*1e7, dir.z*1e7);
          const local = Cesium.Matrix4.multiplyByPoint(inv, sunPoint, new Cesium.Cartesian3());
          const e = local.x, n = local.y, u = local.z;
          const az = (Math.atan2(e,n)*180/Math.PI + 360) % 360;
          const elv = Math.asin(u / Math.sqrt(e*e+n*n+u*u))*180/Math.PI;

          setText(sunEl, `Subsolare: ${slat}°, ${slon}°\nAzimut/Elev: ${az.toFixed(1)}°, ${elv.toFixed(1)}°`);
        }
      }
    }catch(_){ /* silenzioso */ }
  });
})();
