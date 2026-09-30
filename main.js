const droneButton = document.querySelector("#drone");
const copyButton = document.querySelector("#copy");
const rowText = document.querySelector("#row-text");
const copyStatus = document.querySelector("#copy-status");

let audioCtx;
let nodes;

function distortionCurve(amount) {
  const samples = 441;
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i += 1) {
    const x = (i * 2) / samples - 1;
    curve[i] = Math.tanh(x * amount);
  }
  return curve;
}

function startDrone() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) throw new Error("no audio");
  if (!audioCtx) audioCtx = new Ctx();
  audioCtx.resume();

  if (nodes) {
    try {
      nodes.osc.stop();
      nodes.osc2.stop();
      nodes.lfo.stop();
    } catch (error) {
      /* already stopped */
    }
    nodes = null;
  }

  const osc = audioCtx.createOscillator();
  const osc2 = audioCtx.createOscillator();
  const shaper = audioCtx.createWaveShaper();
  const band = audioCtx.createBiquadFilter();
  const low = audioCtx.createBiquadFilter();
  const gain = audioCtx.createGain();
  const lfo = audioCtx.createOscillator();
  const lfoGain = audioCtx.createGain();
  const voice = audioCtx.createGain();
  const overtone = audioCtx.createGain();

  osc.type = "sawtooth";
  osc.frequency.value = 185;
  osc2.type = "square";
  osc2.frequency.value = 370;
  voice.gain.value = 0.85;
  overtone.gain.value = 0.18;

  shaper.curve = distortionCurve(14);
  shaper.oversample = "2x";

  band.type = "bandpass";
  band.frequency.value = 1500;
  band.Q.value = 3.2;

  low.type = "lowpass";
  low.frequency.value = 2800;

  lfo.type = "sine";
  lfo.frequency.value = 5.5;
  lfoGain.gain.value = 7;
  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);

  const now = audioCtx.currentTime;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.06, now + 0.03);

  osc.connect(voice);
  osc2.connect(overtone);
  voice.connect(shaper);
  overtone.connect(shaper);
  shaper.connect(band);
  band.connect(low);
  low.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start();
  osc2.start();
  lfo.start();
  nodes = { osc, osc2, lfo, gain };

  document.body.classList.add("is-droning");
  droneButton.setAttribute("aria-pressed", "true");
}

function stopDrone() {
  if (nodes && audioCtx) {
    const fading = nodes;
    const now = audioCtx.currentTime;
    nodes = null;
    try {
      fading.gain.gain.cancelScheduledValues(now);
      fading.gain.gain.setValueAtTime(Math.max(fading.gain.gain.value, 0.0001), now);
      fading.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
      fading.osc.stop(now + 0.06);
      fading.osc2.stop(now + 0.06);
      fading.lfo.stop(now + 0.06);
    } catch (error) {
      /* already stopped */
    }
  }
  document.body.classList.remove("is-droning");
  if (droneButton) droneButton.setAttribute("aria-pressed", "false");
}

if (droneButton) {
  droneButton.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    try {
      droneButton.setPointerCapture(event.pointerId);
    } catch (error) {
      /* capture is optional */
    }
    try {
      startDrone();
    } catch (error) {
      const idle = droneButton.querySelector(".when-idle");
      if (idle) idle.textContent = "Hum it yourself";
    }
  });

  droneButton.addEventListener("pointerup", stopDrone);
  droneButton.addEventListener("pointercancel", stopDrone);
  droneButton.addEventListener("keydown", (event) => {
    if (event.repeat) return;
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      try {
        startDrone();
      } catch (error) {
        const idle = droneButton.querySelector(".when-idle");
        if (idle) idle.textContent = "Hum it yourself";
      }
    }
  });
  droneButton.addEventListener("keyup", (event) => {
    if (event.key === " " || event.key === "Enter") stopDrone();
  });
  window.addEventListener("blur", stopDrone);
}

const signup = document.querySelector("form[name='bringing-one']");
if (signup) {
  signup.addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = document.querySelector("#form-status");
    const button = signup.querySelector("[type='submit']");
    if (button) button.disabled = true;
    if (status) {
      status.hidden = true;
      status.textContent = "";
    }

    try {
      const response = await fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(new FormData(signup)).toString()
      });
      if (!response.ok) throw new Error("form failed");
      window.location.assign("/thanks");
    } catch (error) {
      if (button) button.disabled = false;
      if (status) {
        status.hidden = false;
        status.textContent = "That didn't send. Try it once more.";
      }
    }
  });
}

const nativeShare = document.querySelector("#native-share");
if (nativeShare && navigator.share) {
  nativeShare.hidden = false;
  nativeShare.addEventListener("click", async () => {
    try {
      await navigator.share({
        title: "Raise the Buzz",
        text: "Bring a kazoo to the Hive. Drone their free throws. #RaiseTheBuzz #BringAKazoo",
        url: "https://raisethebuzz.com/"
      });
    } catch (error) {
      /* The share sheet was closed. */
    }
  });
}

const tagStatus = document.querySelector("#tag-status");
document.querySelectorAll(".tag").forEach((button) => {
  const label = button.textContent;
  button.addEventListener("click", async () => {
    const tag = button.dataset.tag;
    let copied = false;
    try {
      await navigator.clipboard.writeText(tag);
      copied = true;
    } catch (error) {
      copied = false;
    }
    if (tagStatus) tagStatus.textContent = copied ? `Copied ${tag}` : `Copy ${tag} from the page.`;
    if (!copied) return;
    button.textContent = "Copied";
    window.setTimeout(() => {
      button.textContent = label;
    }, 1200);
  });
});

if (copyButton && rowText) {
  copyButton.addEventListener("click", async () => {
    const text = rowText.textContent.trim();
    let copied = false;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch (error) {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.left = "-9999px";
      document.body.appendChild(area);
      area.select();
      try {
        copied = document.execCommand("copy");
      } catch (copyError) {
        copied = false;
      }
      area.remove();
    }

    if (!copied) {
      const range = document.createRange();
      range.selectNodeContents(rowText);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      copyButton.textContent = "Select and copy";
      if (copyStatus) copyStatus.textContent = "Clipboard blocked. The message is selected.";
      return;
    }

    copyButton.textContent = "Copied";
    if (copyStatus) copyStatus.textContent = "Copied. Paste it into a text.";
    window.setTimeout(() => {
      copyButton.textContent = "Copy this";
    }, 2000);
  });
}
