<img src="https://raw.githubusercontent.com/TheInGoF/heatpilot-card/main/logo.png" alt="HeatPilot" width="96" align="right">

# HeatPilot Card

Karten für Home Assistant zum Add-on **[EMS HeatPilot](https://github.com/TheInGoF/ems-heatpilot)** – im Stil der
HeatPilot-Seite, ohne card-mod, ohne weitere Abhängigkeiten. Bedienen geht auch für Nicht-Admins und unterwegs in der App.

| Karte | Was sie zeigt |
|---|---|
| `custom:heatpilot-rooms-card` | Raumkacheln wie im Reiter „Heizen“ (Ist, Luftfeuchte, Zustand, Farben), direkt auf dem Hintergrund. Antippen öffnet das Thermostat-Pop-up von Home Assistant |
| `custom:heatpilot-control-card` | „HeatPilot Steuerung“ für mehrere Räume auf einmal – wie die Leiste im Reiter „Heizen“: Räume wählen, Temperatur, Boost mit Dauer („bis 18:44“), Zeitplan, Aus; laufende Boosts mit Restzeit, Stopp, +30 min |
| `custom:heatpilot-weather-card` | Wetter jetzt (Symbol, Temperatur, gefühlt, Wind mit Richtung und Böen, Feuchte, Druck, UV, Wolken) und die nächsten 24 Stunden als Stundenbalken |

## Voraussetzung

EMS HeatPilot **ab 0.56**. Das Add-on stellt `sensor.heatpilot_raum_*` und `sensor.heatpilot_boost` bereit und legt
den Helfer `input_text.heatpilot_befehl` an, über den die Karten bedienen. Die Wetter-Karte braucht nur eine
Wetter-Entität mit stündlicher Vorhersage.

## Installation über HACS

1. HACS → ⋮ → **Benutzerdefinierte Repositories** → `https://github.com/TheInGoF/heatpilot-card`, Typ **Dashboard**.
2. „HeatPilot Card“ suchen, herunterladen, Seite neu laden.
3. Dashboard bearbeiten → Karte hinzufügen → Reiter „Nach Karte“ → „HeatPilot“ suchen. Alle drei Karten haben einen
   visuellen Editor: Räume (leer = alle), Titel, Spalten bzw. die Wetter-Entität. Alle Karten stehen ohne
   Kartenrahmen direkt auf dem Hintergrund; `card: true` gibt ihnen den Rahmen zurück.

## Beispiele

```yaml
type: custom:heatpilot-rooms-card
# entities:            # optional – sonst alle sensor.heatpilot_raum_* in der Reihenfolge von HeatPilot
#   - sensor.heatpilot_raum_wohnzimmer   # nach dem Raumnamen in HeatPilot (Add-on ab 0.56.3)
# columns: 2           # optional – Spalten auf breiten Dashboards
# title: Räume         # optional
# card: true           # optional – Kacheln in einem Kartenrahmen statt direkt auf dem Hintergrund
```

```yaml
type: custom:heatpilot-control-card
```

```yaml
type: custom:heatpilot-weather-card
entity: weather.wetter_lokal
```

## So bedienen die Karten

Die Karten schreiben einen Befehl als JSON in `input_text.heatpilot_befehl`, z. B.
`{"a": "boost", "rooms": ["climate.wohnzimmer"], "temp": 22, "minutes": 120}`. HeatPilot führt ihn aus wie die
Knöpfe im Reiter „Heizen“, leert das Feld und meldet das Ergebnis in `sensor.heatpilot_boost` (Attribut `last`) –
die Karte zeigt Fehler direkt unter den Knöpfen. Mögliche Befehle: `boost`, `schedule`, `mode`.

## Wer bedient was

| Was | Wo |
|---|---|
| Einen Raum ansehen und einstellen (Soll, Betriebsart, Verlauf) | Raumkachel antippen → Thermostat-Pop-up von Home Assistant |
| Mehrere Räume auf einmal: Boost, Zeitplan, Aus | HeatPilot Steuerung |
| Pause, Einstellungen | HeatPilot-Seite (Admins) |
