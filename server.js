
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

import fs from "fs";
import express from "express";
import multer from "multer";
import ffmpeg from "fluent-ffmpeg";
import OpenAI from "openai";

/* =========================
   PATH FIX (.env safe load)
========================= */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env") });

/* =========================
   ENV CHECK
========================= */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  throw new Error("❌ OPENAI_API_KEY manquante dans .env");
}

console.log("🔑 API KEY chargée OK");

/* =========================
   INIT OPENAI (ONE ONLY)
========================= */

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY
});

/* =========================
   OPTIONAL OPENAI TEST
   (SAFE, REMOVE LATER IF YOU WANT)
========================= */

async function testOpenAI() {
  try {
    console.log("🧪 TEST OPENAI START");

    const models = await openai.models.list();

    console.log("🟢 OPENAI OK");
    console.log("📦 Models count:", models.data.length);

  } catch (err) {
    console.log("🔴 OPENAI ERROR:");
    console.log(err.message);
  }
}

setTimeout(testOpenAI, 100);

/* =========================
   EXPRESS SETUP
========================= */

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));
app.use("/audio", express.static("audio"));

/* =========================
   FILE SETUP
========================= */

const upload = multer({ dest: "uploads/" });

if (!fs.existsSync("audio")) fs.mkdirSync("audio");
if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");

/* =========================
   MEMORY
========================= */

let conversation = [
  {
    role: "system",
    content: `
Tu t'appelles Sofia, professeure de français.

Règles :
- 1 erreur max par réponse
- explication simple
- ton bienveillant
- encourage toujours l'élève

Si aucune erreur :
"Très bien, aucune erreur 👍"
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

/* =========================
   AUDIO CONVERT
========================= */

function convertToWav(input, output) {
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .toFormat("wav")
      .on("end", resolve)
      .on("error", reject)
      .save(output);
  });
}

/* =========================
   SAFE DELETE
========================= */

function safeDelete(path) {
  try {
    if (path && fs.existsSync(path)) {
      fs.unlinkSync(path);
    }
  } catch (err) {
    console.error("⚠️ delete error:", err.message);
  }
}

/* =========================
   MAIN ROUTE
========================= */

app.post("/api/audio", upload.single("audio"), async (req, res) => {
  try {
    console.log("🎤 Audio reçu");

    if (!req.file?.path) {
      return res.status(400).json({ error: "Audio manquant" });
    }

    const wavPath = `${req.file.path}.wav`;

    await convertToWav(req.file.path, wavPath);

    /* =========================
       TRANSCRIPTION
    ========================= */

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

    /* =========================
       GPT RESPONSE
    ========================= */

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

    /* =========================
       CLEAN TEXT FOR TTS
    ========================= */

    const aiTextClean = aiText
      .split("Correction :")[0]
      .trim();

    /* =========================
       TTS
    ========================= */

    const speechResponse = await openai.audio.speech.create({
      model: "tts-1",
      voice: "nova",
      input: aiTextClean,
      instructions: `
Voix :
- féminine
- calme
- pédagogique
- naturelle
`
    });

    const audioBuffer = Buffer.from(await speechResponse.arrayBuffer());
    const audioBase64 = audioBuffer.toString("base64");

    /* =========================
       CLEANUP
    ========================= */

    safeDelete(req.file.path);
    safeDelete(wavPath);

    /* =========================
       RESPONSE
    ========================= */

    res.json({
      userText,
      aiText,
      audioBase64,
      history: conversation
    });

  } catch (err) {
    console.error("❌ SERVER ERROR:", err);

    res.status(500).json({
      error: err.message || "Erreur serveur"
    });
  }
});

/* =========================
   START SERVER
========================= */

app.listen(port, () => {
  console.log(`🔥 Server actif → http://localhost:${port}`);
});