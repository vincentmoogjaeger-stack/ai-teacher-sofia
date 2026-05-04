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
   🔑 CLÉS API (SÉCURISÉES)
   =============================== */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

console.log("KEY USED:", process.env.OPENAI_API_KEY);

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;

// 🔒 Sécurité : vérification
if (!OPENAI_API_KEY) {
  throw new Error("❌ OPENAI_API_KEY manquante");
}
if (!ELEVENLABS_API_KEY) {
  throw new Error("❌ ELEVENLABS_API_KEY manquante");
}
if (!ELEVENLABS_VOICE_ID) {
  throw new Error("❌ ELEVENLABS_VOICE_ID manquante");
}

/* ===============================
   🔧 OPENAI
   =============================== */

const openai = new OpenAI({
  apiKey: "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",
});

/* ===============================
   📁 MIDDLEWARE
   =============================== */

const upload = multer({ dest: "uploads/" });

app.use(express.static("public"));
app.use("/audio", express.static("audio"));

if (!fs.existsSync("audio")) fs.mkdirSync("audio");
if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");

/* ===============================
   🧠 MÉMOIRE CONVERSATION
   =============================== */

let conversation = [
  {
    role: "system",
    content: `
Tu t'appelles Sofia.
Tu es une professeure de français langue étrangère passionnée.

Tu es chaleureuse, accessible et motivante.
Tu es encourageante et rassurante lorsque l’élève fait des erreurs.
Tu peux être légèrement amusante et spontanée.
Tu ne te prends pas trop au sérieux, mais tu prends l’apprentissage très au sérieux.

Tu parles calmement, avec douceur et naturel.
Tu utilises parfois de petites phrases positives comme :
"Très bonne question !"
"Bravo pour ton effort."
"On va voir ça ensemble."
"C’est normal d’hésiter."

Tu crées une ambiance détendue et bienveillante où l’élève se sent en confiance pour progresser.
`
  }
];

/* ===============================
   🔊 CONVERSION AUDIO
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
   🎤 ROUTE AUDIO
   =============================== */

app.post("/api/audio", upload.single("audio"), async (req, res) => {
  try {
    console.log("🎤 Audio reçu");

    const wavPath = `${req.file.path}.wav`;
    await convertToWav(req.file.path, wavPath);

    /* 📝 TRANSCRIPTION */
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(wavPath),
      model: "whisper-1"
    });

    const userText = transcription.text.trim();
    console.log("🧑 Utilisateur :", userText);

    conversation.push({ role: "user", content: userText });

    /* 🤖 GPT */
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: conversation
    });

    const aiText = completion.choices[0].message.content;

    // 🎓 Interjections
    const interjections = [
      "Hmm...",
      "Très bien.",
      "D'accord.",
      "Bonne question.",
      "Alors...",
      "Voyons ça ensemble.",
      "Parfait.",
      "Alors, écoute bien...",
      "Très bien, je t'explique.",
      "Je suis Neo, et je vais t'aider."
    ];

    const addInterjection = Math.random() < 0.7;
    const interjection = addInterjection
      ? interjections[Math.floor(Math.random() * interjections.length)] + " "
      : "";

    console.log("🤖 IA :", aiText);

    conversation.push({ role: "assistant", content: aiText });

    const aiTextForSpeech = (interjection + aiText)
      .replace(/\./g, "... ")
      .replace(/\!/g, " ! ")
      .replace(/\?/g, " ? ");

    /* 🔊 ELEVENLABS */
    const elevenRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          text: aiTextForSpeech,
          model_id: "eleven_multilingual_v2"
        })
      }
    );

    if (!elevenRes.ok) {
      const errText = await elevenRes.text();
      console.error("❌ ElevenLabs:", errText);
      throw new Error("Erreur ElevenLabs");
    }

    const audioBuffer = Buffer.from(await elevenRes.arrayBuffer());

    res.json({
      userText,
      aiText,
      audioBase64: audioBuffer.toString("base64"),
      history: conversation
    });

    fs.unlinkSync(req.file.path);
    fs.unlinkSync(wavPath);

  } catch (err) {
    console.error("❌ ERREUR SERVEUR :", err);
    res.status(500).json({ error: err.message || "Erreur serveur" });
  }
});

/* ===============================
   🚀 LANCEMENT SERVEUR
   =============================== */

app.listen(port, () => {
  console.log(`🔥 Server actif → http://localhost:${port}`);
});
