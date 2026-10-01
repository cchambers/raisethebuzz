const droneButton = document.querySelector("#drone");
const copyButton = document.querySelector("#copy");
const rowText = document.querySelector("#row-text");
const copyStatus = document.querySelector("#copy-status");
const pads = document.querySelectorAll(".pad");

const presets = {
  drone: { freq: 185, peak: 0.11, attack: 0.03, lfo: 5.5, depth: 7 },
  boo: { freq: 330, freqTo: 140, glide: 0.4, peak: 0.15, attack: 0.02, release: 0.26, lfo: 8.5, depth: 18, oneshot: true }
};

const quarter = 0.34;
const g4 = 392;
const c5 = 523.25;
const e5 = 659.25;
const g5 = 783.99;

const phrases = {
  buildup: {
    peak: 0.14,
    notes: [
      { freq: g4, at: 0, dur: 0.09 },
      { freq: c5, at: quarter / 3, dur: 0.09 },
      { freq: e5, at: (quarter * 2) / 3, dur: 0.09 },
      { freq: g5, at: quarter, dur: 0.07 },
      { freq: e5, at: quarter + quarter * 0.75, dur: 0.055 },
      { freq: g5, at: quarter * 2, dur: quarter * 2, held: true, peak: 0.18 }
    ]
  },
  charge: {
    peak: 0.22,
    notes: [{ freq: c5, at: 0, dur: 0.48, held: true }]
  }
};

let audioCtx;
let nodes;
let voiceId = 0;
let heldId = null;

function distortionCurve(amount) {
  const samples = 441;
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i += 1) {
    const x = (i * 2) / samples - 1;
    curve[i] = Math.tanh(x * amount);
  }
  return curve;
}

function markPlaying(button) {
  if (droneButton) {
    const on = button === droneButton;
    droneButton.classList.toggle("is-on", on);
    droneButton.setAttribute("aria-pressed", on ? "true" : "false");
  }
  pads.forEach((pad) => {
    const on = pad === button;
    pad.classList.toggle("is-on", on);
    pad.setAttribute("aria-pressed", on ? "true" : "false");
  });
  document.body.classList.toggle("is-droning", Boolean(button));
}

function stopNodes(release) {
  if (!nodes || !audioCtx) return;
  const fading = nodes;
  nodes = null;
  const now = audioCtx.currentTime;
  const tail = release || 0.05;
  try {
    fading.gain.gain.cancelScheduledValues(now);
    fading.gain.gain.setValueAtTime(Math.max(fading.gain.gain.value, 0.0001), now);
    fading.gain.gain.exponentialRampToValueAtTime(0.0001, now + tail);
    fading.osc.stop(now + tail + 0.02);
    fading.osc2.stop(now + tail + 0.02);
    if (fading.lfo) fading.lfo.stop(now + tail + 0.02);
  } catch (error) {
    /* already stopped */
  }
}

function startVoice(preset, button) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) throw new Error("no audio");
  if (!audioCtx) audioCtx = new Ctx();
  audioCtx.resume();

  const id = voiceId + 1;
  voiceId = id;
  stopNodes(0.03);

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
  osc2.type = "square";
  voice.gain.value = 0.85;
  overtone.gain.value = 0.18;

  shaper.curve = distortionCurve(14);
  shaper.oversample = "2x";

  band.type = "bandpass";
  band.frequency.value = preset.oneshot ? 1200 : 1500;
  band.Q.value = preset.oneshot ? 2.2 : 3.2;

  low.type = "lowpass";
  low.frequency.value = 2800;

  lfo.type = "sine";
  lfo.frequency.value = preset.lfo;
  lfoGain.gain.value = preset.depth;
  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);

  const now = audioCtx.currentTime;
  osc.frequency.setValueAtTime(preset.freq, now);
  osc2.frequency.setValueAtTime(preset.freq * 2, now);
  if (preset.freqTo) {
    osc.frequency.exponentialRampToValueAtTime(preset.freqTo, now + preset.glide);
    osc2.frequency.exponentialRampToValueAtTime(preset.freqTo * 2, now + preset.glide);
  }

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(preset.peak, now + preset.attack);

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
  nodes = { osc, osc2, lfo, gain, oneshot: Boolean(preset.oneshot), id };

  if (preset.oneshot) {
    const releaseAt = now + Math.max(preset.glide || 0, preset.attack) + 0.05;
    const stopAt = releaseAt + preset.release + 0.03;
    gain.gain.setValueAtTime(preset.peak, releaseAt);
    gain.gain.exponentialRampToValueAtTime(0.0001, releaseAt + preset.release);
    osc.stop(stopAt);
    osc2.stop(stopAt);
    lfo.stop(stopAt);
    osc.onended = () => {
      if (voiceId !== id) return;
      nodes = null;
      markPlaying(null);
    };
  }

  markPlaying(button);
}

function playPhrase(phrase, button) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) throw new Error("no audio");
  if (!audioCtx) audioCtx = new Ctx();
  audioCtx.resume();

  const id = voiceId + 1;
  voiceId = id;
  stopNodes(0.02);

  const osc = audioCtx.createOscillator();
  const osc2 = audioCtx.createOscillator();
  const shaper = audioCtx.createWaveShaper();
  const band = audioCtx.createBiquadFilter();
  const low = audioCtx.createBiquadFilter();
  const gain = audioCtx.createGain();
  const voice = audioCtx.createGain();
  const overtone = audioCtx.createGain();

  osc.type = "sawtooth";
  osc2.type = "square";
  voice.gain.value = 0.92;
  overtone.gain.value = 0.08;
  shaper.curve = distortionCurve(14);
  shaper.oversample = "2x";
  band.type = "bandpass";
  band.frequency.value = 900;
  band.Q.value = 0.8;
  low.type = "lowpass";
  low.frequency.value = 4200;

  const t0 = audioCtx.currentTime + 0.02;
  gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);

  phrase.notes.forEach((note) => {
    const start = t0 + note.at;
    const end = start + note.dur;
    const level = note.peak || phrase.peak;
    const attack = Math.min(0.012, note.dur * 0.28);
    osc.frequency.setValueAtTime(note.freq, start);
    osc2.frequency.setValueAtTime(note.freq * 2, start);
    band.frequency.setValueAtTime(Math.min(note.freq * 2.4, 3600), start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(level, start + attack);
    if (note.held) gain.gain.setValueAtTime(level, Math.max(start + attack + 0.02, end - 0.07));
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
  });

  const last = phrase.notes[phrase.notes.length - 1];
  const stopAt = t0 + last.at + last.dur + 0.03;
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
  osc.stop(stopAt);
  osc2.stop(stopAt);
  nodes = { osc, osc2, lfo: null, gain, oneshot: true, id };
  osc.onended = () => {
    if (voiceId !== id) return;
    nodes = null;
    markPlaying(null);
  };
  markPlaying(button);
}

function stopVoice() {
  if (nodes && nodes.oneshot) return;
  voiceId += 1;
  stopNodes(0.05);
  markPlaying(null);
}

function holdStart(button, preset, event) {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  event.preventDefault();
  heldId = event.pointerId;
  try {
    button.setPointerCapture(event.pointerId);
  } catch (error) {
    /* capture is optional */
  }
  try {
    startVoice(preset, button);
  } catch (error) {
    const idle = button.querySelector(".when-idle");
    if (idle) idle.textContent = "Hum it yourself";
  }
}

function holdEnd(event) {
  if (heldId !== null && event.pointerId !== heldId) return;
  heldId = null;
  stopVoice();
}

if (droneButton) {
  droneButton.addEventListener("pointerdown", (event) => holdStart(droneButton, presets.drone, event));
  droneButton.addEventListener("pointerup", holdEnd);
  droneButton.addEventListener("pointercancel", holdEnd);
  droneButton.addEventListener("keydown", (event) => {
    if (event.repeat) return;
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    try {
      startVoice(presets.drone, droneButton);
    } catch (error) {
      const idle = droneButton.querySelector(".when-idle");
      if (idle) idle.textContent = "Hum it yourself";
    }
  });
  droneButton.addEventListener("keyup", (event) => {
    if (event.key === " " || event.key === "Enter") stopVoice();
  });
}

pads.forEach((pad) => {
  const voice = pad.dataset.voice;
  const preset = presets[voice];
  const phrase = phrases[voice];
  if (!preset && !phrase) return;
  const play = () => {
    if (phrase) playPhrase(phrase, pad);
    else startVoice(preset, pad);
  };
  pad.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    heldId = event.pointerId;
    try {
      pad.setPointerCapture(event.pointerId);
    } catch (error) {
      /* capture is optional */
    }
    play();
  });
  pad.addEventListener("pointerup", holdEnd);
  pad.addEventListener("pointercancel", holdEnd);
  pad.addEventListener("contextmenu", (event) => event.preventDefault());
  pad.addEventListener("keydown", (event) => {
    if (event.repeat) return;
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    play();
  });
  pad.addEventListener("keyup", (event) => {
    if (event.key === " " || event.key === "Enter") stopVoice();
  });
});

if (droneButton || pads.length) {
  window.addEventListener("blur", () => {
    heldId = null;
    voiceId += 1;
    stopNodes(0.05);
    markPlaying(null);
  });
}

const passPage = document.querySelector("#pass-page");
if (passPage) {
  passPage.addEventListener("click", async () => {
    const status = document.querySelector("#pass-status");
    const url = "https://raisethebuzz.com/#board";
    const text = "No kazoo? Your phone is one. Six notes, then yell Charge. #RaiseTheBuzz";
    if (navigator.share) {
      try {
        await navigator.share({ title: "Raise the Buzz", text, url });
        return;
      } catch (error) {
        if (error && error.name === "AbortError") return;
      }
    }
    let copied = false;
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
    } catch (error) {
      copied = false;
    }
    if (!status) return;
    status.hidden = false;
    status.textContent = copied ? "Copied. Send it down the row." : "Copy raisethebuzz.com/#board from the address bar.";
  });
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
