/* HeatPilot Card – Karten für Home Assistant zum Add-on „EMS HeatPilot“ (ab Add-on 0.56).
 *
 * Drei Karten im Stil der HeatPilot-Seite, ohne card-mod und ohne Abhängigkeiten:
 *   custom:heatpilot-rooms-card    Raumkacheln wie im Reiter „Heizen“; Antippen klappt die Bedienung auf
 *   custom:heatpilot-boost-card    Boost ohne Pop-up: Räume, Temperatur, Dauer – laufende Boosts mit Stopp
 *   custom:heatpilot-weather-card  Wetter jetzt und die nächsten 24 Stunden als Stundenbalken
 *
 * Daten: sensor.heatpilot_raum_* und sensor.heatpilot_boost (setzt das Add-on), die Wetter-Entität.
 * Bedienen: JSON-Befehl in input_text.heatpilot_befehl – das Add-on führt ihn aus wie die Knöpfe im Reiter
 * „Heizen“, leert das Feld und meldet das Ergebnis in sensor.heatpilot_boost → last.
 */
const HP_VERSION = "0.1.0";
const COMMAND = "input_text.heatpilot_befehl";
const BOOST = "sensor.heatpilot_boost";
const ROOM_PREFIX = "sensor.heatpilot_raum_";
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
:host { --hp-heat-bg: #f8e1c2; --hp-heat-fg: #9a4e00; --hp-off-bg: rgba(127,127,127,.10); --hp-blue: #2a78d6;
  --hp-orange: #eb6834; --hp-purple: #8e5bd0; --hp-grey: #8a8984; --hp-warn: #c98500; --hp-chip: rgba(127,127,127,.10);
  --hp-text: var(--primary-text-color); --hp-text2: var(--secondary-text-color); --hp-border: var(--divider-color, rgba(127,127,127,.25)); }
:host([dark]) { --hp-heat-bg: #4a2d0c; --hp-heat-fg: #f5a729; --hp-off-bg: rgba(255,255,255,.04); --hp-blue: #3987e5; --hp-orange: #d95926; }
ha-card { padding: 14px 16px; container-type: inline-size; }
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
function roomOf(hass, e) {
  const s = hass.states[e], a = s.attributes || {};
  const t = Number(s.state);
  return { ...a, entity: e, temp: Number.isNaN(t) ? null : t, name: a.room || e };
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
  root(css) {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      this.shadowRoot.innerHTML = `<style>${BASE_CSS}${css}</style><ha-card></ha-card>`;
    }
    return this.shadowRoot.querySelector("ha-card");
  }
  canCommand() { return !!this._hass.states[COMMAND]; }
  // Befehl senden, Ergebnis abwarten (bis 20 s) und in .msg melden
  async command(cmd, msgEl) {
    if (!this.canCommand()) { if (msgEl) { msgEl.className = "msg err"; msgEl.textContent = "Bedienen nicht möglich – HeatPilot-Add-on ab 0.56 nötig."; } return; }
    if (msgEl) { msgEl.className = "msg muted"; msgEl.textContent = "Wird gesendet …"; }
    try {
      const n = await sendCommand(this._hass, cmd);
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 500));
        const res = commandResult(this._hass, n);
        if (res) {
          if (msgEl) { msgEl.className = res.ok ? "msg muted" : "msg err"; msgEl.textContent = res.ok ? (res.text || "") : `Nicht gelungen: ${res.text || "unbekannter Fehler"}`; }
          return res;
        }
      }
      if (msgEl) { msgEl.className = "msg err"; msgEl.textContent = "Keine Antwort von HeatPilot – läuft das Add-on?"; }
    } catch (e) {
      if (msgEl) { msgEl.className = "msg err"; msgEl.textContent = `Nicht gesendet: ${e.message || e}`; }
    }
    return null;
  }
}

// ------------------------------------------------------------------ Räume
const ROOMS_CSS = `
.grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
@container (min-width: 560px) { .grid { grid-template-columns: repeat(var(--cols, 4), minmax(0, 1fr)); } }
.rtile { position: relative; display: flex; flex-direction: column; justify-content: space-between; aspect-ratio: 1 / 1; padding: 12px 14px;
  border-radius: 16px; border: 1px solid var(--hp-border); background: var(--card-background-color, transparent); cursor: pointer;
  user-select: none; text-align: left; color: var(--hp-text); min-width: 0; }
.rtile.sel { outline: 2px solid var(--hp-blue); outline-offset: 1px; }
.rtile .top { display: flex; justify-content: space-between; align-items: flex-start; min-height: 30px; }
.rtile .hum { display: inline-flex; align-items: center; gap: 3px; white-space: nowrap; font-size: 12px; font-weight: 600; padding: 3px 8px;
  border-radius: 10px; background: rgba(127,127,127,.16); color: var(--hp-text2); }
.rtile .pw { color: var(--hp-text2); opacity: .6; } .rtile .pw svg { width: 30px; height: 30px; }
.rtile .big { font-size: 40px; font-weight: 700; line-height: 1; letter-spacing: -1px; font-variant-numeric: tabular-nums; }
.rtile .big small { font-size: 16px; font-weight: 600; }
.rtile h3 { margin: 6px 0 0; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rtile .state { font-size: 12px; color: var(--hp-text2); margin-top: 2px; }
.rtile.heating { background: var(--hp-heat-bg); border-color: transparent; color: var(--hp-heat-fg); }
.rtile.heating h3, .rtile.heating .state { color: var(--hp-heat-fg); }
.rtile.heating .hum { background: rgba(255,255,255,.16); color: var(--hp-heat-fg); }
.rtile.off { background: var(--hp-off-bg); color: var(--hp-text2); }
.rtile .left { font-size: 12px; font-weight: 700; padding: 3px 9px; border-radius: 10px; background: var(--hp-heat-fg); color: #111; }
.panel { margin-top: 12px; border: 1px solid var(--hp-border); border-radius: 14px; padding: 12px 14px; }
.ph { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.ph b { font-size: 16px; }
.setp { display: flex; align-items: center; justify-content: center; gap: 18px; margin: 12px 0; }
.setp .rnd { width: 44px; height: 44px; border-radius: 50%; border: 1px solid var(--tile-fg); background: var(--tile-bg); color: var(--tile-fg);
  font-size: 24px; line-height: 1; cursor: pointer; }
.setp .val { font-size: 40px; font-weight: 700; color: var(--tile-fg); font-variant-numeric: tabular-nums; min-width: 4.2ch; text-align: center; }
.setp .val small { font-size: 18px; font-weight: 600; }
.acts { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
`;

class HeatPilotRoomsCard extends HPBase {
  static getStubConfig() { return {}; }
  getCardSize() { return 4; }
  renderKey(hass) {
    const es = roomEntities(hass, this.config || {});
    return JSON.stringify([es.map((e) => [hass.states[e].state, hass.states[e].attributes]), !!hass.states[COMMAND], this._sel, this._sp]);
  }
  stateText(r) {
    const t = fmt(r.target) + "°";
    if (r.ems) return `Nur Anzeige · ${t}`;
    if (r.boost) return `Boost · ${t} · ${hm(r.boost.left_min || 0).replace(" h", "")} bis ${clock(r.boost.until)}`;
    if (r.managing && r.managed && r.lead === "ventil" && r.phase) {
      const pct = r.valve_want ?? r.valve;
      return `Ventil · ${PHASE[r.phase] || r.phase} ${fmt(r.desired)}°` + (pct !== null && pct !== undefined ? ` · ${fmt(pct, 0)} %` : "") + (r.valve_hold ? " · von Hand" : "");
    }
    if (r.managing && r.managed && r.phase) {
      const until = r.manual_until ? ` bis ${clock(r.manual_until)}` : "";
      if (r.mode === "off") return "Aus" + until;
      if (r.manual) return `Manuell · ${t}${until}`;
      const d = fmt(r.desired) + "°";
      let s = r.paused ? `Pause · ${t}` : r.phase === "vorheizen" ? `Vorheizen → ${d}` : `HeatPilot · ${PHASE[r.phase] || r.phase} ${d}`;
      if (r.reach_c !== null && r.reach_c !== undefined && r.desired !== null && r.reach_c < r.desired - 0.2) s += ` · erreicht ≈ ${fmt(r.reach_c)}°`;
      if (r.next_phase === "vorheizen" && r.next_change) s += ` · Vorheizen ab ${clock(r.next_change)}` + (r.preheat_flow ? ` (${fmt(r.preheat_flow, 0)} °C)` : "");
      return s;
    }
    if (r.mode === "off") return "Frostschutz";
    return r.mode === "heat" ? `Manuell · ${t}` : `Zeitplan · ${t}`;
  }
  tile(r) {
    const off = r.mode === "off", heating = !off && (r.action === "heating" || (r.valve || 0) > 0);
    const s = fmt(r.temp), i = s.indexOf(",");
    const big = i < 0 ? `${s}<small>°</small>` : `${s.slice(0, i)}<small>${s.slice(i)}°</small>`;
    const hum = r.humidity !== null && r.humidity !== undefined ? `<span class="hum">${ICON.drop}${fmt(r.humidity, 0)} %</span>` : "<span></span>";
    const right = r.boost ? `<span class="left">noch ${leftText(r.boost.left_min || 0)}</span>` : off ? `<span class="pw">${ICON.off}</span>` : "";
    return `<div class="rtile ${off ? "off" : heating ? "heating" : "idle"}${this._sel === r.entity ? " sel" : ""}" data-e="${esc(r.entity)}" role="button" tabindex="0">` +
      `<div class="top">${hum}${right}</div><div><div class="big">${big}</div><h3>${esc(r.name)}</h3><div class="state">${esc(this.stateText(r))}</div></div></div>`;
  }
  panel(r) {
    const lim = (this._hass.states[BOOST] || {}).attributes || {};
    const sp = this._sp ?? r.target, c = tileColors(r.mode === "off" ? null : sp, r.mode);
    if (r.ems) return `<div class="panel"><div class="ph"><b>${esc(r.name)}</b><span class="muted">Heizkreis von EMS-ESP – nur Anzeige</span></div></div>`;
    const v = fmt(sp), k = v.indexOf(",");
    const val = k < 0 ? `${v}<small> °C</small>` : `${v.slice(0, k)}<small>${v.slice(k)} °C</small>`;
    const b = store.get("hp-boost", { temp: 22, minutes: 60 });
    return `<div class="panel" style="--tile-fg:${c.fg};--tile-bg:${c.bg}"><div class="ph"><b>${esc(r.name)}</b><span class="muted">${esc(this.stateText(r))}</span></div>` +
      `<div class="setp"><button class="rnd" data-d="-0.5" aria-label="kälter"${sp <= (lim.temp_min ?? 5) ? " disabled" : ""}>−</button>` +
      `<span class="val">${val}</span><button class="rnd" data-d="0.5" aria-label="wärmer"${sp >= (lim.temp_max ?? 25) ? " disabled" : ""}>+</button></div>` +
      `<div class="acts"><button class="btn" data-a="schedule">${ICON.sched}Zeitplan</button>` +
      (r.mode === "off" ? "" : `<button class="btn" data-a="off">${ICON.off}Aus</button>`) +
      `<button class="btn" data-a="boost">${ICON.boost}Boost ${fmt(b.temp)} °C · ${leftText(b.minutes).replace(":00 h", " h")}</button></div>` +
      `<div class="msg" id="msg"></div></div>`;
  }
  render() {
    const card = this.root(ROOMS_CSS), hass = this._hass;
    const rooms = roomEntities(hass, this.config).map((e) => roomOf(hass, e)), k = rooms.length;
    if (!k) { card.innerHTML = `<p class="muted">Keine HeatPilot-Räume gefunden – HeatPilot-Add-on ab 0.56 nötig.</p>`; return; }
    const sel = rooms.find((r) => r.entity === this._sel);
    const msg = this.shadowRoot.getElementById("msg");
    const keepMsg = msg && msg.textContent ? [msg.className, msg.textContent] : null;
    card.innerHTML = (this.config.title ? `<h2>${esc(this.config.title)}</h2>` : "") +
      `<div class="grid" style="--cols:${this.config.columns || (k <= 4 ? k : k <= 6 ? 3 : 4)}">${rooms.map((r) => this.tile(r)).join("")}</div>` +
      (sel ? this.panel(sel) : "");
    if (keepMsg) { const m = this.shadowRoot.getElementById("msg"); if (m) { m.className = keepMsg[0]; m.textContent = keepMsg[1]; } }
    card.querySelectorAll(".rtile").forEach((el) => el.addEventListener("click", () => {
      this._sel = this._sel === el.dataset.e ? null : el.dataset.e;
      this._sp = null; this._key = null; this.render();
    }));
    if (!sel) return;
    card.querySelectorAll(".rnd").forEach((el) => el.addEventListener("click", () => this.step(sel, Number(el.dataset.d))));
    card.querySelectorAll("[data-a]").forEach((el) => el.addEventListener("click", () => this.act(sel, el.dataset.a)));
  }
  // −/+: erst nach 1,5 s Ruhe senden – mehrmaliges Tippen wird ein Befehl
  step(r, d) {
    const lim = (this._hass.states[BOOST] || {}).attributes || {};
    const base = this._sp ?? r.target ?? 20;
    this._sp = Math.min(Math.max(Math.round((base + d) * 2) / 2, lim.temp_min ?? 5), lim.temp_max ?? 25);
    this._key = null; this.render();
    clearTimeout(this._t);
    this._t = setTimeout(async () => {
      const temp = this._sp;
      await this.command({ a: "temp", room: r.climate, temp }, this.shadowRoot.getElementById("msg"));
      this._sp = null; this._key = null;
    }, 1500);
  }
  act(r, a) {
    const msg = this.shadowRoot.getElementById("msg");
    if (a === "schedule") return this.command({ a: "schedule", rooms: [r.climate] }, msg);
    if (a === "off") return this.command({ a: "mode", rooms: [r.climate], mode: "off" }, msg);
    const b = store.get("hp-boost", { temp: 22, minutes: 60 });
    return this.command({ a: "boost", rooms: [r.climate], temp: b.temp, minutes: b.minutes }, msg);
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
.run { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--hp-border); }
.run:last-of-type { border-bottom: 0; }
.bar { height: 4px; background: var(--hp-border); border-radius: 2px; margin-top: 4px; width: 160px; max-width: 100%; }
.bar i { display: block; height: 100%; background: var(--hp-heat-fg); border-radius: 2px; }
.row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; align-items: center; }
.link { background: none; border: 0; padding: 0; color: var(--hp-text2); font-size: 12px; cursor: pointer; margin-top: 10px; }
`;
const DURATIONS = [30, 60, 120, 180];

class HeatPilotBoostCard extends HPBase {
  static getStubConfig() { return {}; }
  getCardSize() { return 5; }
  setConfig(config) {
    super.setConfig(config);
    const b = store.get("hp-boost", { temp: 22, minutes: 60, rooms: [] });
    this._b = { temp: b.temp ?? 22, minutes: b.minutes ?? 60, rooms: b.rooms || [] };
  }
  renderKey(hass) {
    const s = hass.states[BOOST];
    return JSON.stringify([s && s.state, s && s.attributes.rooms, roomEntities(hass, this.config || {}).length, this._b, this._more,
      Math.floor(Date.now() / 60000), !!hass.states[COMMAND]]);
  }
  render() {
    const card = this.root(BOOST_CSS), hass = this._hass, s = hass.states[BOOST];
    if (!s) { card.innerHTML = `<h2>Boost</h2><p class="muted">sensor.heatpilot_boost fehlt – HeatPilot-Add-on ab 0.56 nötig.</p>`; return; }
    const a = s.attributes || {}, running = a.rooms || [];
    const rooms = roomEntities(hass, this.config).map((e) => roomOf(hass, e)).filter((r) => !r.ems);
    const ids = rooms.map((r) => r.climate);
    this._b.rooms = this._b.rooms.filter((c) => ids.includes(c));
    let h = `<h2>${esc(this.config.title || "Boost")}${running.length ? '<span class="pill">läuft</span>' : ""}</h2>`;
    for (const r of running) {
      const total = Math.max(r.left_min, 1), done = r.minutes ? Math.max(0, 1 - r.left_min / r.minutes) : 0.5;
      h += `<div class="run"><div><b>${esc(r.room)}</b> · ${fmt(r.temp)} °C<div class="muted">noch ${leftText(total)} · bis ${clock(r.until)}</div>` +
        `<div class="bar"><i style="width:${Math.round(done * 100)}%"></i></div></div><button class="btn" data-stop="${esc(r.climate)}">Stopp</button></div>`;
    }
    if (running.length) {
      h += `<div class="row"><button class="btn" data-extend>+30 min</button><button class="btn" data-stopall>Alle stoppen</button></div>`;
      if (!this._more) h += `<button class="link" data-more>Weitere Räume boosten ›</button>`;
    }
    if (!running.length || this._more) h += this.form(rooms, a);
    card.innerHTML = h + `<div class="msg" id="msg"></div>`;
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
      `<div class="lbl">Dauer</div><div class="seg">${DURATIONS.map((m) => `<button data-m="${m}" class="${b.minutes === m ? "on" : ""}">${leftText(m).replace(":00 h", " h")}</button>`).join("")}</div>` +
      `<div class="muted" style="margin-top:6px">bis ${clock(end.toISOString())} · danach wieder Zeitplan</div>` +
      `<button class="btn primary go" data-go${b.rooms.length ? "" : " disabled"}>${ICON.boost}Boost starten</button>`;
  }
  save() { store.set("hp-boost", this._b); this._key = null; this.render(); }
  wire(card, running, a) {
    const msg = () => this.shadowRoot.getElementById("msg"), b = this._b;
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
const WX_CLOUD = '<path stroke="var(--hp-grey)" fill="var(--card-background-color, #fff)" d="M14 38h22a8 8 0 0 0 0-16 11 11 0 0 0-21-2 9 9 0 0 0-1 18z"/>';
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
    const card = this.root(WX_CSS), s = this._hass.states[this.config.entity];
    if (!s) { card.innerHTML = `<p class="muted">${esc(this.config.entity)} nicht gefunden.</p>`; return; }
    const a = s.attributes || {}, hs = this.hours(), t = hs.map((h) => h.temp).filter((v) => v != null);
    const wind = toMs(a.wind_speed, a.wind_speed_unit), gust = toMs(a.wind_gust_speed, a.wind_speed_unit), brg = a.wind_bearing;
    const chip = (k, v) => v ? `<span class="wchip"><span class="muted">${k}</span> ${v}</span>` : "";
    let h = `<h2>${esc(this.config.title || "Wetter")}</h2><div class="now"><span class="icon">${wxIcon(s.state)}</span>` +
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

customElements.define("heatpilot-rooms-card", HeatPilotRoomsCard);
customElements.define("heatpilot-boost-card", HeatPilotBoostCard);
customElements.define("heatpilot-weather-card", HeatPilotWeatherCard);
window.customCards = window.customCards || [];
window.customCards.push(
  { type: "heatpilot-rooms-card", name: "HeatPilot Räume", description: "Raumkacheln wie in HeatPilot – antippen zum Bedienen" },
  { type: "heatpilot-boost-card", name: "HeatPilot Boost", description: "Boost ohne Pop-up: Räume, Temperatur, Dauer" },
  { type: "heatpilot-weather-card", name: "HeatPilot Wetter", description: "Wetter jetzt und 24 Stunden als Stundenbalken" },
);
console.info(`%c HeatPilot Card ${HP_VERSION} `, "background:#9a4e00;color:#fff;border-radius:4px");
