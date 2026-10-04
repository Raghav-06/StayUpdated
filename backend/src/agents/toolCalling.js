import { HumanMessage, ToolMessage } from "@langchain/core/messages";
import { getLLM } from "../config/llm.js";
import { getTextLength } from "../tools/textLength.js";

const tools = { [getTextLength.name]: getTextLength };

// toolcalling.py — one round of manual tool calling with bindTools
export async function runToolCalling(prompt) {
  const llmWithTools = getLLM().bindTools(Object.values(tools));

  const messages = [new HumanMessage(prompt)];

  const first = await llmWithTools.invoke(messages);
  messages.push(first);

  const toolResults = [];
  for (const call of first.tool_calls ?? []) {
    const output = await tools[call.name].invoke(call.args);
    toolResults.push({ name: call.name, args: call.args, output });
    messages.push(
      new ToolMessage({ content: String(output), tool_call_id: call.id, name: call.name })
    );
  }

  const final = await llmWithTools.invoke(messages);

  return { reply: final.content, toolCalls: toolResults };
}
