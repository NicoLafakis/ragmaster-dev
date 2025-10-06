#!/usr/bin/env node
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});
const OpenAI = require("openai");

if (!process.env.OPENAI_API_KEY) {
  console.error("❌ Missing OPENAI_API_KEY in .env");
  process.exit(1);
}

const CHEAP_MODEL = process.env.CHEAP_MODEL || "gpt-5-nano-2025-08-07";

(async () => {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const sampleMd = `# Test File\n\nThis is a short test document for connectivity.\n\n## Section\nSome content here.`;
  const docId = "debug_cli_" + Date.now().toString(36);
  const prompt = `You are a converter. Return ONLY minified JSON with keys doc, content, chunks.\nInput markdown:\n${sampleMd}`;
  try {
    console.log("⏳ Sending request to model", CHEAP_MODEL);
    const r = await openai.chat.completions.create({
      model: CHEAP_MODEL,
      messages: [
        { role: "system", content: "Return ONLY JSON" },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.4,
    });
    const raw = r.choices[0].message.content;
    console.log("✅ Raw response (first 500 chars):");
    console.log(raw.slice(0, 500));
    try {
      const parsed = JSON.parse(raw);
      console.log("🔍 Parsed keys:", Object.keys(parsed));
    } catch (e) {
      console.error("⚠️ JSON parse failed:", e.message);
    }
    console.log("📊 Usage:", r.usage);
  } catch (e) {
    console.error("❌ Request failed:", e.message);
  }
})();
