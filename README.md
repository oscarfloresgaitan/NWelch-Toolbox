# NWelch-Toolbox

An interactive frequency-domain analysis tool and visualization interface for the [`NWelch`](https://github.com/sdrastro/NWelch) library (Dodson-Robinson et al., 2022). The toolbox packages the group's time series methods into a local web application for investigating spectral window functions, 1D Welch PSD and bivariate coherence, adaptive seasonal segmentation, and 2D dual-frequency autocoherence and cross-coherence matrices.

A hosted public web version is currently in development. Instructions below detail how to run the workbench locally.

---

## Quick Start

```bash
git clone https://github.com/oscarfloresgaitan/NWelch-Toolbox.git
cd NWelch-Toolbox

python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

python3 run_app.py
```

The application runs locally at `http://localhost:8050` with no external build tools or JavaScript package managers.

---

## Key Views & Capabilities

- **Time Series & Diagnostics**: Activity proxy timelines, cadence histograms, native NWelch spectral window function $W(f)$, and Lomb-Scargle periodograms.
- **1D Welch PSD & Adaptive Segmentation**: Time-clustered seasonal segmentation with 100% data preservation (zero trimming), overlaid Welch PSDs, and 1D bivariate coherence $z(f)$.
- **2D Dual-Frequency Coherence**: Autocoherence and cross-coherence heatmaps $\Gamma(f_1, f_2)$ with empirical 2D False Alarm Level (FAL) contours, real-time directional slicing (horizontal and anti-diagonal beat spectra), and automated node peak detection.
- **Multi-Campaign Comparison**: Side-by-side heatmaps, differential delta matrices ($\Delta z = z_B - z_A$), linked cross-campaign 1D slices with rotation presets, and independent 1D Welch coherence panels.

---

## Roadmap

- Parametric red-noise false alarm thresholds for univariate and bivariate data via Whittle's approximation to the likelihood.
- Precomputed Monte Carlo red-noise surrogate libraries.
- Curated stellar benchmark sample library (Barnard's Star, Proxima Centauri, active K-dwarfs).
- Standalone `DualFrequency.py` integration into upstream `sdrastro/NWelch`.

---

## References & Attribution

If you use this software in your research, please cite:

1. **NWelch Library & Methodology**:
   - Dodson-Robinson, S. E.; Ramirez Delgado, V.; Harrell, J.; Haley, C. L. 2022, [Magnitude-squared Coherence: A Powerful Tool for Disentangling Doppler Planet Discoveries from Stellar Activity](https://ui.adsabs.harvard.edu/abs/2022AJ....163..169D/abstract), *Astronomical Journal*, Volume 163, Issue 4, id.169.
   - Ejaz, A.; Dodson-Robinson, S.; Haley, C. 2026, [Red Noise–based False Alarm Thresholds for Astrophysical Periodograms via Whittle’s Approximation to the Likelihood](https://doi.org/10.3847/1538-3881/ae2fe4), *Astronomical Journal*, Volume 171, Issue 3, id.124.
   - Ramirez Delgado, V.; Caicedo Vivas, J. S.; Dodson-Robinson, S.; Haley, C. 2025, [The Rayleigh Criterion: Resolution Limits of Astronomical Periodograms](https://doi.org/10.1088/1538-3873/adffed), *Publications of the Astronomical Society of the Pacific*, Volume 137, Number 9, id.094503.

2. **Dual-Frequency Methodology**:
   - Flores Gaitán, O. A., & Dodson-Robinson, S. (in prep). *Detecting Harmonic Coupling in Stellar Activity using Dual-Frequency Autocoherence*.

---

## Contact & Authors

- **Oscar A. Flores Gaitán**: [ofg@udel.edu](mailto:ofg@udel.edu) | [Website](https://oscarfloresgaitan.github.io/)
- **Sally Dodson-Robinson**: [sdr@udel.edu](mailto:sdr@udel.edu) | [Website](https://sdrastro.github.io/personal-webpage/)

