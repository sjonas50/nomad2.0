# Offline Content Sources: Disaster-Preparedness / Off-Grid Knowledge Platform

**Last researched:** 2026-03-23

---

## 1. Offline Maps

### 1A. Protomaps (PMTiles Format) — Recommended for vector tiles

Protomaps produces a daily-built planet `.pmtiles` file from OpenStreetMap data. There are no pre-packaged state-level extracts; you use the CLI to cut your own regions from the planet file.

| Item | Details |
|------|---------|
| **Planet file URL pattern** | `https://build.protomaps.com/YYYYMMDD.pmtiles` (e.g. `https://build.protomaps.com/20260217.pmtiles`) |
| **Build index** | https://maps.protomaps.com/builds/ |
| **Planet file size** | ~107 GB (zoom 0–15, building-level detail) |
| **Format** | `.pmtiles` (single-file HTTP range-request tile archive) |
| **License** | ODbL (OpenStreetMap) |
| **Cost** | Free |
| **Regional extract method** | Use `pmtiles extract` CLI with a bounding box or GeoJSON polygon — works against the remote URL without downloading the full planet |
| **Gotcha** | Docs explicitly say "do not hotlink" — copy to your own S3/R2 bucket for production |

**CLI extract example (Mountain West bounding box):**
```bash
pmtiles extract https://build.protomaps.com/20260217.pmtiles mountain-west.pmtiles \
  --bbox=-120.0,36.0,-104.0,49.0
```

---

### 1B. Geofabrik (OSM PBF / Shapefile) — Recommended for raw OSM data

Daily-updated state and regional extracts. These are raw OSM data, not vector tiles — you need to render/convert them (e.g., with `tilemaker` or `planetiler`) to get MBTiles/PMTiles.

**US Regional Extracts:**

| Region | Filename | Size (PBF) | Download URL |
|--------|----------|-----------|--------------|
| US West (11 states) | `us-west-latest.osm.pbf` | 3.1 GB | https://download.geofabrik.de/north-america/us-west-latest.osm.pbf |
| Utah | `utah-latest.osm.pbf` | 153 MB | https://download.geofabrik.de/north-america/us/utah-latest.osm.pbf |
| Oregon | `oregon-latest.osm.pbf` | 235 MB | https://download.geofabrik.de/north-america/us/oregon-latest.osm.pbf |
| Washington | `washington-latest.osm.pbf` | 336 MB | https://download.geofabrik.de/north-america/us/washington-latest.osm.pbf |
| Idaho | `idaho-latest.osm.pbf` | 117 MB | https://download.geofabrik.de/north-america/us/idaho-latest.osm.pbf |
| Montana | `montana-latest.osm.pbf` | ~91 MB | https://download.geofabrik.de/north-america/us/montana-latest.osm.pbf |
| Colorado | `colorado-latest.osm.pbf` | 340 MB | https://download.geofabrik.de/north-america/us/colorado-latest.osm.pbf |
| Nevada | `nevada-latest.osm.pbf` | ~112 MB | https://download.geofabrik.de/north-america/us/nevada-latest.osm.pbf |

- Shapefile variants available at same URLs replacing `.osm.pbf` with `-free.shp.zip` (roughly 2x size)
- Updated daily; checksums provided
- Free, ODbL license
- State index: https://download.geofabrik.de/north-america/us.html

---

### 1C. BBBike Extracts — MBTiles/PMTiles direct downloads

BBBike offers an on-demand extraction service that can output **MBTiles and PMTiles directly** (no conversion needed). Pre-built city extracts exist for 200+ cities; custom regions can be requested.

| Item | Details |
|------|---------|
| **Extraction service** | https://extract.bbbike.org |
| **Pre-built city downloads** | https://download.bbbike.org/osm/bbbike/ |
| **Formats available** | OSM, PBF, MBTiles, PMTiles, Garmin, mapsforge, Shapefile, GeoJSON |
| **Max extract size** | 512 MB file / 24M km² area |
| **Cost** | Free |
| **Turnaround** | ~30–60 min for custom extracts (email notification) |
| **Gotcha** | City extracts are small (2–50 MB). For full state coverage, use Geofabrik + convert. |

---

## 2. Kiwix ZIM Files

Reader: https://kiwix.org — available for Linux, macOS, Windows, Android, iOS, and as a headless server (`kiwix-serve`).
Download base URL: `https://download.kiwix.org/zim/`

---

### 2A. General Knowledge / Reference

| Filename | Size | Description | URL |
|----------|------|-------------|-----|
| `wikipedia_en_all_mini_2026-03.zim` | 12 GB | Full English Wikipedia, no images | https://download.kiwix.org/zim/wikipedia/wikipedia_en_all_mini_2026-03.zim |
| `wikipedia_en_all_nopic_2025-12.zim` | 48 GB | Full English Wikipedia, no pictures, more complete | https://download.kiwix.org/zim/wikipedia/wikipedia_en_all_nopic_2025-12.zim |
| `wikipedia_en_all_maxi_2026-02.zim` | 115 GB | Full English Wikipedia with all images | https://download.kiwix.org/zim/wikipedia/wikipedia_en_all_maxi_2026-02.zim |
| `wikipedia_en_simple_all_maxi_2026-02.zim` | 3.2 GB | Simple English Wikipedia (with images) | https://download.kiwix.org/zim/wikipedia/wikipedia_en_simple_all_maxi_2026-02.zim |
| `wikipedia_en_simple_all_nopic_2026-02.zim` | 921 MB | Simple English Wikipedia, no images | https://download.kiwix.org/zim/wikipedia/wikipedia_en_simple_all_nopic_2026-02.zim |
| `wikibooks_en_all_maxi_2026-01.zim` | 5.1 GB | English Wikibooks — how-to books on dozens of topics | https://download.kiwix.org/zim/wikibooks/wikibooks_en_all_maxi_2026-01.zim |
| `wikibooks_en_all_nopic_2026-01.zim` | 2.9 GB | English Wikibooks, no images | https://download.kiwix.org/zim/wikibooks/wikibooks_en_all_nopic_2026-01.zim |
| `wikivoyage_en_all_maxi_2026-03.zim` | 1.0 GB | Travel guides for ~30K destinations | https://download.kiwix.org/zim/wikivoyage/wikivoyage_en_all_maxi_2026-03.zim |

---

### 2B. Emergency / Survival / Preparedness

| Filename | Size | Description | URL |
|----------|------|-------------|-----|
| `www.ready.gov_en_2024-12.zim` | 2.3 GB | Full ready.gov site — FEMA/DHS emergency preparedness | https://download.kiwix.org/zim/zimit/www.ready.gov_en_2024-12.zim |
| `zimgit-post-disaster_en_2024-05.zim` | 615 MB | Post-disaster guidance compendium | https://download.kiwix.org/zim/other/zimgit-post-disaster_en_2024-05.zim |
| `zimgit-medicine_en_2024-08.zim` | 67 MB | Curated medical reference for offline use | https://download.kiwix.org/zim/other/zimgit-medicine_en_2024-08.zim |
| `zimgit-water_en_2024-08.zim` | 20 MB | Water treatment and safety | https://download.kiwix.org/zim/other/zimgit-water_en_2024-08.zim |
| `zimgit-knots_en_2024-08.zim` | 27 MB | Knot-tying reference | https://download.kiwix.org/zim/other/zimgit-knots_en_2024-08.zim |
| `zimgit-food-preparation_en_2025-04.zim` | 93 MB | Food handling and preservation | https://download.kiwix.org/zim/other/zimgit-food-preparation_en_2025-04.zim |

---

### 2C. Medical Reference

| Filename | Size | Description | URL |
|----------|------|-------------|-----|
| `medlineplus.gov_en_all_2025-01.zim` | 1.8 GB | NLM MedlinePlus — consumer health encyclopedia | https://download.kiwix.org/zim/zimit/medlineplus.gov_en_all_2025-01.zim |
| `wwwnc.cdc.gov_en_all_2024-11.zim` | 170 MB | CDC Travelers' Health and disease reference | https://download.kiwix.org/zim/zimit/wwwnc.cdc.gov_en_all_2024-11.zim |
| `nhs.uk_en_medicines_2025-12.zim` | 16 MB | NHS drug reference (UK formulary, but useful) | https://download.kiwix.org/zim/zimit/nhs.uk_en_medicines_2025-12.zim |
| `medicalsciences.stackexchange.com_en_all_2026-02.zim` | 58 MB | Medical Q&A from Stack Exchange | https://download.kiwix.org/zim/stack_exchange/medicalsciences.stackexchange.com_en_all_2026-02.zim |
| `fas-military-medicine_en_2025-06.zim` | 78 MB | Federation of American Scientists military medicine | https://download.kiwix.org/zim/zimit/fas-military-medicine_en_2025-06.zim |

---

### 2D. Technical / Repair

| Filename | Size | Description | URL |
|----------|------|-------------|-----|
| `ifixit_en_all_2025-12.zim` | 3.3 GB | iFixit — repair guides for electronics, appliances, devices | https://download.kiwix.org/zim/ifixit/ifixit_en_all_2025-12.zim |
| `diy.stackexchange.com_en_all_2026-02.zim` | 1.9 GB | Home improvement Q&A (plumbing, electrical, carpentry) | https://download.kiwix.org/zim/stack_exchange/diy.stackexchange.com_en_all_2026-02.zim |
| `mechanics.stackexchange.com_en_all_2026-02.zim` | 323 MB | Vehicle repair and maintenance Q&A | https://download.kiwix.org/zim/stack_exchange/mechanics.stackexchange.com_en_all_2026-02.zim |

---

### 2E. Homesteading / Gardening / Food

| Filename | Size | Description | URL |
|----------|------|-------------|-----|
| `gardening.stackexchange.com_en_all_2026-02.zim` | 882 MB | Gardening and landscaping Q&A | https://download.kiwix.org/zim/stack_exchange/gardening.stackexchange.com_en_all_2026-02.zim |
| `cooking.stackexchange.com_en_all_2026-02.zim` | 226 MB | Cooking techniques and food science Q&A | https://download.kiwix.org/zim/stack_exchange/cooking.stackexchange.com_en_all_2026-02.zim |
| `outdoors.stackexchange.com_en_all_2026-02.zim` | 136 MB | Hiking, camping, foraging, backcountry Q&A | https://download.kiwix.org/zim/stack_exchange/outdoors.stackexchange.com_en_all_2026-02.zim |

---

### 2F. Military / Tactical

| Filename | Size | Description | URL |
|----------|------|-------------|-----|
| `armypubs_en_all_2024-12.zim` | 7.7 GB | Full Army Publishing Directorate — all publicly available FM, ATP, ADP docs | https://download.kiwix.org/zim/zimit/armypubs_en_all_2024-12.zim |
| `fas-military-medicine_en_2025-06.zim` | 78 MB | Military medicine reference | https://download.kiwix.org/zim/zimit/fas-military-medicine_en_2025-06.zim |

**Note on `survivorlibrary.com_en_all_2025-12.zim` (235 GB):** This file appears in the Kiwix zimit directory and contains the Survivor Library — a massive collection of 1800s–1900s industrial/technical knowledge (farming, engineering, medicine, mechanics). It is community-generated, not officially published by survivorlibrary.com, and PDF rendering in Kiwix has known issues. Treat as a bonus resource, not a primary dependency.

---

## 3. Standalone PDF Downloads (No Kiwix Required)

### 3A. Army Field Manuals (via Internet Archive — archive.org)

All freely downloadable. Direct PDF links below.

| Manual | Title | Direct PDF / Archive URL |
|--------|-------|--------------------------|
| FM 21-76 | US Army Survival Manual | https://dn790002.ca.archive.org/0/items/Fm21-76SurvivalManual/FM21-76_SurvivalManual.pdf |
| FM 21-76 (archive page) | Survival Manual (multiple editions) | https://archive.org/details/Fm21-76SurvivalManual |
| FM 4-25.11 | First Aid (the primary Army first aid manual) | https://archive.org/details/FM4-25.11 |
| FM 4-25.11 (alt) | US Army First Aid Manual | https://archive.org/details/UsArmyFirstAidManualFm4-25.11 |
| 2023–2024 collection | Newer FMs (FM 2-0, FM 3-98, FM 3-60, etc.) | https://archive.org/details/2023-2024-us-army-fm |
| General collection | Full military field manuals library | https://archive.org/details/military-field-manuals-and-guides |

Official current FMs (unclassified) are also on the Army Publishing Directorate: https://armypubs.army.mil/ProductMaps/PubForm/FM.aspx

---

### 3B. FEMA / Ready.gov PDFs

All free, hosted on ready.gov and fema.gov. No login required.

| Document | Size (est.) | URL |
|----------|-------------|-----|
| Are You Ready? Guide (comprehensive) | ~3 MB | https://www.ready.gov/sites/default/files/2021-11/are-you-ready-guide.pdf |
| Emergency Supply Checklist | ~500 KB | https://www.ready.gov/sites/default/files/2020-03/ready_emergency-supply-kit-checklist.pdf |
| Full Suite Hazard Info Sheets (17 hazards) | ~2 MB | https://www.ready.gov/sites/default/files/2025-02/fema_full-suite-hazard-info-sheets.pdf |
| Family Communication Plan | ~200 KB | https://www.ready.gov/sites/default/files/2025-06/family-communication-plan_fillable-card.pdf |
| Disaster Preparedness for Older Adults | ~2 MB | https://www.ready.gov/sites/default/files/2023-09/ready-gov_disaster-preparedness-guide-for-older-adults.pdf |
| Guide for Alerts and Warnings | ~1 MB | https://www.ready.gov/sites/default/files/2022-02/fema_guide-for-alerts-and-warnings_2021.pdf.pdf |
| FEMA Basic Preparedness (older guide) | ~5 MB | https://www.fema.gov/pdf/areyouready/basic_preparedness.pdf |
| All publications index | — | https://www.ready.gov/publications |

---

## 4. Recommended Content Bundle by Use Case

### Minimal Viable Offline Kit (~20 GB total)
- `wikipedia_en_simple_all_nopic_2026-02.zim` — 921 MB
- `wikibooks_en_all_nopic_2026-01.zim` — 2.9 GB
- `ifixit_en_all_2025-12.zim` — 3.3 GB
- `www.ready.gov_en_2024-12.zim` — 2.3 GB
- `medlineplus.gov_en_all_2025-01.zim` — 1.8 GB
- `zimgit-post-disaster_en_2024-05.zim` — 615 MB
- `zimgit-medicine_en_2024-08.zim` — 67 MB
- `zimgit-water_en_2024-08.zim` — 20 MB
- `diy.stackexchange.com_en_all_2026-02.zim` — 1.9 GB
- `gardening.stackexchange.com_en_all_2026-02.zim` — 882 MB
- `mechanics.stackexchange.com_en_all_2026-02.zim` — 323 MB
- `outdoors.stackexchange.com_en_all_2026-02.zim` — 136 MB
- Geofabrik state PBF extracts for target region: ~500 MB–3.1 GB

### Full Knowledge Vault (~170 GB)
Everything above plus:
- `wikipedia_en_all_nopic_2025-12.zim` — 48 GB
- `armypubs_en_all_2024-12.zim` — 7.7 GB
- `wwwnc.cdc.gov_en_all_2024-11.zim` — 170 MB
- `fas-military-medicine_en_2025-06.zim` — 78 MB
- `wikivoyage_en_all_maxi_2026-03.zim` — 1.0 GB
- `cooking.stackexchange.com_en_all_2026-02.zim` — 226 MB
- Protomaps planet PMTiles: ~107 GB

---

## 5. Tool Notes

### PMTiles Extraction Workflow
```bash
# Install
brew install protomaps/tap/pmtiles  # or download from github.com/protomaps/go-pmtiles

# Extract Utah from remote planet (no full download needed)
pmtiles extract https://build.protomaps.com/20260217.pmtiles utah.pmtiles \
  --bbox=-114.05,37.0,-109.04,42.0

# Extract Mountain West
pmtiles extract https://build.protomaps.com/20260217.pmtiles mountain-west.pmtiles \
  --bbox=-125.0,36.0,-102.0,49.0
```

### Converting Geofabrik PBF to PMTiles
Use `planetiler` (Java) or `tilemaker` (C++) to convert `.osm.pbf` to `.pmtiles` or `.mbtiles`.
- Planetiler: https://github.com/onthegomap/planetiler
- Tilemaker: https://github.com/systemed/tilemaker

### Kiwix Server (headless, for serving to devices on LAN)
```bash
docker run -v /data/zim:/data -p 8080:80 ghcr.io/kiwix/kiwix-serve:latest *.zim
```

---

## 6. Sources

- [Protomaps Basemap Downloads](https://docs.protomaps.com/basemaps/downloads)
- [Protomaps Daily Builds](https://maps.protomaps.com/builds/)
- [Geofabrik US Downloads](https://download.geofabrik.de/north-america/us.html)
- [Geofabrik US West](https://download.geofabrik.de/north-america/us-west.html)
- [Kiwix ZIM Index](https://download.kiwix.org/zim/)
- [Kiwix Wikipedia ZIMs](https://download.kiwix.org/zim/wikipedia/)
- [Kiwix iFixit ZIMs](https://download.kiwix.org/zim/ifixit/)
- [Kiwix Wikibooks ZIMs](https://download.kiwix.org/zim/wikibooks/)
- [Kiwix Wikivoyage ZIMs](https://download.kiwix.org/zim/wikivoyage/)
- [Kiwix Zimit ZIMs (ready.gov, CDC, armypubs)](https://download.kiwix.org/zim/zimit/)
- [Kiwix Other ZIMs (zimgit collection)](https://download.kiwix.org/zim/other/)
- [Kiwix Stack Exchange ZIMs](https://download.kiwix.org/zim/stack_exchange/)
- [Kiwix for Preppers Blog Post](https://hub.kiwix.org/weblog/2024/2/for-all-preppers-out-there/)
- [Ready.gov Free Publications](https://www.ready.gov/publications)
- [FEMA Basic Preparedness PDF](https://www.fema.gov/pdf/areyouready/basic_preparedness.pdf)
- [Army FM 21-76 Survival Manual (archive.org)](https://archive.org/details/Fm21-76SurvivalManual)
- [Army FM 4-25.11 First Aid (archive.org)](https://archive.org/details/FM4-25.11)
- [2023-2024 Army Field Manuals (archive.org)](https://archive.org/details/2023-2024-us-army-fm)
- [Army Publishing Directorate](https://armypubs.army.mil/ProductMaps/PubForm/FM.aspx)
- [BBBike Extract Service](https://extract.bbbike.org)
- [BBBike OSM Downloads](https://download.bbbike.org/osm/)
- [Survivor Library ZIM info](https://www.survivorlibrary.com/index.php/2024/12/13/2024-12-13zim-kiwix-download/)
