let recorder;
let chunks = [];

const btn = document.getElementById("record");
const audio = document.getElementById("audio");
const convo = document.getElementById("conversation");
const avatar = document.getElementById("avatar");

btn.onclick = async () => {
  btn.disabled = true;
  btn.innerText = "🎧 Écoute...";

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  recorder = new MediaRecorder(stream);
  chunks = [];

  recorder.ondataavailable = e => chunks.push(e.data);

  recorder.onstop = async () => {
    const blob = new Blob(chunks, { type: "audio/webm" });
    const fd = new FormData();
    fd.append("audio", blob, "voice.webm");

    const res = await fetch("/api/audio", {
      method: "POST",
      body: fd
    });

    const data = await res.json();

    convo.innerHTML = data.history
      .filter(m => m.role !== "system")
      .map(m =>
        `<p><b>${m.role === "user" ? "Vous" : "Professeur"} :</b> ${m.content}</p>`
      ).join("");

    audio.src = "data:audio/mpeg;base64," + data.audioBase64;
    audio.play();

    avatar.classList.add("talking");
    audio.onended = () => avatar.classList.remove("talking");

    btn.innerText = "🎙️ Parler";
    btn.disabled = false;
  };

  recorder.start();
  setTimeout(() => recorder.stop(), 4000);
};



