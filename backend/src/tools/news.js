import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getTavily } from "../config/tavily.js";

export const getNews = tool(
  async ({ city }) => {
    const response = await getTavily().search(`latest news in ${city}`, {
      searchDepth: "basic",
      maxResults: 3,
    });

    const results = response.results ?? [];
    if (results.length === 0) return `No news found for ${city}`;

    const newsList = results.map((r) => {
      const title = r.title || "No title";
      const url = r.url || "";
      const snippet = r.content || "";
      return `- ${title}\n  🔗 ${url}\n  📝 ${snippet.slice(0, 100)}...`;
    });

    return `Latest news in ${city}:\n\n` + newsList.join("\n\n");
  },
  {
    name: "get_news",
    description: "Get latest news about a city",
    schema: z.object({ city: z.string().describe("Name of the city") }),
  }
);
