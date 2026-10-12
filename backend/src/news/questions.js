// Follow-up questions about a saved search, answered only from that search's sources.
import { getLLM, toAIError } from "../config/llm.js";
import { query } from "../db/index.js";

const HISTORY_TURNS = 4;

const SYSTEM_PROMPT =
  "You answer follow-up questions about a news topic. Answer ONLY from the provided sources. " +
  "Cite the sources you use inline with their bracket numbers like [1] or [2][3]. " +
  "If the sources don't contain the answer, say so plainly instead of guessing, and don't use outside knowledge. " +
  "Keep answers short: a few sentences or a short bullet list.";

const LIMITED_NOTE =
  " Only short excerpts of the sources are available for this search, so mention that the answer may be limited.";

// Searches saved before full contexts were stored only have each source's short excerpt.
function excerptContext(sources) {
  return sources
    .map((s) => `[${s.id}] ${s.title}\nSource: ${s.source ?? "unknown"} | Published: ${s.publishedAt ?? "unknown"}\n${s.excerpt ?? ""}`)
    .join("\n\n");
}

function chunkText(chunk) {
  const c = chunk?.content;
  return typeof c === "string" ? c : Array.isArray(c) ? c.map((p) => p.text ?? "").join("") : "";
}

/**
 * Streams an answer to `question` about `search` (a news_searches row), calling onDelta(text)
 * per token, then saves the Q&A. Returns the saved row plus `limited` (answered from excerpts only).
 */
export async function answerQuestion({ search, userId, question, onDelta, signal }) {
  const limited = !search.context;
  const context = search.context || excerptContext(search.sources);

  const { rows: previous } = await query(
    `SELECT question, answer FROM search_questions
      WHERE search_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [search.id, HISTORY_TURNS]
  );

  const messages = [
    { role: "system", content: SYSTEM_PROMPT + (limited ? LIMITED_NOTE : "") },
    { role: "user", content: `Topic: ${search.topic}\n\nSources:\n\n${context}` },
    { role: "assistant", content: "I'll answer from these sources only." },
    ...previous.reverse().flatMap((qa) => [
      { role: "user", content: qa.question },
      { role: "assistant", content: qa.answer },
    ]),
    { role: "user", content: question },
  ];

  let answer = "";
  try {
    for await (const chunk of await getLLM({ temperature: 0.2, maxTokens: 500 }).stream(messages, { signal })) {
      const delta = chunkText(chunk);
      if (!delta) continue;
      answer += delta;
      onDelta(delta);
    }
  } catch (err) {
    if (signal?.aborted) throw err;
    throw toAIError(err, { assumeConnection: true });
  }
  signal?.throwIfAborted();

  const { rows } = await query(
    `INSERT INTO search_questions (search_id, user_id, question, answer)
     VALUES ($1, $2, $3, $4) RETURNING id, question, answer, created_at`,
    [search.id, userId, question, answer.trim()]
  );
  return { ...rows[0], limited };
}
