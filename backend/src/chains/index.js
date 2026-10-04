import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import {
  RunnableParallel,
  RunnablePassthrough,
  RunnableSequence,
} from "@langchain/core/runnables";
import { getLLM } from "../config/llm.js";

const parser = new StringOutputParser();

// sequencerunnable.py — prompt | model | parser
const explainPrompt = ChatPromptTemplate.fromTemplate("Explain {topic} in simple words");

export function explainTopic(topic) {
  return explainPrompt.pipe(getLLM()).pipe(parser).invoke({ topic });
}

// parallelrunnable.py — two chains run in parallel on different inputs
const shortPrompt = ChatPromptTemplate.fromTemplate("Explain {topic} in 1-2 lines");
const detailedPrompt = ChatPromptTemplate.fromTemplate("Explain {topic} in detail");

export function explainShortAndDetailed({ shortTopic, detailedTopic }) {
  const model = getLLM();
  const chain = RunnableParallel.from({
    short: RunnableSequence.from([(x) => x.short, shortPrompt, model, parser]),
    detailed: RunnableSequence.from([(x) => x.detailed, detailedPrompt, model, parser]),
  });

  return chain.invoke({
    short: { topic: shortTopic },
    detailed: { topic: detailedTopic },
  });
}

// runnablepassthrough.py — generate code, then return it alongside an explanation
const codePrompt = ChatPromptTemplate.fromMessages([
  ["system", "You are a code generator"],
  ["human", "{topic}"],
]);

const codeExplainPrompt = ChatPromptTemplate.fromMessages([
  ["system", "You are a helpful assistant who explains code in simple terms"],
  ["human", "Explain the following code in simple words:\n{code}"],
]);

export function generateAndExplainCode(topic) {
  const model = getLLM();
  const generate = RunnableSequence.from([codePrompt, model, parser]);
  const withExplanation = RunnableParallel.from({
    code: new RunnablePassthrough(),
    explanation: RunnableSequence.from([(code) => ({ code }), codeExplainPrompt, model, parser]),
  });

  return generate.pipe(withExplanation).invoke({ topic });
}
