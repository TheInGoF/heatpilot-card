/* HeatPilot Card – Karten für Home Assistant zum Add-on „EMS HeatPilot“ (ab Add-on 0.56).
 *
 * Vier Karten im Stil der HeatPilot-Seite, ohne card-mod und ohne Abhängigkeiten:
 *   custom:heatpilot-rooms-card    Raumkacheln wie im Reiter „Heizen“; Antippen öffnet das Thermostat-Pop-up
 *   custom:heatpilot-control-card  Mehrere Räume auf einmal: Boost mit Dauer, Zeitplan, Aus – laufende Boosts mit Stopp
 *   custom:heatpilot-weather-card  Wetter jetzt und die nächsten 24 Stunden als Stundenbalken
 *   custom:heatpilot-mode-card     Nur jetzt: Nacht, Anwesend, Abwesend für das ganze Haus (ab Add-on 0.62)
 *
 * Daten: sensor.heatpilot_raum_* und sensor.heatpilot_boost (setzt das Add-on), die Wetter-Entität.
 * Bedienen: JSON-Befehl in input_text.heatpilot_befehl – das Add-on führt ihn aus wie die Knöpfe im Reiter
 * „Heizen“, leert das Feld und meldet das Ergebnis in sensor.heatpilot_boost → last.
 */
const HP_VERSION = "0.6.1";
const COMMAND = "input_text.heatpilot_befehl";
const BOOST = "sensor.heatpilot_boost";
const ROOM_PREFIX = "sensor.heatpilot_raum_";
const MODE = "sensor.heatpilot_modus";
const PHASE = { komfort: "Komfort", nacht: "Nacht", abwesend: "Abwesend", vorheizen: "Vorheizen", urlaub: "Urlaub", aus: "Aus" };

const fmt = (v, d = 1) => v === null || v === undefined || Number.isNaN(Number(v)) ? "–"
  : Number(v).toLocaleString("de-DE", { maximumFractionDigits: d, minimumFractionDigits: 0 });
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const clock = (t) => t ? new Date(typeof t === "number" ? t * 1000 : t).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : "–";
const hm = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")} h`;
const leftText = (m) => m >= 60 ? hm(m) : m + " min";
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ohne Speicher */ } },
};

// Farbe nach Soll wie in der HeatPilot-Seite: aus = grau, kühl = türkis, ab 19 °C bernstein bis orange
function tileColors(target, mode) {
  if (mode === "off" || target === null || target === undefined || target < 5) return { fg: "#8f9aa6", bg: "rgba(143,154,166,.10)" };
  if (target < 19) { const h = 175 - (target - 5) * 1.2; return { fg: `hsl(${h},70%,45%)`, bg: `hsla(${h},70%,45%,.12)` }; }
  const h = 45 - Math.min(target - 19, 6) * 3.5;
  return { fg: `hsl(${h},95%,52%)`, bg: `hsla(${h},95%,52%,.14)` };
}

const ICON = {
  drop: '<svg viewBox="0 0 24 24" fill="currentColor" width="11" height="11"><path d="M12 2.5s6 7 6 11.5a6 6 0 0 1-12 0C6 9.5 12 2.5 12 2.5z"/></svg>',
  off: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3v9"/><path d="M6.3 6.3a8 8 0 1 0 11.4 0"/></svg>',
  boost: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c4 0 7-3 7-7 0-5-5-8-5-12-2 2-3 4-3 6-1-1-2-3-2-5-3 3-4 7-4 11 0 4 3 7 7 7z"/></svg>',
  sched: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15.5-6.4L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.4L3 16"/><path d="M3 21v-5h5"/></svg>',
};

// Farben der HeatPilot-Seite; Fläche und Schrift kommen vom Home-Assistant-Theme
const BASE_CSS = `
:host { --hp-heat-bg: #f8e1c2; --hp-heat-fg: #9a4e00; --hp-off-bg: #ecebe8; --hp-blue: #2a78d6;
  --hp-orange: #eb6834; --hp-purple: #8e5bd0; --hp-grey: #8a8984; --hp-warn: #c98500; --hp-chip: rgba(127,127,127,.10);
  --hp-text: var(--primary-text-color); --hp-text2: var(--secondary-text-color); --hp-border: var(--divider-color, rgba(127,127,127,.25)); }
:host([dark]) { --hp-heat-bg: #4a2d0c; --hp-heat-fg: #f5a729; --hp-off-bg: #161615; --hp-blue: #3987e5; --hp-orange: #d95926; }
ha-card { padding: 14px 16px; container-type: inline-size; }
div.hp-root { display: block; container-type: inline-size; }  /* ohne Kartenrahmen (Standard): direkt auf dem Hintergrund */
div.hp-root > h2 { margin: 4px 4px 10px; }
h2 { margin: 0 0 10px; font-size: 17px; font-weight: 600; color: var(--hp-text); display: flex; align-items: center; gap: 8px; }
.muted { color: var(--hp-text2); font-size: 12px; }
.lbl { font-size: 12px; color: var(--hp-text2); text-transform: uppercase; letter-spacing: .04em; font-weight: 600; margin: 12px 0 6px; }
button { font: inherit; color: inherit; }
.btn { border: 1px solid var(--hp-border); border-radius: 10px; background: var(--card-background-color, transparent); padding: 7px 12px;
  cursor: pointer; font-size: 13px; display: inline-flex; align-items: center; gap: 6px; color: var(--hp-text); }
.btn svg { width: 16px; height: 16px; }
.btn.primary { background: var(--hp-blue); border-color: transparent; color: #fff; font-weight: 600; }
.btn:disabled { opacity: .45; cursor: default; }
.msg { font-size: 12px; margin-top: 8px; min-height: 0; }
.msg.err { color: var(--error-color, #c62828); }
.pill { background: var(--hp-heat-bg); color: var(--hp-heat-fg); border-radius: 999px; padding: 3px 9px; font-size: 12px; font-weight: 600; }
`;

// Befehl an das Add-on (input_text.heatpilot_befehl); n macht gleiche Befehle unterscheidbar
function sendCommand(hass, cmd) {
  const n = Date.now() % 1e9;
  return hass.callService("input_text", "set_value", { entity_id: COMMAND, value: JSON.stringify({ ...cmd, n }) }).then(() => n);
}
// Ergebnis des Befehls n aus sensor.heatpilot_boost → last (null, solange es fehlt)
function commandResult(hass, n) {
  const last = ((hass.states[BOOST] || {}).attributes || {}).last;
  return last && last.n === n ? last : null;
}
function roomEntities(hass, config) {
  const list = config.entities && config.entities.length ? config.entities
    : Object.keys(hass.states).filter((e) => e.startsWith(ROOM_PREFIX)).sort((a, b) =>  // Reihenfolge wie in HeatPilot
      (hass.states[a].attributes.order ?? 99) - (hass.states[b].attributes.order ?? 99)
      || String(hass.states[a].attributes.room || a).localeCompare(String(hass.states[b].attributes.room || b), "de"));
  return list.filter((e) => hass.states[e]);
}
// Raum aus dem HeatPilot-Sensor; Soll, Betriebsart und „heizt“ live vom Thermostat (der Sensor zieht nur alle 30 s nach)
function roomOf(hass, e) {
  const s = hass.states[e], a = s.attributes || {}, c = hass.states[a.climate];
  const t = Number(s.state), live = c ? { mode: c.state, target: c.attributes.temperature ?? a.target, action: c.attributes.hvac_action ?? a.action } : {};
  return { ...a, ...live, entity: e, temp: Number.isNaN(t) ? null : t, name: a.room || e };
}

class HPBase extends HTMLElement {
  setConfig(config) { this.config = config || {}; this._key = null; }
  set hass(hass) {
    this._hass = hass;
    const dark = !!(hass.themes && hass.themes.darkMode);
    if (dark !== this.hasAttribute("dark")) this.toggleAttribute("dark", dark);
    const key = this.renderKey(hass);
    if (key === this._key) return;  // nur neu zeichnen, wenn sich etwas Sichtbares geändert hat
    this._key = key;
    this.render();
  }
  get hass() { return this._hass; }
  // tag "div": ohne Kartenrahmen, direkt auf dem Hintergrund des Dashboards (Raumkacheln)
  root(css, tag = "ha-card") {
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    let el = this.shadowRoot.querySelector(".hp-root");
    if (!el || el.tagName.toLowerCase() !== tag) {
      this.shadowRoot.innerHTML = `<style>${BASE_CSS}${css}</style><${tag} class="hp-root"></${tag}>`;
      el = this.shadowRoot.querySelector(".hp-root");
    }
    return el;
  }
  canCommand() { return !!this._hass.states[COMMAND]; }
  // Befehl senden und das Ergebnis abwarten (bis 20 s); show(text, fehler) meldet den Stand
  async command(cmd, show = () => {}) {
    if (!this.canCommand()) { show("Bedienen nicht möglich – HeatPilot-Add-on ab 0.56 nötig.", true); return null; }
    show("Wird gesendet …", false);
    try {
      const n = await sendCommand(this._hass, cmd);
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 500));
        const res = commandResult(this._hass, n);
        if (res) { show(res.ok ? (res.text || "") : `Nicht gelungen: ${res.text || "unbekannter Fehler"}`, !res.ok); return res; }
      }
      show("Keine Antwort von HeatPilot – läuft das Add-on?", true);
    } catch (e) {
      show(`Nicht gesendet: ${e.message || e}`, true);
    }
    return null;
  }
  // Stand eines Befehls als Zustand der Karte – bleibt beim Neuzeichnen stehen
  report() { return (text, err) => { this._msg = { text, err }; this._key = null; this.render(); }; }
}

// ------------------------------------------------------------------ Räume
// Zustandszeile wie die Raumkachel der HeatPilot-Seite (roomState dort)
// 0.6.0 (Add-on ab 0.72): eigenes Climate je geführtem Raum – Text der Betriebsart und das Soll, nach dem die Kachel färbt
const ownText = (o) => o.mode === "aus" ? "Aus (Frostschutz)"
  : o.mode === "boost" ? `Boost ${fmt(o.sp)}° bis ${clock(new Date(o.until * 1000).toISOString())}` : `Manuell ${fmt(o.sp)}°`;
const ownLed = (r) => r.managing && r.managed && r.phase;
function tileSoll(r) {
  if (ownLed(r) && r.desired !== null && r.desired !== undefined) return (r.own || {}).mode === "aus" ? null : r.desired;
  return r.mode === "off" ? null : r.target;
}
function roomState(r) {
  const t = fmt(r.target) + "°";
  if (r.ems) return `Nur Anzeige · ${t}`;
  if (r.managing && r.managed && r.own) return ownText(r.own);  // eigenes Climate (0.6.0)
  if (r.boost) return `Boost · ${t} · ${hm(r.boost.left_min || 0).replace(" h", "")} bis ${clock(r.boost.until)}`;
  if (r.managing && r.managed && r.phase) {  // Ventilräume wie die übrigen (0.6.1)
    const until = r.manual_until ? ` bis ${clock(r.manual_until)}` : "", valve = r.lead === "ventil";
    if (r.mode === "off" && !valve) return "Aus" + until;
    if (r.manual && !valve) return `Manuell · ${t}${until}`;
    const d = fmt(r.desired) + "°";
    let s = r.paused ? `Pause · ${t}` : r.phase === "vorheizen" ? `Vorheizen → ${d}` : `HeatPilot · ${PHASE[r.phase] || r.phase} ${d}`;
    if (r.reach_c !== null && r.reach_c !== undefined && r.desired !== null && r.reach_c < r.desired - 0.2) s += ` · erreicht ≈ ${fmt(r.reach_c)}°`;
    if (r.next_phase === "vorheizen" && r.next_change) s += ` · Vorheizen ab ${clock(r.next_change)}` + (r.preheat_flow ? ` (${fmt(r.preheat_flow, 0)} °C)` : "");
    return s;
  }
  if (r.mode === "off") return "Frostschutz";
  return r.mode === "heat" ? `Manuell · ${t}` : `Zeitplan · ${t}`;
}
// 21,5 → „21<small>,5 °C</small>“ (große Zahl, kleine Nachkommastelle)
function bigNumber(v, unit) {
  const s = fmt(v), i = s.indexOf(",");
  return i < 0 ? `${s}<small>${unit}</small>` : `${s.slice(0, i)}<small>${s.slice(i)}${unit}</small>`;
}

const ROOMS_CSS = `
.grid { display: grid; grid-template-columns: repeat(var(--ncols, 2), minmax(0, 1fr)); gap: 10px; }
@container (min-width: 560px) { .grid { grid-template-columns: repeat(var(--cols, 4), minmax(0, 1fr)); } }
.rtile { position: relative; display: flex; flex-direction: column; justify-content: space-between; aspect-ratio: 1 / 1; padding: 12px 14px;
  border-radius: 16px; border: 1px solid var(--hp-border); background: var(--ha-card-background, var(--card-background-color, transparent));
  cursor: pointer; user-select: none; text-align: left; color: var(--hp-text); min-width: 0; box-sizing: border-box; }
.rtile .top { display: flex; justify-content: space-between; align-items: flex-start; min-height: 30px; gap: 6px; }
.rtile .hum { display: inline-flex; align-items: center; gap: 3px; white-space: nowrap; font-size: 12px; font-weight: 600; padding: 3px 8px;
  border-radius: 10px; background: rgba(127,127,127,.16); color: var(--hp-text2); }
.rtile .pw { color: var(--hp-text2); opacity: .6; } .rtile .pw svg { width: 30px; height: 30px; }
.rtile .big { font-size: 40px; font-weight: 700; line-height: 1; letter-spacing: -1px; font-variant-numeric: tabular-nums; }
.rtile .big small { font-size: 16px; font-weight: 600; }
.rtile h3 { margin: 6px 0 0; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rtile .state { font-size: 12px; color: var(--hp-text2); margin-top: 2px; }
.rtile.soll { background: var(--t-bg); border-color: transparent; }  /* 0.6.0: Farbe nach Soll, nicht nach „heizt“ */
.rtile.soll .big { color: var(--t-fg); }
.rtile.off h3 { color: var(--hp-text2); }
.dlg { position: absolute; inset: 0; z-index: 2; display: flex; flex-direction: column; gap: 10px; padding: 14px; border-radius: 16px;
  background: var(--ha-card-background, var(--card-background-color, #fff)); border: 1px solid var(--hp-border); overflow: auto; }
.dlg h3 { margin: 0; font-size: 16px; display: flex; justify-content: space-between; align-items: center; }
.dlg .x { border: 0; background: none; font-size: 18px; cursor: pointer; color: var(--hp-text2); }
.dlg .step { display: flex; align-items: center; justify-content: space-between; border: 1px solid var(--hp-border); border-radius: 10px; }
.dlg .step button { width: 48px; font-size: 20px; padding: 8px 0; border: 0; background: transparent; cursor: pointer; color: var(--t-fg); }
.dlg .step span { font-size: 22px; font-weight: 600; color: var(--t-fg); font-variant-numeric: tabular-nums; }
.dlg .seg { display: flex; border: 1px solid var(--hp-border); border-radius: 10px; overflow: hidden; }
.dlg .seg button { flex: 1; padding: 8px 0; font-size: 13px; border: 0; border-right: 1px solid var(--hp-border); background: transparent; cursor: pointer; color: var(--hp-text); }
.dlg .seg button:last-child { border-right: 0; } .dlg .seg button.on { background: var(--hp-blue); color: #fff; }
.dlg .link { background: none; border: 0; padding: 0; color: var(--hp-text2); font-size: 12px; cursor: pointer; text-align: left; }
.hp-root { position: relative; }
.rtile .left { font-size: 12px; font-weight: 700; padding: 3px 9px; border-radius: 10px; background: var(--hp-heat-fg); color: #111; }
`;

class HeatPilotRoomsCard extends HPBase {
  static getConfigElement() { return document.createElement("heatpilot-rooms-card-editor"); }
  static getStubConfig() { return {}; }
  getCardSize() { return 4; }
  roomCount() { return this.config.entities && this.config.entities.length ? this.config.entities.length : this._hass ? roomEntities(this._hass, this.config).length : 4; }
  // Sections-Dashboard: ein Raum = halbe Breite (zwei Einzelkarten nebeneinander), mehrere = volle Breite
  getGridOptions() { return { columns: this.roomCount() === 1 ? 6 : 12, min_columns: 3, rows: "auto" }; }
  getLayoutOptions() { return { grid_columns: this.roomCount() === 1 ? 2 : 4, grid_rows: "auto" }; }
  renderKey(hass) {
    const es = roomEntities(hass, this.config || {});
    return JSON.stringify([es.map((e) => [hass.states[e].state, hass.states[e].attributes, hass.states[hass.states[e].attributes.climate]]),
      this._dlg, this._msg]);
  }
  // Anzeige wie im Reiter „Heizen“
  tile(r) {
    const soll = tileSoll(r), off = soll === null, c = tileColors(soll, off ? "off" : "heat");
    const hum = r.humidity !== null && r.humidity !== undefined ? `<span class="hum">${ICON.drop}${fmt(r.humidity, 0)} %</span>` : "<span></span>";
    const right = r.boost ? `<span class="left">noch ${leftText(r.boost.left_min || 0)}</span>` : off ? `<span class="pw">${ICON.off}</span>` : "";
    return `<div class="rtile soll${off ? " off" : ""}" style="--t-fg:${c.fg};--t-bg:${c.bg}" data-dlg="${esc(r.climate)}" role="button" tabindex="0">` +
      `<div class="top">${hum}${right}</div><div><div class="big">${bigNumber(r.temp, "°")}</div><h3>${esc(r.name)}</h3>` +
      `<div class="state">${esc(roomState(r))}</div></div></div>`;
  }
  render() {
    const card = this.root(ROOMS_CSS, this.config.card ? "ha-card" : "div"), hass = this._hass;
    const rooms = roomEntities(hass, this.config).map((e) => roomOf(hass, e)), k = rooms.length;
    if (!k) { card.innerHTML = `<p class="muted">Keine HeatPilot-Räume gefunden – HeatPilot-Add-on ab 0.56 nötig.</p>`; return; }
    const cols = this.config.columns || (k <= 4 ? k : k <= 6 ? 3 : 4);
    card.innerHTML = (this.config.title ? `<h2>${esc(this.config.title)}</h2>` : "") +
      `<div class="grid" style="--cols:${cols};--ncols:${this.config.columns || Math.min(k, 2)}">` +
      rooms.map((r) => this.tile(r)).join("") + "</div>" + this.dialog(rooms.find((r) => r.climate === this._dlg));
    // Antippen: HeatPilots eigenes Climate (0.6.0) – das Thermostat-Pop-up nur noch für die Einrichtung (Link im Dialog)
    const on = (sel, fn) => card.querySelectorAll(sel).forEach((el) => el.addEventListener("click", (ev) => { ev.stopPropagation(); fn(el); }));
    on("[data-dlg]", (el) => { this._dlg = el.dataset.dlg; this._msg = null; this._key = null; this.render(); });
    on("[data-x]", () => { this._dlg = null; this._key = null; this.render(); });
    on("[data-more]", (el) => this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: el.dataset.more }, bubbles: true, composed: true })));
    on("[data-cmd]", (el) => this.command(JSON.parse(el.dataset.cmd), this.report()));
  }
  // Ein Raum: Soll −/+, Zeitplan | Manuell | Aus, Boost – geht über den Befehl an HeatPilot (heat_actions)
  dialog(r) {
    if (!r) return "";
    const soll = tileSoll(r), off = soll === null, c = tileColors(soll, off ? "off" : "heat"), own = (r.own || {}).mode;
    const mode = ownLed(r) ? (!own ? "auto" : own === "aus" ? "off" : "heat") : r.mode;
    const cmd = (o) => esc(JSON.stringify({ room: r.climate, rooms: [r.climate], ...o }));
    const t = (d) => Math.min(Math.max((soll ?? 20) + d, 5), 25), m = this._msg || {};
    return `<div class="dlg" style="--t-fg:${c.fg}"><h3>${esc(r.name)}<button class="x" data-x aria-label="Schließen">✕</button></h3>` +
      `<div class="muted">${fmt(r.temp)} °C · ${esc(roomState(r))}</div>` +
      `<div class="step"><button data-cmd="${cmd({ a: "temp", temp: t(-0.5) })}"${off ? " disabled" : ""}>−</button>` +
      `<span>${off ? "Aus" : fmt(soll) + " °C"}</span><button data-cmd="${cmd({ a: "temp", temp: t(0.5) })}"${off ? " disabled" : ""}>+</button></div>` +
      `<div class="seg">${[["auto", "Zeitplan"], ["heat", "Manuell"], ["off", "Aus"]].map(([k, l]) =>
        `<button class="${mode === k ? "on" : ""}" data-cmd="${cmd({ a: "mode", mode: k })}">${l}</button>`).join("")}</div>` +
      `<div class="seg">${[30, 60, 120].map((min) => `<button data-cmd="${cmd({ a: "boost", temp: t(2), minutes: min })}">Boost ${leftText(min).replace(":00 h", " h")}</button>`).join("")}</div>` +
      `<button class="link" data-more="${esc(r.climate)}">Thermostat (Einrichtung) ›</button>` +
      `<div class="msg${m.err ? " err" : " muted"}">${esc(m.text || "")}</div></div>`;
  }
}

// ------------------------------------------------------------------ Boost
const BOOST_CSS = `
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { border: 1px solid var(--hp-border); border-radius: 999px; padding: 5px 11px; font-size: 13px; background: transparent; cursor: pointer; color: var(--hp-text); }
.chip.on { background: var(--hp-blue); color: #fff; border-color: transparent; }
.step { display: inline-flex; align-items: center; border: 1px solid var(--hp-border); border-radius: 10px; overflow: hidden; }
.step button { width: 40px; font-size: 18px; padding: 6px 0; border: 0; background: transparent; cursor: pointer; color: var(--tile-fg); }
.step span { padding: 0 14px; font-size: 20px; font-weight: 600; color: var(--tile-fg); font-variant-numeric: tabular-nums; }
.seg { display: flex; border: 1px solid var(--hp-border); border-radius: 10px; overflow: hidden; }
.seg button { flex: 1; padding: 7px 0; font-size: 13px; border: 0; border-right: 1px solid var(--hp-border); background: transparent; cursor: pointer; color: var(--hp-text); }
.seg button:last-child { border-right: 0; } .seg button.on { background: var(--hp-blue); color: #fff; }
.go { width: 100%; justify-content: center; margin-top: 12px; padding: 10px; font-size: 15px; }
.acts2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 8px; }
.acts2 .btn { justify-content: center; padding: 7px 4px; font-size: 13px; }
.run { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--hp-border); }
.run:last-of-type { border-bottom: 0; }
.bar { height: 4px; background: var(--hp-border); border-radius: 2px; margin-top: 4px; width: 160px; max-width: 100%; }
.bar i { display: block; height: 100%; background: var(--hp-heat-fg); border-radius: 2px; }
.row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; align-items: center; }
.link { background: none; border: 0; padding: 0; color: var(--hp-text2); font-size: 12px; cursor: pointer; margin-top: 10px; }
`;
const DURATIONS = [30, 60, 120, 180];

class HeatPilotControlCard extends HPBase {
  static getConfigElement() { return document.createElement("heatpilot-control-card-editor"); }
  static getStubConfig() { return {}; }
  getCardSize() { return 5; }
  setConfig(config) {
    super.setConfig(config);
    const b = store.get("hp-control", { temp: 22, minutes: 60, rooms: [] });
    this._b = { temp: b.temp ?? 22, minutes: b.minutes ?? 60, rooms: b.rooms || [] };
  }
  renderKey(hass) {
    const s = hass.states[BOOST];
    return JSON.stringify([s && s.state, s && s.attributes.rooms, roomEntities(hass, this.config || {}).length, this._b, this._more,
      Math.floor(Date.now() / 60000), !!hass.states[COMMAND], this._msg]);
  }
  render() {
    const card = this.root(BOOST_CSS, this.config.card ? "ha-card" : "div"), hass = this._hass, s = hass.states[BOOST];
    if (!s) { card.innerHTML = `<p class="muted">sensor.heatpilot_boost fehlt – HeatPilot-Add-on ab 0.56 nötig.</p>`; return; }
    const a = s.attributes || {}, running = a.rooms || [];
    const rooms = roomEntities(hass, this.config).map((e) => roomOf(hass, e)).filter((r) => !r.ems);
    const ids = rooms.map((r) => r.climate);
    this._b.rooms = this._b.rooms.filter((c) => ids.includes(c));
    let h = this.config.title ? `<h2>${esc(this.config.title)}</h2>` : "";
    for (const r of running) {
      const total = Math.max(r.left_min, 1), done = r.minutes ? Math.max(0, 1 - r.left_min / r.minutes) : 0.5;
      h += `<div class="run"><div><b>${esc(r.room)}</b> · ${fmt(r.temp)} °C<div class="muted">noch ${leftText(total)} · bis ${clock(r.until)}</div>` +
        `<div class="bar"><i style="width:${Math.round(done * 100)}%"></i></div></div><button class="btn" data-stop="${esc(r.climate)}">Stopp</button></div>`;
    }
    if (running.length) {
      h += `<div class="row"><button class="btn" data-extend>+30 min</button><button class="btn" data-stopall>Alle stoppen</button></div>`;
      if (!this._more) h += `<button class="link" data-more>Weitere Räume bedienen ›</button>`;
    }
    if (!running.length || this._more) h += this.form(rooms, a);
    const m = this._msg || {};
    card.innerHTML = h + `<div class="msg${m.err ? " err" : " muted"}">${esc(m.text || "")}</div>`;
    this.wire(card, running, a);
  }
  form(rooms, a) {
    const b = this._b, c = tileColors(b.temp, "heat"), all = rooms.length && b.rooms.length === rooms.length;
    const end = new Date(Date.now() + b.minutes * 60000);
    return `<div class="lbl">Räume</div><div class="chips">` +
      rooms.map((r) => `<button class="chip${b.rooms.includes(r.climate) ? " on" : ""}" data-room="${esc(r.climate)}">${esc(r.name)}</button>`).join("") +
      `<button class="chip${all ? " on" : ""}" data-all>Alle</button></div>` +
      `<div class="lbl">Temperatur</div><div class="step" style="--tile-fg:${c.fg}"><button data-t="-0.5"${b.temp <= (a.temp_min ?? 5) ? " disabled" : ""}>−</button>` +
      `<span>${fmt(b.temp)} °C</span><button data-t="0.5"${b.temp >= (a.temp_max ?? 25) ? " disabled" : ""}>+</button></div>` +
      `<div class="lbl">Dauer (Boost)</div><div class="seg">${DURATIONS.map((m) => `<button data-m="${m}" class="${b.minutes === m ? "on" : ""}">${leftText(m).replace(":00 h", " h")}</button>`).join("")}</div>` +
      `<div class="muted" style="margin-top:6px">bis ${clock(end.toISOString())} · danach wieder Zeitplan</div>` +
      `<button class="btn primary go" data-go${b.rooms.length ? "" : " disabled"}>${ICON.boost}Boost starten</button>` +
      // ohne Zeitlimit für die gewählten Räume – wie Zeitplan und Ausschalten im Reiter „Heizen“ (Soll je Raum: Pop-up der Kachel)
      `<div class="acts2">` +
      `<button class="btn" data-sched${b.rooms.length ? "" : " disabled"}>${ICON.sched}Zeitplan</button>` +
      `<button class="btn" data-off${b.rooms.length ? "" : " disabled"}>${ICON.off}Aus</button></div>`;
  }
  save() { store.set("hp-control", this._b); this._key = null; this.render(); }
  wire(card, running, a) {
    const msg = () => this.report(), b = this._b;
    const on = (sel, fn) => card.querySelectorAll(sel).forEach((el) => el.addEventListener("click", () => fn(el)));
    on("[data-room]", (el) => { const c = el.dataset.room; b.rooms = b.rooms.includes(c) ? b.rooms.filter((x) => x !== c) : [...b.rooms, c]; this.save(); });
    on("[data-all]", () => {
      const ids = roomEntities(this._hass, this.config).map((e) => roomOf(this._hass, e)).filter((r) => !r.ems).map((r) => r.climate);
      b.rooms = b.rooms.length === ids.length ? [] : ids; this.save();
    });
    on("[data-t]", (el) => { b.temp = Math.min(Math.max(Math.round((b.temp + Number(el.dataset.t)) * 2) / 2, a.temp_min ?? 5), a.temp_max ?? 25); this.save(); });
    on("[data-m]", (el) => { b.minutes = Number(el.dataset.m); this.save(); });
    on("[data-more]", () => { this._more = true; this._key = null; this.render(); });
    on("[data-go]", async () => {
      const res = await this.command({ a: "boost", rooms: b.rooms, temp: b.temp, minutes: b.minutes }, msg());
      if (res && res.ok) { this._more = false; this._key = null; }
    });
    on("[data-sched]", () => this.command({ a: "schedule", rooms: b.rooms }, msg()));
    on("[data-off]", () => this.command({ a: "mode", rooms: b.rooms, mode: "off" }, msg()));
    on("[data-stop]", (el) => this.command({ a: "schedule", rooms: [el.dataset.stop] }, msg()));
    on("[data-stopall]", () => this.command({ a: "schedule", rooms: running.map((r) => r.climate) }, msg()));
    on("[data-extend]", async () => {  // je Temperatur ein Befehl: Rest + 30 min
      const by = {};
      for (const r of running) (by[`${r.temp}|${r.left_min + 30}`] = by[`${r.temp}|${r.left_min + 30}`] || []).push(r.climate);
      for (const [k, rooms] of Object.entries(by)) {
        const [temp, minutes] = k.split("|").map(Number);
        await this.command({ a: "boost", rooms, temp, minutes: Math.min(minutes, a.dur_max ?? 720) }, msg());
      }
    });
  }
}

// ------------------------------------------------------------------ Wetter
const WX_COND = { "clear-night": "Klar", cloudy: "Bewölkt", exceptional: "Unwetter", fog: "Nebel", hail: "Hagel",
  lightning: "Gewitter", "lightning-rainy": "Gewitter mit Regen", partlycloudy: "Teils bewölkt", pouring: "Starkregen",
  rainy: "Regen", snowy: "Schnee", "snowy-rainy": "Schneeregen", sunny: "Sonnig", windy: "Windig", "windy-variant": "Windig und bewölkt" };
const WIND_UNITS = { "m/s": 1, "km/h": 1 / 3.6, mph: 0.44704, kn: 0.514444, "ft/s": 0.3048 };
const toMs = (v, unit) => v === null || v === undefined || Number.isNaN(Number(v)) ? null : Math.round(Number(v) * (WIND_UNITS[unit] ?? 1 / 3.6) * 100) / 100;
const WX_DIR = ["N", "NO", "O", "SO", "S", "SW", "W", "NW"];
const WX_SVG = (d) => `<svg viewBox="0 0 48 48" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const WX_SUN = '<circle cx="18" cy="18" r="7" stroke="var(--hp-warn)"/><path stroke="var(--hp-warn)" d="M18 4v3M18 29v3M4 18h3M29 18h3M8 8l2 2M26 26l2 2M8 28l2-2M26 10l2-2"/>';
const WX_CLOUD = '<path stroke="#9aa0a6" fill="#e3e6ea" d="M14 38h22a8 8 0 0 0 0-16 11 11 0 0 0-21-2 9 9 0 0 0-1 18z"/>';
const WX_RAIN = '<path stroke="var(--hp-blue)" d="M18 42l-2 4M26 42l-2 4M34 42l-2 4"/>';
function wxIcon(c) {
  if (c === "sunny") return WX_SVG('<circle cx="24" cy="24" r="9" stroke="var(--hp-warn)"/><path stroke="var(--hp-warn)" d="M24 6v5M24 37v5M6 24h5M37 24h5M11 11l3.5 3.5M33.5 33.5L37 37M11 37l3.5-3.5M33.5 14.5L37 11"/>');
  if (c === "clear-night") return WX_SVG('<path stroke="var(--hp-purple)" d="M32 30a12 12 0 1 1-12-18 10 10 0 0 0 12 18z"/>');
  const pre = c === "partlycloudy" ? WX_SUN : "", wet = /rain|pouring/.test(c || "") ? WX_RAIN : "";
  const snow = /snow/.test(c || "") ? '<path stroke="var(--hp-blue)" d="M18 43h.1M26 45h.1M34 43h.1"/>' : "";
  const bolt = /lightning/.test(c || "") ? '<path stroke="var(--hp-warn)" d="M26 36l-4 6h5l-3 5"/>' : "";
  const fog = c === "fog" ? '<path stroke="var(--hp-grey)" d="M10 42h28M14 46h20"/>' : "";
  return WX_SVG(pre + WX_CLOUD + wet + snow + bolt + fog);
}
const WX_ROWS = [["temp", "Temperatur", "°C", "--hp-orange", null], ["rain", "Regen", "mm", "--hp-blue", "rain_prob"],
  ["cloud", "Wolken", "%", "--hp-grey", null], ["uv", "Sonne (UV)", "", "--hp-warn", null], ["wind", "Wind", "m/s", "--hp-purple", "gust"]];
const WX_CSS = `
.now { display: flex; align-items: center; gap: 12px; }
.icon svg { width: 56px; height: 56px; display: block; }
.tnow { font-size: 40px; font-weight: 600; line-height: 1; font-variant-numeric: tabular-nums; color: var(--hp-text); }
.tnow small { font-size: 18px; font-weight: 500; color: var(--hp-text2); }
.cond { display: flex; flex-direction: column; font-size: 14px; gap: 2px; color: var(--hp-text); }
.wchips { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0 4px; font-size: 12px; }
.wchip { background: var(--hp-chip); border: 1px solid var(--hp-border); border-radius: 999px; padding: 3px 9px; color: var(--hp-text); }
.arrow { display: inline-block; margin-right: 3px; }
.sub { margin: 12px 0 0; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: var(--hp-text2); }
.wrow { display: grid; grid-template-columns: 8.5em 1fr; gap: 8px; align-items: end; margin: 6px 0; }
.wk { display: flex; flex-direction: column; font-size: 12px; line-height: 1.25; color: var(--hp-text); }
.bars { display: grid; grid-template-columns: repeat(24, 1fr); gap: 2px; height: 38px; align-items: end; }
.col { position: relative; height: 100%; }
.col i { position: absolute; left: 0; right: 0; bottom: 0; border-radius: 2px 2px 0 0; background: var(--c); }
.col i.b { opacity: .22; } .col i.v { min-height: 1px; }
.axis .bars { height: auto; font-size: 11px; color: var(--hp-text2); align-items: start; }
.axis .bars span { white-space: nowrap; }
`;

class HeatPilotWeatherCard extends HPBase {
  static getConfigElement() { return document.createElement("heatpilot-weather-card-editor"); }
  static getStubConfig(hass) { return { entity: Object.keys(hass.states).find((e) => e.startsWith("weather.")) || "" }; }
  getCardSize() { return 6; }
  setConfig(config) {
    if (!config || !config.entity || !String(config.entity).startsWith("weather.")) throw new Error("entity: weather.… angeben");
    super.setConfig(config);
  }
  connectedCallback() { this.subscribe(); }
  disconnectedCallback() { if (this._unsub) { this._unsub.then((u) => u && u()).catch(() => {}); this._unsub = null; } }
  // stündliche Vorhersage abonnieren (Home Assistant schickt neue Werte selbst)
  subscribe() {
    if (this._unsub || !this._hass || !this.isConnected) return;
    this._unsub = this._hass.connection.subscribeMessage((m) => { this._fc = m.forecast || []; this._key = null; this.render(); },
      { type: "weather/subscribe_forecast", forecast_type: "hourly", entity_id: this.config.entity }).catch(() => null);
  }
  renderKey(hass) {
    this.subscribe();
    const s = hass.states[this.config.entity];
    return JSON.stringify([s && s.state, s && s.attributes, (this._fc || []).length]);
  }
  hours() {
    const a = (this._hass.states[this.config.entity] || {}).attributes || {}, unit = a.wind_speed_unit, now = Date.now();
    return (this._fc || []).filter((f) => { const t = Date.parse(f.datetime); return t > now - 3600000 && t < now + 86400000; }).slice(0, 24)
      .map((f) => ({ t: f.datetime, temp: f.temperature, cloud: f.cloud_coverage, rain: f.precipitation, rain_prob: f.precipitation_probability,
        wind: toMs(f.wind_speed, unit), gust: toMs(f.wind_gust_speed, unit), uv: f.uv_index }));
  }
  row(hs, [k, name, unit, color, back], rainUnit) {
    const vals = hs.map((h) => h[k]), ok = vals.filter((v) => v !== null && v !== undefined);
    if (!ok.length) return "";
    const backs = back ? hs.map((h) => h[back]) : [], bok = backs.filter((v) => v !== null && v !== undefined);
    const lo = k === "temp" ? Math.floor(Math.min(...ok)) - 1 : 0;
    const hi = k === "cloud" ? 100 : k === "rain" ? Math.max(...ok, 1) : Math.max(...ok, ...bok, lo + 1);
    const u = k === "rain" ? rainUnit : unit, pct = (v) => Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));
    const bars = hs.map((h, i) => {
      const v = vals[i], b = backs[i];
      const tip = `${clock(h.t)} · ${v == null ? "–" : fmt(v, k === "rain" ? 1 : 0) + (u ? " " + u : "")}` +
        (back === "rain_prob" && b != null ? ` · ${fmt(b, 0)} %` : back === "gust" && b != null ? ` · Böen ${fmt(b, 0)} m/s` : "");
      return `<span class="col" title="${esc(tip)}">${b == null ? "" : `<i class="b" style="height:${back === "rain_prob" ? b : pct(b)}%"></i>`}` +
        `${v == null ? "" : `<i class="v" style="height:${pct(v)}%"></i>`}</span>`;
    }).join("");
    const span = ["cloud", "rain", "uv"].includes(k) ? `bis ${fmt(Math.max(...ok), k === "rain" ? 1 : 0)}` : `${fmt(Math.min(...ok), 0)} bis ${fmt(Math.max(...ok), 0)}`;
    const gust = back === "gust" && bok.length ? ` · Böen ${fmt(Math.max(...bok), 0)}` : "";
    return `<div class="wrow" style="--c:var(${color})"><span class="wk"><b>${name}</b><span class="muted">${span}${u ? " " + u : ""}${gust}</span></span><span class="bars">${bars}</span></div>`;
  }
  render() {
    const card = this.root(WX_CSS, this.config.card ? "ha-card" : "div"), s = this._hass.states[this.config.entity];
    if (!s) { card.innerHTML = `<p class="muted">${esc(this.config.entity)} nicht gefunden.</p>`; return; }
    const a = s.attributes || {}, hs = this.hours(), t = hs.map((h) => h.temp).filter((v) => v != null);
    const wind = toMs(a.wind_speed, a.wind_speed_unit), gust = toMs(a.wind_gust_speed, a.wind_speed_unit), brg = a.wind_bearing;
    const chip = (k, v) => v ? `<span class="wchip"><span class="muted">${k}</span> ${v}</span>` : "";
    let h = `${this.config.title ? `<h2>${esc(this.config.title)}</h2>` : ""}<div class="now"><span class="icon">${wxIcon(s.state)}</span>` +
      `<span class="tnow">${fmt(a.temperature)}<small> ${esc(a.temperature_unit || "°C")}</small></span>` +
      `<span class="cond"><b>${esc(WX_COND[s.state] || s.state)}</b><span class="muted">${a.apparent_temperature != null ? `gefühlt ${fmt(a.apparent_temperature, 0)} °C` : ""}` +
      `${t.length ? `${a.apparent_temperature != null ? " · " : ""}24 h ${fmt(Math.min(...t), 0)} bis ${fmt(Math.max(...t), 0)} °C` : ""}</span></span></div>` +
      `<div class="wchips">` +
      chip("Wind", wind != null ? `${typeof brg === "number" ? `<span class="arrow" style="transform:rotate(${brg + 180}deg)">↑</span>` : ""}${fmt(wind, 0)} m/s` +
        `${typeof brg === "number" ? ` aus ${WX_DIR[Math.round(brg / 45) % 8]}` : ""}${gust != null ? ` · Böen ${fmt(gust, 0)}` : ""}` : "") +
      chip("Feuchte", a.humidity != null ? `${fmt(a.humidity, 0)} %` : "") +
      chip("Druck", a.pressure != null ? `${fmt(a.pressure, 0)} ${esc(a.pressure_unit || "hPa")}` : "") +
      chip("UV", a.uv_index != null ? fmt(a.uv_index, 0) : "") + chip("Wolken", a.cloud_coverage != null ? `${fmt(a.cloud_coverage, 0)} %` : "") + "</div>";
    if (hs.length > 1) {
      const axis = hs.map((x, i) => `<span>${i % 3 ? "" : clock(x.t).slice(0, 2)}</span>`).join("");
      h += `<p class="sub">Nächste 24 Stunden</p>` + WX_ROWS.map((r) => this.row(hs, r, a.precipitation_unit || "mm")).join("") +
        `<div class="wrow axis"><span class="wk"></span><span class="bars">${axis}</span></div>`;
    }
    card.innerHTML = h;
  }
}

// ------------------------------------------------------------------ Editoren (visueller Karten-Editor)
// ha-form von Home Assistant mit einem Schema je Karte; leere Felder fallen aus der Konfiguration
// ------------------------------------------------------------------ Nur jetzt (Override)
// Vier Knöpfe für Ausnahmen (nachts zur Arbeit, samstags früh raus, spät heim, früh ins Bett): gilt bis zum nächsten
// Schaltpunkt bzw. bis HeatPilot erkennt, dass die Lage vorbei ist; der aktive Knopf beendet es. „Tag“ (0.5.0, Add-on
// ab 0.71) beendet die Nacht. Stand aus sensor.heatpilot_modus.
const MODES = [["nacht", "Nacht", "M12 3a7 7 0 1 0 9 9 9 9 0 1 1-9-9z"],
  ["tag", "Tag", "M12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"],
  ["anwesend", "Anwesend", "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"],
  ["abwesend", "Abwesend", "M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"]];
const MODE_CSS = `
.hp-root { container-type: inline-size; }
.modes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
@container (min-width: 520px) { .modes { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
.mode { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; padding: 12px 14px; border-radius: 16px;
  border: 1px solid var(--hp-border); background: var(--ha-card-background, var(--card-background-color, transparent)); cursor: pointer; text-align: left; }
.mode svg { width: 24px; height: 24px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.mode b { font-size: 14px; } .mode.on { background: var(--hp-blue); border-color: transparent; color: #fff; }
.mode.on .muted { color: rgba(255,255,255,.85); }
`;
class HeatPilotModeCard extends HPBase {
  static getConfigElement() { return document.createElement("heatpilot-mode-card-editor"); }
  static getStubConfig() { return {}; }
  getCardSize() { return 2; }
  renderKey(hass) { const s = hass.states[MODE]; return JSON.stringify([s && s.state, s && s.attributes.until, this._msg]); }
  render() {
    const card = this.root(MODE_CSS, this.config.card ? "ha-card" : "div"), s = this._hass.states[MODE];
    if (!s) { card.innerHTML = `<p class="muted">sensor.heatpilot_modus fehlt – HeatPilot-Add-on ab 0.62 nötig.</p>`; return; }
    const cur = s.state, until = s.attributes.until, m = this._msg || {};
    card.innerHTML = (this.config.title ? `<h2>${esc(this.config.title)}</h2>` : "") + `<div class="modes">` +
      MODES.map(([k, t, d]) => `<button class="mode${cur === k ? " on" : ""}" data-mode="${k}"><svg viewBox="0 0 24 24"><path d="${d}"/></svg>` +
        `<b>${t}</b><span class="muted">${cur === k ? `bis ${clock(until)} · tippen beendet` : "nur jetzt"}</span></button>`).join("") +
      `</div><div class="msg${m.err ? " err" : " muted"}">${esc(m.text || "")}</div>`;
    card.querySelectorAll("[data-mode]").forEach((el) => el.addEventListener("click", () =>
      this.command({ a: "override", mode: el.dataset.mode === cur ? "aus" : el.dataset.mode }, this.report())));
  }
}

class HPEditor extends HTMLElement {
  setConfig(config) { this._config = { ...config }; this.render(); }
  set hass(hass) { this._hass = hass; this.render(); }
  render() {
    if (!this._hass || !this._config) return;
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.computeLabel = (f) => f.label || f.name;
      this._form.computeHelper = (f) => f.helper;
      this._form.addEventListener("value-changed", (e) => {
        const config = { ...e.detail.value };
        for (const [k, v] of Object.entries(config)) if (v === "" || v === undefined || v === null || (Array.isArray(v) && !v.length)) delete config[k];
        this._config = config;
        this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
      });
      this.appendChild(this._form);
    }
    this._form.hass = this._hass;
    this._form.data = this._config;
    this._form.schema = this.schema(this._hass);
  }
}
const roomSelector = (hass, helper) => ({ name: "entities", label: "Räume", helper,
  selector: { entity: { multiple: true, include_entities: Object.keys(hass.states).filter((e) => e.startsWith(ROOM_PREFIX)) } } });
const TITLE = { name: "title", label: "Titel", selector: { text: {} } };
class RoomsCardEditor extends HPEditor {
  schema(hass) {
    return [roomSelector(hass, "Leer = alle Räume von HeatPilot, in dessen Reihenfolge"), TITLE,
      { type: "grid", name: "", schema: [
        { name: "columns", label: "Spalten (breite Ansicht)", selector: { number: { min: 1, max: 6, mode: "box" } } },
        { name: "card", label: "Mit Kartenrahmen", selector: { boolean: {} } }] }];
  }
}
class ControlCardEditor extends HPEditor {
  schema(hass) { return [roomSelector(hass, "Räume zur Auswahl – leer = alle"), TITLE]; }
}
class ModeCardEditor extends HPEditor {
  schema() { return [TITLE, { name: "card", label: "Mit Kartenrahmen", selector: { boolean: {} } }]; }
}
class WeatherCardEditor extends HPEditor {
  schema() { return [{ name: "entity", label: "Wetter-Entität", required: true, selector: { entity: { domain: "weather" } } }, TITLE]; }
}
customElements.define("heatpilot-rooms-card-editor", RoomsCardEditor);
customElements.define("heatpilot-control-card-editor", ControlCardEditor);
customElements.define("heatpilot-weather-card-editor", WeatherCardEditor);
customElements.define("heatpilot-mode-card-editor", ModeCardEditor);
customElements.define("heatpilot-mode-card", HeatPilotModeCard);
customElements.define("heatpilot-rooms-card", HeatPilotRoomsCard);
customElements.define("heatpilot-control-card", HeatPilotControlCard);
customElements.define("heatpilot-weather-card", HeatPilotWeatherCard);
window.customCards = window.customCards || [];
window.customCards.push(
  { type: "heatpilot-rooms-card", name: "HeatPilot Räume", description: "Raumkacheln wie in HeatPilot – antippen öffnet das Thermostat" },
  { type: "heatpilot-control-card", name: "HeatPilot Steuerung", description: "Mehrere Räume: Boost, Zeitplan, Aus" },
  { type: "heatpilot-weather-card", name: "HeatPilot Wetter", description: "Wetter jetzt und 24 Stunden als Stundenbalken" },
  { type: "heatpilot-mode-card", name: "HeatPilot Nur jetzt", description: "Nacht, Anwesend, Abwesend – bis zum nächsten Schaltpunkt" },
);
console.info(`%c HeatPilot Card ${HP_VERSION} `, "background:#9a4e00;color:#fff;border-radius:4px");
