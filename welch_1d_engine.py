#!/usr/bin/env python3
"""
welch_1d_engine.py

1D Welch Bivariate Coherence & Power Spectral Density Engine:
1. Time-Domain Segmentation:
   - Adaptive Campaign Partitioning (gap-clustering, zero point trimming, 100% data preservation).
   - Direct K-Segment Split (user-specified K segments).
   - Custom Interactive Segments (user-adjusted boundary indices).
2. Observations Time-Domain Plot with colored shaded segment spans matching Barnard standard.
3. Power Spectra: Welch PSD overlaid directly on top of Lomb-Scargle Periodogram (log scale, Parseval PSD).
4. 1D Welch Bivariate Magnitude-Squared Coherence in Fisher z(f) with Analytical FAPs (0.1%, 1%, 5%).
   (Enforces distinct series s1 != s2; autocoherence is disabled in 1D).
5. Ramirez Delgado 2R bandwidth calculations and rotation harmonic overlays.
6. High-resolution publication composite figure rendering with metadata parameters card.
"""

import os
os.environ['MPLCONFIGDIR'] = '/tmp/mpl_cache'
os.makedirs('/tmp/mpl_cache', exist_ok=True)
import sys
import itertools
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch
from astropy.timeseries import LombScargle

APP_DIR = os.path.dirname(os.path.abspath(__file__))
if APP_DIR not in sys.path:
    sys.path.insert(0, APP_DIR)

from data_loader import load_dataset
from NWelch.TimeSeries import TimeSeries
from NWelch.Bivariate import Bivariate, ztrans, cthresh
from coherence_engine import generate_car1_red_noise_surrogate

SEG_COLORS = [
    '#1976D2', '#388E3C', '#D32F2F', '#F57C00', '#7B1FA2',
    '#0097A7', '#C2185B', '#FFA000', '#00796B', '#512DA8'
]

def make_uniform_k_segments(n_pts, K, overlap=0.5):
    """
    Uniform partition into exactly K segments with 100% data preservation.
    """
    K = max(1, int(K))
    if K == 1 or n_pts < 20:
        return {
            'segments': np.array([[0, n_pts]], dtype=int),
            'neff': 1.0,
            'k_segs': 1,
            'mean_l': float(n_pts)
        }
        
    if overlap > 0.0:
        nperseg = max(20, int(2 * n_pts // (K + 1)))
        step = max(1, nperseg // 2)
        segs = []
        for i in range(K - 1):
            st = i * step
            segs.append([st, min(n_pts, st + nperseg)])
        # Absorb all leftover edge points into final segment (Rule 1: 100% data preservation)
        last_st = (K - 1) * step
        segs.append([last_st, n_pts])
        c50 = 0.5
        neff = K / (1.0 + 2.0 * c50**2 - (2.0 * c50**2 / K)) if K > 1 else 1.0
    else:
        step = max(1, n_pts // K)
        segs = []
        for i in range(K - 1):
            st = i * step
            segs.append([st, st + step])
        segs.append([(K - 1) * step, n_pts])
        neff = float(K)
        
    return {
        'segments': np.array(segs, dtype=int),
        'neff': float(neff),
        'k_segs': len(segs),
        'mean_l': float(np.mean([s[1] - s[0] for s in segs]))
    }

def partition_into_k_segments(t, K, min_pts=30, gap_threshold=30.0, overlap=0.5):
    """
    Partitions time series into K segments while preserving 100% of data points,
    clustering across major observing gaps when feasible.
    """
    t = np.asarray(t)
    n_total = len(t)
    K = max(1, int(K))
    if K == 1 or n_total < 2 * min_pts:
        return {
            'segments': np.array([[0, n_total]], dtype=int),
            'neff': 1.0,
            'k_segs': 1,
            'mean_l': float(n_total)
        }
        
    dt = np.diff(t)
    gap_idx = np.where(dt > gap_threshold)[0] + 1
    raw_clusters = [np.asarray(c, dtype=int) for c in np.split(np.arange(n_total), gap_idx) if len(c) > 0]
    
    # Merge small clusters into neighboring campaigns so 100% of observations are preserved
    valid_clusters = []
    for c in raw_clusters:
        if len(valid_clusters) == 0:
            valid_clusters.append(c)
        elif len(c) < min_pts:
            valid_clusters[-1] = np.concatenate([valid_clusters[-1], c])
        else:
            if len(valid_clusters[-1]) < min_pts:
                valid_clusters[-1] = np.concatenate([valid_clusters[-1], c])
            else:
                valid_clusters.append(c)

    if len(valid_clusters) > 1 and len(valid_clusters[-1]) < min_pts:
        last = valid_clusters.pop()
        valid_clusters[-1] = np.concatenate([valid_clusters[-1], last])
    
    # If gap clusters cannot accommodate K, fallback to uniform K partition
    if len(valid_clusters) == 0 or K < len(valid_clusters):
        return make_uniform_k_segments(n_total, K, overlap=overlap)
        
    total_valid_pts = sum(len(c) for c in valid_clusters)
    subsegs_per_cluster = []
    allocated_k = 0
    for c in valid_clusters:
        k_c = max(1, int(round(K * (len(c) / total_valid_pts))))
        subsegs_per_cluster.append(k_c)
        allocated_k += k_c
        
    diff = K - allocated_k
    if diff != 0:
        sizes = [len(c) for c in valid_clusters]
        sort_idx = np.argsort(sizes)[::-1]
        for i in range(abs(diff)):
            idx = sort_idx[i % len(sort_idx)]
            subsegs_per_cluster[idx] += 1 if diff > 0 else -1
            subsegs_per_cluster[idx] = max(1, subsegs_per_cluster[idx])
            
    segments = []
    for c, k_c in zip(valid_clusters, subsegs_per_cluster):
        n_pts_c = len(c)
        c_st = int(c[0])
        c_ed = int(c[-1] + 1)
        if k_c == 1:
            segments.append([c_st, c_ed])
        else:
            if overlap == 0.5:
                nperseg = max(20, int(2 * n_pts_c // (k_c + 1)))
                step = max(1, nperseg // 2)
                for i in range(k_c - 1):
                    start = c_st + i * step
                    segments.append([start, min(c_ed, start + nperseg)])
                segments.append([c_st + (k_c - 1) * step, c_ed])
            else:
                step = max(1, n_pts_c // k_c)
                for i in range(k_c - 1):
                    start = c_st + i * step
                    segments.append([start, start + step])
                segments.append([c_st + (k_c - 1) * step, c_ed])
                
    # Effective segments Neff calculation
    c50_rect = 0.5
    neff_total = 0.0
    for c, k_c in zip(valid_clusters, subsegs_per_cluster):
        if k_c <= 1:
            neff_total += 1.0
        else:
            neff_total += k_c / (1.0 + 2.0 * (c50_rect**2) - (2.0 * (c50_rect**2) / k_c))
            
    return {
        'segments': np.array(segments, dtype=int),
        'neff': float(neff_total),
        'k_segs': len(segments),
        'mean_l': float(np.mean([s[1] - s[0] for s in segments]))
    }

def autocalculate_adaptive_segments(t, min_pts=75, fallback_min=50, gap_threshold=30.0, overlap=0.5):
    """
    Adaptive Campaign Segmentation following the workspace guidelines:
    - Splits at major observing gaps (> gap_threshold days) into campaigns.
    - 0% overlap across gaps (disjoint campaign mode).
    - 50% overlap within continuous campaigns.
    - 100% data preservation: edge points absorbed into nearest campaign segment.
    """
    t = np.asarray(t)
    n_total = len(t)
    if n_total < fallback_min:
        return {
            'segments': np.array([[0, n_total]], dtype=int),
            'campaigns': [[0, n_total]],
            'neff': 1.0,
            'k_segs': 1,
            'mean_l': float(n_total)
        }

    dt = np.diff(t)
    gap_indices = np.where(dt > gap_threshold)[0] + 1
    campaign_splits = np.split(np.arange(n_total), gap_indices)
    
    cleaned_campaigns = []
    accum = []
    for c in campaign_splits:
        if len(c) == 0:
            continue
        if len(c) < 25 and len(cleaned_campaigns) > 0:
            cleaned_campaigns[-1] = np.concatenate([cleaned_campaigns[-1], c])
        elif len(c) < 25:
            accum.extend(c)
        else:
            if accum:
                c = np.concatenate([accum, c])
                accum = []
            cleaned_campaigns.append(c)
    if accum and cleaned_campaigns:
        cleaned_campaigns[-1] = np.concatenate([cleaned_campaigns[-1], accum])
    elif accum:
        cleaned_campaigns.append(np.array(accum))

    all_segments = []
    campaign_meta = []

    for camp_id, camp in enumerate(cleaned_campaigns):
        n_camp = len(camp)
        c_start = int(camp[0])
        c_end = int(camp[-1] + 1)
        campaign_meta.append({
            'campaign_id': camp_id + 1,
            'start_idx': c_start,
            'end_idx': c_end,
            't_start': float(t[c_start]),
            't_end': float(t[c_end - 1]),
            'n_pts': n_camp
        })

        if n_camp >= 2 * min_pts:
            target_l = min_pts
        elif n_camp >= fallback_min:
            target_l = fallback_min
        else:
            all_segments.append([c_start, c_end])
            continue

        if overlap == 0.0:
            n_subsegs = max(1, int(n_camp // target_l))
            step = n_camp // n_subsegs
            for s in range(n_subsegs - 1):
                all_segments.append([c_start + s * step, c_start + (s + 1) * step])
            all_segments.append([c_start + (n_subsegs - 1) * step, c_end])
        else:
            step = max(1, int(target_l * 0.5))
            n_subsegs = max(1, int(2 * n_camp // (target_l + 1)))
            if n_subsegs <= 1:
                all_segments.append([c_start, c_end])
            else:
                nperseg = int(2 * n_camp // (n_subsegs + 1))
                for s in range(n_subsegs - 1):
                    seg_st = c_start + (s * nperseg) // 2
                    all_segments.append([seg_st, seg_st + nperseg])
                last_st = c_start + (n_subsegs - 1) * nperseg // 2
                all_segments.append([last_st, c_end])

    segments = np.array(all_segments, dtype=int)
    c50_rect = 0.5
    neff_total = 0.0
    for camp_id, camp in enumerate(cleaned_campaigns):
        c_segs = [s for s in segments if s[0] >= camp[0] and s[1] <= camp[-1] + 1]
        k_c = len(c_segs)
        if k_c <= 1:
            neff_total += 1.0
        else:
            neff_c = k_c / (1.0 + 2.0 * (c50_rect**2) - (2.0 * (c50_rect**2) / k_c))
            neff_total += neff_c
            
    mean_l = float(np.mean([s[1] - s[0] for s in segments]))
    return {
        'segments': segments,
        'campaigns': campaign_meta,
        'neff': float(neff_total),
        'k_segs': len(segments),
        'mean_l': mean_l
    }

def compute_welch_1d(dataset_key, series1_key, series2_key=None, preset='10yr',
                     t_min=None, t_max=None, seg_mode='adaptive', L_pts=100,
                     k_segments=None, custom_segments=None,
                     overlap=0.5, taper='None', fmax=0.15, p_rot=None,
                     fap_type='analytical', n_mc=50):
    """
    Computes Welch Power Spectra, Lomb-Scargle Periodograms, and 1D Welch Bivariate
    Magnitude-Squared Coherence in Fisher z(f) with Analytical False Alarm Probabilities.
    Enforces two distinct series (s1 != s2).
    """
    # 1. Enforce distinct series (1D autocoherence is trivial and meaningless)
    if series2_key is None or series2_key == series1_key:
        from data_loader import DATASET_CONFIGS
        ds_cfg = DATASET_CONFIGS.get(dataset_key, {})
        avail = [k for k in ds_cfg.get('series', {}).keys() if k != series1_key]
        if avail:
            series2_key = avail[0]
        else:
            series2_key = 'FWHM' if series1_key != 'FWHM' else 'RV'
        
    data = load_dataset(dataset_key, series1_key, series2_key, preset=preset, t_min=t_min, t_max=t_max)
    t = data['time']
    s1 = data['s1']
    s2 = data['s2']
    if s2 is None:
        raise ValueError(f"Series 2 ({series2_key}) could not be loaded. Two distinct series are required for 1D Bivariate Coherence.")
    n_pts = len(t)
    
    prot_val = float(p_rot) if p_rot is not None else float(data['p_rot'])
    f_rot_val = 1.0 / prot_val if prot_val > 0 else 0.03666
    
    # 2. Segment partitioning
    if custom_segments and len(custom_segments) > 0:
        c_segs = []
        for s in custom_segments:
            st = max(0, min(n_pts - 10, int(s[0])))
            ed = max(st + 10, min(n_pts, int(s[1])))
            c_segs.append([st, ed])
        segs = np.array(c_segs, dtype=int)
        k_segs = len(segs)
        neff = float(k_segs)
        seg_info = {
            'segments': segs,
            'neff': neff,
            'k_segs': k_segs,
            'mean_l': float(np.mean([s[1] - s[0] for s in segs]))
        }
    elif k_segments is not None and int(k_segments) > 0:
        seg_info = partition_into_k_segments(t, int(k_segments), min_pts=30,
                                             gap_threshold=30.0, overlap=float(overlap))
        segs = seg_info['segments']
        neff = seg_info['neff']
        k_segs = seg_info['k_segs']
    elif seg_mode == 'adaptive':
        seg_info = autocalculate_adaptive_segments(t, min_pts=max(50, int(L_pts)),
                                                   fallback_min=50, gap_threshold=30.0,
                                                   overlap=float(overlap))
        segs = seg_info['segments']
        neff = seg_info['neff']
        k_segs = seg_info['k_segs']
    else:
        # Uniform L-based partition
        seg_info = make_uniform_k_segments(n_pts, max(2, n_pts // max(20, int(L_pts))), overlap=float(overlap))
        segs = seg_info['segments']
        neff = seg_info['neff']
        k_segs = seg_info['k_segs']
        
    # Segment durations and Rayleigh resolution
    seg_durations = [t[s[1] - 1] - t[s[0]] for s in segs]
    t_seg_mean = float(np.mean(seg_durations)) if seg_durations else 100.0
    rayleigh = 1.0 / t_seg_mean if t_seg_mean > 0 else 0.01
    two_r = 2.0 * rayleigh
    
    # 3. NWelch TimeSeries and Bivariate objects
    ts1 = TimeSeries(t, s1, display_frequency_info=False)
    ts1.segment_data(segs, float(fmax), oversample=4, window=taper, quiet=True, plot_windows=False)
    ts1.Welch_powspec(norm=True)
    
    ts2 = TimeSeries(t, s2, display_frequency_info=False)
    ts2.segment_data(segs, float(fmax), oversample=4, window=taper, quiet=True, plot_windows=False)
    ts2.Welch_powspec(norm=True)
    
    bv = Bivariate(t, s1, s2, display_frequency_info=False)
    bv.segment_data(segs, float(fmax), oversample=4, window=taper, quiet=True, plot_windows=False)
    bv.Welch_coherence_powspec()
    coh_raw = np.real(bv.coh)
    
    f_grid = ts1.Welch_powgrid
    mask = (f_grid >= 0.0) & (f_grid <= float(fmax))
    f_sub = f_grid[mask]
    
    psd1 = np.real(ts1.Welch_pow[mask])
    psd2 = np.real(ts2.Welch_pow[mask])
    coh_sub = np.clip(coh_raw[mask], 0.0, 0.999999)
    
    # 4. Lomb-Scargle Periodograms computed on the exact same frequency grid
    ls1 = LombScargle(t, s1, normalization='standard')
    ls_power1 = ls1.power(f_sub)
    ls2 = LombScargle(t, s2, normalization='standard')
    ls_power2 = ls2.power(f_sub)
    
    # Peak-normalized power (matching HARPS-N preliminary tradeoff plots P / P_max)
    max_psd1 = float(np.max(psd1)) if len(psd1) > 0 and np.max(psd1) > 0 else 1.0
    max_psd2 = float(np.max(psd2)) if len(psd2) > 0 and np.max(psd2) > 0 else 1.0
    max_ls1 = float(np.max(ls_power1)) if len(ls_power1) > 0 and np.max(ls_power1) > 0 else 1.0
    max_ls2 = float(np.max(ls_power2)) if len(ls_power2) > 0 and np.max(ls_power2) > 0 else 1.0

    norm_psd1 = psd1 / max_psd1
    norm_psd2 = psd2 / max_psd2
    norm_ls1 = ls_power1 / max_ls1
    norm_ls2 = ls_power2 / max_ls2

    # Physical PSD: Astropy normalization='psd'
    ls_psd1 = LombScargle(t, s1, normalization='psd').power(f_sub)
    ls_psd2 = LombScargle(t, s2, normalization='psd').power(f_sub)
    
    # Fisher z-transformation
    z_sub = ztrans(coh_sub, neff)
    
    # False Alarm Probability (FAP) thresholds
    if fap_type in ['montecarlo', 'rednoise'] and n_mc and int(n_mc) > 0:
        max_z_surr = []
        n_mc_int = min(150, max(20, int(n_mc)))
        for _ in range(n_mc_int):
            surr1 = generate_car1_red_noise_surrogate(t, s1)
            surr2 = generate_car1_red_noise_surrogate(t, s2)
            b_surr = Bivariate(t, surr1, surr2, display_frequency_info=False)
            b_surr.segment_data(segs, float(fmax), oversample=4, window=taper, quiet=True, plot_windows=False)
            b_surr.Welch_coherence_powspec()
            c_s = np.clip(np.real(b_surr.Welch_coh[mask]), 0.0, 0.999999)
            z_s = ztrans(c_s, float(b_surr.Nseg_eff))
            max_z_surr.append([
                float(np.percentile(z_s, 95.0)),
                float(np.percentile(z_s, 99.0)),
                float(np.percentile(z_s, 99.9))
            ])
        arr = np.array(max_z_surr)
        fap5 = float(np.mean(arr[:, 0]))
        fap1 = float(np.mean(arr[:, 1]))
        fap01 = float(np.mean(arr[:, 2]))
    else:
        # Analytical FAP thresholds
        fap01 = float(ztrans(cthresh(0.001, neff), neff))
        fap1 = float(ztrans(cthresh(0.01, neff), neff))
        fap5 = float(ztrans(cthresh(0.05, neff), neff))
    
    # Harmonic resonance bands (Ramirez Delgado 2R bandwidth)
    harmonics = []
    for h in range(1, 5):
        f_h = h * f_rot_val
        if f_h <= float(fmax):
            harmonics.append({
                'order': h,
                'name': 'Rotation' if h == 1 else f"Harmonic {h}",
                'f_center': float(f_h),
                'p_center': float(1.0 / f_h),
                'f_low': float(max(0.0, f_h - rayleigh)),
                'f_high': float(f_h + rayleigh)
            })
            
    # Peak detection in coherence
    peak_idx = int(np.argmax(z_sub))
    peak_f = float(f_sub[peak_idx])
    peak_z = float(z_sub[peak_idx])
    peak_p = float(1.0 / peak_f) if peak_f > 0 else 0.0

    # Build timeline segment metadata for frontend rendering
    timeline_segs = []
    for idx, s in enumerate(segs):
        timeline_segs.append({
            'seg_id': idx + 1,
            'start_idx': int(s[0]),
            'end_idx': int(s[1]),
            't_start': float(t[s[0]]),
            't_end': float(t[s[1] - 1]),
            'duration': float(t[s[1] - 1] - t[s[0]]),
            'n_pts': int(s[1] - s[0]),
            'color': SEG_COLORS[idx % len(SEG_COLORS)]
        })

    return {
        'dataset_key': dataset_key,
        'dataset_name': data['dataset_name'],
        'series1_key': series1_key,
        'series2_key': series2_key,
        'series1_label': data['s1_label'],
        'series2_label': data['s2_label'],
        'is_cross': True,
        'seg_mode': seg_mode,
        'k_segs': k_segs,
        'neff': neff,
        't_seg_mean': t_seg_mean,
        'rayleigh': rayleigh,
        'two_r': two_r,
        'p_rot': prot_val,
        'f_rot': f_rot_val,
        'time': t.tolist(),
        's1': s1.tolist(),
        's2': s2.tolist(),
        'f_grid': f_sub.tolist(),
        'period_grid': [float(1.0 / f) if f > 0 else 1e9 for f in f_sub],
        'psd1': psd1.tolist(),
        'psd2': psd2.tolist(),
        'ls_psd1': ls_psd1.tolist(),
        'ls_psd2': ls_psd2.tolist(),
        'norm_psd1': norm_psd1.tolist(),
        'norm_psd2': norm_psd2.tolist(),
        'norm_ls1': norm_ls1.tolist(),
        'norm_ls2': norm_ls2.tolist(),
        'ls_norm1': ls_power1.tolist(),
        'ls_norm2': ls_power2.tolist(),
        'coherence': coh_sub.tolist(),
        'z_fisher': z_sub.tolist(),
        'fap01': fap01,
        'fap1': fap1,
        'fap5': fap5,
        'harmonics': harmonics,
        'peak_f': peak_f,
        'peak_p': peak_p,
        'peak_z': peak_z,
        'segments': timeline_segs,
        'taper': taper,
        't_span': float(data['t_span']),
        'cadence': float(data['cadence']),
        'n_pts': n_pts
    }

def export_welch_1d_plot(welch_res, out_path=None, use_period=False, y_log=False):
    """
    Renders a high-resolution publication PNG (300 DPI) for 1D Welch Analysis:
    1. Time series observations with colored shaded segment spans matching plot_segmentation_scheme().
    2. Power Spectra: Welch PSD overlaid directly on top of Lomb-Scargle Periodogram (log scale).
    3. 1D Welch Bivariate Magnitude-Squared Coherence z(f) with Analytical FAPs and 2R bands.
    4. Diagnostics and Segmentation parameters metadata card.
    """
    if out_path is None:
        out_path = os.path.join(PROJECT_DIR, 'scratch', 'welch_1d_coherence.png')
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    
    fig = plt.figure(figsize=(16, 14), dpi=300)
    fig.patch.set_facecolor('white')
    
    # Vertical stacked layout:
    # 1. Observations + Shaded Segment Bands (Top)
    # 2. Power Spectrum: Welch PSD vs Lomb-Scargle (Middle)
    # 3. 1D Magnitude-Squared Coherence z(f) (Bottom-Middle)
    # 4. Parameters and Segmentation Card (Bottom)
    
    ax_seg = fig.add_axes([0.08, 0.76, 0.88, 0.19])
    ax_psd = fig.add_axes([0.08, 0.49, 0.88, 0.22])
    ax_coh = fig.add_axes([0.08, 0.23, 0.88, 0.22])
    ax_meta = fig.add_axes([0.08, 0.04, 0.88, 0.14])
    
    t = np.array(welch_res['time'])
    s1 = np.array(welch_res['s1'])
    segs = welch_res['segments']
    
    # --- 1. Plot Observations with Shaded Segment Bands ---
    ax_seg.scatter(t, s1, color='black', alpha=0.55, s=12, label='Data points', zorder=3)
    y_min, y_max = float(np.nanmin(s1)), float(np.nanmax(s1))
    y_margin = (y_max - y_min) * 0.15 if y_max != y_min else 1.0
    band_bottom = y_min - y_margin
    band_top = y_max + y_margin
    
    for i, s in enumerate(segs):
        col = s['color']
        t_st = s['t_start']
        t_ed = s['t_end']
        ax_seg.axvspan(t_st, t_ed, color=col, alpha=0.28, zorder=2)
        t_mid = 0.5 * (t_st + t_ed)
        y_text = y_max - (0.05 + 0.10 * (i % 2)) * (y_max - y_min)
        ax_seg.text(t_mid, y_text, f"Seg {s['seg_id']} (N={s['n_pts']})",
                    color=col, fontweight='bold', ha='center', fontsize=8.5, zorder=4)
                    
    ax_seg.set_xlabel("Time (BJD)", fontsize=9.5)
    ax_seg.set_ylabel(f"{welch_res['series1_label']}", fontsize=10)
    ax_seg.set_title(f"Time-Domain Segmentation Scheme (K = {welch_res['k_segs']} segments, 100% Data Preserved)",
                     fontsize=11, fontweight='bold', pad=8)
    ax_seg.set_ylim([band_bottom, band_top])
    ax_seg.grid(True, color='0.88', ls=':', lw=0.6)
    
    # --- 2. Power Spectrum: Welch PSD vs Lomb-Scargle ---
    f_grid = np.array(welch_res['f_grid'])
    x_axis = 1.0 / f_grid if use_period else f_grid
    x_label = "Period (days)" if use_period else r"Frequency $f\ (\rm d^{-1})$"
    
    use_norm = welch_res.get('use_norm', True)
    if use_norm and 'norm_psd1' in welch_res:
        w_psd1 = np.array(welch_res['norm_psd1'])
        w_psd2 = np.array(welch_res['norm_psd2'])
        ls_psd1 = np.array(welch_res['norm_ls1'])
        ls_psd2 = np.array(welch_res['norm_ls2'])
        psd_ylabel = r"Normalized Power [$P / P_{\max}$]"
    else:
        w_psd1 = np.array(welch_res['psd1'])
        w_psd2 = np.array(welch_res['psd2'])
        ls_psd1 = np.array(welch_res['ls_psd1'])
        ls_psd2 = np.array(welch_res['ls_psd2'])
        psd_ylabel = r"PSD $\hat{S}(f)$ [Parseval]"
    
    ax_psd.semilogy(x_axis, ls_psd1, color='#757575', ls='-', lw=1.0, alpha=0.85,
                    label=f"Lomb-Scargle: {welch_res['series1_label']}")
    ax_psd.semilogy(x_axis, w_psd1, color='#0D47A1', ls='-', lw=1.5,
                    label=f"Welch PSD: {welch_res['series1_label']}")
    ax_psd.semilogy(x_axis, ls_psd2, color='#9E9E9E', ls='-', lw=1.0, alpha=0.85,
                    label=f"Lomb-Scargle: {welch_res['series2_label']}")
    ax_psd.semilogy(x_axis, w_psd2, color='#B71C1C', ls='-', lw=1.5,
                    label=f"Welch PSD: {welch_res['series2_label']}")
                    
    for h in welch_res['harmonics']:
        xh = h['p_center'] if use_period else h['f_center']
        lbl = r"Rotation ($2\mathcal{R}$)" if h['order'] == 1 else rf"Harmonic {h['order']} ($2\mathcal{{R}})"
        ax_psd.axvline(xh, color='black', ls='-.', lw=0.85, alpha=0.7, label=lbl if h['order'] <= 2 else None)
        if not use_period:
            ax_psd.axvspan(h['f_low'], h['f_high'], color='gray', alpha=0.18)
            
    ax_psd.set_xlabel(x_label, fontsize=9.5)
    ax_psd.set_ylabel(psd_ylabel, fontsize=10)
    ax_psd.set_title("Power Spectrum: Welch PSD vs Lomb-Scargle Periodogram [Log Scale]",
                     fontsize=11, fontweight='bold', pad=8)
    ax_psd.grid(True, color='0.88', ls=':', lw=0.6)
    ax_psd.legend(loc='upper right', fontsize=8.5, framealpha=0.9)
    
    # --- 3. 1D Magnitude-Squared Coherence z(f) ---
    z_vals = np.array(welch_res['z_fisher'])
    if y_log:
        ax_coh.semilogy(x_axis, np.clip(z_vals, 1e-3, None), color='mediumblue', lw=1.4, label=r"$z(f)$ Coherence")
    else:
        ax_coh.plot(x_axis, z_vals, color='mediumblue', lw=1.4, label=r"$z(f)$ Coherence")
        
    ax_coh.axhline(welch_res['fap01'], color='#FF2D55', ls='--', lw=1.0, label='0.1% FAP Threshold')
    ax_coh.axhline(welch_res['fap1'], color='#00E676', ls='-.', lw=1.0, label='1.0% FAP Threshold')
    ax_coh.axhline(welch_res['fap5'], color='#AF52DE', ls=':', lw=1.0, label='5.0% FAP Threshold')
    
    for h in welch_res['harmonics']:
        xh = h['p_center'] if use_period else h['f_center']
        ax_coh.axvline(xh, color='black', ls='-.', lw=0.85, alpha=0.7)
        if not use_period:
            ax_coh.axvspan(h['f_low'], h['f_high'], color='gray', alpha=0.22)
            
    peak_x = welch_res['peak_p'] if use_period else welch_res['peak_f']
    ax_coh.scatter([peak_x], [welch_res['peak_z']], color='orange', s=35, zorder=5,
                   label=f"Peak: P = {welch_res['peak_p']:.2f} d (z = {welch_res['peak_z']:.2f})")
                   
    ax_coh.set_xlabel(x_label, fontsize=9.5)
    ax_coh.set_ylabel(r"$z(f)$", fontsize=11)
    ax_coh.set_title("Magnitude-squared coherence", fontsize=11, fontweight='bold', pad=8)
    max_z = max(welch_res['fap01'] * 1.25, float(np.max(z_vals)) * 1.15)
    if not y_log:
        ax_coh.set_ylim([-0.05, max_z])
    ax_coh.grid(True, color='0.88', ls=':', lw=0.6)
    ax_coh.legend(loc='upper right', fontsize=8.5, framealpha=0.9)
    
    # --- 4. Parameters and Segmentation Card ---
    ax_meta.axis('off')
    meta_bg = FancyBboxPatch((0.0, 0.0), 1.0, 1.0, boxstyle="round,pad=0.02,rounding_size=0.03",
                             facecolor='#F8F9FA', edgecolor='#B0BEC5', lw=1.2,
                             transform=ax_meta.transAxes, zorder=1)
    ax_meta.add_patch(meta_bg)
    
    header_bar = FancyBboxPatch((0.0, 0.86), 1.0, 0.14, boxstyle="round,pad=0.01,rounding_size=0.02",
                                facecolor='#ECEFF1', edgecolor='none',
                                transform=ax_meta.transAxes, zorder=2)
    ax_meta.add_patch(header_bar)
    ax_meta.text(0.03, 0.93, "WELCH BIVARIATE COHERENCE & SEGMENTATION", fontsize=9.5,
                 fontweight='bold', color='#1A237E', va='center', transform=ax_meta.transAxes, zorder=3)
    ax_meta.text(0.97, 0.93, f"Prot = {welch_res['p_rot']:.2f} d",
                 fontsize=9.0, color='#37474F', ha='right', va='center', transform=ax_meta.transAxes, zorder=3)
                 
    lines = [
        [rf"$\bf{{Dataset:}}$ {welch_res['dataset_name']}",
         rf"$\bf{{Mode:}}$ Cross-Coherence (Bivariate)",
         rf"$\bf{{Channels:}}$ {welch_res['series1_label']} x {welch_res['series2_label']}"],
         
        [rf"$\bf{{Timespan:}}$ {welch_res['t_span']:.1f} d ({welch_res['t_span']/365.25:.2f} yr)",
         rf"$\bf{{Observations:}}$ N = {welch_res['n_pts']} (100% kept)",
         rf"$\bf{{Mean\ Cadence:}}$ {welch_res['cadence']:.2f} d"],
         
        [rf"$\bf{{Segmentation:}}$ {welch_res['seg_mode'].title()}",
         rf"$\bf{{Segments\ (K):}}$ {welch_res['k_segs']}",
         rf"$\bf{{Effective\ Segments\ (N_{{eff}}):}}$ {welch_res['neff']:.2f}"],
         
        [rf"$\bf{{Mean\ Duration\ (T_{{seg}}):}}$ {welch_res['t_seg_mean']:.1f} d",
         rf"$\bf{{Resolution\ (2\mathcal{{R}}):}}$ {welch_res['two_r']:.5f} 1/d",
         rf"$\bf{{Rayleigh\ (\mathcal{{R}}):}}$ {welch_res['rayleigh']:.5f} 1/d"],
         
        [rf"$\bf{{Window\ Taper:}}$ {welch_res['taper']}",
         rf"$\bf{{FAP\ Model:}}$ Analytical",
         rf"$\bf{{FAP\ Levels:}}$ 0.1%: {welch_res['fap01']:.2f} | 1%: {welch_res['fap1']:.2f} | 5%: {welch_res['fap5']:.2f}"],
         
        [rf"$\bf{{Dominant\ Peak:}}$ P = {welch_res['peak_p']:.2f} d",
         rf"$\bf{{Peak\ Fisher\ z:}}$ {welch_res['peak_z']:.2f}",
         rf"$\bf{{Rotation\ Harmonic\ Bands:}}$ Ramirez Delgado $2\mathcal{{R}}$"]
    ]
    
    y_start = 0.74
    y_step = 0.135
    for row_idx, row in enumerate(lines):
        y = y_start - row_idx * y_step
        ax_meta.text(0.03, y, row[0], fontsize=8.0, color='#263238', va='center', transform=ax_meta.transAxes, zorder=3)
        ax_meta.text(0.36, y, row[1], fontsize=8.0, color='#263238', va='center', transform=ax_meta.transAxes, zorder=3)
        ax_meta.text(0.69, y, row[2], fontsize=8.0, color='#263238', va='center', transform=ax_meta.transAxes, zorder=3)
        
    plt.savefig(out_path, dpi=300, facecolor=fig.get_facecolor(), edgecolor='none', bbox_inches='tight')
