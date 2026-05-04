import dotenv from "dotenv";
dotenv.config();
console.log("Clé OpenAI lue :", process.env.OPENAI_API_KEY);

res.json({
  userText,
  aiText: aiReply,
  videoUrl
});

document.getElementById("cloneVideo").src = data.videoUrl;


