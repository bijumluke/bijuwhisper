const axios = require("axios");
const formidable = require("formidable");
const { Buffer } = require("buffer");
const fs = require("fs");

exports.handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: "Method Not Allowed"
    };
  }

  return new Promise((resolve, reject) => {
  const form = new formidable.IncomingForm({
  multiples: false,
  uploadDir: "/tmp",
  keepExtensions: true
});


    // Netlify gives event.body as base64 string when it's multipart
    const contentType = event.headers["content-type"] || event.headers["Content-Type"];
    const bodyBuffer = Buffer.from(event.body, "base64");

    // Create a fake request and response object to use with formidable
    const req = new require("stream").Readable();
    req.push(bodyBuffer);
    req.push(null); // end the stream
    req.headers = { "content-type": contentType };

    form.parse(req, async (err, fields, files) => {
      if (err) {
        return resolve({
          statusCode: 500,
          body: JSON.stringify({ error: "Form parsing error: " + err.message })
        });
      }

      const audioPath = files.audio?.filepath;
      if (!audioPath) {
        return resolve({
          statusCode: 400,
          body: JSON.stringify({ error: "Audio file not found" })
        });
      }

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
        // Step 1: Whisper transcription
        const whisperRes = await axios.post(
          "https://api.openai.com/v1/audio/transcriptions",
          fs.createReadStream(audioPath),
          {
            headers: {
              "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
              "Content-Type": "multipart/form-data"
            },
            params: {
              model: "whisper-1"
            }
          }
        );

        const whisperText = whisperRes.data.text;

        // Step 2: GPT formatting
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
              "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
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
        const errorMsg = error?.response?.data?.error?.message || error.message || "Unknown error";
        return resolve({
          statusCode: 500,
          body: JSON.stringify({ error: errorMsg })
        });
      }
    });
  });
};

