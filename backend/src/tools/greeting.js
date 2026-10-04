import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const getGreeting = tool(
  async ({ name }) => `Hello ${name}, Welcome to the AI world`,
  {
    name: "get_greeting",
    description: "Generate a greeting message for a user",
    schema: z.object({ name: z.string() }),
  }
);
