const axios = require("axios");
const fs = require("fs");
const path = require("path");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const contentType = event.headers["content-type"] || event.headers["Content-Type"];
    const boundary = contentType.split("boundary=")[1];
    const bodyBuffer = Buffer.from(event.body, "base64");

    const parts = bodyBuffer.toString().split(`--${boundary}`);
    let audioBuffer = null;
    let style = "general";
    let customPrompt = "";

    for (const part of parts) {
      if (part.includes('name="audio"') && part.includes("filename=")) {
        const splitIndex = part.indexOf("\r\n\r\n");
        const binary = part.substring(splitIndex + 4).trimEnd();
        audioBuffer = Buffer.from(binary, "binary");
      } else if (part.includes('name="style"')) {
        const value = part.split("\r\n\r\n")[1];
        if (value) style = value.trim();
      } else if (part.includes('name="customPrompt"')) {
        const value = part.split("\r\n\r\n")[1];
        if (value) customPrompt = value.trim().replace(/[<>]/g, "").substring(0, 500);
      }
    }

    if (!audioBuffer) {
      return { statusCode: 400, body: JSON.stringify({ error: "Audio file missing" }) };
    }

    const audioPath = path.join("/tmp", `audio_${Date.now()}.webm`);
    fs.writeFileSync(audioPath, audioBuffer);

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
${stylePrompts[style] || ""}
${customPrompt}
    `;

    // Whisper API
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

    // GPT API
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

    return {
      statusCode: 200,
      body: JSON.stringify({ result: finalText })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || "Unknown error" })
    };
  }
};

