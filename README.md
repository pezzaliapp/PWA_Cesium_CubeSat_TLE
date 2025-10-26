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
