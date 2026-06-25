// Per-sample signal processing pipeline
//
// Called once for every parsed sample from packet-parser.js.
// The pipeline in order:
//
//   1. Dropped-packet detection  — compares sample counter to expected value
//   2. ADC normalization         — rawADC → float in [-1, +1]  (via packet-parser.js)
//   3. Signal Quality Index      — EMA of pre-filter power; detects flat-line / no electrodes
//   4. Flat-line reset           — recalibrates all filters if signal was absent > 500 ms
//   5. DC filter (optional)      — high-pass 0.5 Hz, removes baseline wander
//   6. Notch filter              — band-stop 48-52 Hz, removes powerline interference
//   7. ECG low-pass filter       — 30 Hz cutoff, smooths noise above QRS band
//   8. Pan-Tompkins detector     — R-peak detection; stores flag in peakFlags[]
//   9. Recording                 — appends filtered sample if recording is active

function processSample(dataView) {
  if (dataView.byteLength !== connection.singleSampleLen) return;
  connection._samplesThisSecond++;

  // ── 1. Dropped-packet detection ──────────────────────────────────────────
  const sampleCounter = dataView.getUint8(0);
  if (connection.prevSampleCounter === null) {
    connection.prevSampleCounter = sampleCounter;
  } else {
    const expected = (connection.prevSampleCounter + 1) % 256;
    if (sampleCounter !== expected) {
      const skipped = (sampleCounter - expected + 256) % 256;
      connection.droppedSamples += skipped;
      console.log(`Samples lost: ${connection.droppedSamples}`);
    }
    connection.prevSampleCounter = sampleCounter;
  }

  // ── 2. ADC normalization ─────────────────────────────────────────────────
  const writePos = connection.sampleIndex;
  connection.peakFlags[writePos] = 0; // clear stale peak flag for this slot

  const rawCh0 = dataView.getInt16(1, false); // big-endian
  let normCh0  = normalizeSample(Math.max(0, Math.min(4096, rawCh0)));

  // ── 3. Signal Quality Index (SQI) ────────────────────────────────────────
  // EMA of pre-filter signal power; drops to ~0 when electrodes are off or flatlined.
  const wasGood = connection.signalGood;
  connection._sqiPower = 0.999 * connection._sqiPower + 0.001 * normCh0 * normCh0;
  connection.signalGood = connection._sqiPower > SQI_FLAT_THRESHOLD;

  // ── 4. Flat-line reset ───────────────────────────────────────────────────
  // If signal was absent for > 500 ms (250 samples) and has just returned,
  // recalibrate all filters and the detector from scratch so the learning
  // phase re-runs cleanly instead of inheriting a corrupted state.
  if (!connection.signalGood) {
    if (connection._flatlineSamples < 65535) connection._flatlineSamples++;
  } else {
    if (!wasGood && connection._flatlineSamples > 250) {
      connection.panTompkins.reset();
      connection.notch0.reset();
      connection.ecg0.reset();
      connection.dc0.reset();
      connection.sampleIndex = 0;
      connection.dataCh0.fill(0);
      connection.peakFlags.fill(0);
    }
    connection._flatlineSamples = 0;
  }

  // ── 5-7. Filter chain ────────────────────────────────────────────────────
  if (connection.dcEnabled) normCh0 = connection.dc0.process(normCh0);
  normCh0 = connection.ecg0.process(connection.notch0.process(normCh0));

  connection.dataCh0[writePos] = normCh0;
  connection.sampleIndex = (connection.sampleIndex + 1) % NUM_POINTS;

  // ── 8. Pan-Tompkins R-peak detection ─────────────────────────────────────
  const rTime = connection.panTompkins.process(normCh0);

  // RR-interval coefficient of variation distinguishes real ECG (regular
  // intervals, CV < 0.15) from floating-wire noise that triggers the detector
  // on random spikes (CV > 0.30). Returns "bad" until ≥ 4 intervals are seen.
  connection.signalRegular = connection.panTompkins._rrCV() < RR_CV_THRESHOLD;

  if (rTime !== null && connection.signalGood && connection.signalRegular) {
    connection.peakFlags[rTime % NUM_POINTS] = 1;
    triggerHeartbeat(); // defined in button-ui.js
  }
  connection.absN++;

  // ── 9. Recording ─────────────────────────────────────────────────────────
  if (connection.isRecording) {
    connection.recordingData.push([sampleCounter, normCh0]);
    connection.totalRecordedSamples++;

    if (connection.recordingData.length >= 500) {
      flushRecordingData(); // defined in recording.js
    }

    if (connection.recordingDurationLimit !== null) {
      const elapsed = Date.now() - connection.recordingStartTime;
      if (elapsed >= connection.recordingDurationLimit) {
        stopRecording(); // defined in recording.js
      }
    }
  }
}

// Compute the current BPM from the Pan-Tompkins detector.
// Returns a number in [40, 120] if the signal is valid, or null.
function computeBPM() {
  if (!connection || !connection.signalRegular) return null;
  const bpm = connection.panTompkins.bpm;
  return (bpm >= 40 && bpm <= 120) ? bpm : null;
}
