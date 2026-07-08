import requests

WMO_LABELS = {
    0: "ciel dégagé",
    1: "plutôt dégagé",
    2: "partiellement nuageux",
    3: "couvert",
    45: "brouillard",
    48: "brouillard givrant",
    51: "bruine légère",
    53: "bruine",
    55: "bruine forte",
    61: "pluie légère",
    63: "pluie",
    65: "pluie forte",
    71: "neige légère",
    73: "neige",
    75: "neige forte",
    80: "averses légères",
    81: "averses",
    82: "averses fortes",
    95: "orage",
    96: "orage avec grêle",
    99: "orage violent avec grêle",
}


def get_weather(ville: str, date_iso: str) -> dict:
    """Geocode `ville` (Open-Meteo geocoding, no API key) then fetch the daily
    forecast (Open-Meteo forecast, no API key) for `date_iso`'s date. Returns
    {disponible: False, message} if the city can't be found or the date is out
    of the ~16-day forecast range, instead of raising."""
    try:
        geo = requests.get(
            "https://geocoding-api.open-meteo.com/v1/search",
            params={"name": ville, "count": 1, "language": "fr"},
            timeout=10,
        )
        geo.raise_for_status()
        results = geo.json().get("results")
        if not results:
            return {"disponible": False, "message": f"Ville '{ville}' introuvable pour la météo."}

        lat, lon = results[0]["latitude"], results[0]["longitude"]
        date_str = date_iso[:10]

        forecast = requests.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": lat,
                "longitude": lon,
                "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode",
                "timezone": "auto",
                "start_date": date_str,
                "end_date": date_str,
            },
            timeout=10,
        )
        forecast.raise_for_status()
        daily = forecast.json().get("daily")
        if not daily or not daily.get("time"):
            return {
                "disponible": False,
                "message": "Prévision indisponible pour cette date (trop loin ou date passée).",
            }

        code = daily["weathercode"][0]
        return {
            "disponible": True,
            "temperature_max": daily["temperature_2m_max"][0],
            "temperature_min": daily["temperature_2m_min"][0],
            "precipitation_mm": daily["precipitation_sum"][0],
            "condition": WMO_LABELS.get(code, "conditions variables"),
        }
    except requests.RequestException as e:
        return {"disponible": False, "message": f"Service météo indisponible ({e})."}
