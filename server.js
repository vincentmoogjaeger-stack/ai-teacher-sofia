import dotenv from "dotenv";
dotenv.config({ path: "./.env" });

import express from "express";
import multer from "multer";
import fs from "fs";
import ffmpeg from "fluent-ffmpeg";
import fetch from "node-fetch";
import OpenAI from "openai";

const app = express();
const port = process.env.PORT || 3000;

/* ===============================
   🔑 API KEYS
   =============================== */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

/* ===============================
   🔒 SECURITY CHECKS
   =============================== */

if (!OPENAI_API_KEY) throw new Error("❌ OPENAI_API_KEY manquante");

console.log("ENV CHECK START");
console.log("process.env.OPENAI_API_KEY =", process.env.OPENAI_API_KEY);
console.log("OPENAI_API_KEY =", OPENAI_API_KEY);
console.log("ENV CHECK END");

/* ===============================
   🤖 OPENAI
   =============================== */

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY
});

/* ===============================
   📁 FILE SETUP
   =============================== */

const upload = multer({ dest: "uploads/" });

app.use(express.static("public"));
app.use("/audio", express.static("audio"));

if (!fs.existsSync("audio")) fs.mkdirSync("audio");
if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");

/* ===============================
   🧠 MEMORY (LIMITED)
   =============================== */

let conversation = [
  {
    role: "system",
    content: `
Tu t'appelles Sofia.
Tu es une professeure de français bienveillante, motivante et calme.
Tu expliques simplement et tu encourages l’élève.
`
  }
];

const MAX_MEMORY = 20;

function trimMemory() {
  if (conversation.length > MAX_MEMORY) {
    conversation = [
      conversation[0],
      ...conversation.slice(-MAX_MEMORY)
    ];
  }
}

/* ===============================
   🔊 AUDIO CONVERSION
   =============================== */

function convertToWav(input, output) {
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .toFormat("wav")
      .on("end", resolve)
      .on("error", reject)
      .save(output);
  });
}

/* ===============================
   🧹 SAFE DELETE
   =============================== */

function safeDelete(path) {
  try {
    if (path && fs.existsSync(path)) {
      fs.unlinkSync(path);
    }
  } catch (e) {
    console.error("⚠️ safeDelete failed:", e.message);
  }
}

/* ===============================
   🎤 MAIN ROUTE
   =============================== */

app.post("/api/audio", upload.single("audio"), async (req, res) => {
  try {
    console.log("🎤 Audio reçu");

    /* 🔒 CHECK FILE */
    if (!req.file?.path) {
      return res.status(400).json({ error: "Audio manquant" });
    }

    const wavPath = `${req.file.path}.wav`;

    /* 🎧 CONVERT */
    await convertToWav(req.file.path, wavPath);

    /* 📝 TRANSCRIPTION */
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(wavPath),
      model: "whisper-1"
    });

    const userText = transcription?.text?.trim();

    if (!userText) {
      throw new Error("Transcription vide");
    }

    console.log("🧑 User:", userText);

    conversation.push({ role: "user", content: userText });

    /* 🤖 GPT */
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: conversation
    });

    const aiText = completion.choices?.[0]?.message?.content;

    if (!aiText) {
      throw new Error("Réponse GPT vide");
    }

    conversation.push({ role: "assistant", content: aiText });
    trimMemory();

    /* 🎓 INTERJECTIONS */
    const interjections = [
      "Très bien.",
      "Bonne question.",
      "Voyons ça ensemble.",
      "Parfait.",
      "Alors..."
    ];

    const interjection =
      Math.random() < 0.6
        ? interjections[Math.floor(Math.random() * interjections.length)] + " "
        : "";

    const aiTextForSpeech = (interjection + aiText)
      .replace(/\./g, "... ")
      .replace(/\?/g, " ? ")
      .replace(/\!/g, " ! ");

 /* 🔊 OPENAI TEXT TO SPEECH */

const speechResponse = await openai.audio.speech.create({
  model: "tts-1",
  voice: "nova",
  input: aiTextForSpeech,
  instructions: `
Tu es Sofia, une professeure de français.

Voix :
- féminine
- chaleureuse
- calme
- naturelle
- pédagogique
`
});

const audioBuffer = Buffer.from(await speechResponse.arrayBuffer());

const audioBase64 = audioBuffer.toString("base64");

const audioBuffer = Buffer.from(
  await speechResponse.arrayBuffer()
);

const audioBase64 = audioBuffer.toString("base64");

    /* 🔒 FINAL VALIDATION */
    if (!audioBuffer) {
      throw new Error("audioBuffer vide");
    }

    /* 🧹 CLEANUP */
    console.log("🧹 CLEANUP START");

    safeDelete(req.file.path);
    safeDelete(wavPath);

    console.log("🧹 CLEANUP DONE");

    /* 📤 RESPONSE */
    res.json({
      userText,
      aiText,
      audioBase64: audioBuffer.toString("base64"),
      history: conversation
    });

  } catch (err) {
    console.error("❌ SERVER ERROR:", err);

    res.status(500).json({
      error: err.message || "Erreur serveur"
    });
  }
});

/* ===============================
   🚀 START SERVER
   =============================== */

app.listen(port, () => {
  console.log(`🔥 Server actif → http://localhost:${port}`);
});