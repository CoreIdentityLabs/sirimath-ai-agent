import { createTool } from "@voltagent/core";
import { z } from "zod";

const WMO_CODES: Record<number, string> = {
	0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
	45: "Foggy", 48: "Icy fog", 51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle",
	61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
	71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow",
	77: "Snow grains", 80: "Slight showers", 81: "Moderate showers", 82: "Violent showers",
	85: "Slight snow showers", 86: "Heavy snow showers",
	95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Thunderstorm with heavy hail",
};

export const weatherTool = createTool({
	name: "getWeather",
	description: "Get the current real-time weather for a city or location using open-meteo.com. No API key required.",
	parameters: z.object({
		location: z.string().describe("The city or location to get weather for"),
	}),
	execute: async ({ location }) => {
		// Step 1: Geocode city name → lat/lon
		const geoRes = await fetch(
			`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`,
			{ signal: AbortSignal.timeout(10_000) },
		);
		if (!geoRes.ok) throw new Error(`Geocoding failed: ${geoRes.status}`);
		const geoData = (await geoRes.json()) as { results?: { name: string; latitude: number; longitude: number; country: string }[] };
		const place = geoData.results?.[0];
		if (!place) return { error: `Could not find location: ${location}` };

		// Step 2: Fetch current weather
		const wxRes = await fetch(
			`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weathercode&wind_speed_unit=kmh`,
			{ signal: AbortSignal.timeout(10_000) },
		);
		if (!wxRes.ok) throw new Error(`Weather fetch failed: ${wxRes.status}`);
		const wxData = (await wxRes.json()) as {
			current: { temperature_2m: number; relative_humidity_2m: number; wind_speed_10m: number; weathercode: number };
		};
		const c = wxData.current;
		const condition = WMO_CODES[c.weathercode] ?? `Code ${c.weathercode}`;

		return {
			location: `${place.name}, ${place.country}`,
			temperature: `${c.temperature_2m}°C`,
			condition,
			humidity: `${c.relative_humidity_2m}%`,
			windSpeed: `${c.wind_speed_10m} km/h`,
			message: `Current weather in ${place.name}, ${place.country}: ${c.temperature_2m}°C, ${condition}, ${c.relative_humidity_2m}% humidity, wind ${c.wind_speed_10m} km/h.`,
		};
	},
});
