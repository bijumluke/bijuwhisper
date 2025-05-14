const axios = require("axios");
const fs = require("fs");
const path = require("path");
const multiparty = require("multiparty");

exports.handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: "Method Not Allowed"
    };
  }

  return new Promise((resolve, reject) => {
    const form = new multiparty.Form({ uploadDir: "/tmp" });

    form.parse(event, async (err, fields, files) => {
      if (err) {
        return resolve({
          statusCode: 500,
          body: JSON.stringify({ error: "Form parsing error: " + err.message })
        });
      }

      try {
        const audioPath = files.audio[0].path;
        const style = fields.style[0] || "general";
        const userPrompt = (fields.customPrompt?.[0] || "").substring(0, 500).replace(/[<>]/g, "");

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

        // Whisper transcription
        const whisperRes = await axios.post(
          "https://api.openai.com/v1/audio/transcriptions",
          fs.createReadStream(audioPath),
          {
            headers: {
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
              "Content-Type": "multipart/form-data"
            },
            params: {
              model: "whisper-1"
            }
          }
        );

        const whisperText = whisperRes.data.text;

        // GPT formatting
        const chatRes = await axios.post(
          "https://api.openai.com/v1/chat/completions",
          {
            model: "gpt-4o",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: whisperText }
            ]
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
              "Content-Type": "application/json"
            }
          }
        );

        const finalText = chatRes.data.choices[0].message.content;

        return resolve({
          statusCode: 200,
          body: JSON.stringify({ result: finalText })
        });
      } catch (error) {
        return resolve({
          statusCode: 500,
          body: JSON.stringify({ error: error.message || "Unknown error" })
        });
      }
    });
  });
};

