// ── BLE UUIDs ──────────────────────────────────────────────────────────────
const SERVICE_UUID      = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const DATA_CHAR_UUID    = "beb5483e-36e1-4688-b7f5-ea07361b26a8";
const CONTROL_CHAR_UUID = "0000ff01-0000-1000-8000-00805f9b34fb";

// ── Packet format ───────────────────────────────────────────────────────────
// Each BLE notification carries BLOCK_COUNT samples bundled together.
// 3CH device: 1-byte counter + 3×2-byte channels = 7 bytes/sample → 70 bytes/block
// 6CH device: 1-byte counter + 6×2-byte channels = 13 bytes/sample → 130 bytes/block
const BLOCK_COUNT = 10;

// ── Display & sampling ──────────────────────────────────────────────────────
const NUM_POINTS  = 2000;  // circular buffer length = 4 seconds @ 500 Hz
const SAMPLE_RATE = 500;   // Hz — must match firmware

// ── Signal quality thresholds ───────────────────────────────────────────────
// EMA power below SQI_FLAT_THRESHOLD → electrodes off / flat-line
const SQI_FLAT_THRESHOLD = 1e-4;
// RR-interval coefficient of variation above RR_CV_THRESHOLD → noise, not ECG
const RR_CV_THRESHOLD = 0.25;

// ── Recording ───────────────────────────────────────────────────────────────
// Minimum recording length before stop is allowed; shorter recordings are discarded
const MIN_RECORDING_MS = 12000;
