import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const getWeather = tool(
  async ({ city, country }) => {
    const apiKey = process.env.OPENWEATHER_API_KEY;
    if (!apiKey) return "Error: OPENWEATHER_API_KEY is not set";

    const q = country ? `${city},${country}` : city;
    const url =
      `https://api.openweathermap.org/data/2.5/weather` +
      `?q=${encodeURIComponent(q)}&appid=${apiKey}&units=metric`;

    const response = await fetch(url);
    const data = await response.json();

    if (String(data.cod) !== "200") {
      return `Error: ${data.message ?? "Could not fetch weather"}`;
    }

    const temp = data.main.temp;
    const desc = data.weather[0].description;

    return `Weather in ${city}: ${desc}, ${temp}°C`;
  },
  {
    name: "get_weather",
    description: "Get current weather of a city",
    schema: z.object({
      city: z.string().describe("Name of the city"),
      country: z
        .string()
        .regex(/^[A-Za-z]{2}$/)
        .optional()
        .describe("Optional ISO 3166 two-letter country code, e.g. 'IN' or 'US', to tell same-named cities apart"),
    }),
  }
);
