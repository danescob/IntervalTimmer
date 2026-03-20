const STORAGE_KEY = "interval-timer-settings";

const defaultSettings = {
  startDelay: "0:15",
  intervalTime: "10:00",
  intervalWarning: "2:00",
  restTime: "0:00",
  restWarning: "0:00",
  intervalCount: 6,
};

const elements = {
  form: document.getElementById("settingsForm"),
  startDelay: document.getElementById("startDelay"),
  intervalTime: document.getElementById("intervalTime"),
  intervalWarning: document.getElementById("intervalWarning"),
  restTime: document.getElementById("restTime"),
  restWarning: document.getElementById("restWarning"),
  intervalCount: document.getElementById("intervalCount"),
  timerDisplay: document.getElementById("timerDisplay"),
  phaseLabel: document.getElementById("phaseLabel"),
  intervalLabel: document.getElementById("intervalLabel"),
  message: document.getElementById("message"),
  saveButton: document.getElementById("saveButton"),
  startButton: document.getElementById("startButton"),
  pauseButton: document.getElementById("pauseButton"),
  stopButton: document.getElementById("stopButton"),
};

const state = {
  settings: { ...defaultSettings },
  timerId: null,
  phaseIndex: 0,
  phaseRemaining: 0,
  isRunning: false,
  phases: [],
  currentInterval: 0,
  audioContext: null,
  warned: false,
  wakeLock: null,
};

function parseTime(value) {
  const trimmed = String(value).trim();
  const match = /^(\d+):([0-5]?\d)$/.exec(trimmed);

  if (!match) {
    return null;
  }

  return (Number(match[1]) * 60) + Number(match[2]);
}

function formatTime(totalSeconds) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function readSettingsFromForm() {
  const nextSettings = {
    startDelay: elements.startDelay.value,
    intervalTime: elements.intervalTime.value,
    intervalWarning: elements.intervalWarning.value,
    restTime: elements.restTime.value,
    restWarning: elements.restWarning.value,
    intervalCount: Number(elements.intervalCount.value),
  };

  const parsed = {
    startDelay: parseTime(nextSettings.startDelay),
    intervalTime: parseTime(nextSettings.intervalTime),
    intervalWarning: parseTime(nextSettings.intervalWarning),
    restTime: parseTime(nextSettings.restTime),
    restWarning: parseTime(nextSettings.restWarning),
  };

  if (Object.values(parsed).some((value) => value === null)) {
    throw new Error("Use time format M:SS in all time fields.");
  }

  if (!Number.isInteger(nextSettings.intervalCount) || nextSettings.intervalCount < 1) {
    throw new Error("Quantity of intervals must be at least 1.");
  }

  if (parsed.intervalWarning > parsed.intervalTime) {
    throw new Error("End of interval warning cannot be longer than the interval.");
  }

  if (parsed.restWarning > parsed.restTime) {
    throw new Error("End of rest warning cannot be longer than the rest.");
  }

  return { ...nextSettings, parsed };
}

function applySettingsToForm(settings) {
  elements.startDelay.value = settings.startDelay;
  elements.intervalTime.value = settings.intervalTime;
  elements.intervalWarning.value = settings.intervalWarning;
  elements.restTime.value = settings.restTime;
  elements.restWarning.value = settings.restWarning;
  elements.intervalCount.value = settings.intervalCount;
}

function loadSettings() {
  const saved = localStorage.getItem(STORAGE_KEY);

  if (!saved) {
    applySettingsToForm(defaultSettings);
    state.settings = { ...defaultSettings };
    resetVisualState();
    return;
  }

  try {
    const parsed = JSON.parse(saved);
    state.settings = { ...defaultSettings, ...parsed };
    applySettingsToForm(state.settings);
  } catch (error) {
    state.settings = { ...defaultSettings };
    applySettingsToForm(defaultSettings);
  }

  resetVisualState();
}

function saveSettings() {
  const next = readSettingsFromForm();
  state.settings = {
    startDelay: next.startDelay,
    intervalTime: next.intervalTime,
    intervalWarning: next.intervalWarning,
    restTime: next.restTime,
    restWarning: next.restWarning,
    intervalCount: next.intervalCount,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings));
  showMessage("Settings saved.");
  resetVisualState();
}

function buildPhases(settings) {
  const phases = [];
  const startDelay = parseTime(settings.startDelay);
  const intervalTime = parseTime(settings.intervalTime);
  const restTime = parseTime(settings.restTime);

  if (startDelay > 0) {
    phases.push({
      type: "start",
      label: "Starting Soon",
      duration: startDelay,
      intervalNumber: 0,
      warningAt: null,
    });
  }

  for (let i = 1; i <= settings.intervalCount; i += 1) {
    phases.push({
      type: "interval",
      label: "Work",
      duration: intervalTime,
      intervalNumber: i,
      warningAt: parseTime(settings.intervalWarning),
    });

    if (restTime > 0 && i < settings.intervalCount) {
      phases.push({
        type: "rest",
        label: "Rest",
        duration: restTime,
        intervalNumber: i,
        warningAt: parseTime(settings.restWarning),
      });
    }
  }

  return phases;
}

function ensureAudioContext() {
  if (!state.audioContext) {
    state.audioContext = new window.AudioContext();
  }

  if (state.audioContext.state === "suspended") {
    state.audioContext.resume();
  }
}

function playTone({ frequency, startTime, duration, volume, type = "sine", decay = duration }) {
  const oscillator = state.audioContext.createOscillator();
  const gain = state.audioContext.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startTime);

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + decay);

  oscillator.connect(gain);
  gain.connect(state.audioContext.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration);
}

function playSound(pattern = "transition") {
  ensureAudioContext();
  const now = state.audioContext.currentTime;

  if (pattern === "start") {
    // Strong two-hit ring for the round start.
    playTone({ frequency: 880, startTime: now, duration: 1.9, volume: 0.16, decay: 1.2 });
    playTone({ frequency: 1320, startTime: now + 0.01, duration: 1.6, volume: 0.09, decay: 1.05, type: "triangle" });
    playTone({ frequency: 660, startTime: now + 0.015, duration: 2.1, volume: 0.06, decay: 1.35 });
    playTone({ frequency: 880, startTime: now + 0.34, duration: 1.6, volume: 0.14, decay: 1.0 });
    playTone({ frequency: 1320, startTime: now + 0.35, duration: 1.3, volume: 0.07, decay: 0.95, type: "triangle" });
    return;
  }

  if (pattern === "warning") {
    [0, 0.22, 0.44].forEach((offset) => {
      playTone({ frequency: 1040, startTime: now + offset, duration: 0.42, volume: 0.12, decay: 0.28, type: "triangle" });
      playTone({ frequency: 780, startTime: now + offset + 0.015, duration: 0.46, volume: 0.08, decay: 0.3 });
    });
    return;
  }

  if (pattern === "rest") {
    playTone({ frequency: 720, startTime: now, duration: 1.3, volume: 0.12, decay: 0.75 });
    playTone({ frequency: 1080, startTime: now + 0.02, duration: 1.0, volume: 0.06, decay: 0.68, type: "triangle" });
    return;
  }

  if (pattern === "transition") {
    playTone({ frequency: 820, startTime: now, duration: 1.0, volume: 0.11, decay: 0.58 });
    playTone({ frequency: 1230, startTime: now + 0.015, duration: 0.82, volume: 0.05, decay: 0.52, type: "triangle" });
    return;
  }

  if (pattern === "finish") {
    [0, 0.34, 0.68].forEach((offset) => {
      playTone({ frequency: 900, startTime: now + offset, duration: 0.88, volume: 0.12, decay: 0.6, type: "triangle" });
      playTone({ frequency: 1350, startTime: now + offset + 0.02, duration: 0.7, volume: 0.06, decay: 0.48 });
    });
    return;
  }
}

function showMessage(text) {
  elements.message.textContent = text;
}

async function requestWakeLock() {
  if (!("wakeLock" in navigator) || state.wakeLock || !state.isRunning) {
    return;
  }

  try {
    state.wakeLock = await navigator.wakeLock.request("screen");
    state.wakeLock.addEventListener("release", () => {
      state.wakeLock = null;
    });
  } catch (error) {
    showMessage("Wake lock unavailable in this browser/tab.");
  }
}

async function releaseWakeLock() {
  if (!state.wakeLock) {
    return;
  }

  try {
    await state.wakeLock.release();
  } catch (error) {
    // Ignore release failures caused by browser state changes.
  } finally {
    state.wakeLock = null;
  }
}

function setPhaseTheme(type, warningActive = false) {
  document.body.classList.remove("phase-warning", "phase-rest", "phase-finished");

  if (warningActive) {
    document.body.classList.add("phase-warning");
    return;
  }

  if (type === "rest") {
    document.body.classList.add("phase-rest");
  }
}

function resetVisualState() {
  const intervalTime = parseTime(state.settings.intervalTime) ?? parseTime(defaultSettings.intervalTime);
  elements.timerDisplay.textContent = formatTime(intervalTime);
  elements.phaseLabel.textContent = "Ready";
  elements.intervalLabel.textContent = `Interval 0 / ${state.settings.intervalCount}`;
  document.body.classList.remove("phase-warning", "phase-rest", "phase-finished");
}

function updateDisplay() {
  const phase = state.phases[state.phaseIndex];

  if (!phase) {
    elements.phaseLabel.textContent = "Finished";
    elements.timerDisplay.textContent = "0:00";
    elements.intervalLabel.textContent = `Interval ${state.settings.intervalCount} / ${state.settings.intervalCount}`;
    document.body.classList.remove("phase-warning", "phase-rest");
    document.body.classList.add("phase-finished");
    return;
  }

  const warningActive = phase.warningAt !== null && phase.warningAt > 0 && state.phaseRemaining <= phase.warningAt;
  elements.phaseLabel.textContent = warningActive ? `${phase.label} Ending` : phase.label;
  elements.timerDisplay.textContent = formatTime(state.phaseRemaining);

  const intervalNumber = phase.type === "interval" ? phase.intervalNumber : Math.min(phase.intervalNumber + (phase.type === "rest" ? 1 : 0), state.settings.intervalCount);
  elements.intervalLabel.textContent = `Interval ${intervalNumber} / ${state.settings.intervalCount}`;
  setPhaseTheme(phase.type, warningActive);
}

function advancePhase() {
  state.phaseIndex += 1;
  state.warned = false;

  if (state.phaseIndex >= state.phases.length) {
    stopTimer(false);
    elements.phaseLabel.textContent = "Finished";
    elements.timerDisplay.textContent = "0:00";
    elements.intervalLabel.textContent = `Interval ${state.settings.intervalCount} / ${state.settings.intervalCount}`;
    document.body.classList.add("phase-finished");
    playSound("finish");
    showMessage("Workout complete.");
    return;
  }

  const nextPhase = state.phases[state.phaseIndex];
  state.phaseRemaining = nextPhase.duration;
  if (nextPhase.type === "interval") {
    playSound("start");
  } else if (nextPhase.type === "rest") {
    playSound("rest");
  } else {
    playSound("transition");
  }
  updateDisplay();
}

function tick() {
  if (!state.isRunning) {
    return;
  }

  const phase = state.phases[state.phaseIndex];

  if (!phase) {
    return;
  }

  state.phaseRemaining -= 1;

  if (
    phase.warningAt !== null &&
    phase.warningAt > 0 &&
    !state.warned &&
    state.phaseRemaining <= phase.warningAt
  ) {
    state.warned = true;
    playSound("warning");
    showMessage(`${phase.label} ending in ${formatTime(phase.warningAt)}.`);
  }

  updateDisplay();

  if (state.phaseRemaining <= 0) {
    advancePhase();
  }
}

function startTimer() {
  try {
    const next = readSettingsFromForm();
    state.settings = {
      startDelay: next.startDelay,
      intervalTime: next.intervalTime,
      intervalWarning: next.intervalWarning,
      restTime: next.restTime,
      restWarning: next.restWarning,
      intervalCount: next.intervalCount,
    };
  } catch (error) {
    showMessage(error.message);
    return;
  }

  ensureAudioContext();

  if (!state.phases.length || state.phaseIndex >= state.phases.length) {
    state.phases = buildPhases(state.settings);
    state.phaseIndex = 0;
    state.warned = false;
    state.phaseRemaining = state.phases[0]?.duration ?? 0;
    updateDisplay();
    if (state.phases[0]?.type === "interval") {
      playSound("start");
    } else if (state.phases[0]?.type === "rest") {
      playSound("rest");
    } else {
      playSound("transition");
    }
  }

  if (state.isRunning) {
    return;
  }

  state.isRunning = true;
  state.timerId = window.setInterval(tick, 1000);
  requestWakeLock();
  showMessage("Timer running.");
}

function pauseTimer() {
  if (!state.isRunning) {
    return;
  }

  state.isRunning = false;
  window.clearInterval(state.timerId);
  state.timerId = null;
  releaseWakeLock();
  showMessage("Timer paused.");
}

function stopTimer(resetMessage = true) {
  state.isRunning = false;
  window.clearInterval(state.timerId);
  state.timerId = null;
  state.phaseIndex = 0;
  state.phaseRemaining = 0;
  state.phases = [];
  state.warned = false;
  releaseWakeLock();
  resetVisualState();

  if (resetMessage) {
    showMessage("Timer stopped.");
  }
}

elements.saveButton.addEventListener("click", saveSettings);
elements.startButton.addEventListener("click", startTimer);
elements.pauseButton.addEventListener("click", pauseTimer);
elements.stopButton.addEventListener("click", () => stopTimer(true));

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && state.isRunning) {
    requestWakeLock();
    return;
  }

  if (document.visibilityState !== "visible") {
    releaseWakeLock();
  }
});

loadSettings();
