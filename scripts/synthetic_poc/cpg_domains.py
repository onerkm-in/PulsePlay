"""Realistic CPG / FMCG (LATAM) value domains for the synthetic POC reskin.

Turns the masked-pattern gibberish into believable consumer-goods supply-chain
data — real public geography + standard industry taxonomy (trade channels,
product categories, quality-reject reasons) + realistic KPI magnitudes.

SYNTHETIC + ILLUSTRATIVE. This is invented data styled after a CPG/FMCG company;
it uses NO real company's confidential figures and NO real brand trademarks.
"""

from __future__ import annotations

import hashlib

# (iso2, country_name, operating_unit, language)
COUNTRIES = [
    ("MX", "Mexico", "Mexico", "ES"),
    ("BR", "Brazil", "Brazil", "PT"),
    ("AR", "Argentina", "South Cone", "ES"),
    ("CL", "Chile", "South Cone", "ES"),
    ("UY", "Uruguay", "South Cone", "ES"),
    ("PY", "Paraguay", "South Cone", "ES"),
    ("BO", "Bolivia", "South Cone", "ES"),
    ("CO", "Colombia", "Andean", "ES"),
    ("PE", "Peru", "Andean", "ES"),
    ("EC", "Ecuador", "Andean", "ES"),
    ("VE", "Venezuela", "Andean", "ES"),
    ("GT", "Guatemala", "CARICAM", "ES"),
    ("HN", "Honduras", "CARICAM", "ES"),
    ("SV", "El Salvador", "CARICAM", "ES"),
    ("NI", "Nicaragua", "CARICAM", "ES"),
    ("CR", "Costa Rica", "CARICAM", "ES"),
    ("PA", "Panama", "CARICAM", "ES"),
    ("DO", "Dominican Republic", "Caribbean", "ES"),
    ("PR", "Puerto Rico", "Caribbean", "ES"),
    ("JM", "Jamaica", "Caribbean", "EN"),
]

# Approx country centroid lat/lon (public geographic facts).
COUNTRY_GEO = {
    "MX": (23.6, -102.5), "BR": (-14.2, -51.9), "AR": (-38.4, -63.6), "CL": (-35.7, -71.5),
    "UY": (-32.5, -55.8), "PY": (-23.4, -58.4), "BO": (-16.3, -63.6), "CO": (4.6, -74.3),
    "PE": (-9.2, -75.0), "EC": (-1.8, -78.2), "VE": (6.4, -66.6), "GT": (15.8, -90.2),
    "HN": (15.2, -86.2), "SV": (13.8, -88.9), "NI": (12.9, -85.2), "CR": (9.7, -83.8),
    "PA": (8.5, -80.8), "DO": (18.7, -70.2), "PR": (18.2, -66.6), "JM": (18.1, -77.3),
}

# Cities per country → drive coherent plant names / locations.
CITIES = {
    "MX": ["Guadalajara", "Monterrey", "Mexico City", "Puebla", "Toluca", "Queretaro", "Merida", "Tijuana"],
    "BR": ["Sao Paulo", "Curitiba", "Recife", "Salvador", "Manaus", "Sorocaba", "Belo Horizonte"],
    "AR": ["Buenos Aires", "Cordoba", "Rosario", "Mendoza", "Mar del Plata"],
    "CL": ["Santiago", "Valparaiso", "Concepcion"],
    "UY": ["Montevideo", "Salto"], "PY": ["Asuncion", "Ciudad del Este"],
    "BO": ["Santa Cruz", "La Paz"], "CO": ["Bogota", "Medellin", "Cali", "Barranquilla"],
    "PE": ["Lima", "Arequipa", "Trujillo"], "EC": ["Quito", "Guayaquil"],
    "VE": ["Caracas", "Valencia", "Maracaibo"], "GT": ["Guatemala City", "Escuintla"],
    "HN": ["Tegucigalpa", "San Pedro Sula"], "SV": ["San Salvador"], "NI": ["Managua"],
    "CR": ["San Jose", "Alajuela"], "PA": ["Panama City", "Colon"],
    "DO": ["Santo Domingo", "Santiago"], "PR": ["San Juan", "Ponce"], "JM": ["Kingston", "Montego Bay"],
}

FACILITY_TYPES = [("Plant", "Planta"), ("Distribution Center", "CEDIS"), ("Co-Manufacturer", "Co-Man")]

SALES_CHANNELS = [
    "Modern Trade", "Traditional Trade", "Wholesale", "Convenience", "E-Commerce",
    "Foodservice", "Discounters", "Cash & Carry", "Club Stores", "Vending", "On-Premise",
]

# Product categories for a beverages+snacks CPG portfolio (generic, no trademarks).
CATEGORIES = ["Carbonated Soft Drinks", "Juices & Nectars", "Bottled Water",
              "Salty Snacks", "Cookies & Crackers", "Sports Drinks", "Ready-to-Drink Tea"]

KPI_FAMILIES = ["Order Fill Rate", "OTIF", "Forecast Accuracy", "Manufacturing Fill Rate",
                "Quality Complaints", "GHG Emissions", "Net Sales", "COGS"]
PERIOD_TYPES = ["Monthly", "Weekly", "Quarterly"]
REJECT_REASONS = ["Packaging Defect", "Underweight", "Foreign Material", "Seal Failure",
                  "Labeling Error", "Off-Spec Flavor", "Short Shelf Life"]
MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
               "July", "August", "September", "October", "November", "December"]
QUARTER_NAMES = ["Q1", "Q2", "Q3", "Q4"]


def _h(*parts) -> int:
    return int(hashlib.sha256("|".join(str(p) for p in parts).encode()).hexdigest()[:12], 16)


def build_countries() -> list[dict]:
    """20 coherent country rows (id/text/ou/language/lat/lon coherent)."""
    rows = []
    for i, (iso2, name, ou, lang) in enumerate(COUNTRIES, start=1):
        lat, lon = COUNTRY_GEO[iso2]
        rows.append({
            "country_id": iso2, "country_text": name, "ou": ou, "language": lang,
            "latitude": lat, "longitude": lon, "id": i,
        })
    return rows


def build_sales_channels() -> list[dict]:
    """11 coherent channel rows."""
    rows = []
    for i, ch in enumerate(SALES_CHANNELS):
        cc = "".join(w[0] for w in ch.split())[:3].upper()  # e.g. Modern Trade -> MT
        rows.append({"sales_channel_text": ch, "country_channel": cc})
    return rows


def build_plants(n: int, country_ids: list[str]) -> list[dict]:
    """`n` coherent plant rows: city/name/region match the assigned country."""
    rows = []
    seq: dict[str, int] = {}
    for i in range(n):
        iso2 = country_ids[_h("plant-country", i) % len(country_ids)]
        cities = CITIES.get(iso2, ["Central"])
        city = cities[_h("plant-city", i) % len(cities)]
        long_t, short_t = FACILITY_TYPES[_h("plant-type", i) % len(FACILITY_TYPES)]
        seq[iso2] = seq.get(iso2, 0) + 1
        pid = f"{iso2}{seq[iso2]:02d}"
        rows.append({
            "plant_id": pid,
            "descr": f"{short_t} {city}",
            "location": f"{city}, {iso2}",
            "country_id": iso2,
            "region": city,
            "ou": next((c[2] for c in COUNTRIES if c[0] == iso2), "LATAM"),
            "loc_type": long_t,
            "lat": COUNTRY_GEO[iso2][0] + ((_h("plant-lat", i) % 400) - 200) / 100.0,
            "lon": COUNTRY_GEO[iso2][1] + ((_h("plant-lon", i) % 400) - 200) / 100.0,
            "pallet_cap": 500 + (_h("plant-pc", i) % 40000),
        })
    return rows


def pick(pool: list[str], *salt) -> str:
    return pool[_h(*salt) % len(pool)]
