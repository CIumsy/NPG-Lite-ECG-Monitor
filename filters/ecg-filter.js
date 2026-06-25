// Low-Pass Butterworth IIR digital filter
// Sampling rate : 500 Hz
// Cutoff        : 30 Hz  (removes high-frequency noise above QRS band)
// Order         : 2  (single second-order section / biquad)
//
// Coefficients generated with SciPy butter() + BioAmp Filter Designer:
//   https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.butter.html
//   https://github.com/upsidedownlabs/BioAmp-Filter-Designer

class ECGFilter {
  constructor() {
    this.z1 = 0;
    this.z2 = 0;
  }

  process(input) {
    let output = input;
    this.x1 = output - (-1.47548044 * this.z1) - (0.58691951 * this.z2);
    output   = 0.02785977 * this.x1 + (0.05571953 * this.z1) + (0.02785977 * this.z2);
    this.z2  = this.z1;
    this.z1  = this.x1;
    return output;
  }

  reset() {
    this.z1 = 0;
    this.z2 = 0;
  }
}
