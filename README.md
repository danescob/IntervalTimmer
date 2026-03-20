# Interval Timer

A lightweight browser-based interval timer with configurable work/rest cycles, countdown warnings, and audio cues.

## 🚀 Features

- Configurable countdown values:
  - Start delay (`startDelay`)
  - Interval time (`intervalTime`)
  - Interval warning time (`intervalWarning`)
  - Rest time (`restTime`)
  - Rest warning time (`restWarning`)
  - Number of intervals (`intervalCount`)
- Start / Pause / Stop controls
- Save settings to `localStorage` (via Save button)
- Visual phase states (Ready, Work, Rest, Warning, Finished)
- Audio signals for transitions, warnings, and completion
- Wake Lock support (keeps screen awake while timer runs)

## 🧩 Files

- `index.html` - UI structure
- `assets/styles.css` - styling for the timer and UI
- `assets/script.js` - timer logic, state management, local audio playback
- `assets/sounds/` - `.ogg` timer cues

## ▶️ Running locally

1. Open `index.html` in a web browser (double-click file or host with static server).
2. Set the values in the options panel.
3. Click `Save` to persist settings locally.
4. Use `Start` / `Pause` / `Stop` controls.

## ⏱️ Valid input formats

- Time fields: `M:SS` (e.g., `0:15`, `3:30`, `10:00`)
- Interval count: positive integer (minimum `1`)

## 🛠️ Known behavior

- A warning tone is played when remaining seconds reach the configured warning time.
- No rest phase is added after the last interval.
- If a value is invalid (bad format or warning > phase duration), the timer won’t start and message shows in UI.

## 📝 Notes

- Audio uses local `.ogg` files and may require a user interaction before sound will work.
- Wake Lock is browser-dependent and may not be available everywhere.

## 🔊 Audio assets

- Timer cues use boxing-themed `CC0` sounds from BigSoundBank.
- Start: Boxing bell #1
- Warning: Punch #7
- Rest: Punch #6
- Transition: Punch #6
- Finish: Boxing bell #2
- Source: https://bigsoundbank.com/boxing-bell-1-s1926.html
- Source: https://bigsoundbank.com/boxing-bell-2-s1927.html
- Source: https://bigsoundbank.com/punch-6-s2461.html
- Source: https://bigsoundbank.com/punch-7-s2462.html

## 🧪 Basic technical flow

1. `loadSettings` from `localStorage` or default settings.
2. `startTimer` validates form data and builds phase list via `buildPhases`.
3. `tick` updates timer each second with warnings and phase advancement.
4. `stopTimer` resets the timer and UI.

## 📌 Author
Built in the `IntervalTimmer` workspace sample by Neverbit.
