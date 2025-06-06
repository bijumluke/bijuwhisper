let mediaRecorder, audioChunks = [];
let audioBlob = null;

const startBtn = document.getElementById("start");
const stopBtn = document.getElementById("stop");
const reloadBtn = document.getElementById("reload");
const copyBtn = document.getElementById("copy");
const downloadAudioBtn = document.getElementById("download-audio");
const downloadTextBtn = document.getElementById("download-text");
const transcriptBox = document.getElementById("transcript");
const cheatBtn = document.getElementById("cheat-sheet-button");
const cheatPopup = document.getElementById("cheat-sheet");

cheatBtn.onmouseover = () => cheatPopup.style.display = "block";
cheatBtn.onmouseout = () => cheatPopup.style.display = "none";

startBtn.onclick = async () => {
  startBtn.disabled = true;
  stopBtn.disabled = false;
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(stream);
  audioChunks = [];

  mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
  mediaRecorder.onstop = async () => {
    audioBlob = new Blob(audioChunks, { type: "audio/webm" });
    downloadAudioBtn.disabled = false;

    const formData = new FormData();
    formData.append("audio", audioBlob);
    formData.append("style", document.getElementById("style-select").value);
    formData.append("customPrompt", document.getElementById("custom-prompt").value);

    const statusLine = document.createElement("div");
    statusLine.id = "status-line";
    statusLine.style.color = "gray";
    statusLine.textContent = "[Processing...]";
    transcriptBox.parentElement.insertBefore(statusLine, transcriptBox);

    const response = await fetch("/.netlify/functions/whispergpt", {
      method: "POST",
      body: formData
    });

    if (statusLine) statusLine.remove();

    const result = await response.json();

    if (result.result) {
      transcriptBox.innerText += "\n" + result.result + "\n";
    } else {
      const errorLine = document.createElement("div");
      errorLine.style.color = "red";
      errorLine.textContent = `[ERROR] ${result.error}`;
      transcriptBox.parentElement.insertBefore(errorLine, transcriptBox);
    }
  };

  mediaRecorder.start();
};

stopBtn.onclick = () => {
  stopBtn.disabled = true;
  startBtn.disabled = false;
  mediaRecorder.stop();
};

reloadBtn.onclick = () => {
  transcriptBox.innerText = "";
  audioBlob = null;
  downloadAudioBtn.disabled = true;

  const oldStatus = document.getElementById("status-line");
  if (oldStatus) oldStatus.remove();
};

copyBtn.onclick = () => {
  navigator.clipboard.writeText(transcriptBox.innerText);
};

downloadAudioBtn.onclick = () => {
  if (!audioBlob) return;
  const url = URL.createObjectURL(audioBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "recording.webm";
  a.click();
};

downloadTextBtn.onclick = () => {
  const blob = new Blob([transcriptBox.innerText], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "transcript.txt";
  a.click();
};

