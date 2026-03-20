const STORAGE_KEY = "interval-timer-settings";
const SOUND_FILES = {
  start: "assets/sounds/start.ogg",
  warning: "assets/sounds/warning.ogg",
  rest: "assets/sounds/rest.ogg",
  transition: "assets/sounds/transition.ogg",
  finish: "assets/sounds/finish.ogg",
  metronome_electric: "assets/sounds/metronome_electric.ogg",
  metronome_mechanical: "assets/sounds/metronome_mechanical.ogg",
};
const SOUND_VOLUMES = {
  start: 0.8,
  warning: 0.95,
  rest: 0.55,
  transition: 0.65,
  finish: 0.85,
  metronome_electric: 0.7,
  metronome_mechanical: 0.6,
};
const DEFAULT_SOUND_SETTINGS = {
  startDelaySound: "transition",
  intervalTimeSound: "start",
  intervalMetronomeEnabled: false,
  intervalMetronomeTime: 10,
  intervalMetronomeSound: "metronome_electric",
  intervalWarningSound: "warning",
  restTimeSound: "rest",
  restWarningSound: "warning",
};

const defaultSettings = {
  startDelay: "0:15",
  intervalTime: "10:00",
  intervalWarning: "2:00",
  restTime: "0:00",
  restWarning: "0:00",
  intervalCount: 6,
  ...DEFAULT_SOUND_SETTINGS,
};

const elements = {
  form: document.getElementById("settingsForm"),
  startDelay: document.getElementById("startDelay"),
  startDelaySound: document.getElementById("startDelaySound"),
  intervalTime: document.getElementById("intervalTime"),
  intervalTimeSound: document.getElementById("intervalTimeSound"),
  intervalMetronomeEnabled: document.getElementById("intervalMetronomeEnabled"),
  intervalMetronomeSlider: document.getElementById("intervalMetronomeSlider"),
  intervalMetronomeTime: document.getElementById("intervalMetronomeTime"),
  intervalMetronomeSound: document.getElementById("intervalMetronomeSound"),
  intervalWarning: document.getElementById("intervalWarning"),
  intervalWarningSound: document.getElementById("intervalWarningSound"),
  restTime: document.getElementById("restTime"),
  restTimeSound: document.getElementById("restTimeSound"),
  restWarning: document.getElementById("restWarning"),
  restWarningSound: document.getElementById("restWarningSound"),
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
  phaseRemainingTenths: 0,
  isRunning: false,
  phases: [],
  soundBank: {},
  warned: false,
  wakeLock: null,
};

function toTenths(seconds) {
  return seconds * 10;
}

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

function syncMetronomeTimeInputs(value) {
  const normalized = Math.min(100, Math.max(1, Number(value) || DEFAULT_SOUND_SETTINGS.intervalMetronomeTime));
  elements.intervalMetronomeSlider.value = String(normalized);
  elements.intervalMetronomeTime.value = String(normalized);
}

function applyLiveMetronomeSettings() {
  syncMetronomeTimeInputs(elements.intervalMetronomeTime.value);

  state.settings.intervalMetronomeEnabled = elements.intervalMetronomeEnabled.checked;
  state.settings.intervalMetronomeTime = Number(elements.intervalMetronomeTime.value);
  state.settings.intervalMetronomeSound = elements.intervalMetronomeSound.value;

  state.phases.forEach((phase) => {
    if (phase.type !== "interval") {
      return;
    }

    phase.metronomeEnabled = state.settings.intervalMetronomeEnabled;
    phase.metronomeTime = state.settings.intervalMetronomeTime;
    phase.metronomeSound = state.settings.intervalMetronomeSound;
  });
}

function readSettingsFromForm() {
  const nextSettings = {
    startDelay: elements.startDelay.value,
    startDelaySound: elements.startDelaySound.value,
    intervalTime: elements.intervalTime.value,
    intervalTimeSound: elements.intervalTimeSound.value,
    intervalMetronomeEnabled: elements.intervalMetronomeEnabled.checked,
    intervalMetronomeTime: Number(elements.intervalMetronomeTime.value),
    intervalMetronomeSound: elements.intervalMetronomeSound.value,
    intervalWarning: elements.intervalWarning.value,
    intervalWarningSound: elements.intervalWarningSound.value,
    restTime: elements.restTime.value,
    restTimeSound: elements.restTimeSound.value,
    restWarning: elements.restWarning.value,
    restWarningSound: elements.restWarningSound.value,
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

  if (!Number.isInteger(nextSettings.intervalMetronomeTime) || nextSettings.intervalMetronomeTime < 1 || nextSettings.intervalMetronomeTime > 100) {
    throw new Error("Metronome interval must be between 1 and 100 tenths of a second.");
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
  elements.startDelaySound.value = settings.startDelaySound;
  elements.intervalTime.value = settings.intervalTime;
  elements.intervalTimeSound.value = settings.intervalTimeSound;
  elements.intervalMetronomeEnabled.checked = Boolean(settings.intervalMetronomeEnabled);
  syncMetronomeTimeInputs(settings.intervalMetronomeTime);
  elements.intervalMetronomeSound.value = settings.intervalMetronomeSound;
  elements.intervalWarning.value = settings.intervalWarning;
  elements.intervalWarningSound.value = settings.intervalWarningSound;
  elements.restTime.value = settings.restTime;
  elements.restTimeSound.value = settings.restTimeSound;
  elements.restWarning.value = settings.restWarning;
  elements.restWarningSound.value = settings.restWarningSound;
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
    startDelaySound: next.startDelaySound,
    intervalTime: next.intervalTime,
    intervalTimeSound: next.intervalTimeSound,
    intervalMetronomeEnabled: next.intervalMetronomeEnabled,
    intervalMetronomeTime: next.intervalMetronomeTime,
    intervalMetronomeSound: next.intervalMetronomeSound,
    intervalWarning: next.intervalWarning,
    intervalWarningSound: next.intervalWarningSound,
    restTime: next.restTime,
    restTimeSound: next.restTimeSound,
    restWarning: next.restWarning,
    restWarningSound: next.restWarningSound,
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
      durationTenths: toTenths(startDelay),
      intervalNumber: 0,
      warningAtTenths: null,
      sound: settings.startDelaySound,
    });
  }

  for (let i = 1; i <= settings.intervalCount; i += 1) {
    phases.push({
      type: "interval",
      label: "Work",
      durationTenths: toTenths(intervalTime),
      intervalNumber: i,
      warningAtTenths: toTenths(parseTime(settings.intervalWarning)),
      sound: settings.intervalTimeSound,
      metronomeEnabled: settings.intervalMetronomeEnabled,
      metronomeTime: settings.intervalMetronomeTime,
      metronomeSound: settings.intervalMetronomeSound,
      warningSound: settings.intervalWarningSound,
    });

    if (restTime > 0 && i < settings.intervalCount) {
      phases.push({
        type: "rest",
        label: "Rest",
        durationTenths: toTenths(restTime),
        intervalNumber: i,
        warningAtTenths: toTenths(parseTime(settings.restWarning)),
        sound: settings.restTimeSound,
        warningSound: settings.restWarningSound,
      });
    }
  }

  return phases;
}

function ensureSoundBank() {
  Object.entries(SOUND_FILES).forEach(([pattern, source]) => {
    if (state.soundBank[pattern]) {
      return;
    }

    const audio = new Audio(source);
    audio.preload = "auto";
    state.soundBank[pattern] = audio;
  });
}

function playSound(pattern = "transition") {
  const baseAudio = state.soundBank[pattern];

  if (!baseAudio) {
    return;
  }

  const audio = baseAudio.cloneNode();
  audio.volume = SOUND_VOLUMES[pattern] ?? 0.65;
  audio.play().catch(() => {
    // Browsers may still block audio until the page has been interacted with.
  });
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

  const displaySeconds = Math.ceil(state.phaseRemainingTenths / 10);
  const warningActive = phase.warningAtTenths !== null && phase.warningAtTenths > 0 && state.phaseRemainingTenths <= phase.warningAtTenths;
  elements.phaseLabel.textContent = warningActive ? `${phase.label} Ending` : phase.label;
  elements.timerDisplay.textContent = formatTime(displaySeconds);

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
  state.phaseRemainingTenths = nextPhase.durationTenths;
  playSound(nextPhase.sound ?? "transition");
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

  state.phaseRemainingTenths -= 1;

  if (
    phase.type === "interval" &&
    phase.metronomeEnabled &&
    state.phaseRemainingTenths > 0 &&
    state.phaseRemainingTenths % phase.metronomeTime === 0
  ) {
    playSound(phase.metronomeSound ?? "transition");
  }

  if (
    phase.warningAtTenths !== null &&
    phase.warningAtTenths > 0 &&
    !state.warned &&
    state.phaseRemainingTenths <= phase.warningAtTenths
  ) {
    state.warned = true;
    playSound(phase.warningSound ?? "warning");
    showMessage(`${phase.label} ending in ${formatTime(Math.ceil(phase.warningAtTenths / 10))}.`);
  }

  updateDisplay();

  if (state.phaseRemainingTenths <= 0) {
    advancePhase();
  }
}

function startTimer() {
  try {
    const next = readSettingsFromForm();
    state.settings = {
      startDelay: next.startDelay,
      startDelaySound: next.startDelaySound,
      intervalTime: next.intervalTime,
      intervalTimeSound: next.intervalTimeSound,
      intervalMetronomeEnabled: next.intervalMetronomeEnabled,
      intervalMetronomeTime: next.intervalMetronomeTime,
      intervalMetronomeSound: next.intervalMetronomeSound,
      intervalWarning: next.intervalWarning,
      intervalWarningSound: next.intervalWarningSound,
      restTime: next.restTime,
      restTimeSound: next.restTimeSound,
      restWarning: next.restWarning,
      restWarningSound: next.restWarningSound,
      intervalCount: next.intervalCount,
    };
  } catch (error) {
    showMessage(error.message);
    return;
  }

  ensureSoundBank();

  if (!state.phases.length || state.phaseIndex >= state.phases.length) {
    state.phases = buildPhases(state.settings);
    state.phaseIndex = 0;
    state.warned = false;
    state.phaseRemainingTenths = state.phases[0]?.durationTenths ?? 0;
    updateDisplay();
    playSound(state.phases[0]?.sound ?? "transition");
  }

  if (state.isRunning) {
    return;
  }

  state.isRunning = true;
  state.timerId = window.setInterval(tick, 100);
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
  state.phaseRemainingTenths = 0;
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

elements.intervalMetronomeSlider.addEventListener("input", (event) => {
  syncMetronomeTimeInputs(event.target.value);
  applyLiveMetronomeSettings();
});

elements.intervalMetronomeTime.addEventListener("input", (event) => {
  syncMetronomeTimeInputs(event.target.value);
  applyLiveMetronomeSettings();
});

elements.intervalMetronomeEnabled.addEventListener("change", () => {
  applyLiveMetronomeSettings();
});

elements.intervalMetronomeSound.addEventListener("change", () => {
  applyLiveMetronomeSettings();
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
