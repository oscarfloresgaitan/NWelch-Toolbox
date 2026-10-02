#!/usr/bin/env python3
"""
comparison_engine.py

Module 4 Engine: Side-by-Side Multi-Epoch and Multi-Instrument Comparison.
Supports:
1. Dual-target computation for two distinct epochs or instruments (Panel A vs Panel B).
2. Shared frequency grid interpolation and Delta Coherence Matrix (Δz = z_B - z_A).
3. Linked 1D horizontal cut and anti-diagonal cut comparisons on shared axes.
4. Latitudinal differential rotation beat period measurement (Δf = |f_B - f_A|, P_beat = 1/Δf).
5. High-resolution publication-quality 4-panel composite figure generation.
"""

import os
os.environ['MPLCONFIGDIR'] = '/tmp/mpl_cache'
os.makedirs('/tmp/mpl_cache', exist_ok=True)
import sys
import numpy as np
from scipy.interpolate import RegularGridInterpolator
from scipy.signal import find_peaks
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.colors import PowerNorm, TwoSlopeNorm
from matplotlib.lines import Line2D
from matplotlib.patches import Rectangle

APP_DIR = os.path.dirname(os.path.abspath(__file__))
if APP_DIR not in sys.path:
    sys.path.insert(0, APP_DIR)

from data_loader import load_dataset
from coherence_engine import (compute_dual_coherence, extract_slices, detect_dual_coherence_peaks,
                              ztrans, cthresh)
from welch_1d_engine import compute_welch_1d, partition_into_k_segments, autocalculate_adaptive_segments, SEG_COLORS

def run_comparison_analysis(panel_a_cfg, panel_b_cfg, shared_cfg):
    """
    Executes the dual-pipeline comparison between Panel A and Panel B.
    """
    # 1. Compute Panel A
    data_a = load_dataset(
        panel_a_cfg.get('dataset', 'harpsn'),
        panel_a_cfg.get('series1', 'RV'),
        panel_a_cfg.get('series2', 'FWHM'),
        preset=panel_a_cfg.get('preset', 'cycle_min_3yr'),
        t_min=panel_a_cfg.get('t_min', None),
        t_max=panel_a_cfg.get('t_max', None)
    )
    
    L_a = int(panel_a_cfg.get('L_pts', 200))
    mode_a = panel_a_cfg.get('mode', 'cross' if panel_a_cfg.get('series2') else 'auto')
    taper = shared_cfg.get('taper', 'None')
    fmin = float(shared_cfg.get('fmin', 0.0))
    fmax = float(shared_cfg.get('fmax', 0.10))
    fap_type = shared_cfg.get('fap_type', 'analytical')
    n_mc = int(shared_cfg.get('n_mc', 50))
    
    custom_segs_a = panel_a_cfg.get('custom_segments', None)
    seg_source_a = panel_a_cfg.get('seg_source', 'uniform')
    if panel_a_cfg.get('seg_mode') == 'adaptive' or panel_a_cfg.get('k_segments'):
        k_a = int(panel_a_cfg.get('k_segments', 4))
        seg_res_a = partition_into_k_segments(data_a['time'], k_a, min_pts=20, gap_threshold=30.0, overlap=0.5)
        custom_segs_a = seg_res_a['segments'].tolist()
        seg_source_a = 'adaptive'

    coh_a = compute_dual_coherence(
        data_a, mode=mode_a, L_pts=L_a, overlap=0.5, taper=taper,
        fmin=fmin, fmax=fmax, fap_type=fap_type, n_mc=n_mc,
        custom_segments=custom_segs_a,
        seg_source=seg_source_a
    )

    f_rot_a = 1.0 / coh_a['p_rot']
    z_mat_a = np.array(coh_a['z_matrix'])
    f_grid_a = np.array(coh_a['f_grid'])

    target_f2 = float(shared_cfg.get('horizontal_target', f_rot_a))
    slices_a = extract_slices(
        z_mat_a, f_grid_a, target_f2, target_f2, coh_a['p_rot'],
        coh_a['bw_2R'], coh_a['df_rayleigh'], coh_a,
        horizontal_targets=[target_f2]
    )
    peaks_a = detect_dual_coherence_peaks(
        z_mat_a, f_grid_a, coh_a['p_rot'], coh_a['bw_2R'], coh_a
    )
    slices_a['detected_peaks'] = peaks_a

    # 2. Compute Panel B
    data_b = load_dataset(
        panel_b_cfg.get('dataset', 'harpsn'),
        panel_b_cfg.get('series1', 'RV'),
        panel_b_cfg.get('series2', 'FWHM'),
        preset=panel_b_cfg.get('preset', 'cycle_max_3yr'),
        t_min=panel_b_cfg.get('t_min', None),
        t_max=panel_b_cfg.get('t_max', None)
    )

    L_b = int(panel_b_cfg.get('L_pts', 200))
    mode_b = panel_b_cfg.get('mode', 'cross' if panel_b_cfg.get('series2') else 'auto')

    custom_segs_b = panel_b_cfg.get('custom_segments', None)
    seg_source_b = panel_b_cfg.get('seg_source', 'uniform')
    if panel_b_cfg.get('seg_mode') == 'adaptive' or panel_b_cfg.get('k_segments'):
        k_b = int(panel_b_cfg.get('k_segments', 4))
        seg_res_b = partition_into_k_segments(data_b['time'], k_b, min_pts=20, gap_threshold=30.0, overlap=0.5)
        custom_segs_b = seg_res_b['segments'].tolist()
        seg_source_b = 'adaptive'

    coh_b = compute_dual_coherence(
        data_b, mode=mode_b, L_pts=L_b, overlap=0.5, taper=taper,
        fmin=fmin, fmax=fmax, fap_type=fap_type, n_mc=n_mc,
        custom_segments=custom_segs_b,
        seg_source=seg_source_b
    )
    
    f_rot_b = 1.0 / coh_b['p_rot']
    z_mat_b = np.array(coh_b['z_matrix'])
    f_grid_b = np.array(coh_b['f_grid'])
    
    slices_b = extract_slices(
        z_mat_b, f_grid_b, target_f2, target_f2, coh_b['p_rot'],
        coh_b['bw_2R'], coh_b['df_rayleigh'], coh_b,
        horizontal_targets=[target_f2]
    )
    peaks_b = detect_dual_coherence_peaks(
        z_mat_b, f_grid_b, coh_b['p_rot'], coh_b['bw_2R'], coh_b
    )
    slices_b['detected_peaks'] = peaks_b
    
    # 3. Create Shared Frequency Grid & Delta Matrix (Δz = z_B - z_A)
    f_shared_min = max(float(f_grid_a[0]), float(f_grid_b[0]))
    f_shared_max = min(float(f_grid_a[-1]), float(f_grid_b[-1]))
    n_shared = 160
    f_shared = np.linspace(f_shared_min, f_shared_max, n_shared)
    
    interp_a = RegularGridInterpolator((f_grid_a, f_grid_a), z_mat_a, bounds_error=False, fill_value=0.0)
    interp_b = RegularGridInterpolator((f_grid_b, f_grid_b), z_mat_b, bounds_error=False, fill_value=0.0)
    
    F1, F2 = np.meshgrid(f_shared, f_shared, indexing='ij')
    pts = np.column_stack([F1.ravel(), F2.ravel()])
    z_grid_a = interp_a(pts).reshape((n_shared, n_shared))
    z_grid_b = interp_b(pts).reshape((n_shared, n_shared))
    
    delta_z = z_grid_b - z_grid_a
    
    # 4. Extract Shared 1D Horizontal Cut at target_f2
    cut_pts = np.column_stack([f_shared, np.full_like(f_shared, target_f2)])
    zh_a = interp_a(cut_pts)
    zh_b = interp_b(cut_pts)
    
    # Peak detection in horizontal cut around rotation band
    # Search in window [f_rot * 0.75, f_rot * 1.35]
    f_rot_ref = f_rot_a
    mask_peak_win = (f_shared >= f_rot_ref * 0.70) & (f_shared <= f_rot_ref * 1.35)
    if np.any(mask_peak_win):
        sub_f = f_shared[mask_peak_win]
        sub_za = zh_a[mask_peak_win]
        sub_zb = zh_b[mask_peak_win]
        idx_pk_a = int(np.argmax(sub_za))
        idx_pk_b = int(np.argmax(sub_zb))
        pk_f_a = float(sub_f[idx_pk_a])
        pk_z_a = float(sub_za[idx_pk_a])
        pk_f_b = float(sub_f[idx_pk_b])
        pk_z_b = float(sub_zb[idx_pk_b])
    else:
        pk_f_a = f_rot_ref
        pk_z_a = float(np.max(zh_a))
        pk_f_b = f_rot_ref
        pk_z_b = float(np.max(zh_b))
        
    delta_f = abs(pk_f_b - pk_f_a)
    p_beat = float(1.0 / delta_f) if delta_f > 1e-5 else None
    
    # 5. Extract Shared Anti-Diagonal Cut perpendicular to diagonal
    # Through carrier / mid frequency
    f_mid_ref = float(shared_cfg.get('anti_diagonal_fmid', target_f2))
    s_half = min(f_mid_ref - f_shared_min, f_shared_max - f_mid_ref) * 0.95
    if s_half <= 1e-4:
        s_half = (f_shared_max - f_shared_min) * 0.25
    s_grid = np.linspace(-s_half, s_half, 161)
    # trajectory: f1 = f_mid + s / sqrt(2), f2 = f_mid - s / sqrt(2)
    f1_ad = f_mid_ref + s_grid / np.sqrt(2.0)
    f2_ad = f_mid_ref - s_grid / np.sqrt(2.0)
    ad_pts = np.column_stack([f1_ad, f2_ad])
    zad_a = interp_a(ad_pts)
    zad_b = interp_b(ad_pts)

    idx_pk_ad_a = int(np.argmax(zad_a))
    idx_pk_ad_b = int(np.argmax(zad_b))
    pk_ad_df_a = float(np.sqrt(2.0) * s_grid[idx_pk_ad_a])
    pk_ad_z_a = float(zad_a[idx_pk_ad_a])
    pk_ad_df_b = float(np.sqrt(2.0) * s_grid[idx_pk_ad_b])
    pk_ad_z_b = float(zad_b[idx_pk_ad_b])
    
    label_a = panel_a_cfg.get('label', f"{data_a['dataset_name']} ({panel_a_cfg.get('preset', 'Epoch A')})")
    label_b = panel_b_cfg.get('label', f"{data_b['dataset_name']} ({panel_b_cfg.get('preset', 'Epoch B')})")
    
    comparison_summary = {
        'f_grid_shared': f_shared.tolist(),
        'delta_z': delta_z.tolist(),
        'delta_min': float(np.min(delta_z)),
        'delta_max': float(np.max(delta_z)),
        'label_a': label_a,
        'label_b': label_b,
        'shared_horizontal_cut': {
            'f1': f_shared.tolist(),
            'target_f2': target_f2,
            'target_p2': float(1.0 / target_f2) if target_f2 > 0 else 999.0,
            'z_a': zh_a.tolist(),
            'z_b': zh_b.tolist(),
            'fap01_a': float(coh_a['fap01']),
            'fap1_a': float(coh_a['fap1']),
            'fap5_a': float(coh_a['fap5']),
            'fap01_b': float(coh_b['fap01']),
            'fap1_b': float(coh_b['fap1']),
            'fap5_b': float(coh_b['fap5']),
            'peak_a': {
                'f': pk_f_a,
                'P': float(1.0 / pk_f_a) if pk_f_a > 0 else 999.0,
                'z': pk_z_a
            },
            'peak_b': {
                'f': pk_f_b,
                'P': float(1.0 / pk_f_b) if pk_f_b > 0 else 999.0,
                'z': pk_z_b
            },
            'delta_f': float(delta_f),
            'p_beat': p_beat
        },
        'shared_antidiagonal_cut': {
            's': s_grid.tolist(),
            'delta_f': (np.sqrt(2.0) * s_grid).tolist(),
            'f_mid': f_mid_ref,
            'p_mid': float(1.0 / f_mid_ref) if f_mid_ref > 0 else 999.0,
            'z_a': zad_a.tolist(),
            'z_b': zad_b.tolist(),
            'fap01_a': float(coh_a['fap01']),
            'fap1_a': float(coh_a.get('fap1', coh_a['fap01'])),
            'fap5_a': float(coh_a.get('fap5', coh_a['fap01'])),
            'fap01_b': float(coh_b['fap01']),
            'fap1_b': float(coh_b.get('fap1', coh_b['fap01'])),
            'fap5_b': float(coh_b.get('fap5', coh_b['fap01'])),
            'peak_a': {
                'delta_f': pk_ad_df_a,
                'p_beat': float(1.0 / abs(pk_ad_df_a)) if abs(pk_ad_df_a) > 1e-5 else None,
                'z': pk_ad_z_a
            },
            'peak_b': {
                'delta_f': pk_ad_df_b,
                'p_beat': float(1.0 / abs(pk_ad_df_b)) if abs(pk_ad_df_b) > 1e-5 else None,
                'z': pk_ad_z_b
            }
        },
        'metrics_table': {
            'panel_a': {
                'label': label_a,
                'n_pts': data_a['n_pts'],
                't_span_days': data_a['t_span'],
                'cadence_days': data_a['cadence'],
                'L_pts': L_a,
                'neff': coh_a['neff'],
                'two_r': coh_a['bw_2R'],
                'max_z': float(np.max(z_mat_a)),
                'fap01': float(coh_a['fap01']),
                'peak_f_rot': pk_f_a,
                'peak_p_rot': float(1.0 / pk_f_a) if pk_f_a > 0 else 999.0
            },
            'panel_b': {
                'label': label_b,
                'n_pts': data_b['n_pts'],
                't_span_days': data_b['t_span'],
                'cadence_days': data_b['cadence'],
                'L_pts': L_b,
                'neff': coh_b['neff'],
                'two_r': coh_b['bw_2R'],
                'max_z': float(np.max(z_mat_b)),
                'fap01': float(coh_b['fap01']),
                'peak_f_rot': pk_f_b,
                'peak_p_rot': float(1.0 / pk_f_b) if pk_f_b > 0 else 999.0
            },
            'comparison': {
                'delta_f': float(delta_f),
                'p_beat': p_beat,
                'delta_max_z': float(np.max(z_mat_b) - np.max(z_mat_a))
            }
        }
    }
    
    # 6. Compute 1D Welch Power Spectra, Lomb-Scargle & Bivariate Coherence for Panel A & B
    welch_1d_a = None
    try:
        s2_a = panel_a_cfg.get('series2', None)
        welch_1d_a = compute_welch_1d(
            panel_a_cfg.get('dataset', 'harpsn'),
            panel_a_cfg.get('series1', 'RV'),
            series2_key=s2_a,
            preset=panel_a_cfg.get('preset', '10yr'),
            t_min=panel_a_cfg.get('t_min', None),
            t_max=panel_a_cfg.get('t_max', None),
            seg_mode=seg_source_a,
            L_pts=L_a,
            custom_segments=custom_segs_a,
            taper=taper,
            fmax=fmax,
            fap_type=fap_type,
            n_mc=n_mc
        )
    except Exception as err:
        print(f"[ComparisonEngine] Warning computing 1D Welch for Panel A: {err}")

    welch_1d_b = None
    try:
        s2_b = panel_b_cfg.get('series2', None)
        welch_1d_b = compute_welch_1d(
            panel_b_cfg.get('dataset', 'harpsn'),
            panel_b_cfg.get('series1', 'RV'),
            series2_key=s2_b,
            preset=panel_b_cfg.get('preset', '10yr'),
            t_min=panel_b_cfg.get('t_min', None),
            t_max=panel_b_cfg.get('t_max', None),
            seg_mode=seg_source_b,
            L_pts=L_b,
            custom_segments=custom_segs_b,
            taper=taper,
            fmax=fmax,
            fap_type=fap_type,
            n_mc=n_mc
        )
    except Exception as err:
        print(f"[ComparisonEngine] Warning computing 1D Welch for Panel B: {err}")

    # Construct observation timeline metadata (100% data preservation)
    t_a = data_a['time']
    s1_a = data_a['s1']
    segs_a = coh_a.get('segments', [])
    timeline_segs_a = [
        {
            'seg_id': idx + 1,
            'start_idx': int(s[0]),
            'end_idx': int(s[1]),
            't_start': float(t_a[s[0]]),
            't_end': float(t_a[min(len(t_a) - 1, s[1] - 1)]),
            'n_pts': int(s[1] - s[0]),
            'color': SEG_COLORS[idx % len(SEG_COLORS)]
        }
        for idx, s in enumerate(segs_a)
    ]

    t_b = data_b['time']
    s1_b = data_b['s1']
    segs_b = coh_b.get('segments', [])
    timeline_segs_b = [
        {
            'seg_id': idx + 1,
            'start_idx': int(s[0]),
            'end_idx': int(s[1]),
            't_start': float(t_b[s[0]]),
            't_end': float(t_b[min(len(t_b) - 1, s[1] - 1)]),
            'n_pts': int(s[1] - s[0]),
            'color': SEG_COLORS[idx % len(SEG_COLORS)]
        }
        for idx, s in enumerate(segs_b)
    ]

    return {
        'panel_a': {
            'coherence': coh_a,
            'slices': slices_a,
            'welch_1d': welch_1d_a,
            'timeline': {
                'time': t_a.tolist(),
                's1': s1_a.tolist(),
                's1_label': data_a['s1_label'],
                's1_unit': data_a.get('s1_unit', ''),
                'p_rot': float(data_a['p_rot']),
                'segments': timeline_segs_a
            },
            'dataset_info': {
                'n_pts': data_a['n_pts'],
                't_span': data_a['t_span'],
                'cadence': data_a['cadence'],
                's1_label': data_a['s1_label'],
                's2_label': data_a['s2_label'],
                'dataset_name': data_a['dataset_name']
            }
        },
        'panel_b': {
            'coherence': coh_b,
            'slices': slices_b,
            'welch_1d': welch_1d_b,
            'timeline': {
                'time': t_b.tolist(),
                's1': s1_b.tolist(),
                's1_label': data_b['s1_label'],
                's1_unit': data_b.get('s1_unit', ''),
                'p_rot': float(data_b['p_rot']),
                'segments': timeline_segs_b
            },
            'dataset_info': {
                'n_pts': data_b['n_pts'],
                't_span': data_b['t_span'],
                'cadence': data_b['cadence'],
                's1_label': data_b['s1_label'],
                's2_label': data_b['s2_label'],
                'dataset_name': data_b['dataset_name']
            }
        },
        'comparison': comparison_summary
    }

def extract_shared_horizontal_slice(f_grid_a, z_mat_a, f_grid_b, z_mat_b, target_f2, f_shared_min=None, f_shared_max=None):
    """
    Extracts a synchronized horizontal slice at target_f2 across both matrices
    and evaluates differential rotation beat frequencies.
    """
    f_grid_a = np.asarray(f_grid_a, dtype=float)
    z_mat_a = np.asarray(z_mat_a, dtype=float)
    f_grid_b = np.asarray(f_grid_b, dtype=float)
    z_mat_b = np.asarray(z_mat_b, dtype=float)

    if f_shared_min is None:
        f_shared_min = max(float(f_grid_a[0]), float(f_grid_b[0]))
    if f_shared_max is None:
        f_shared_max = min(float(f_grid_a[-1]), float(f_grid_b[-1]))

    n_shared = 160
    f_shared = np.linspace(f_shared_min, f_shared_max, n_shared)

    interp_a = RegularGridInterpolator((f_grid_a, f_grid_a), z_mat_a, bounds_error=False, fill_value=0.0)
    interp_b = RegularGridInterpolator((f_grid_b, f_grid_b), z_mat_b, bounds_error=False, fill_value=0.0)

    cut_pts = np.column_stack([f_shared, np.full_like(f_shared, target_f2)])
    zh_a = interp_a(cut_pts)
    zh_b = interp_b(cut_pts)

    mask_peak_win = (f_shared >= target_f2 * 0.70) & (f_shared <= target_f2 * 1.35)
    if np.any(mask_peak_win):
        sub_f = f_shared[mask_peak_win]
        sub_za = zh_a[mask_peak_win]
        sub_zb = zh_b[mask_peak_win]
        idx_pk_a = int(np.argmax(sub_za))
        idx_pk_b = int(np.argmax(sub_zb))
        pk_f_a = float(sub_f[idx_pk_a])
        pk_z_a = float(sub_za[idx_pk_a])
        pk_f_b = float(sub_f[idx_pk_b])
        pk_z_b = float(sub_zb[idx_pk_b])
    else:
        pk_f_a = float(target_f2)
        pk_z_a = float(np.max(zh_a))
        pk_f_b = float(target_f2)
        pk_z_b = float(np.max(zh_b))

    delta_f = abs(pk_f_b - pk_f_a)
    p_beat = float(1.0 / delta_f) if delta_f > 1e-5 else None

    return {
        'f1': f_shared.tolist(),
        'target_f2': float(target_f2),
        'target_p2': float(1.0 / target_f2) if target_f2 > 0 else 999.0,
        'z_a': zh_a.tolist(),
        'z_b': zh_b.tolist(),
        'peak_a': {'f': pk_f_a, 'P': float(1.0 / pk_f_a) if pk_f_a > 0 else 999.0, 'z': pk_z_a},
        'peak_b': {'f': pk_f_b, 'P': float(1.0 / pk_f_b) if pk_f_b > 0 else 999.0, 'z': pk_z_b},
        'delta_f': float(delta_f),
        'p_beat': p_beat
    }

def extract_shared_antidiagonal_slice(f_grid_a, z_mat_a, f_grid_b, z_mat_b, f_mid=None, f_shared_min=None, f_shared_max=None):
    """
    Extracts a synchronized anti-diagonal slice across both matrices at mid/carrier frequency f_mid.
    """
    f_grid_a = np.asarray(f_grid_a, dtype=float)
    z_mat_a = np.asarray(z_mat_a, dtype=float)
    f_grid_b = np.asarray(f_grid_b, dtype=float)
    z_mat_b = np.asarray(z_mat_b, dtype=float)

    if f_shared_min is None:
        f_shared_min = max(float(f_grid_a[0]), float(f_grid_b[0]))
    if f_shared_max is None:
        f_shared_max = min(float(f_grid_a[-1]), float(f_grid_b[-1]))

    if f_mid is None:
        f_mid = 0.5 * (f_shared_min + f_shared_max)

    s_half = min(f_mid - f_shared_min, f_shared_max - f_mid) * 0.95
    if s_half <= 1e-4:
        s_half = (f_shared_max - f_shared_min) * 0.25
    s_grid = np.linspace(-s_half, s_half, 161)
    f1_ad = f_mid + s_grid / np.sqrt(2.0)
    f2_ad = f_mid - s_grid / np.sqrt(2.0)

    interp_a = RegularGridInterpolator((f_grid_a, f_grid_a), z_mat_a, bounds_error=False, fill_value=0.0)
    interp_b = RegularGridInterpolator((f_grid_b, f_grid_b), z_mat_b, bounds_error=False, fill_value=0.0)

    ad_pts = np.column_stack([f1_ad, f2_ad])
    zad_a = interp_a(ad_pts)
    zad_b = interp_b(ad_pts)

    idx_pk_a = int(np.argmax(zad_a))
    idx_pk_b = int(np.argmax(zad_b))
    df_a = float(np.sqrt(2.0) * s_grid[idx_pk_a])
    df_b = float(np.sqrt(2.0) * s_grid[idx_pk_b])

    return {
        's': s_grid.tolist(),
        'delta_f': (np.sqrt(2.0) * s_grid).tolist(),
        'f_mid': float(f_mid),
        'p_mid': float(1.0 / f_mid) if f_mid > 0 else 999.0,
        'z_a': zad_a.tolist(),
        'z_b': zad_b.tolist(),
        'peak_a': {
            'delta_f': df_a,
            'p_beat': float(1.0 / abs(df_a)) if abs(df_a) > 1e-5 else None,
            'z': float(zad_a[idx_pk_a])
        },
        'peak_b': {
            'delta_f': df_b,
            'p_beat': float(1.0 / abs(df_b)) if abs(df_b) > 1e-5 else None,
            'z': float(zad_b[idx_pk_b])
        }
    }

def export_comparison_publication_plot(comp_res, output_path, colormap='inferno', vmin=0.5, vmax=4.0):
    """
    Renders and saves a 4-panel publication composite figure:
    Top-Left: Panel A 2D Heatmap (e.g. Solar Min)
    Top-Right: Panel B 2D Heatmap (e.g. Solar Max)
    Bottom-Left: Direct 1D Horizontal Cut Comparison (Curve A vs Curve B on shared axis with 2R shading and FAPs)
    Bottom-Right: Delta Coherence Matrix Δz = z_B - z_A (Diverging colormap)
    """
    panel_a = comp_res['panel_a']
    panel_b = comp_res['panel_b']
    comp = comp_res['comparison']
    
    coh_a = panel_a['coherence']
    coh_b = panel_b['coherence']
    
    f_grid_a = np.array(coh_a['f_grid'])
    z_mat_a = np.array(coh_a['z_matrix'])
    f_grid_b = np.array(coh_b['f_grid'])
    z_mat_b = np.array(coh_b['z_matrix'])
    
    f_shared = np.array(comp['f_grid_shared'])
    delta_z = np.array(comp['delta_z'])
    
    h_cut = comp['shared_horizontal_cut']
    target_f2 = h_cut['target_f2']
    p_rot_a = coh_a['p_rot']
    f_rot_a = 1.0 / p_rot_a
    
    label_a = comp['label_a']
    label_b = comp['label_b']
    
    fig = plt.figure(figsize=(16, 12))
    gs = fig.add_gridspec(2, 2, height_ratios=[1.15, 1.0], hspace=0.32, wspace=0.25)
    
    norm_p = PowerNorm(gamma=0.70, vmin=vmin, vmax=vmax)
    
    # -------------------------------------------------------------------------
    # Panel 1: Top-Left (Panel A 2D Heatmap)
    # -------------------------------------------------------------------------
    ax_a = fig.add_subplot(gs[0, 0])
    ax_a.set_facecolor('black')
    im_a = ax_a.pcolormesh(f_grid_a, f_grid_a, z_mat_a.T, cmap=colormap, norm=norm_p, shading='auto')
    ax_a.plot([f_grid_a[0], f_grid_a[-1]], [f_grid_a[0], f_grid_a[-1]], color='#B0BEC5', ls='-', lw=1.2, alpha=0.85)
    ax_a.axvline(f_rot_a, color='white', ls=':', lw=1.1, alpha=0.75)
    ax_a.axhline(f_rot_a, color='white', ls=':', lw=1.1, alpha=0.75)
    ax_a.axhline(target_f2, color='#00E676', ls='--', lw=1.5, alpha=0.9, label=rf'Horizontal Cut ($f_2 = {target_f2:.4f}\,\mathrm{{d}}^{{-1}}$)')
    # 2D FAL Contour Overlays for Panel A (Analytical and/or Red-Noise MC)
    fap1_a = coh_a.get('fap1')
    fap01_a = coh_a.get('fap01')
    fap1_an_a = coh_a.get('fap1_analytical')
    fap01_an_a = coh_a.get('fap01_analytical')
    is_mc_a = coh_a.get('fap_type') in ['montecarlo', 'rednoise']

    fal_items_a = []
    if is_mc_a and fap1_an_a is not None:
        fal_items_a.append((fap1_an_a, '#00E676', ':', 0.9))
    if is_mc_a and fap01_an_a is not None:
        fal_items_a.append((fap01_an_a, '#FF2D55', ':', 0.9))
    if fap1_a is not None:
        fal_items_a.append((fap1_a, '#00E676', '--', 1.2))
    if fap01_a is not None:
        fal_items_a.append((fap01_a, '#FF2D55', '-.', 1.2))

    for lvl, col, ls, lw in fal_items_a:
        if np.nanmin(z_mat_a) <= lvl <= np.nanmax(z_mat_a):
            ax_a.contour(f_grid_a, f_grid_a, z_mat_a.T, levels=[lvl], colors=[col],
                         linestyles=[ls], linewidths=[lw], alpha=0.90, zorder=5)

    leg_a = [
        Line2D([0], [0], color='#00E676', ls='--', lw=1.2, label=f"1.0% FAL ({'MC' if is_mc_a else 'Analytical'})"),
        Line2D([0], [0], color='#FF2D55', ls='-.', lw=1.2, label=f"0.1% FAL ({'MC' if is_mc_a else 'Analytical'})"),
    ]
    ax_a.legend(handles=leg_a, loc='upper left', fontsize=7.5, facecolor='black', edgecolor='0.3', labelcolor='white')

    ax_a.set_aspect('equal')
    ax_a.set_xlabel(r"Frequency $f_1$ (d$^{-1}$)", fontsize=10.5)
    ax_a.set_ylabel(r"Frequency $f_2$ (d$^{-1}$)", fontsize=10.5)
    ax_a.set_title(f"{label_a}\n$N = {panel_a['dataset_info']['n_pts']}$, $N_{{\\rm eff}} = {coh_a['neff']:.1f}$, $2\\mathcal{{R}} = {coh_a['bw_2R']:.4f}\\,\\mathrm{{d}}^{{-1}}$",
                   fontsize=11, weight='bold', pad=7)
    cb_a = fig.colorbar(im_a, ax=ax_a, orientation='horizontal', pad=0.18, shrink=0.75, aspect=24)
    cb_a.set_label(r"Fisher $z(f_1, f_2)$", fontsize=8.5)
    cb_a.ax.tick_params(labelsize=8)
    
    # -------------------------------------------------------------------------
    # Panel 2: Top-Right (Panel B 2D Heatmap)
    # -------------------------------------------------------------------------
    ax_b = fig.add_subplot(gs[0, 1])
    ax_b.set_facecolor('black')
    im_b = ax_b.pcolormesh(f_grid_b, f_grid_b, z_mat_b.T, cmap=colormap, norm=norm_p, shading='auto')
    ax_b.plot([f_grid_b[0], f_grid_b[-1]], [f_grid_b[0], f_grid_b[-1]], color='#B0BEC5', ls='-', lw=1.2, alpha=0.85)
    ax_b.axvline(f_rot_a, color='white', ls=':', lw=1.1, alpha=0.75)
    ax_b.axhline(f_rot_a, color='white', ls=':', lw=1.1, alpha=0.75)
    ax_b.axhline(target_f2, color='#FF9100', ls='--', lw=1.5, alpha=0.9, label=rf'Horizontal Cut ($f_2 = {target_f2:.4f}\,\mathrm{{d}}^{{-1}}$)')

    # 2D FAL Contour Overlays for Panel B (Analytical and/or Red-Noise MC)
    fap1_b = coh_b.get('fap1')
    fap01_b = coh_b.get('fap01')
    fap1_an_b = coh_b.get('fap1_analytical')
    fap01_an_b = coh_b.get('fap01_analytical')
    is_mc_b = coh_b.get('fap_type') in ['montecarlo', 'rednoise']

    fal_items_b = []
    if is_mc_b and fap1_an_b is not None:
        fal_items_b.append((fap1_an_b, '#00E676', ':', 0.9))
    if is_mc_b and fap01_an_b is not None:
        fal_items_b.append((fap01_an_b, '#FF2D55', ':', 0.9))
    if fap1_b is not None:
        fal_items_b.append((fap1_b, '#00E676', '--', 1.2))
    if fap01_b is not None:
        fal_items_b.append((fap01_b, '#FF2D55', '-.', 1.2))

    for lvl, col, ls, lw in fal_items_b:
        if np.nanmin(z_mat_b) <= lvl <= np.nanmax(z_mat_b):
            ax_b.contour(f_grid_b, f_grid_b, z_mat_b.T, levels=[lvl], colors=[col],
                         linestyles=[ls], linewidths=[lw], alpha=0.90, zorder=5)

    leg_b = [
        Line2D([0], [0], color='#00E676', ls='--', lw=1.2, label=f"1.0% FAL ({'MC' if is_mc_b else 'Analytical'})"),
        Line2D([0], [0], color='#FF2D55', ls='-.', lw=1.2, label=f"0.1% FAL ({'MC' if is_mc_b else 'Analytical'})"),
    ]
    ax_b.legend(handles=leg_b, loc='upper left', fontsize=7.5, facecolor='black', edgecolor='0.3', labelcolor='white')

    ax_b.set_aspect('equal')
    ax_b.set_xlabel(r"Frequency $f_1$ (d$^{-1}$)", fontsize=10.5)
    ax_b.set_ylabel(r"Frequency $f_2$ (d$^{-1}$)", fontsize=10.5)
    ax_b.set_title(f"{label_b}\n$N = {panel_b['dataset_info']['n_pts']}$, $N_{{\\rm eff}} = {coh_b['neff']:.1f}$, $2\\mathcal{{R}} = {coh_b['bw_2R']:.4f}\\,\\mathrm{{d}}^{{-1}}$",
                   fontsize=11, weight='bold', pad=7)
    cb_b = fig.colorbar(im_b, ax=ax_b, orientation='horizontal', pad=0.18, shrink=0.75, aspect=24)
    cb_b.set_label(r"Fisher $z(f_1, f_2)$", fontsize=8.5)
    cb_b.ax.tick_params(labelsize=8)
    
    # -------------------------------------------------------------------------
    # Panel 3: Bottom-Left (1D Horizontal Cut Comparison Overlaid)
    # -------------------------------------------------------------------------
    ax_h = fig.add_subplot(gs[1, 0])
    f1_vals = np.array(h_cut['f1'])
    zh_a = np.array(h_cut['z_a'])
    zh_b = np.array(h_cut['z_b'])
    
    # Ramirez Delgado 2R bandwidth shading around f_rot
    bw_2r_ref = max(coh_a['bw_2R'], coh_b['bw_2R'])
    ax_h.axvspan(f_rot_a - bw_2r_ref / 2.0, f_rot_a + bw_2r_ref / 2.0, color='gray', alpha=0.22,
                 label=r'Rotation ($2\mathcal{R}$)')
    
    ax_h.plot(f1_vals, zh_a, color='#00E676', lw=2.0, alpha=0.95, label=f"{label_a}")
    ax_h.plot(f1_vals, zh_b, color='#FF9100', lw=2.0, alpha=0.95, label=f"{label_b}")
    
    # Peaks
    pk_a = h_cut['peak_a']
    pk_b = h_cut['peak_b']
    ax_h.scatter([pk_a['f']], [pk_a['z']], color='#00E676', edgecolors='black', s=55, zorder=6)
    ax_h.scatter([pk_b['f']], [pk_b['z']], color='#FF9100', edgecolors='black', s=55, zorder=6)
    
    # FAPs
    fap_tag_a = " (MC)" if is_mc_a else " (An)"
    fap_tag_b = " (MC)" if is_mc_b else " (An)"
    if h_cut.get('fap1_a'):
        ax_h.axhline(h_cut['fap1_a'], color='#00E676', ls='--', lw=1.0, alpha=0.6, label=f"1.0% FAP A{fap_tag_a}")
    ax_h.axhline(h_cut['fap01_a'], color='#00E676', ls='-.', lw=1.2, alpha=0.8, label=f"0.1% FAP A{fap_tag_a}")
    if h_cut.get('fap1_b'):
        ax_h.axhline(h_cut['fap1_b'], color='#FF9100', ls='--', lw=1.0, alpha=0.6, label=f"1.0% FAP B{fap_tag_b}")
    ax_h.axhline(h_cut['fap01_b'], color='#FF9100', ls='-.', lw=1.2, alpha=0.8, label=f"0.1% FAP B{fap_tag_b}")
    
    beat_str = rf" | $P_{{\rm beat}} = {h_cut['p_beat']:.1f}\,$d" if h_cut.get('p_beat') else ""
    ax_h.set_title(rf"Coupled Slices $z(f_1 \mid f_2 = {target_f2:.4f}\,$d$^{{-1}})$" + beat_str, fontsize=11, weight='bold', pad=7)
    ax_h.set_xlabel(r"Frequency $f_1$ (d$^{-1}$)", fontsize=10.5)
    ax_h.set_ylabel(r"$z(f_1)$", fontsize=10.5)
    ax_h.grid(True, color='0.88', ls=':')
    ax_h.set_xlim(f1_vals[0], f1_vals[-1])
    ax_h.legend(loc='upper right', fontsize=7.5, framealpha=0.9)
    
    # -------------------------------------------------------------------------
    # Panel 4: Bottom-Right (Delta Coherence Matrix Δz = z_B - z_A)
    # -------------------------------------------------------------------------
    ax_d = fig.add_subplot(gs[1, 1])
    ax_d.set_facecolor('white')
    
    # Centered diverging colormap
    abs_max = max(abs(comp['delta_min']), abs(comp['delta_max']), 0.5)
    norm_diff = TwoSlopeNorm(vmin=-abs_max, vcenter=0.0, vmax=abs_max)
    
    im_d = ax_d.pcolormesh(f_shared, f_shared, delta_z.T, cmap='RdBu_r', norm=norm_diff, shading='auto')
    ax_d.plot([f_shared[0], f_shared[-1]], [f_shared[0], f_shared[-1]], color='#37474F', ls='-', lw=1.1, alpha=0.8)
    ax_d.axvline(f_rot_a, color='#37474F', ls=':', lw=1.1, alpha=0.6)
    ax_d.axhline(f_rot_a, color='#37474F', ls=':', lw=1.1, alpha=0.6)
    ax_d.set_aspect('equal')
    ax_d.set_xlabel(r"Frequency $f_1$ (d$^{-1}$)", fontsize=10.5)
    ax_d.set_ylabel(r"Frequency $f_2$ (d$^{-1}$)", fontsize=10.5)
    ax_d.set_title(rf"Delta Coherence Matrix $\Delta z(f_1, f_2) = z_B - z_A$", fontsize=11, weight='bold', pad=7)
    cb_d = fig.colorbar(im_d, ax=ax_d, orientation='horizontal', pad=0.18, shrink=0.75, aspect=24)
    cb_d.set_label(r"$\Delta z = z_B - z_A$ (Red: Coherence Gain, Blue: Coherence Drop)", fontsize=8.5)
    cb_d.ax.tick_params(labelsize=8)
    
    plt.savefig(output_path, dpi=300, bbox_inches='tight')
    plt.close(fig)
    return output_path
