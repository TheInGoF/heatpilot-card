<img src="https://raw.githubusercontent.com/TheInGoF/heatpilot-card/main/logo.png" alt="HeatPilot" width="96" align="right">

# HeatPilot Card

Karten für Home Assistant zum Add-on **[EMS HeatPilot](https://github.com/TheInGoF/ems-heatpilot)** – im
Standard-Design von Home Assistant (ab 0.8: Kartenrahmen, Fläche, Schrift, Akzentfarbe und Rundung kommen vom Theme;
eigene Farben haben nur die Wetter-Grafik und die Raumkacheln nach Soll), ohne card-mod, ohne weitere Abhängigkeiten. Bedienen geht auch für Nicht-Admins und unterwegs in der App.

| Karte | Was sie zeigt |
|---|---|
| `custom:heatpilot-rooms-card` | Raumkacheln wie im Reiter „Heizen“ (Ist, Luftfeuchte, Zustand), Farbe nach dem Soll. Antippen öffnet HeatPilots eigenes Climate des Raums als Pop-up mittig über der Seite (ab 0.8.1; schließt mit ✕, Esc oder einem Tipp daneben): Soll −/+, **Zeitplan** (HeatPilots Plan) · **Manuell** · **Aus**, Boost – das Thermostat-Pop-up nur noch über „Thermostat (Einrichtung)“ (ab 0.6, Add-on ab 0.72) |
| `custom:heatpilot-control-card` | „HeatPilot Steuerung“ für mehrere Räume auf einmal – wie die Leiste im Reiter „Heizen“: Räume wählen, Temperatur, Boost mit Dauer („bis 18:44“), Zeitplan, Aus; laufende Boosts mit Restzeit, Stopp, +30 min |
| `custom:heatpilot-weather-card` | Wetter jetzt (Symbol, Temperatur, gefühlt, Wind mit Richtung und Böen, Feuchte, Druck, UV, Wolken) und die nächsten 24 Stunden als Stundenbalken |
| `custom:heatpilot-mode-card` | „Nur jetzt“ für Ausnahmen: **Nacht**, **Tag** (beendet die Nacht, Add-on ab 0.71), **Anwesend**, **Abwesend** für das ganze Haus – gilt bis zum nächsten Schaltpunkt oder bis HeatPilot erkennt, dass die Lage vorbei ist; der aktive Knopf beendet es (Add-on ab 0.62) |
| `custom:heatpilot-hints-card` | „HeatPilot Hinweise“: was gerade ansteht – **Lüften**, wenn ein Raum zu feucht ist (HeatPilot senkt ihn dann nachts und bei Abwesenheit nur 1 K ab), und die offenen Probleme. Nur Anzeige, keine Meldung aufs Handy; ohne Hinweis „Keine Hinweise“ oder ausgeblendet (`hide_empty: true`). Je Dashboard lassen sich Gruppen ausblenden – Lüften, Ventile, Kessel, Warmwasser, Thermostate, Sonstiges (`hide`, ab 0.7.1, Add-on ab 0.75.1) (ab 0.7, Add-on ab 0.75) |

## Voraussetzung

EMS HeatPilot **ab 0.75.3** (Card ab 0.8.2: Räume gehen als Nummer in den Befehl, Soll −/+ im Pop-up der Raumkachel). Das Add-on stellt `sensor.heatpilot_raum_*` und `sensor.heatpilot_boost` bereit und legt
den Helfer `input_text.heatpilot_befehl` an, über den die Karten bedienen. Die Wetter-Karte braucht nur eine
Wetter-Entität mit stündlicher Vorhersage.

## Installation über HACS

1. HACS → ⋮ → **Benutzerdefinierte Repositories** → `https://github.com/TheInGoF/heatpilot-card`, Typ **Dashboard**.
2. „HeatPilot Card“ suchen, herunterladen, Seite neu laden.
3. Dashboard bearbeiten → Karte hinzufügen → Reiter „Nach Karte“ → „HeatPilot“ suchen. Alle Karten haben einen
   visuellen Editor: Räume (leer = alle), Titel, Spalten bzw. die Wetter-Entität. Steuerung, Wetter und Hinweise
   sind je eine Karte mit dem Titel als Kartenkopf; Räume und „Nur jetzt“ sind ein Raster aus einzelnen Kacheln.

## Beispiele

```yaml
type: custom:heatpilot-rooms-card
# entities:            # optional – sonst alle sensor.heatpilot_raum_* in der Reihenfolge von HeatPilot
#   - sensor.heatpilot_raum_wohnzimmer   # nach dem Raumnamen in HeatPilot (Add-on ab 0.56.3)
# columns: 2           # optional – Spalten auf breiten Dashboards
# title: Räume         # optional
```

```yaml
type: custom:heatpilot-control-card
```

```yaml
type: custom:heatpilot-weather-card
entity: weather.wetter_lokal
```

```yaml
type: custom:heatpilot-mode-card   # Add-on ab 0.62, liest sensor.heatpilot_modus
```

```yaml
type: custom:heatpilot-hints-card  # Add-on ab 0.75, liest sensor.heatpilot_hinweise
# hide: [ventile, kessel]          # optional – Gruppen ausblenden (lueften, ventile, kessel, warmwasser, thermostate, sonstiges)
# hide_empty: true                 # optional – ausblenden, solange nichts ansteht
```

## So bedienen die Karten

Die Karten schreiben einen Befehl als JSON in `input_text.heatpilot_befehl`, z. B.
`{"a": "boost", "rooms": [0, 2], "temp": 22, "minutes": 120}` (Räume als Nummer, `order` des Raum-Sensors). HeatPilot führt ihn aus wie die
Knöpfe im Reiter „Heizen“, leert das Feld und meldet das Ergebnis in `sensor.heatpilot_boost` (Attribut `last`) –
die Karte zeigt Fehler direkt unter den Knöpfen. Mögliche Befehle: `boost`, `schedule`, `temp`, `mode`, `override` (`{"a": "override", "mode": "nacht"}`, `aus` beendet).

## Wer bedient was

| Was | Wo |
|---|---|
| Einen Raum ansehen und einstellen (Soll, Betriebsart, Verlauf) | Raumkachel antippen → Thermostat-Pop-up von Home Assistant |
| Mehrere Räume auf einmal: Boost, Zeitplan, Aus | HeatPilot Steuerung |
| Ausnahme für das ganze Haus: früh ins Bett, nachts los, spät heim | HeatPilot Nur jetzt |
| Pause, Einstellungen | HeatPilot-Seite (Admins) |
