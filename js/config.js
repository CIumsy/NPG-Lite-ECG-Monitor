// BLE UUIDs (from the firmware)
const SERVICE_UUID      = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const DATA_CHAR_UUID    = "beb5483e-36e1-4688-b7f5-ea07361b26a8";
const CONTROL_CHAR_UUID = "0000ff01-0000-1000-8000-00805f9b34fb";

// 10 samples per BLE notification; 3CH = 70 bytes/block, 6CH = 130 bytes/block
const BLOCK_COUNT = 10;    // must match firmware

// display
const NUM_POINTS  = 2000;  // 4 seconds @ 500 Hz
const SAMPLE_RATE = 500;   // must match firmware

// EMA power below SQI_FLAT_THRESHOLD = flat-line; RR CV above RR_CV_THRESHOLD = noise
const SQI_FLAT_THRESHOLD = 1e-4;
const RR_CV_THRESHOLD = 0.25;

// minimum recording length before stop is allowed; shorter ones are discarded
const MIN_RECORDING_MS = 12000;
