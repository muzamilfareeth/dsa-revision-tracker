// AI approach notes via Google Gemini (free tier, AI Studio API key).
// Server-side only: the key never reaches the browser.
// Model: gemini-2.5-flash (free tier). Returns strict JSON.

const MODEL = "gemini-3.8-flash";

function buildPrompt(title, language, code) {
  return `You are helping a student revise Data Structures and Algorithms.
The student solved the LeetCode problem "${title}" in ${language || "an unknown language"}.
Here is their accepted code:

\`\`\`
${code}
\`\`\`

Write a revision note FROM THIS CODE (do not invent a different solution):
- "explanation": 2-3 simple lines: the core idea of this approach.
- "steps": 4-7 short bullet steps of the algorithm as implemented.
- "complexity": time and space, like "Time O(n log n), Space O(n)", with a 3-6 word reason.
- "diagram": a Mermaid flowchart (flowchart TD) with 4-8 short nodes describing the logic. Use simple node text, no quotes or brackets inside node labels except the [] wrappers.

Respond with ONLY a JSON object with exactly these keys: explanation, steps (array of strings), complexity, diagram. No markdown fences, no extra text.`;
}

async function generateNote({ title, language, code }, apiKey) {
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set on the server");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(title, language, code) }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.3 }
    })
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini API HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned an empty response");
  let note;
  try { note = JSON.parse(text); }
  catch { throw new Error("Gemini did not return valid JSON"); }
  return {
    explanation: String(note.explanation || ""),
    steps: Array.isArray(note.steps) ? note.steps.map(String) : [],
    complexity: String(note.complexity || ""),
    diagram: String(note.diagram || "")
  };
}

module.exports = { generateNote };
