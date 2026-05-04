import dotenv from "dotenv";
dotenv.config();

console.log("Contenu brut du fichier .env chargé :");
console.log(process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY : "⚠️ Aucune clé trouvée");
