import { tavily } from "@tavily/core";

let client;

export function getTavily() {
  if (!client) {
    if (!process.env.TAVILY_API_KEY) {
      throw Object.assign(new Error("TAVILY_API_KEY is not set"), { status: 500 });
    }
    client = tavily({ apiKey: process.env.TAVILY_API_KEY });
  }
  return client;
}
