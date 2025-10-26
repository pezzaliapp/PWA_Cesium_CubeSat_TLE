# 🛰️ CubeSat Orbit — CesiumJS TLE Viewer (PWA)

**Versione v5b — Telemetria Leggera + Mappe + Etichetta dinamica**  
Sviluppato da **pezzaliAPP.com** · Licenza **MIT 2025**

---

## 🚀 Descrizione

**CubeSat Orbit** è una **Progressive Web App** interattiva che visualizza in tempo reale  
le orbite di satelliti artificiali a partire dai dati **TLE (Two-Line Elements)**.  

L’applicazione sfrutta la potenza di **CesiumJS** e della libreria **satellite.js**  
per generare orbite 3D accurate, sincronizzate nel tempo simulato,  
con **telemetria live** e coordinate aggiornate a ogni frame.

---

## 🌍 Caratteristiche principali

- Visualizzazione **3D in tempo reale** delle orbite (OpenStreetMap + CesiumJS)
- Lettura diretta dei dati **TLE**
- **Telemetria leggera**: altitudine, velocità, latitudine, longitudine
- **Subsolar point** e calcolo dinamico **Azimut / Elevazione del Sole**
- Link integrati per aprire la posizione in **Google Maps** e **OpenStreetMap**
- Etichetta dinamica sopra il satellite con **Alt / Vel** in tempo reale
- Micro-logger interno per FPS stimato e tempo simulato
- Funziona **offline** come PWA installabile su desktop e mobile

---

## ⚙️ Architettura

- **Motore 3D:** CesiumJS  
- **Propagazione orbitale:** satellite.js  
- **Interfaccia:** HTML / CSS / JavaScript vanilla  
- **Offline:** service-worker.js  
- **Formato input:** Two-Line Elements (TLE)

---

## 💡 Esempio TLE (ISS — ZARYA)

1 25544U 98067A   24299.50000000  .00016717  00000-0  10270-3 0  9995
2 25544  51.6437  28.9044 0005712  35.3822  65.1452 15.50386381445585

---

## 🕹️ Comandi

| Pulsante | Funzione |
|-----------|-----------|
| **Simula** | Genera e visualizza l’orbita |
| **Play/Pause** | Avvia o ferma la simulazione |
| **Reset** | Riporta l’orbitale all’inizio |
| **Installa** | Installa la PWA su dispositivo locale |

---

## 📡 Telemetria

| Parametro | Descrizione |
|------------|-------------|
| **Altitudine** | Altezza del satellite sopra il livello medio del mare |
| **Velocità** | Velocità relativa stimata tra due frame successivi |
| **Periodo** | Periodo orbitale stimato dai dati TLE |
| **Lat/Lon** | Coordinate geografiche in gradi decimali |
| **Subsolare / Azimut / Elevazione** | Posizione del Sole e orientamento relativo al satellite |

---

## 🧱 Struttura dei file

/index.html
/app.js
/styles.css
/manifest.json
/service-worker.js
/README.md

---

## 📲 Installazione

1. Clona o scarica il repository:  
   ```bash
   git clone https://github.com/pezzaliapp/PWA_Cesium_CubeSat_TLE

	2.	Apri index.html nel browser (anche offline).
	3.	Se richiesto, consenti l’installazione della PWA.
	4.	Inserisci un TLE e premi Simula.

⸻

🧪 Compatibilità
	•	✅ Chrome, Edge, Safari, Firefox (desktop e mobile)
	•	✅ iOS, Android, macOS, Windows, Linux
	•	⚙️ Offline Ready — nessuna dipendenza cloud
	•	🌐 CesiumJS & satellite.js inclusi localmente o via CDN

⸻

👨‍🚀 Autore

Alessandro Pezzali — pezzaliAPP.com
Cultura digitale tra codice, orbite e immaginazione.

“Osservare la Terra da lassù significa capire quanto sia fragile da quaggiù.”

⸻

📜 Licenza

MIT License — 2025
Utilizzabile liberamente per fini educativi, scientifici e divulgativi.
