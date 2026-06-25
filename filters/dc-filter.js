// High-Pass (DC-Removal) Butterworth IIR digital filter
// Sampling rate : 500 Hz
// Cutoff        : 0.5 Hz  (removes baseline wander and DC offset)
// Order         : 2  (single second-order section / biquad)
// Toggleable    : user can disable via the DC-filter button in the UI
//
// Coefficients generated with SciPy butter() + BioAmp Filter Designer:
//   https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.butter.html
//   https://github.com/upsidedownlabs/BioAmp-Filter-Designer

class DCFilter {
  constructor() {
    this.z1_0 = 0.0;
    this.z2_0 = 0.0;
  }

  process(input) {
    let output = input;
    const x0   = output - (-1.99111429 * this.z1_0) - (0.99115360 * this.z2_0);
    output      = 0.99556697 * x0 + (-1.99113394 * this.z1_0) + (0.99556697 * this.z2_0);
    this.z2_0   = this.z1_0;
    this.z1_0   = x0;
    return output;
  }

  reset() {
    this.z1_0 = 0.0;
    this.z2_0 = 0.0;
  }
}
