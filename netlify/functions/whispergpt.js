
const axios = require("axios");
const formidable = require("formidable");
const fs = require("fs");

exports.handler = async function (event, context) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  return new Promise((resolve, reject) => {
    const form = new formidable.IncomingForm({ multiples: false, uploadDir: "/tmp", keepExtensions: true });
    form.parse(event, async (err, fields, files) => {
      if (err) return reject({ statusCode: 500, body: JSON.stringify({ error: "Upload Error" }) });

      const audioPath = files.audio.filepath;
      const style = fields.style || "general";
      const userPrompt = (fields.customPrompt || "").substring(0, 500).replace(/[<>]/g, "");

      const stylePrompts = {
        general: "",
        medical: "Format the output using clinical documentation style.",
        legal: "Format the output in formal legal English.",
        prompt: "Format this as a prompt for a language model."
      };

      const systemPrompt = `
You are a transcription formatter. Interpret spoken punctuation:
- "period" → .
- "comma" → ,
- "quote ... end quote" → "..."
- "capital A" → A
- "new paragraph" → blank line
Context: "period period" → ".", "menstrual period period" → "menstrual period."
${stylePrompts[style]}
${userPrompt}
      `;

      try {
        const whisperRes = await axios.post("https://api.openai.com/v1/audio/transcriptions", fs.createReadStream(audioPath), {
          headers: {
            "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "multipart/form-data"
          },
          params: { model: "whisper-1" }
        });

        const chatRes = await axios.post("https://api.openai.com/v1/chat/completions", {
          model: "gpt-4o",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: whisperRes.data.text }
          ]
        }, {
          headers: {
            "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
          }
        });

        resolve({
          statusCode: 200,
          body: JSON.stringify({ result: chatRes.data.choices[0].message.content })
        });
      } catch (error) {
        resolve({
          statusCode: 500,
          body: JSON.stringify({ error: error.message })
        });
      }
    });
  });
};
