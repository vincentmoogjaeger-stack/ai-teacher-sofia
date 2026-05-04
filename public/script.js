const recordBtn = document.getElementById("record");
const audioEl = document.getElementById("audio");
const avatar = document.getElementById("avatar");
const conversationDiv = document.getElementById("conversation");

let mediaRecorder;
let audioChunks = [];

recordBtn.addEventListener("click", async () => {
  if (!mediaRecorder || mediaRecorder.state === "inactive") {
    startRecording();
  } else {
    stopRecording();
  }
});

async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

  mediaRecorder = new MediaRecorder(stream);
  audioChunks = [];

  mediaRecorder.ondataavailable = e => audioChunks.push(e.data);

  mediaRecorder.onstop = sendAudio;

  mediaRecorder.start();
  recordBtn.textContent = "⏹️ Stop";
}

function stopRecording() {
  mediaRecorder.stop();
  recordBtn.textContent = "🎙️ Parler";
}

async function sendAudio() {
  const blob = new Blob(audioChunks, { type: "audio/webm" });
  const formData = new FormData();
  formData.append("audio", blob);

  recordBtn.disabled = true;

const res = await fetch("/api/audio", {
  method: "POST",
  body: formData
});

const data = await res.json();
console.log("SERVER RESPONSE:", data);

// 💬 texte
conversationDiv.innerHTML += `
<p><strong>Toi :</strong> ${data.history[data.history.length - 2].content}</p>
<p><strong>Prof :</strong> ${data.history[data.history.length - 1].content}</p>
`;

conversationDiv.scrollTop = conversationDiv.scrollHeight;

  // 🔊 AUDIO (POINT CLÉ)
  audioEl.src = "data:audio/mp3;base64," + data.audioBase64;
  audioEl.play();

  // 👄 animation avatar
  avatar.classList.add("talking");
  audioEl.onended = () => avatar.classList.remove("talking");

  recordBtn.disabled = false;
}



