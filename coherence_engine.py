#!/usr/bin/env python3
"""
coherence_engine.py

Core analytical and numerical engine for Dual-Frequency Coherence Analysis.
Supports:
1. Welch bivariate cross-coherence and univariate autocoherence (NWelch + DualFrequency)
2. Fisher z(f1, f2) transformation: z = sqrt(2*Neff - 2) * atanh(sqrt(coh))
3. Analytical FAPs & Empirical Red-Noise Monte Carlo surrogates
4. Ramirez Delgado (2025/2026) 2R bandwidth calculations (R = 1/T_seg, 2R = 2/T_seg)
5. Dynamic 1D slice extractions: Horizontal Cut, Anti-Diagonal Beat Cut, Diagonal Cut
6. High-resolution publication-quality composite figure rendering adhering to 2R standard
"""

import os
os.environ['MPLCONFIGDIR'] = '/tmp/mpl_cache'
os.makedirs('/tmp/mpl_cache', exist_ok=True)
import sys
import time
import csv
import numpy as np
from scipy.interpolate import RegularGridInterpolator
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle, Circle, FancyBboxPatch
from matplotlib.lines import Line2D

APP_DIR = os.path.dirname(os.path.abspath(__file__))
if APP_DIR not in sys.path:
    sys.path.insert(0, APP_DIR)

from NWelch.TimeSeries import TimeSeries
from NWelch.Bivariate import Bivariate
from DualFrequency import dual_frequency

def ztrans(coh, neff):
    """Fisher z-transformation for magnitude-squared coherence."""
    coh_safe = np.clip(coh, 0.0, 0.999999)
    return np.sqrt(2.0 * neff - 2.0) * np.arctanh(np.sqrt(coh_safe))

def cthresh(alpha, neff):
    """Analytical coherence threshold for false alarm probability alpha."""
    return 1.0 - alpha**(1.0 / (neff - 1.0))

def make_segments(n_pts, L_pts, overlap=0.5, t=None, gap_threshold=30.0):
    """
    Generates segment indices [start, end] with specified fractional overlap.
    If timestamps t are provided and contain gaps > gap_threshold, partitions
    within each contiguous campaign (0% overlap across gaps, specified overlap within campaigns).
    100% data preservation is strictly maintained.
    """
    if t is not None and len(t) == n_pts:
        dt = np.diff(t)
        gap_indices = np.where(dt > gap_threshold)[0] + 1
        if len(gap_indices) > 0:
            campaign_splits = np.split(np.arange(n_pts), gap_indices)
            segs = []
            step = max(1, int(L_pts * (1.0 - overlap)))
            for camp in campaign_splits:
                if len(camp) < 10:
                    continue
                c_start = int(camp[0])
                c_end = int(camp[-1] + 1)
                n_c = len(camp)
                if n_c <= L_pts:
                    segs.append([c_start, c_end])
                else:
                    st = c_start
                    while st + L_pts <= c_end:
                        segs.append([st, st + L_pts])
                        st += step
                    # Absorb remaining edge points into final segment of campaign (zero trimming)
                    if segs and segs[-1][1] < c_end:
                        segs[-1][1] = c_end
            if len(segs) >= 2:
                return np.array(segs, dtype=int)

    # Standard contiguous sliding window
    step = max(1, int(L_pts * (1.0 - overlap)))
    segs = []
    start = 0
    while start + L_pts <= n_pts:
        segs.append([start, start + L_pts])
        start += step
    # Rule 1: absorb leftover edge points into final segment (100% data preservation)
    if segs and segs[-1][1] < n_pts:
        segs[-1][1] = n_pts
    return np.array(segs, dtype=int)

def generate_car1_red_noise_surrogate(t, y):
    """
    Continuous-time CAR(1) (Ornstein-Uhlenbeck) surrogate generator for arbitrary,
    non-uniformly sampled time series with observing gaps and seasonal dropouts.
    Preserves exact observation timestamps, median autocorrelation persistence time tau,
    and variance.
    """
    t = np.asarray(t, dtype=float)
    y = np.asarray(y, dtype=float)
    n = len(y)
    if n < 5:
        return y.copy()
        
    # 1. Linear detrending
    p = np.polyfit(t, y, 1)
    trend = np.polyval(p, t)
    y_detr = y - trend
    y_mean = float(np.mean(y_detr))
    y_std = float(np.std(y_detr))
    if y_std < 1e-12:
        return y.copy()
        
    # 2. Estimate sampling intervals & persistence timescale
    dt = np.diff(t)
    dt_pos = dt[dt > 0]
    dt_med = float(np.median(dt_pos)) if len(dt_pos) > 0 else 1.0
    
    # Lag-1 correlation of consecutive observations
    cov1 = float(np.mean((y_detr[:-1] - y_mean) * (y_detr[1:] - y_mean)))
    r1 = float(np.clip(cov1 / (y_std**2 + 1e-12), 0.05, 0.99))
    
    # Persistence timescale tau: r1 = exp(-dt_med / tau) => tau = -dt_med / ln(r1)
    tau = -dt_med / np.log(r1)
    
    # 3. Non-uniform conditional correlation and noise standard deviation
    rho = np.exp(-dt / tau)
    sigma_cond = y_std * np.sqrt(np.maximum(0.0, 1.0 - rho**2))
    
    # 4. Exact discrete simulation of continuous-time CAR(1)
    sim = np.zeros(n)
    sim[0] = np.random.normal(0.0, y_std)
    eps = np.random.normal(0.0, 1.0, n)
    for i in range(1, n):
        sim[i] = sim[i - 1] * rho[i - 1] + sigma_cond[i - 1] * eps[i]
        
    # 5. Renormalize to exact observed variance and restore linear trend
    sim_norm = (sim - np.mean(sim)) / (np.std(sim) + 1e-12) * y_std
    return sim_norm + trend + y_mean

def generate_red_noise_surrogate(t, y):
    """Wrapper calling the continuous-time CAR(1) non-uniform red-noise simulator."""
    return generate_car1_red_noise_surrogate(t, y)

def compute_dual_coherence(data_dict, mode='auto', L_pts=200, overlap=0.5, taper='KaiserBessel',
                           fmin=0.0, fmax=0.10, fap_type='analytical', n_mc=50,
                           custom_segments=None, seg_source='uniform'):
    """
    Computes 2D dual autocoherence or cross-coherence matrix.
    Supports uniform sliding window L or user-defined / adaptive custom segments.
    """
    t = data_dict['time']
    s1 = data_dict['s1']
    s2 = data_dict['s2'] if mode == 'cross' and data_dict['s2'] is not None else s1
    n_pts = len(t)
    
    is_custom = custom_segments is not None and len(custom_segments) >= 2
    if is_custom:
        c_segs = []
        for s in custom_segments:
            if isinstance(s, dict):
                st_val = s.get('start_idx', s.get('start', 0))
                ed_val = s.get('end_idx', s.get('end', n_pts))
            else:
                st_val = s[0]
                ed_val = s[1]
            st = max(0, min(n_pts - 10, int(st_val)))
            ed = max(st + 10, min(n_pts, int(ed_val)))
            c_segs.append([st, ed])
        segs = np.array(c_segs, dtype=int)
        if len(segs) < 2:
            raise ValueError("Custom segments must contain at least 2 valid segments.")
        seg_durations = [t[s[1] - 1] - t[s[0]] for s in segs]
        t_seg = float(np.mean(seg_durations)) if seg_durations else float(L_pts) * (data_dict.get('cadence') or 1.0)
        df_rayleigh = 1.0 / t_seg if t_seg > 0 else 0.01
        bw_2R = 2.0 * df_rayleigh
        L_pts = int(round(np.mean([s[1] - s[0] for s in segs])))
    else:
        if L_pts > n_pts:
            L_pts = max(30, n_pts // 2)
        segs = make_segments(n_pts, L_pts, overlap=overlap, t=t, gap_threshold=30.0)
        if len(segs) < 2:
            raise ValueError(f"Dataset length ({n_pts}) with segment length ({L_pts}) produces only {len(segs)} segment(s). Minimum 2 required.")
        cadence = data_dict['cadence'] if data_dict['cadence'] > 0 else 1.0
        t_seg = float(L_pts) * cadence
        df_rayleigh = 1.0 / t_seg
        bw_2R = 2.0 * df_rayleigh

    window_choice = 'KaiserBessel' if taper in ['KaiserBessel', 'kaiser'] else 'None'
    nyquist_lim = max(0.5, float(fmax) * 1.5)
    
    if mode == 'cross' and s2 is not s1:
        biv = Bivariate(t, s1, s2, display_frequency_info=False)
        biv.segment_data(segs, nyquist_lim, oversample=4, window=window_choice, quiet=True, plot_windows=False)
        biv.Welch_coherence_powspec()
        coh_matrix, sub_freq = dual_frequency(biv, fmin=fmin, fmax=fmax)
        neff = float(biv.Nseg_eff)
    else:
        ts = TimeSeries(t, s1, display_frequency_info=False)
        ts.segment_data(segs, nyquist_lim, oversample=4, window=window_choice, quiet=True, plot_windows=False)
        ts.Welch_powspec(norm=True)
        coh_matrix, sub_freq = dual_frequency(ts, fmin=fmin, fmax=fmax)
        neff = float(ts.Nseg_eff)
        
    # Fisher z transformation
    z_matrix = ztrans(coh_matrix, neff)
    
    # FAPs
    if fap_type in ['montecarlo', 'rednoise']:
        # Run Non-Uniform Continuous-Time CAR(1) Red-Noise Monte Carlo surrogates
        max_z_surrogates = []
        for _ in range(int(n_mc)):
            surr1 = generate_red_noise_surrogate(t, s1)
            if mode == 'cross' and s2 is not s1:
                surr2 = generate_red_noise_surrogate(t, s2)
                b_s = Bivariate(t, surr1, surr2, display_frequency_info=False)
                b_s.segment_data(segs, nyquist_lim, oversample=4, window=window_choice, quiet=True, plot_windows=False)
                b_s.Welch_coherence_powspec()
                c_s, _ = dual_frequency(b_s, fmin=fmin, fmax=fmax)
                z_s = ztrans(c_s, float(b_s.Nseg_eff))
            else:
                t_s = TimeSeries(t, surr1, display_frequency_info=False)
                t_s.segment_data(segs, nyquist_lim, oversample=4, window=window_choice, quiet=True, plot_windows=False)
                t_s.Welch_powspec(norm=True)
                c_s, _ = dual_frequency(t_s, fmin=fmin, fmax=fmax)
                z_s = ztrans(c_s, float(t_s.Nseg_eff))
                
        # Off-diagonal maximum to avoid trivial self-correlation on diagonal in autocoherence
        fap01_an = float(ztrans(cthresh(0.001, neff), neff))
        fap1_an = float(ztrans(cthresh(0.01, neff), neff))
        fap5_an = float(ztrans(cthresh(0.05, neff), neff))

    # FAPs
    if fap_type in ['montecarlo', 'rednoise']:
        # Run Non-Uniform Continuous-Time CAR(1) Red-Noise Monte Carlo surrogates
        max_z_surrogates = []
        for _ in range(int(n_mc)):
            surr1 = generate_red_noise_surrogate(t, s1)
            if mode == 'cross' and s2 is not s1:
                surr2 = generate_red_noise_surrogate(t, s2)
                b_s = Bivariate(t, surr1, surr2, display_frequency_info=False)
                b_s.segment_data(segs, nyquist_lim, oversample=4, window=window_choice, quiet=True, plot_windows=False)
                b_s.Welch_coherence_powspec()
                c_s, _ = dual_frequency(b_s, fmin=fmin, fmax=fmax)
                z_s = ztrans(c_s, float(b_s.Nseg_eff))
            else:
                t_s = TimeSeries(t, surr1, display_frequency_info=False)
                t_s.segment_data(segs, nyquist_lim, oversample=4, window=window_choice, quiet=True, plot_windows=False)
                t_s.Welch_powspec(norm=True)
                c_s, _ = dual_frequency(t_s, fmin=fmin, fmax=fmax)
                z_s = ztrans(c_s, float(t_s.Nseg_eff))
                
            # Off-diagonal maximum to avoid trivial self-correlation on diagonal in autocoherence
            if mode == 'auto':
                np.fill_diagonal(z_s, 0.0)
            max_z_surrogates.append(np.percentile(z_s, [95.0, 99.0, 99.9]))
            
        surr_arr = np.array(max_z_surrogates)
        fap5_mc = float(np.mean(surr_arr[:, 0]))
        fap1_mc = float(np.mean(surr_arr[:, 1]))
        fap01_mc = float(np.mean(surr_arr[:, 2]))

        fap5 = fap5_mc
        fap1 = fap1_mc
        fap01 = fap01_mc
    else:
        # Analytical FAP transformed to Fisher z
        fap01_an = float(ztrans(cthresh(0.001, neff), neff))
        fap1_an = float(ztrans(cthresh(0.01, neff), neff))
        fap5_an = float(ztrans(cthresh(0.05, neff), neff))

        fap01 = fap01_an
        fap1 = fap1_an
        fap5 = fap5_an
        fap01_mc = None
        fap1_mc = None
        fap5_mc = None
        
    return {
        'f_grid': sub_freq.tolist(),
        'z_matrix': z_matrix.tolist(),
        'neff': neff,
        'n_eff': neff,
        'k_segs': len(segs),
        'k_segments': len(segs),
        'L_pts': L_pts,
        't_seg': t_seg,
        'df_rayleigh': df_rayleigh,
        'bw_2R': bw_2R,
        'two_r': bw_2R,
        'p_rot': data_dict['p_rot'],
        'fap_type': fap_type,
        'fap01': fap01,
        'fap1': fap1,
        'fap5': fap5,
        'fap01_analytical': fap01_an,
        'fap1_analytical': fap1_an,
        'fap5_analytical': fap5_an,
        'fap01_mc': fap01_mc,
        'fap1_mc': fap1_mc,
        'fap5_mc': fap5_mc,
        'n_eff': neff,
        'k_segs': len(segs),
        'k_segments': len(segs),
        'L_pts': L_pts,
        't_seg': t_seg,
        'df_rayleigh': df_rayleigh,
        'bw_2R': bw_2R,
        'two_r': bw_2R,
        'p_rot': data_dict['p_rot'],
        'fap_type': fap_type,
        'fap01': fap01,
        'fap1': fap1,
        'fap5': fap5,
        'mode': mode,
        'taper': taper,
        's1_label': data_dict['s1_label'],
        's2_label': data_dict['s2_label'] if mode == 'cross' else data_dict['s1_label'],
        'dataset_name': data_dict.get('dataset_name', 'Solar Spectroscopic Observations'),
        'dataset_key': data_dict.get('dataset_key', 'dataset'),
        'n_pts': data_dict.get('n_pts', len(t)),
        't_span': data_dict.get('t_span', float(t[-1] - t[0])),
        'cadence': data_dict.get('cadence', float(np.median(np.diff(t)))),
        'overlap': overlap,
        'n_mc': n_mc if fap_type == 'montecarlo' else None,
        'segments': segs.tolist(),
        'seg_source': seg_source,
        'is_custom_segments': is_custom
    }

def classify_peak_node(f1, f2, p_rot, bw_2r):
    f_rot = 1.0 / p_rot
    delta_f = abs(f1 - f2)
    tol = max(bw_2r, 0.003)

    # 1. Diagonal check
    if delta_f <= tol * 0.5:
        for k, name in [(1, f"Fundamental (P ≈ {p_rot:.1f} d)"),
                        (2, f"First Harmonic (P ≈ {p_rot/2.0:.1f} d)"),
                        (3, f"Second Harmonic (P ≈ {p_rot/3.0:.1f} d)"),
                        (4, f"Third Harmonic (P ≈ {p_rot/4.0:.1f} d)")]:
            if abs(f1 - k * f_rot) <= tol:
                return f"Diagonal {name}"
        return "Diagonal Autocoherence Peak"

    # 2. Harmonic cross-coupling (m*f_rot x n*f_rot)
    k1, k2 = None, None
    for k in [1, 2, 3, 4]:
        if abs(f1 - k * f_rot) <= tol:
            k1 = k
        if abs(f2 - k * f_rot) <= tol:
            k2 = k
    if k1 is not None and k2 is not None and k1 != k2:
        return f"Harmonic Coupling ({k1}f_rot × {k2}f_rot)"

    # 3. Observational sampling aliases
    f_yr = 1.0 / 365.25
    f_6mo = 2.0 / 365.25
    f_mo = 1.0 / 29.53
    if abs(delta_f - f_yr) <= tol * 0.6:
        return "1-Year Annual Alias Beat (Δf ≈ 0.0027 d⁻¹)"
    if abs(delta_f - f_6mo) <= tol * 0.6:
        return "6-Month Seasonal Alias Beat (Δf ≈ 0.0055 d⁻¹)"
    if abs(delta_f - f_mo) <= tol * 0.6:
        return "1-Month Lunar Synodic Alias Beat (Δf ≈ 0.0339 d⁻¹)"

    for k in [1, 2, 3]:
        if abs(delta_f - k * f_rot) <= tol * 0.6:
            return f"Rotation Sub-Harmonic Beat (Δf = {k}f_rot)"

    return "Cross-Frequency Activity Node"

def detect_dual_coherence_peaks(z_mat_np, f_grid_np, p_rot, bw_2R, faps, min_fap='fap5', max_peaks=60):
    """
    Scans the 2D dual-coherence matrix for local maxima in the upper triangle (f1 >= f2).
    Clusters pixels within Ramirez Delgado 2R bandwidth to prevent duplicate detections.
    Classifies nodes against rotation harmonics and observational aliases.
    """
    from scipy.ndimage import maximum_filter
    n = len(f_grid_np)
    if n < 5:
        return []

    df = float(f_grid_np[1] - f_grid_np[0])
    pix_radius = max(2, int(np.round((bw_2R / 2.0) / df)))
    size = 2 * pix_radius + 1

    local_max = (maximum_filter(z_mat_np, size=size) == z_mat_np)
    mask_upper = np.triu(np.ones_like(z_mat_np, dtype=bool))
    
    thresh = float(faps.get(min_fap, faps.get('fap5', 1.0)))
    peaks_mask = local_max & mask_upper & (z_mat_np >= thresh)

    y_idxs, x_idxs = np.where(peaks_mask)
    raw_peaks = []
    for y_idx, x_idx in zip(y_idxs, x_idxs):
        f2 = float(f_grid_np[y_idx])
        f1 = float(f_grid_np[x_idx])
        if f1 <= 0 or f2 <= 0:
            continue
        z_val = float(z_mat_np[y_idx, x_idx])
        delta_f = float(abs(f1 - f2))
        # Exclude diagonal autocoherence peaks as they don't represent cross-coupling
        if delta_f < bw_2R * 0.75:
            continue
        tag = classify_peak_node(f1, f2, p_rot, bw_2R)
        
        raw_peaks.append({
            'f1': round(f1, 5),
            'f2': round(f2, 5),
            'p1': round(1.0 / f1, 2) if f1 > 0 else 999.0,
            'p2': round(1.0 / f2, 2) if f2 > 0 else 999.0,
            'delta_f': round(delta_f, 5),
            'p_beat': round(1.0 / (2.0 * delta_f), 2) if delta_f > 1e-6 else 999.0,
            'z': round(z_val, 3),
            'sig': '0.1% FAP' if z_val >= faps.get('fap01', 999.0) else (
                '1.0% FAP' if z_val >= faps.get('fap1', 999.0) else '5.0% FAP'
            ),
            'sig_tier': 1 if z_val >= faps.get('fap01', 999.0) else (2 if z_val >= faps.get('fap1', 999.0) else 3),
            'classification': tag
        })

    # Greedy 2R resolution cell clustering (keep top local maximum within each beam)
    raw_peaks.sort(key=lambda p: p['z'], reverse=True)
    clustered_peaks = []
    cluster_radius = max(0.002, bw_2R * 0.85)
    for p in raw_peaks:
        is_dup = False
        for kp in clustered_peaks:
            if np.hypot(p['f1'] - kp['f1'], p['f2'] - kp['f2']) <= cluster_radius:
                is_dup = True
                break
        if not is_dup:
            clustered_peaks.append(p)
        if len(clustered_peaks) >= max_peaks:
            break

    return clustered_peaks

def extract_slices(z_mat_np, f_grid_np, f1_sel, f2_sel, p_rot, bw_2R, df_rayleigh, faps, horizontal_targets=None):
    """
    Extracts 1D slices from 2D z-matrix:
    1. Horizontal Cuts: z(f1 | f2 = target) for fundamental f_rot, first harmonic 2*f_rot, and custom frequencies
    2. Anti-Diagonal Beat Cut: along f1 + f2 = 2*f_mid
    3. Diagonal Cut: z(f, f)
    """
    f_min = float(f_grid_np[0])
    f_max = float(f_grid_np[-1])
    f_rot = 1.0 / p_rot
    interp = RegularGridInterpolator((f_grid_np, f_grid_np), z_mat_np, bounds_error=False, fill_value=0.0)
    
    n_dense = 400
    f1_dense = np.linspace(f_min, f_max, n_dense)
    
    # 1. Multi-Target Horizontal Cuts
    default_colors = ['#00E5FF', '#FF2D55', '#FF9500', '#AF52DE', '#30D158', '#FFCC00', '#5E5CE6']
    parsed_cuts = []
    if horizontal_targets is not None and len(horizontal_targets) > 0:
        for idx, t in enumerate(horizontal_targets):
            if isinstance(t, dict):
                f_val = float(t.get('f2', t.get('frequency', f_rot)))
                cid = t.get('id', f"cut_{idx}")
                lbl = t.get('label', f"f₂ = {f_val:.4f} d⁻¹")
                col = t.get('color', default_colors[idx % len(default_colors)])
                is_def = bool(t.get('is_default', False))
            else:
                f_val = float(t)
                cid = f"cut_{idx}"
                lbl = f"f₂ = {f_val:.4f} d⁻¹"
                col = default_colors[idx % len(default_colors)]
                is_def = False
            parsed_cuts.append({'id': cid, 'f2': f_val, 'label': lbl, 'color': col, 'is_default': is_def})
    else:
        # Defaults: fundamental and first harmonic
        parsed_cuts = [
            {'id': 'f_rot', 'f2': f_rot, 'label': f"Fundamental f_rot ({p_rot:.2f} d)", 'color': '#00E5FF', 'is_default': True},
            {'id': '2f_rot', 'f2': 2.0 * f_rot, 'label': f"First Harmonic 2f_rot ({p_rot/2.0:.2f} d)", 'color': '#FF2D55', 'is_default': True}
        ]

    horizontal_cuts_list = []
    for c in parsed_cuts:
        f2_val = c['f2']
        pts_c = np.column_stack([f1_dense, np.full_like(f1_dense, f2_val)])
        z_c = interp(pts_c)
        idx_pk = int(np.argmax(z_c))
        pk_f1 = float(f1_dense[idx_pk])
        pk_z = float(z_c[idx_pk])
        pk_p1 = float(1.0 / pk_f1) if pk_f1 > 0 else 999.0
        horizontal_cuts_list.append({
            'id': c['id'],
            'label': c['label'],
            'f2': f2_val,
            'p2': float(1.0 / f2_val) if f2_val > 0 else 999.0,
            'f1': f1_dense.tolist(),
            'period1': [float(1.0 / f) if f > 0 else 999.0 for f in f1_dense],
            'z': z_c.tolist(),
            'peak_f1': pk_f1,
            'peak_p1': pk_p1,
            'peak_z': pk_z,
            'color': c['color'],
            'is_default': c.get('is_default', False),
            'active': True
        })

    # Active Cursor Horizontal Cut (z(f1 | f2 = f2_sel))
    pts_h = np.column_stack([f1_dense, np.full_like(f1_dense, f2_sel)])
    z_h = interp(pts_h)
    idx_peak_h = int(np.argmax(z_h))
    f_peak_h = float(f1_dense[idx_peak_h])
    z_peak_h = float(z_h[idx_peak_h])
    p_peak_h = float(1.0 / f_peak_h) if f_peak_h > 0 else 999.0
    
    # 2. Anti-Diagonal Beat Cut (f1 + f2 = 2 * f_mid)
    f_mid = (f1_sel + f2_sel) / 2.0
    f1_ad_min = max(f_min, 2.0 * f_mid - f_max)
    f1_ad_max = min(f_max, 2.0 * f_mid - f_min)
    
    if f1_ad_max > f1_ad_min:
        f1_ad = np.linspace(f1_ad_min, f1_ad_max, n_dense)
        f2_ad = 2.0 * f_mid - f1_ad
        pts_ad = np.column_stack([f1_ad, f2_ad])
        z_ad = interp(pts_ad)
        
        delta_f_ad = f1_ad - f_mid
        f_beat_ad = 2.0 * np.abs(delta_f_ad)
        with np.errstate(divide='ignore'):
            p_beat_ad = np.where(f_beat_ad > 1e-6, 1.0 / f_beat_ad, 999.0)
    else:
        f1_ad = np.array([f_mid])
        f2_ad = np.array([f_mid])
        z_ad = np.array([float(interp([[f_mid, f_mid]])[0])])
        delta_f_ad = np.array([0.0])
        f_beat_ad = np.array([0.0])
        p_beat_ad = np.array([999.0])
        
    carrier_freq = float(f_mid)
    carrier_period = float(1.0 / carrier_freq) if carrier_freq > 0 else 999.0
    beat_freq = float(abs(f1_sel - f2_sel))
    beat_period = float(1.0 / beat_freq) if beat_freq > 1e-6 else 999.0
    pts_sel = np.array([[f1_sel, f2_sel]])
    z_at_sel = float(interp(pts_sel)[0])
    
    # 3. Diagonal Cut (f1 = f2)
    pts_diag = np.column_stack([f1_dense, f1_dense])
    z_diag = interp(pts_diag)
    
    return {
        'horizontal_cuts': horizontal_cuts_list,
        'horizontal': {
            'f1': f1_dense.tolist(),
            'period1': [float(1.0 / f) if f > 0 else 999.0 for f in f1_dense],
            'z': z_h.tolist(),
            'f2_fixed': float(f2_sel),
            'peak_f1': f_peak_h,
            'peak_p1': p_peak_h,
            'peak_z': z_peak_h
        },
        'antidiagonal': {
            'f1': f1_ad.tolist(),
            'f2': f2_ad.tolist(),
            'delta_f': delta_f_ad.tolist(),
            'f_beat': f_beat_ad.tolist(),
            'p_beat': p_beat_ad.tolist(),
            'z': z_ad.tolist(),
            'f_mid': carrier_freq,
            'p_mid': carrier_period,
            'f_beat_sel': beat_freq,
            'p_beat_sel': beat_period,
            'z_sel': z_at_sel
        },
        'diagonal': {
            'f': f1_dense.tolist(),
            'period': [float(1.0 / f) if f > 0 else 999.0 for f in f1_dense],
            'z': z_diag.tolist()
        },
        'metrics': {
            'f1_sel': float(f1_sel),
            'f2_sel': float(f2_sel),
            'f1': float(f1_sel),
            'f2': float(f2_sel),
            'p1_sel': float(1.0 / f1_sel) if f1_sel > 0 else 999.0,
            'p2_sel': float(1.0 / f2_sel) if f2_sel > 0 else 999.0,
            'p1': float(1.0 / f1_sel) if f1_sel > 0 else 999.0,
            'p2': float(1.0 / f2_sel) if f2_sel > 0 else 999.0,
            'carrier_freq': carrier_freq,
            'carrier_period': carrier_period,
            'f_mid': carrier_freq,
            'p_mid': carrier_period,
            'beat_freq': beat_freq,
            'beat_period': beat_period,
            'p_beat': beat_period,
            'delta_f': beat_freq / 2.0,
            'z_at_sel': z_at_sel,
            'z_measured': z_at_sel,
            'significance': 'Significant (> 0.1% FAP)' if z_at_sel >= faps.get('fap01', 999.0) else (
                'Significant (> 1.0% FAP)' if z_at_sel >= faps.get('fap1', 999.0) else (
                    'Marginal (> 5.0% FAP)' if z_at_sel >= faps.get('fap5', 999.0) else 'Noise Floor'
                )
            ),
            'fap01': faps['fap01'],
            'fap1': faps['fap1'],
            'fap5': faps['fap5'],
            'bw_2R': bw_2R,
            'two_r': bw_2R,
            'df_rayleigh': df_rayleigh
        }
    }

def export_publication_plot(coherence_res, slices_res, output_path, colormap='inferno', vmin=0.5, vmax=4.0,
                            n_harmonics=2, custom_periods=None, horiz_domain='freq', beat_domain='freq',
                            horiz_yscale='linear', beat_yscale='linear', zoom=None):
    """
    Renders and saves a 3-panel publication figure adhering strictly to project rules:
    - NO panel titles (per user instruction)
    - mathcal 2R nomenclature ($2\\mathcal{R}$)
    - Clean legend entries: 'Rotation ($2\\mathcal{R}$)' and 'Harmonic ($2\\mathcal{R}$)'
    - High-contrast carrier lines, 2R box & circle at active selection
    - Configurable harmonics and custom periodicities crosshairs
    - Synchronized zoom limits and domain representations matching the interactive screen view
    """
    f_grid = np.array(coherence_res['f_grid'])
    z_matrix = np.array(coherence_res['z_matrix'])
    neff = coherence_res['neff']
    bw_2R = coherence_res['bw_2R']
    df_rayleigh = coherence_res['df_rayleigh']
    p_rot = coherence_res['p_rot']
    f_rot = 1.0 / p_rot
    f_min = float(f_grid[0])
    f_max = float(f_grid[-1])
    
    # Extract zoom limits if active
    is_zoomed = False
    if zoom and zoom.get('is_zoomed', False):
        is_zoomed = True
        vis_f1_min = float(zoom.get('f1_min', f_min))
        vis_f1_max = float(zoom.get('f1_max', f_max))
        vis_f2_min = float(zoom.get('f2_min', f_min))
        vis_f2_max = float(zoom.get('f2_max', f_max))
    else:
        vis_f1_min = f_min
        vis_f1_max = f_max
        vis_f2_min = f_min
        vis_f2_max = f_max
    
    h_cut = slices_res['horizontal']
    ad_cut = slices_res['antidiagonal']
    metrics = slices_res['metrics']
    f1_sel = metrics['f1_sel']
    f2_sel = metrics['f2_sel']
    f_mid = metrics['carrier_freq']
    
    from matplotlib.colors import PowerNorm
    norm = PowerNorm(gamma=0.70, vmin=vmin, vmax=vmax)
    
    fig = plt.figure(figsize=(19, 10.8))

    # Right side: two stacked 1D slice plots
    ax_ad = fig.add_axes([0.58, 0.57, 0.39, 0.38])
    ax_h  = fig.add_axes([0.58, 0.08, 0.39, 0.38])

    # Left side: 2D Matrix
    ax_main = fig.add_axes([0.07, 0.36, 0.35, 0.592])
    
    # --------------------------------------------------------------------------
    # Panel 1: 2D Matrix
    # --------------------------------------------------------------------------
    ax_main.set_facecolor('black')
    im = ax_main.pcolormesh(f_grid, f_grid, z_matrix.T, cmap=colormap, norm=norm, shading='auto')
    
    # Main diagonal
    ax_main.plot([f_min, f_max], [f_min, f_max], color='#B0BEC5', ls='-', lw=1.2, alpha=0.85, label=r'Diagonal ($f_1 = f_2$)')
    
    # Rotation carrier lines up to n_harmonics
    dash_styles = ['--', ':', '-.', ':', '--']
    for k in range(1, int(n_harmonics) + 1):
        fk = k * f_rot
        if fk <= f_max:
            ls = dash_styles[(k - 1) % len(dash_styles)]
            ax_main.axvline(fk, color='#00E5FF', ls=ls, lw=1.1, alpha=0.90)
            ax_main.axhline(fk, color='#00E5FF', ls=ls, lw=1.1, alpha=0.90)
            
    # Custom periodicities crosshairs
    if custom_periods:
        for P in custom_periods:
            if P > 0:
                f_cust = 1.0 / P
                if f_min <= f_cust <= f_max:
                    ax_main.axvline(f_cust, color='#E040FB', ls='-.', lw=1.2, alpha=0.85)
                    ax_main.axhline(f_cust, color='#E040FB', ls='-.', lw=1.2, alpha=0.85)
    
    # Slice tracks: Horizontal corridor and Anti-diagonal beat line
    ax_main.axhline(f2_sel, color='#FF9100', ls='-', lw=1.4, alpha=0.95)
    f1_ad_track = np.array(ad_cut['f1'])
    f2_ad_track = np.array(ad_cut['f2'])
    ax_main.plot(f1_ad_track, f2_ad_track, color='#00E676', ls='--', lw=1.4, alpha=0.95)
    
    # 2R Box and Circle at selected coordinates
    box = Rectangle((f1_sel - df_rayleigh, f2_sel - df_rayleigh), 2.0 * df_rayleigh, 2.0 * df_rayleigh,
                    edgecolor='#00E5FF', facecolor='none', linestyle='-', linewidth=2.0, zorder=6)
    ax_main.add_patch(box)
    circle = Circle((f1_sel, f2_sel), radius=df_rayleigh,
                    edgecolor='#00E5FF', facecolor='none', linestyle=':', linewidth=1.6, zorder=6)
    ax_main.add_patch(circle)
    ax_main.scatter([f1_sel], [f2_sel], color='#00E5FF', edgecolor='black', s=55, zorder=7)

    # 2D FAL Contour Overlays (Analytical and/or Red-Noise MC)
    fap1_val = coherence_res.get('fap1')
    fap01_val = coherence_res.get('fap01')
    fap1_an = coherence_res.get('fap1_analytical')
    fap01_an = coherence_res.get('fap01_analytical')
    is_mc = coherence_res.get('fap_type') in ['montecarlo', 'rednoise']

    fal_items = []
    # If Red-Noise MC, also show Analytical comparison contours as fine dotted lines
    if is_mc and fap1_an is not None:
        fal_items.append((fap1_an, '#00E676', ':', 0.9))
    if is_mc and fap01_an is not None:
        fal_items.append((fap01_an, '#FF2D55', ':', 0.9))

    # Primary FAL contours (either Red-Noise MC or Analytical)
    if fap1_val is not None:
        fal_items.append((fap1_val, '#00E676', '--', 1.3))
    if fap01_val is not None:
        fal_items.append((fap01_val, '#FF2D55', '-.', 1.3))

    for lvl, col, ls, lw in fal_items:
        if np.nanmin(z_matrix) <= lvl <= np.nanmax(z_matrix):
            ax_main.contour(f_grid, f_grid, z_matrix.T, levels=[lvl], colors=[col],
                            linestyles=[ls], linewidths=[lw], alpha=0.90, zorder=5)
    
    ax_main.set_xlim(vis_f1_min, vis_f1_max)
    ax_main.set_ylim(vis_f2_min, vis_f2_max)
    ax_main.set_aspect('equal')
    ax_main.set_xlabel(r"Frequency $f_1$ (d$^{-1}$)", fontsize=11, weight='bold')
    ax_main.set_ylabel(r"Frequency $f_2$ (d$^{-1}$)", fontsize=11, weight='bold')
    
    legend_main = [
        Line2D([0], [0], color='#B0BEC5', ls='-', lw=1.2, label=r'Diagonal ($f_1 = f_2$)'),
        Line2D([0], [0], color='#00E5FF', ls='--', lw=1.2, label=r'Rotation ($2\mathcal{R}$)'),
        Line2D([0], [0], color='#00E5FF', ls=':', lw=1.2, label=r'Harmonic ($2\mathcal{R}$)'),
    ]
    fap_tag = ' (Red-Noise MC)' if is_mc else ''
    if is_mc and fap1_an is not None:
        legend_main.append(Line2D([0], [0], color='#00E676', ls=':', lw=1.1, label='1.0% FAL (Analytical)'))
    if is_mc and fap01_an is not None:
        legend_main.append(Line2D([0], [0], color='#FF2D55', ls=':', lw=1.1, label='0.1% FAL (Analytical)'))
    if fap1_val is not None:
        legend_main.append(Line2D([0], [0], color='#00E676', ls='--', lw=1.3, label=f'1.0% FAL{fap_tag}'))
    if fap01_val is not None:
        legend_main.append(Line2D([0], [0], color='#FF2D55', ls='-.', lw=1.3, label=f'0.1% FAL{fap_tag}'))
    if custom_periods and len(custom_periods) > 0:
        legend_main.append(Line2D([0], [0], color='#E040FB', ls='-.', lw=1.2, label=r'Custom Periodicity'))
    legend_main.extend([
        Line2D([0], [0], color='#FF9100', ls='-', lw=1.4, label=rf'Horiz Track ($f_2 = {f2_sel:.4f}$)'),
        Line2D([0], [0], color='#00E676', ls='--', lw=1.4, label=rf'Beat Track ($f_1 + f_2 = {2*f_mid:.4f}$)'),
        Line2D([0], [0], color='#00E5FF', ls='-', lw=2.0, label=r'Box ($2\mathcal{R}$)'),
        Line2D([0], [0], color='#00E5FF', ls=':', lw=1.6, label=r'Circle ($2\mathcal{R}$)'),
    ])
    ax_main.legend(handles=legend_main, loc='upper left', fontsize=8.0, facecolor='black', edgecolor='0.3', labelcolor='white')
    
    cbar_ax = fig.add_axes([0.07, 0.265, 0.35, 0.022])
    cbar = fig.colorbar(im, cax=cbar_ax, orientation='horizontal', extend='both')
    cbar.set_label(r"Transformed Coherence $z(f_1, f_2)$", fontsize=9.5)
    cbar.ax.tick_params(labelsize=8.5)

    # --------------------------------------------------------------------------
    # Bottom Left: Dataset & Welch Bivariate Coherence Parameters Card
    # --------------------------------------------------------------------------
    ax_meta = fig.add_axes([0.05, 0.05, 0.44, 0.175])
    ax_meta.axis('off')

    meta_rect = FancyBboxPatch((0.0, 0.0), 1.0, 1.0, transform=ax_meta.transAxes,
                               facecolor='#F8F9FA', edgecolor='#B0BEC5', linewidth=1.2,
                               boxstyle='round,pad=0.015,rounding_size=0.03')
    ax_meta.add_patch(meta_rect)

    header_rect = FancyBboxPatch((0.0, 0.76), 1.0, 0.24, transform=ax_meta.transAxes,
                                  facecolor='#ECEFF1', edgecolor='none',
                                  boxstyle='round,pad=0.01,rounding_size=0.02')
    ax_meta.add_patch(header_rect)

    ax_meta.text(0.025, 0.86, "ANALYSIS & SEGMENTATION PARAMETERS", transform=ax_meta.transAxes,
                 fontsize=9.0, weight='bold', color='#263238', va='center')

    p_beat_val = metrics.get('beat_period', 999.0)
    if p_beat_val < 900.0:
        beat_txt = rf"$P_{{\rm beat}} = {p_beat_val:.1f}\,$d"
    else:
        beat_txt = r"$P_{{\rm beat}} = \infty$ (Diagonal)"
    node_header_str = rf"Node: $(f_1, f_2) = ({f1_sel:.4f}, {f2_sel:.4f})\,$d$^{{-1}}$  |  $z = {metrics.get('z_at_sel', 0.0):.1f}$  |  {beat_txt}"
    ax_meta.text(0.975, 0.86, node_header_str,
                 transform=ax_meta.transAxes, fontsize=8.2, weight='bold', color='#00695C', ha='right', va='center')

    dataset_disp = coherence_res.get('dataset_name', 'Solar Spectroscopic Observations')
    s1_disp = coherence_res.get('s1_label', 'Series 1')
    s2_disp = coherence_res.get('s2_label', s1_disp)
    mode_disp = coherence_res.get('mode', 'auto')
    mode_str = "Autocoherence" if mode_disp == 'auto' else "Cross-Coherence"
    channel_str = s1_disp if mode_disp == 'auto' else f"{s1_disp} vs {s2_disp}"

    n_pts_val = coherence_res.get('n_pts', 0)
    t_span_val = coherence_res.get('t_span', 0.0)
    cadence_val = coherence_res.get('cadence', 1.0)
    span_yrs = t_span_val / 365.25 if t_span_val > 0 else 0.0
    timespan_str = f"{t_span_val:.1f} d ({span_yrs:.2f} yr)"
    obs_str = rf"$N = {n_pts_val}$ pts ($\Delta t = {cadence_val:.1f}\,$d)"

    L_pts_val = coherence_res.get('L_pts', 200)
    k_segs_val = coherence_res.get('k_segs', 0)
    t_seg_val = coherence_res.get('t_seg', 0.0)
    overlap_val = coherence_res.get('overlap', 0.5)
    neff_val = coherence_res.get('neff', 0.0)
    if coherence_res.get('is_custom_segments'):
        overlap_str = "Custom / Tab 2 Segments"
    else:
        overlap_str = f"{int(overlap_val * 100)}% (Continuous)" if overlap_val > 0 else "0% (Disjoint)"

    bw_2R_val = coherence_res.get('bw_2R', 0.0)
    df_ray_val = coherence_res.get('df_rayleigh', 0.0)
    p_rot_val = coherence_res.get('p_rot', 27.28)
    f_rot_val = 1.0 / p_rot_val if p_rot_val > 0 else 0.0

    taper_raw = coherence_res.get('taper', 'None')
    if taper_raw == 'None':
        taper_str = "None (100% preservation)"
    elif taper_raw == 'KaiserBessel':
        taper_str = r"Kaiser-Bessel ($\beta = 8.6$)"
    elif taper_raw == 'Hann':
        taper_str = "Hann window"
    else:
        taper_str = str(taper_raw)

    fap_type_val = coherence_res.get('fap_type', 'analytical')
    if fap_type_val == 'montecarlo':
        n_mc_val = coherence_res.get('n_mc', 200)
        fap_str = f"Red-Noise MC ({n_mc_val} runs)"
    else:
        fap_str = "Analytical"

    fap01_val = coherence_res.get('fap01', 0.0)
    fap1_val = coherence_res.get('fap1', 0.0)
    fap5_val = coherence_res.get('fap5', 0.0)
    thresh_str = f"0.1%: {fap01_val:.2f} | 1%: {fap1_val:.2f} | 5%: {fap5_val:.2f}"

    col1_lines = [
        rf"$\bf{{Dataset:}}$ {dataset_disp}",
        rf"$\bf{{Signal:}}$ {channel_str}",
        rf"$\bf{{Mode:}}$ {mode_str}",
        rf"$\bf{{Timespan:}}$ {timespan_str}",
        rf"$\bf{{Observations:}}$ {obs_str}"
    ]

    col2_lines = [
        rf"$\bf{{Pts\ /\ Seg\ (L):}}$ {L_pts_val} pts",
        rf"$\bf{{Segments\ (K):}}$ {k_segs_val} segments",
        rf"$\bf{{Duration:}}$ $T_{{\rm seg}} = {t_seg_val:.1f}\,$d",
        rf"$\bf{{Welch\ Overlap:}}$ {overlap_str}",
        rf"$\bf{{N_{{\rm eff}}:}}$ {neff_val:.1f} independent"
    ]

    col3_lines = [
        rf"$\bf{{Resolution\ 2\mathcal{{R}}:}}$ {bw_2R_val:.4f} d$^{{-1}}$ ($\mathcal{{R}} = {df_ray_val:.4f}$)",
        rf"$\bf{{Stellar\ P_{{\rm rot}}:}}$ {p_rot_val:.2f} d ($f_{{\rm rot}} = {f_rot_val:.4f}\,$d$^{{-1}}$)",
        rf"$\bf{{Taper\ Window:}}$ {taper_str}",
        rf"$\bf{{FAP\ Benchmark:}}$ {fap_str}",
        rf"$\bf{{Thresholds:}}$ {thresh_str}"
    ]

    for idx, text in enumerate(col1_lines):
        y = 0.64 - idx * 0.135
        ax_meta.text(0.02, y, text, transform=ax_meta.transAxes, fontsize=8.2, color='#263238', va='center')
    for idx, text in enumerate(col2_lines):
        y = 0.64 - idx * 0.135
        ax_meta.text(0.35, y, text, transform=ax_meta.transAxes, fontsize=8.2, color='#263238', va='center')
    for idx, text in enumerate(col3_lines):
        y = 0.64 - idx * 0.135
        ax_meta.text(0.67, y, text, transform=ax_meta.transAxes, fontsize=8.2, color='#263238', va='center')
    
    # --------------------------------------------------------------------------
    # Panel 2: Anti-Diagonal Beat Cut (f1 + f2 = 2*f_mid)
    # --------------------------------------------------------------------------
    delta_f = np.array(ad_cut['delta_f'])
    z_ad = np.array(ad_cut['z'])
    z_at_sel_val = metrics['z_at_sel']
    plot_z_sel = max(0.1, z_at_sel_val) if beat_yscale == 'log' else z_at_sel_val

    if beat_domain == 'period':
        df_arr = np.abs(delta_f)
        mask_ad = df_arr > 0.001
        p_beat_arr = np.where(mask_ad, 1.0 / (2.0 * df_arr), np.nan)
        valid_ad = mask_ad & np.isfinite(p_beat_arr) & (p_beat_arr >= 2.0) & (p_beat_arr <= 500.0)
        p_plot = p_beat_arr[valid_ad]
        z_plot = z_ad[valid_ad]
        sort_idx = np.argsort(p_plot)
        p_plot = p_plot[sort_idx]
        z_plot = z_plot[sort_idx]
        if beat_yscale == 'log':
            z_plot = np.maximum(0.08, z_plot)

        ax_ad.plot(p_plot, z_plot, color='#00E676', lw=2.2, label=r'Beat Cut $z(P_{\rm beat})$')
        ax_ad.axhline(coherence_res['fap01'], color='#FF2D55', ls='--', lw=1.0, alpha=0.85, label='0.1% FAP')
        ax_ad.axhline(coherence_res['fap1'],  color='#00E676', ls='--', lw=1.0, alpha=0.85, label='1.0% FAP')
        ax_ad.axhline(coherence_res['fap5'],  color='#AF52DE', ls='--', lw=1.0, alpha=0.85, label='5.0% FAP')

        if metrics['beat_period'] < 900.0:
            ax_ad.scatter([metrics['beat_period']], [plot_z_sel], color='#00E5FF', edgecolor='black', s=55, zorder=7)
            node_str = rf"Node ({z_at_sel_val:.1f})" + "\n" + rf"$P_{{\rm beat}} = {metrics['beat_period']:.1f}\,$d"
            ax_ad.annotate(node_str, xy=(metrics['beat_period'], plot_z_sel), xytext=(10, 0),
                           textcoords='offset points', ha='left', va='center', fontsize=8.0, weight='bold',
                           bbox=dict(boxstyle='round,pad=0.2', facecolor='white', edgecolor='#00E676', lw=1.0))

        ax_ad.set_xlabel(rf"Beat Period $P_{{\rm beat}}$ (days) [Carrier $P_{{\rm mid}} = {metrics['carrier_period']:.2f}\,$d]", fontsize=10, weight='bold')
        if is_zoomed:
            f1_box_min = max(vis_f1_min, 2.0 * f_mid - vis_f2_max)
            f1_box_max = min(vis_f1_max, 2.0 * f_mid - vis_f2_min)
            if f1_box_max > f1_box_min:
                df1 = abs(f1_box_min - f_mid)
                df2 = abs(f1_box_max - f_mid)
                df_lo = max(0.001, min(df1, df2))
                df_hi = max(df1, df2)
                p_lo = max(2.0, 1.0 / (2.0 * df_hi))
                p_hi = min(500.0, 1.0 / (2.0 * df_lo))
                ax_ad.set_xlim(p_lo, p_hi)
            else:
                ax_ad.set_xlim(2.0, 450.0)
        else:
            ax_ad.set_xlim(2.0, 450.0)
    else:
        # Shaded 2R center envelope around delta_f = 0
        ax_ad.axvspan(-df_rayleigh, df_rayleigh, color='#00E676', alpha=0.18, linestyle='--', linewidth=1.1,
                      label=r'Carrier ($2\mathcal{R}$)')
        plot_z_ad = np.maximum(0.08, z_ad) if beat_yscale == 'log' else z_ad
        ax_ad.plot(delta_f, plot_z_ad, color='#00E676', lw=2.2, label=r'Beat Cut $z(\Delta f)$')
        ax_ad.axhline(coherence_res['fap01'], color='#FF2D55', ls='--', lw=1.0, alpha=0.85, label='0.1% FAP')
        ax_ad.axhline(coherence_res['fap1'],  color='#00E676', ls='--', lw=1.0, alpha=0.85, label='1.0% FAP')
        ax_ad.axhline(coherence_res['fap5'],  color='#AF52DE', ls='--', lw=1.0, alpha=0.85, label='5.0% FAP')

        delta_f_sel = (f1_sel - f2_sel) / 2.0
        ax_ad.scatter([delta_f_sel], [plot_z_sel], color='#00E5FF', edgecolor='black', s=55, zorder=7)
        node_str = rf"Node ({z_at_sel_val:.1f})" + "\n" + rf"$P_{{\rm beat}} = {metrics['beat_period']:.1f}\,$d"
        ax_ad.annotate(node_str, xy=(delta_f_sel, plot_z_sel), xytext=(10, 0),
                       textcoords='offset points', ha='left', va='center', fontsize=8.0, weight='bold',
                       bbox=dict(boxstyle='round,pad=0.2', facecolor='white', edgecolor='#00E676', lw=1.0))

        ax_ad.set_xlabel(rf"Separation Frequency $\Delta f = (f_1 - f_2)/2$ (d$^{{-1}}$) [Carrier $P_{{\rm mid}} = {metrics['carrier_period']:.2f}\,$d]", fontsize=10, weight='bold')
        if is_zoomed:
            f1_box_min = max(vis_f1_min, 2.0 * f_mid - vis_f2_max)
            f1_box_max = min(vis_f1_max, 2.0 * f_mid - vis_f2_min)
            if f1_box_max > f1_box_min:
                df_vis_min = f1_box_min - f_mid
                df_vis_max = f1_box_max - f_mid
                ax_ad.set_xlim(df_vis_min, df_vis_max)
            else:
                half_w = (vis_f1_max - vis_f1_min) / 2.0
                ax_ad.set_xlim(-half_w, half_w)
        else:
            ax_ad.set_xlim(np.min(delta_f), np.max(delta_f))

    if beat_yscale == 'log':
        ax_ad.set_yscale('log')
        ax_ad.set_ylim(bottom=0.1, top=max(5.0, float(np.max(z_ad)) * 1.35))
        y_beat_lbl = r"$z(P_{\rm beat})$ [log scale]" if beat_domain == 'period' else r"$z(\Delta f)$ [log scale]"
        ax_ad.set_ylabel(y_beat_lbl, fontsize=10.5, weight='bold')
    else:
        y_beat_lbl = r"$z(P_{\rm beat})$" if beat_domain == 'period' else r"$z(\Delta f)$"
        ax_ad.set_ylabel(y_beat_lbl, fontsize=10.5, weight='bold')
    ax_ad.grid(True, color='0.88', ls=':')
    ax_ad.legend(loc='upper right', fontsize=8.0, framealpha=0.92, ncol=2)
    
    # --------------------------------------------------------------------------
    # Panel 3: Horizontal Cut along f2 = f2_sel
    # --------------------------------------------------------------------------
    f1_h = np.array(h_cut['f1'])
    z_h = np.array(h_cut['z'])
    harm_colors = ['#00E5FF', '#FF9100', '#00E676', '#FFD700', '#AF52DE']

    if horiz_domain == 'period':
        valid_h = (f1_h > 0.002)
        f_sub = f1_h[valid_h]
        p_h = 1.0 / f_sub
        z_sub = z_h[valid_h]
        sort_h = np.argsort(p_h)
        p_h = p_h[sort_h]
        z_sub = z_sub[sort_h]
        plot_z_h = np.maximum(0.08, z_sub) if horiz_yscale == 'log' else z_sub

        for k in range(1, int(n_harmonics) + 1):
            fk = k * f_rot
            f_low = max(0.002, fk - df_rayleigh)
            f_high = fk + df_rayleigh
            p_min_k = 1.0 / f_high
            p_max_k = 1.0 / f_low
            lbl = r'Rotation ($2\mathcal{R}$)' if k == 1 else (r'Harmonic ($2\mathcal{R}$)' if k == 2 else None)
            ax_h.axvspan(p_min_k, p_max_k, color=harm_colors[(k - 1) % len(harm_colors)],
                         alpha=0.20, linestyle='--', linewidth=1.1, label=lbl)

        if custom_periods:
            for idx, P in enumerate(custom_periods):
                if P > 0:
                    ax_h.axvline(P, color='#E040FB', ls='-.', lw=1.2, alpha=0.85,
                                 label='Custom' if idx == 0 else None)

        ax_h.plot(p_h, plot_z_h, color='#0288D1', lw=2.2, label=r'Horizontal Cut $z(P_1)$')
        ax_h.axhline(coherence_res['fap01'], color='#FF2D55', ls='--', lw=1.0, alpha=0.85, label='0.1% FAP')
        ax_h.axhline(coherence_res['fap1'],  color='#00E676', ls='--', lw=1.0, alpha=0.85, label='1.0% FAP')
        ax_h.axhline(coherence_res['fap5'],  color='#AF52DE', ls='--', lw=1.0, alpha=0.85, label='5.0% FAP')

        p_peak = 1.0 / h_cut['peak_f1'] if h_cut['peak_f1'] > 0 else 999.0
        plot_peak_z = max(0.1, h_cut['peak_z']) if horiz_yscale == 'log' else h_cut['peak_z']
        ax_h.scatter([p_peak], [plot_peak_z], color='#00E5FF', edgecolor='black', s=55, zorder=7)
        peak_str = rf"Peak ($z = {h_cut['peak_z']:.1f}$, $P = {p_peak:.1f}\,$d)"
        ax_h.annotate(peak_str, xy=(p_peak, plot_peak_z), xytext=(10, 0),
                      textcoords='offset points', ha='left', va='center', fontsize=8.0, weight='bold',
                      bbox=dict(boxstyle='round,pad=0.2', facecolor='white', edgecolor='#00E5FF', lw=1.0))

        p2_val = 1.0 / f2_sel if f2_sel > 0 else 999.0
        ax_h.set_xlabel(rf"Coupled Period $P_1$ (days) [Cut along $P_2 = {p2_val:.2f}\,$d]", fontsize=10, weight='bold')
        if is_zoomed:
            p_vis_min = max(2.0, 1.0 / max(1e-5, vis_f1_max))
            p_vis_max = min(500.0, 1.0 / max(1e-5, vis_f1_min))
            ax_h.set_xlim(p_vis_min, p_vis_max)
        else:
            ax_h.set_xlim(2.0, 450.0)
    else:
        for k in range(1, int(n_harmonics) + 1):
            fk = k * f_rot
            if fk <= f_max:
                lbl = r'Rotation ($2\mathcal{R}$)' if k == 1 else (r'Harmonic ($2\mathcal{R}$)' if k == 2 else None)
                ax_h.axvspan(fk - df_rayleigh, fk + df_rayleigh, color=harm_colors[(k - 1) % len(harm_colors)],
                             alpha=0.20, linestyle='--', linewidth=1.1, label=lbl)

        if custom_periods:
            for idx, P in enumerate(custom_periods):
                if P > 0:
                    f_cust = 1.0 / P
                    if f_cust <= f_max:
                        ax_h.axvline(f_cust, color='#E040FB', ls='-.', lw=1.2, alpha=0.85,
                                     label='Custom' if idx == 0 else None)

        plot_z_h = np.maximum(0.08, z_h) if horiz_yscale == 'log' else z_h
        ax_h.plot(f1_h, plot_z_h, color='#0288D1', lw=2.2, label=r'Horizontal Cut $z(f_1)$')
        ax_h.axhline(coherence_res['fap01'], color='#FF2D55', ls='--', lw=1.0, alpha=0.85, label='0.1% FAP')
        ax_h.axhline(coherence_res['fap1'],  color='#00E676', ls='--', lw=1.0, alpha=0.85, label='1.0% FAP')
        ax_h.axhline(coherence_res['fap5'],  color='#AF52DE', ls='--', lw=1.0, alpha=0.85, label='5.0% FAP')

        plot_peak_z = max(0.1, h_cut['peak_z']) if horiz_yscale == 'log' else h_cut['peak_z']
        ax_h.scatter([h_cut['peak_f1']], [plot_peak_z], color='#00E5FF', edgecolor='black', s=55, zorder=7)
        peak_str = rf"Peak ($z = {h_cut['peak_z']:.1f}$, $P = {h_cut['peak_p1']:.1f}\,$d)"
        ax_h.annotate(peak_str, xy=(h_cut['peak_f1'], plot_peak_z), xytext=(10, 0),
                      textcoords='offset points', ha='left', va='center', fontsize=8.0, weight='bold',
                      bbox=dict(boxstyle='round,pad=0.2', facecolor='white', edgecolor='#00E5FF', lw=1.0))

        ax_h.set_xlim(vis_f1_min, vis_f1_max)
        ax_h.set_xlabel(rf"Coupled Frequency $f_1$ (d$^{{-1}}$) [Cut along $f_2 = {f2_sel:.4f}\,$d$^{{-1}}$]", fontsize=10, weight='bold')

        # Secondary top axis for period on horizontal cut
        ax_h_top = ax_h.twiny()
        ax_h_top.set_xlim(vis_f1_min, vis_f1_max)
        candidate_p = [200.0, 100.0, 50.0, p_rot, p_rot / 2.0, 10.0, 5.0, 3.0]
        valid_ticks = []
        valid_labels = []
        for p_c in candidate_p:
            fc = 1.0 / p_c
            if vis_f1_min + 0.04 * (vis_f1_max - vis_f1_min) <= fc <= vis_f1_max - 0.04 * (vis_f1_max - vis_f1_min):
                valid_ticks.append(fc)
                if abs(p_c - p_rot) < 0.1:
                    valid_labels.append(f'{p_rot:.1f}d\n(Rot)')
                elif abs(p_c - p_rot / 2.0) < 0.1:
                    valid_labels.append(f'{p_rot/2:.1f}d\n(Harm)')
                else:
                    valid_labels.append(f'{p_c:.0f}d')
        if valid_ticks:
            ax_h_top.set_xticks(valid_ticks)
            ax_h_top.set_xticklabels(valid_labels, fontsize=8.0, weight='bold')
            ax_h_top.set_xlabel(r"Coupled Period $P_1 = 1 / f_1$", fontsize=9.0, weight='bold', labelpad=5)
        else:
            ax_h_top.set_xticks([])

    if horiz_yscale == 'log':
        ax_h.set_yscale('log')
        ax_h.set_ylim(bottom=0.1, top=max(5.0, float(np.max(z_h)) * 1.35))
        y_horiz_lbl = r"$z(P_1)$ [log scale]" if horiz_domain == 'period' else r"$z(f_1)$ [log scale]"
        ax_h.set_ylabel(y_horiz_lbl, fontsize=10.5, weight='bold')
    else:
        y_horiz_lbl = r"$z(P_1)$" if horiz_domain == 'period' else r"$z(f_1)$"
        ax_h.set_ylabel(y_horiz_lbl, fontsize=10.5, weight='bold')
    ax_h.grid(True, color='0.88', ls=':')
    ax_h.legend(loc='upper right', fontsize=8.0, framealpha=0.92, ncol=2)

    plt.savefig(output_path, dpi=200)
    plt.close(fig)
    return output_path

def export_selected_plots(coherence_res, slices_res, selected_plots, output_dir, colormap='inferno',
                          vmin=0.5, vmax=4.0, n_harmonics=2, custom_periods=None, zoom=None, export_id=None):
    """
    Exports a customized bundle of publication-ready PNG figures and CSV tables.
    Selected plots can include:
      - 'heatmap': standalone 2D dual-coherence locator map
      - 'diagonal': standalone 1D diagonal isofrequency profile z(f, f)
      - 'horizontal': standalone 1D multi-cut horizontal profile z(f1 | f2)
      - 'composite': standard 3-panel composite layout
      - 'csv': tabular data files for all cuts and detected significant peaks
    """
    import csv
    os.makedirs(output_dir, exist_ok=True)
    ts = export_id or str(int(time.time()))
    prefix = f"dual_coherence_{ts}"
    exported_files = []

    f_grid = np.array(coherence_res['f_grid'])
    z_matrix = np.array(coherence_res['z_matrix'])
    bw_2R = coherence_res['bw_2R']
    df_rayleigh = coherence_res['df_rayleigh']
    p_rot = coherence_res['p_rot']
    f_rot = 1.0 / p_rot
    f_min = float(f_grid[0])
    f_max = float(f_grid[-1])

    # 1. 2D Heatmap / Locator Map
    if 'heatmap' in selected_plots:
        fig_hm, ax_hm = plt.subplots(figsize=(10, 8.5), dpi=300)
        ax_hm.set_facecolor('black')
        from matplotlib.colors import PowerNorm
        norm = PowerNorm(gamma=0.70, vmin=vmin, vmax=vmax)
        im = ax_hm.pcolormesh(f_grid, f_grid, z_matrix.T, cmap=colormap, norm=norm, shading='auto')
        ax_hm.plot([f_min, f_max], [f_min, f_max], color='#B0BEC5', ls='-', lw=1.2, alpha=0.85, label=r'Diagonal ($f_1 = f_2$)')
        
        # Harmonic carrier lines
        dash_styles = ['--', ':', '-.', ':', '--']
        for k in range(1, int(n_harmonics) + 1):
            fk = k * f_rot
            if fk <= f_max:
                ls = dash_styles[(k - 1) % len(dash_styles)]
                ax_hm.axvline(fk, color='#00E5FF', ls=ls, lw=1.1, alpha=0.85)
                ax_hm.axhline(fk, color='#00E5FF', ls=ls, lw=1.1, alpha=0.85)

        # Active horizontal cuts
        h_cuts = slices_res.get('horizontal_cuts', [])
        for c in h_cuts:
            if c.get('active', True) and c['f2'] <= f_max:
                ax_hm.axhline(c['f2'], color=c.get('color', '#00E5FF'), ls='--', lw=1.4, alpha=0.90, label=c['label'])

        ax_hm.set_xlabel(r"Frequency $f_1$ (d$^{-1}$)", fontsize=11, weight='bold')
        ax_hm.set_ylabel(r"Frequency $f_2$ (d$^{-1}$)", fontsize=11, weight='bold')
        cbar = fig_hm.colorbar(im, ax=ax_hm, pad=0.02, shrink=0.92)
        cbar.set_label(r"Fisher $z(f_1, f_2)$", fontsize=11, weight='bold')
        ax_hm.legend(loc='upper left', fontsize=8.5, framealpha=0.90)
        fig_hm.tight_layout()

        hm_path = os.path.join(output_dir, f"{prefix}_2d_heatmap.png")
        fig_hm.savefig(hm_path, dpi=300)
        plt.close(fig_hm)
        exported_files.append({'id': 'heatmap', 'name': '2D Dual-Coherence Locator Heatmap', 'filename': os.path.basename(hm_path), 'path': hm_path})

    # 2. Diagonal Cut Profile
    if 'diagonal' in selected_plots:
        diag = slices_res.get('diagonal', {})
        f_diag = np.array(diag.get('f', f_grid))
        z_diag = np.array(diag.get('z', []))
        
        fig_d, ax_d = plt.subplots(figsize=(10, 5), dpi=300)
        harm_colors = ['#FF2D55', '#FF9500', '#AF52DE', '#30D158']
        for k in range(1, int(n_harmonics) + 1):
            fk = k * f_rot
            if fk <= f_max:
                lbl = r'Rotation ($2\mathcal{R}$)' if k == 1 else (r'Harmonic ($2\mathcal{R}$)' if k == 2 else None)
                ax_d.axvspan(fk - df_rayleigh, fk + df_rayleigh, color=harm_colors[(k - 1) % len(harm_colors)],
                             alpha=0.20, linestyle='--', linewidth=1.1, label=lbl)

        ax_d.plot(f_diag, z_diag, color='#0288D1', lw=2.2, label=r'Diagonal Isofrequency Cut $z(f, f)$')
        ax_d.axhline(coherence_res['fap01'], color='#FF2D55', ls='--', lw=1.0, alpha=0.85, label='0.1% FAP Threshold')
        ax_d.axhline(coherence_res['fap1'],  color='#00E676', ls='--', lw=1.0, alpha=0.85, label='1.0% FAP Threshold')
        ax_d.axhline(coherence_res['fap5'],  color='#AF52DE', ls='--', lw=1.0, alpha=0.85, label='5.0% FAP Threshold')

        ax_d.set_xlabel(r"Frequency $f$ (d$^{-1}$)", fontsize=11, weight='bold')
        ax_d.set_ylabel(r"$z(f)$", fontsize=11, weight='bold')
        ax_d.set_ylim(-0.06, max(coherence_res['fap01'] * 1.25, float(np.max(z_diag)) * 1.15 if len(z_diag) else 5.0))
        ax_d.grid(True, color='0.88', ls=':')
        ax_d.legend(loc='upper right', fontsize=8.5, framealpha=0.90)
        fig_d.tight_layout()

        d_path = os.path.join(output_dir, f"{prefix}_diagonal_cut.png")
        fig_d.savefig(d_path, dpi=300)
        plt.close(fig_d)
        exported_files.append({'id': 'diagonal', 'name': 'Diagonal Cut Profile z(f, f)', 'filename': os.path.basename(d_path), 'path': d_path})

    # 3. Horizontal Multi-Cuts Profile
    if 'horizontal' in selected_plots:
        fig_h, ax_h_exp = plt.subplots(figsize=(10, 5.5), dpi=300)
        harm_colors = ['#FF2D55', '#FF9500', '#AF52DE', '#30D158']
        for k in range(1, int(n_harmonics) + 1):
            fk = k * f_rot
            if fk <= f_max:
                lbl = r'Rotation ($2\mathcal{R}$)' if k == 1 else (r'Harmonic ($2\mathcal{R}$)' if k == 2 else None)
                ax_h_exp.axvspan(fk - df_rayleigh, fk + df_rayleigh, color=harm_colors[(k - 1) % len(harm_colors)],
                                 alpha=0.18, linestyle='--', linewidth=1.1, label=lbl)

        h_cuts = slices_res.get('horizontal_cuts', [])
        max_h_z = 3.0
        for c in h_cuts:
            if c.get('active', True):
                f1_vals = np.array(c['f1'])
                z_vals = np.array(c['z'])
                if len(z_vals):
                    max_h_z = max(max_h_z, float(np.max(z_vals)))
                ax_h_exp.plot(f1_vals, z_vals, color=c.get('color', '#00E5FF'), lw=2.0, label=c['label'])
                ax_h_exp.scatter([c['peak_f1']], [c['peak_z']], color=c.get('color', '#00E5FF'), edgecolor='black', s=45, zorder=6)

        ax_h_exp.axhline(coherence_res['fap01'], color='#FF2D55', ls='--', lw=1.0, alpha=0.85, label='0.1% FAP Threshold')
        ax_h_exp.axhline(coherence_res['fap1'],  color='#00E676', ls='--', lw=1.0, alpha=0.85, label='1.0% FAP Threshold')
        ax_h_exp.axhline(coherence_res['fap5'],  color='#AF52DE', ls='--', lw=1.0, alpha=0.85, label='5.0% FAP Threshold')

        ax_h_exp.set_xlabel(r"Coupled Frequency $f_1$ (d$^{-1}$)", fontsize=11, weight='bold')
        ax_h_exp.set_ylabel(r"$z(f_1)$", fontsize=11, weight='bold')
        ax_h_exp.set_ylim(-0.06, max(coherence_res['fap01'] * 1.25, max_h_z * 1.15))
        ax_h_exp.grid(True, color='0.88', ls=':')
        ax_h_exp.legend(loc='upper right', fontsize=8.5, framealpha=0.90)
        fig_h.tight_layout()

        h_path = os.path.join(output_dir, f"{prefix}_horizontal_cuts.png")
        fig_h.savefig(h_path, dpi=300)
        plt.close(fig_h)
        exported_files.append({'id': 'horizontal', 'name': 'Horizontal Cuts Profile z(f1 | f2)', 'filename': os.path.basename(h_path), 'path': h_path})

    # 4. 3-Panel Composite Publication Layout
    if 'composite' in selected_plots:
        comp_path = os.path.join(output_dir, f"{prefix}_composite_summary.png")
        export_publication_plot(coherence_res, slices_res, comp_path, colormap=colormap,
                                vmin=vmin, vmax=vmax, n_harmonics=n_harmonics, custom_periods=custom_periods, zoom=zoom)
        exported_files.append({'id': 'composite', 'name': '3-Panel Composite Publication Figure', 'filename': os.path.basename(comp_path), 'path': comp_path})

    # 5. CSV Tabular Export
    if 'csv' in selected_plots:
        csv_cuts_path = os.path.join(output_dir, f"{prefix}_extracted_cuts.csv")
        h_cuts = slices_res.get('horizontal_cuts', [])
        diag = slices_res.get('diagonal', {})
        f1_grid = diag.get('f', f_grid.tolist())
        z_diag = diag.get('z', [])

        with open(csv_cuts_path, 'w', newline='', encoding='utf-8') as f_out:
            writer = csv.writer(f_out)
            # Header
            header = ['f1_day_inv', 'p1_days', 'z_diagonal']
            for c in h_cuts:
                clean_id = c['id'].replace(' ', '_')
                header.append(f"z_cut_{clean_id}")
            writer.writerow(header)

            for i in range(len(f1_grid)):
                f1_val = f1_grid[i]
                p1_val = 1.0 / f1_val if f1_val > 0 else 999.0
                row = [f1_val, p1_val, z_diag[i] if i < len(z_diag) else '']
                for c in h_cuts:
                    c_z = c.get('z', [])
                    row.append(c_z[i] if i < len(c_z) else '')
                writer.writerow(row)

        exported_files.append({'id': 'csv_cuts', 'name': 'Extracted Cuts Data Table (CSV)', 'filename': os.path.basename(csv_cuts_path), 'path': csv_cuts_path})

        # Peaks CSV table if detected peaks are available
        peaks = slices_res.get('detected_peaks', [])
        if not peaks:
            faps_dict = {'fap01': coherence_res['fap01'], 'fap1': coherence_res['fap1'], 'fap5': coherence_res['fap5']}
            peaks = detect_dual_coherence_peaks(z_matrix, f_grid, p_rot, bw_2R, faps_dict)

        if peaks:
            csv_peaks_path = os.path.join(output_dir, f"{prefix}_detected_peaks.csv")
            with open(csv_peaks_path, 'w', newline='', encoding='utf-8') as f_out:
                writer = csv.writer(f_out)
                writer.writerow(['f1_day_inv', 'f2_day_inv', 'P1_days', 'P2_days', 'delta_f_day_inv', 'P_beat_days', 'z_measured', 'significance_tier', 'classification'])
                for pk in peaks:
                    writer.writerow([pk['f1'], pk['f2'], pk['p1'], pk['p2'], pk['delta_f'], pk['p_beat'], pk['z'], pk['sig'], pk['classification']])
            exported_files.append({'id': 'csv_peaks', 'name': 'Detected Significant Peaks & Aliases Table (CSV)', 'filename': os.path.basename(csv_peaks_path), 'path': csv_peaks_path})

    return exported_files
