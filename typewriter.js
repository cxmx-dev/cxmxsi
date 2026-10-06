/* One strike profile per typewriter key. Add a letter here when that key is wired. */
var typewriterStrikes = {
  v: {
    thudHz: 146,
    ringHz: 1680,
    ringHz2: 4270,
    noiseHz: 1860,
    noiseQ: 0.85,
    thudGain: 0.34,
    ringGain: 0.11,
    noiseGain: 0.55,
    body: 0.085
  }
};

var typewriterAudio = null;

function typewriterContext() {
  var AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!typewriterAudio) typewriterAudio = new AudioCtx();
  if (typewriterAudio.state === "suspended") typewriterAudio.resume();
  return typewriterAudio;
}

function typewriterNoise(ctx, seconds, seed) {
  var state = (seed >>> 0) || 1;
  var length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  var buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  var data = buffer.getChannelData(0);
  var decay = ctx.sampleRate * 0.0032;
  for (var i = 0; i < length; i++) {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    data[i] = ((state / 4294967296) * 2 - 1) * Math.exp(-i / decay);
  }
  return buffer;
}

/* Schedules one key strike on ctx at `when` seconds. */
function typewriterSchedule(ctx, profile, when) {
  var master = ctx.createGain();
  master.gain.setValueAtTime(0.72, when);
  master.connect(ctx.destination);

  var noise = ctx.createBufferSource();
  noise.buffer = typewriterNoise(ctx, 0.04, profile.thudHz * 1000 + profile.noiseHz);
  var band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.setValueAtTime(profile.noiseHz, when);
  band.Q.setValueAtTime(profile.noiseQ, when);
  var noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(profile.noiseGain, when);
  noise.connect(band);
  band.connect(noiseGain);
  noiseGain.connect(master);
  noise.start(when);

  var thud = ctx.createOscillator();
  thud.type = "triangle";
  thud.frequency.setValueAtTime(profile.thudHz, when);
  thud.frequency.exponentialRampToValueAtTime(Math.max(40, profile.thudHz * 0.62), when + profile.body);
  var thudGain = ctx.createGain();
  thudGain.gain.setValueAtTime(0.0001, when);
  thudGain.gain.exponentialRampToValueAtTime(profile.thudGain, when + 0.003);
  thudGain.gain.exponentialRampToValueAtTime(0.0001, when + profile.body);
  thud.connect(thudGain);
  thudGain.connect(master);
  thud.start(when);
  thud.stop(when + profile.body + 0.02);

  var ring = ctx.createOscillator();
  ring.type = "sine";
  ring.frequency.setValueAtTime(profile.ringHz, when);
  var ringGain = ctx.createGain();
  ringGain.gain.setValueAtTime(profile.ringGain, when);
  ringGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
  ring.connect(ringGain);
  ringGain.connect(master);
  ring.start(when);
  ring.stop(when + 0.06);

  var ring2 = ctx.createOscillator();
  ring2.type = "sine";
  ring2.frequency.setValueAtTime(profile.ringHz2, when);
  var ring2Gain = ctx.createGain();
  ring2Gain.gain.setValueAtTime(profile.ringGain * 0.4, when);
  ring2Gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.028);
  ring2.connect(ring2Gain);
  ring2Gain.connect(master);
  ring2.start(when);
  ring2.stop(when + 0.04);
}

function typewriterPlay(id) {
  var profile = typewriterStrikes[id];
  var ctx = profile && typewriterContext();
  if (!ctx) return false;
  typewriterSchedule(ctx, profile, ctx.currentTime);
  return true;
}

document.querySelectorAll(".typewriter-key").forEach(function (key) {
  key.addEventListener("click", function (event) {
    var modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
    var played = typewriterPlay(key.getAttribute("data-key"));
    if (modified || !played) return;
    event.preventDefault();
    var href = key.href;
    window.setTimeout(function () {
      window.location.href = href;
    }, 170);
  });
});
