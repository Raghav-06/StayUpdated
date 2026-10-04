import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const getTextLength = tool(
  async ({ text }) => text.length,
  {
    name: "get_text_length",
    description: "Returns the number of character in a given text",
    schema: z.object({ text: z.string() }),
  }
);
