#!/usr/bin/env python3
"""
timeseries_engine.py

Spectral diagnostic engine for Time Series and Lomb-Scargle analysis:
1. Multi-indicator time series observations (100% data preservation).
2. Timestep delta_t distribution and histogram.
3. Sampling Spectral Window Function W(f) with observational alias markers.
4. Lomb-Scargle periodograms with analytical FAP thresholds and rotation harmonics.
5. High-resolution publication composite figure rendering.
"""

import os
os.environ['MPLCONFIGDIR'] = '/tmp/mpl_cache'
os.makedirs('/tmp/mpl_cache', exist_ok=True)
import sys
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch
from astropy.timeseries import LombScargle

APP_DIR = os.path.dirname(os.path.abspath(__file__))
if APP_DIR not in sys.path:
    sys.path.insert(0, APP_DIR)

from data_loader import load_all_indicators, DATASET_CONFIGS
from NWelch.TimeSeries import TimeSeries

ALIAS_FREQUENCIES = [
    {'name': '1-Year', 'f': 1.0 / 365.25, 'color': 'firebrick', 'ls': ':', 'label': '1-Year (365.25 d)'},
    {'name': '6-Month', 'f': 2.0 / 365.25, 'color': 'mediumpurple', 'ls': '-.', 'label': '6-Month (182.6 d)'},
    {'name': '1-Month', 'f': 1.0 / 29.5306, 'color': 'teal', 'ls': ':', 'label': 'Lunar (29.53 d)'},
    {'name': '1-Day', 'f': 1.0, 'color': 'goldenrod', 'ls': '--', 'label': '1-Day (1.0 d)'},
    {'name': '0.5-Day', 'f': 2.0, 'color': 'darkgoldenrod', 'ls': '-.', 'label': '0.5-Day (0.5 d)'}
]

def compute_timeseries_diagnostics(dataset_key, requested_series=None, preset='10yr',
                                  t_min=None, t_max=None, fmin=None, fmax=None,
                                  f_win_max=1.5, oversample=5):
    """
    Computes complete time series diagnostics, sampling distributions,
    spectral window function (symmetric around 0), and Lomb-Scargle periodograms.
    """
    data = load_all_indicators(dataset_key, requested_series=requested_series,
                               preset=preset, t_min=t_min, t_max=t_max)
    t = data['time']
    n_pts = len(t)
    if n_pts < 3:
        raise ValueError("At least 3 observation points are required for diagnostics.")
    
    dt = np.diff(t)
    dt_positive = dt[dt > 0]
    
    # 1. Delta_t histogram and summary metrics
    log_dt = np.log10(dt_positive) if len(dt_positive) > 0 else np.array([0.0])
    hist_counts, bin_edges = np.histogram(log_dt, bins=min(30, max(10, len(dt_positive) // 10)))
    bin_centers = 0.5 * (bin_edges[:-1] + bin_edges[1:])
    
    dt_stats = {
        'n_pts': n_pts,
        't_span_days': float(data['t_span']),
        'mean_dt': float(np.mean(dt_positive)) if len(dt_positive) > 0 else 1.0,
        'median_dt': float(np.median(dt_positive)) if len(dt_positive) > 0 else 1.0,
        'min_dt': float(np.min(dt_positive)) if len(dt_positive) > 0 else 0.0,
        'max_dt': float(np.max(dt_positive)) if len(dt_positive) > 0 else 0.0,
    }
    
    # 2. Frequency grid configuration
    rayleigh = 1.0 / data['t_span'] if data['t_span'] > 0 else 0.001
    f_start = float(fmin) if fmin is not None and fmin > 0 else max(1e-4, 0.5 * rayleigh)
    f_stop = float(fmax) if fmax is not None and fmax > 0 else 0.15
    df = rayleigh / float(oversample)
    n_freqs = max(500, int((f_stop - f_start) / df))
    freq_grid = np.linspace(f_start, f_stop, n_freqs)
    
    # 3. Spectral Window Functions computed symmetrically around f=0 using NWelch
    # Following Dodson-Robinson / Barnard standard: symmetric in [-win_f_stop, win_f_stop]
    win_f_stop = float(f_win_max) if f_win_max is not None and f_win_max > 0 else max(0.10, f_stop)
    
    # Single-series observational spectral window W(f) via NWelch
    dummy_y = np.ones(n_pts)
    ts_win = TimeSeries(t, dummy_y, display_frequency_info=False)
    ts_win.frequency_grid(win_f_stop, oversample=max(2, int(oversample)))
    ts_win.pow_FT(window='None', N_bootstrap=0, quiet=True)
    win_res = ts_win.spectral_window(plot=False)
    
    win_grid = win_res['frequency_symmetric']
    w_power_raw = win_res['spectral_window']
    w_max = np.max(w_power_raw)
    w_power = (w_power_raw / w_max) if w_max > 0 else w_power_raw

    # Welch-averaged spectral window W_Welch(f) with Kaiser-Bessel taper via NWelch
    try:
        ts_welch_win = TimeSeries(t, dummy_y, display_frequency_info=False)
        ts_welch_win.segment_data(4, win_f_stop, window='KaiserBessel', quiet=True)
        ts_welch_win.Welch_powspec(norm=False)
        res_welch = ts_welch_win.spectral_window_Welch(plot=False)
        f_welch = res_welch['frequency_symmetric']
        w_welch_raw = res_welch['spectral_window_Welch']
        w_welch_max = np.max(w_welch_raw)
        w_welch = (w_welch_raw / w_welch_max) if w_welch_max > 0 else w_welch_raw
    except Exception:
        f_welch = np.array([])
        w_welch = np.array([])

    # Symmetric aliases (positive and negative)
    sym_aliases = []
    for al in ALIAS_FREQUENCIES:
        if al['f'] <= win_f_stop:
            sym_aliases.append({
                'name': f"+{al['name']}",
                'f': al['f'],
                'color': al['color'],
                'ls': al['ls'],
                'label': f"+{al['label']}"
            })
            sym_aliases.append({
                'name': f"-{al['name']}",
                'f': -al['f'],
                'color': al['color'],
                'ls': al['ls'],
                'label': f"-{al['label']}"
            })

    # 4. Lomb-Scargle Periodograms for each indicator
    periodograms = {}
    time_series_payload = {}
    
    for key, ind in data['indicators'].items():
        vals = ind['values']
        mask = ind['valid_mask']
        t_sub = t[mask]
        vals_sub = vals[mask]
        
        # Store time series for plotting (100% data points preserved)
        # Break lines across gaps > 25 days to avoid misleading diagonal lines (Rule 2)
        t_plot = []
        vals_plot = []
        for i in range(len(t_sub)):
            if i > 0 and (t_sub[i] - t_sub[i - 1]) > 25.0:
                t_plot.append(None)
                vals_plot.append(None)
            t_plot.append(float(t_sub[i]))
            vals_plot.append(float(vals_sub[i]))

        time_series_payload[key] = {
            'time': t_plot,
            'values': vals_plot,
            'unit': ind['unit'],
            'label': ind['label'],
            'mean': float(np.mean(vals_sub)),
            'std': float(np.std(vals_sub))
        }
        
        if len(t_sub) >= 10:
            ls = LombScargle(t_sub, vals_sub, normalization='standard')
            power = ls.power(freq_grid)
            
            # Analytical FAP levels using Baluev / standard approximation
            try:
                fap_levels = ls.false_alarm_level([0.001, 0.01, 0.05], method='baluev')
                fap01 = float(fap_levels[0])
                fap1 = float(fap_levels[1])
                fap5 = float(fap_levels[2])
            except Exception:
                fap_levels = ls.false_alarm_level([0.001, 0.01, 0.05], method='single')
                fap01 = float(fap_levels[0])
                fap1 = float(fap_levels[1])
                fap5 = float(fap_levels[2])
                
            peak_idx = int(np.argmax(power))
            peak_freq = float(freq_grid[peak_idx])
            peak_period = float(1.0 / peak_freq) if peak_freq > 0 else 0.0
            peak_power = float(power[peak_idx])
            
            # Parseval PSD conversion (optional comparison)
            df_step = freq_grid[1] - freq_grid[0]
            variance = float(np.var(vals_sub))
            psd_norm = variance / (np.sum(power * df_step) if np.sum(power * df_step) > 0 else 1.0)
            psd_power = power * psd_norm
            
            periodograms[key] = {
                'freq': freq_grid.tolist(),
                'period': (1.0 / freq_grid).tolist(),
                'power': power.tolist(),
                'psd_power': psd_power.tolist(),
                'fap01': fap01,
                'fap1': fap1,
                'fap5': fap5,
                'peak_freq': peak_freq,
                'peak_period': peak_period,
                'peak_power': peak_power,
                'label': ind['label'],
                'unit': ind['unit']
            }
            
    return {
        'dataset_key': dataset_key,
        'dataset_name': data['dataset_name'],
        'p_rot': float(data['p_rot']),
        'dt_stats': dt_stats,
        'dt_hist': {
            'bin_centers': bin_centers.tolist(),
            'counts': hist_counts.tolist(),
            'log_dt': log_dt.tolist()
        },
        'spectral_window': {
            'freq': win_grid.tolist(),
            'power': w_power.tolist(),
            'welch_freq': f_welch.tolist() if len(f_welch) > 0 else [],
            'welch_power': w_welch.tolist() if len(w_welch) > 0 else [],
            'aliases': sym_aliases,
            'f_win_max': float(win_f_stop)
        },
        'time_series': time_series_payload,
        'periodograms': periodograms,
        'f_min': float(f_start),
        'f_max': float(f_stop)
    }

def export_timeseries_diagnostics_plot(diag_res, primary_key=None, secondary_keys=None,
                                      out_path=None, p_rot=None, fmin=None, fmax=None,
                                      use_period=False, y_log=True):
    """
    Renders a high-resolution publication PNG (300 DPI) summarizing:
    1. Multi-indicator Time Series observations.
    2. Delta_t cadence histogram & Spectral Window Function W(f).
    3. Lomb-Scargle Periodograms with analytical FAP thresholds and rotation harmonics.
    4. Parameters and diagnostics metadata card.
    """
    if out_path is None:
        out_path = os.path.join(APP_DIR, 'scratch', 'timeseries_diagnostics.png')
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    
    ts_dict = diag_res['time_series']
    pg_dict = diag_res['periodograms']
    prot_val = p_rot if p_rot is not None else diag_res.get('p_rot', 27.28)
    f_rot_val = 1.0 / prot_val if prot_val > 0 else 0.03666
    
    # Select channels to plot
    all_keys = list(ts_dict.keys())
    if primary_key is None or primary_key not in ts_dict:
        primary_key = all_keys[0] if all_keys else 'RV'
        
    keys_to_plot = [primary_key]
    if secondary_keys:
        for k in secondary_keys:
            if k in ts_dict and k not in keys_to_plot:
                keys_to_plot.append(k)
    elif len(all_keys) > 1:
        keys_to_plot.append(all_keys[1])
        
    # Layout definition
    fig = plt.figure(figsize=(18, 12), dpi=300)
    fig.patch.set_facecolor('white')
    
    # Axes placement:
    # Left column: Time series observations (top) and Window Function + Cadence (bottom)
    # Right column: Stacked Lomb-Scargle periodograms for selected indicators
    # Bottom Left: Parameters and diagnostics metadata card
    
    n_ts = min(5, len(keys_to_plot))
    ts_palette = ['mediumblue', 'crimson', 'darkorchid', 'teal', 'goldenrod']
    
    # Left Top: Stacked subpanels for observations
    ts_bottom_base = 0.40
    ts_top_base = 0.94
    ts_total_h = ts_top_base - ts_bottom_base
    ts_panel_h = (ts_total_h - (n_ts - 1) * 0.015) / n_ts
    
    ax_ts_list = []
    for i in range(n_ts):
        y_bot = ts_top_base - (i + 1) * ts_panel_h - i * 0.015
        ax_ts = fig.add_axes([0.07, y_bot, 0.42, ts_panel_h])
        ax_ts_list.append(ax_ts)
        
    # Panel 2: Cadence Histogram & Window Function (Left Middle)
    ax_dt = fig.add_axes([0.07, 0.23, 0.19, 0.13])
    ax_win = fig.add_axes([0.30, 0.23, 0.19, 0.13])
    
    # Panel 3: Diagnostics Metadata Card (Left Bottom)
    ax_meta = fig.add_axes([0.07, 0.04, 0.42, 0.15])
    
    # Right Column: Lomb-Scargle Periodograms
    ax_ls1 = fig.add_axes([0.56, 0.54, 0.40, 0.40])
    ax_ls2 = fig.add_axes([0.56, 0.08, 0.40, 0.40]) if n_ts > 1 else None
    
    # --- 1. Plot Time Series Observations in Stacked Subpanels ---
    for i, (k, ax_ts) in enumerate(zip(keys_to_plot[:n_ts], ax_ts_list)):
        t_k = np.array(ts_dict[k]['time'])
        y_k = np.array(ts_dict[k]['values'])
        col = ts_palette[i % len(ts_palette)]
        ax_ts.plot(t_k, y_k, color=col, lw=0.7, alpha=0.45)
        ax_ts.scatter(t_k, y_k, color=col, s=7, alpha=0.75, edgecolors='none', zorder=3)
        ax_ts.set_ylabel(f"{ts_dict[k]['label']}\n[{ts_dict[k]['unit']}]", fontsize=8.5)
        ax_ts.grid(True, color='0.88', ls=':', lw=0.6)
        if i == 0:
            ax_ts.set_title(f"Time Series Observations: {diag_res['dataset_name']} (100% Data Preserved)",
                            fontsize=11, fontweight='bold', pad=8)
        if i < n_ts - 1:
            ax_ts.set_xticklabels([])
        else:
            ax_ts.set_xlabel("Time (BJD)", fontsize=9.5)
        
    # --- 2. Plot Cadence Histogram ---
    log_dt_vals = diag_res['dt_hist']['log_dt']
    ax_dt.hist(log_dt_vals, bins=15, color='#455A64', alpha=0.75, edgecolor='black', lw=0.5)
    ax_dt.set_xlabel(r"$\log_{10}[\Delta t\ (\rm days)]$", fontsize=9)
    ax_dt.set_ylabel("Count", fontsize=9)
    ax_dt.set_title("Sampling Cadence", fontsize=9, fontweight='bold')
    ax_dt.grid(True, color='0.88', ls=':', lw=0.6)
    
    # --- 3. Plot Spectral Window Function W(f) [Symmetric Barnard Style] ---
    win_f = np.array(diag_res['spectral_window']['freq'])
    win_p = np.array(diag_res['spectral_window']['power'])
    ax_win.semilogy(win_f, np.clip(win_p, 1e-4, 1.2), color='dodgerblue', alpha=0.55, lw=0.9, label='Lomb-Scargle')
    if 'welch_freq' in diag_res['spectral_window'] and len(diag_res['spectral_window']['welch_freq']) > 0:
        w_f = np.array(diag_res['spectral_window']['welch_freq'])
        w_p = np.array(diag_res['spectral_window']['welch_power'])
        ax_win.semilogy(w_f, np.clip(w_p, 1e-4, 1.2), color='mediumblue', lw=1.2, label='Welch (Kaiser-Bessel)')
        ax_win.legend(loc='upper right', fontsize=7.5, framealpha=0.85)
    aliases_list = diag_res['spectral_window'].get('aliases', [])
    for al in aliases_list:
        ax_win.axvline(al['f'], color=al['color'], ls=al['ls'], lw=0.8, alpha=0.8)
    ax_win.set_xlabel(r"Frequency $f\ (\rm d^{-1})$", fontsize=9)
    ax_win.set_ylabel(r"$W(f)$", fontsize=9)
    ax_win.set_title("NWelch Spectral Window W(f)", fontsize=9, fontweight='bold')
    ax_win.set_xlim([np.min(win_f), np.max(win_f)])
    ax_win.set_ylim([1e-4, 1.5])
    ax_win.grid(True, color='0.88', ls=':', lw=0.6)
    
    # --- 4. Plot Lomb-Scargle Periodograms ---
    f_disp_max = fmax if fmax is not None else diag_res['f_max']
    f_disp_min = fmin if fmin is not None else diag_res['f_min']
    
    def plot_single_ls(ax, key, color_line):
        if key not in pg_dict:
            return
        pg = pg_dict[key]
        f_arr = np.array(pg['freq'])
        p_arr = np.array(pg['power'])
        
        mask = (f_arr >= f_disp_min) & (f_arr <= f_disp_max)
        f_sub = f_arr[mask]
        p_sub = p_arr[mask]
        
        x_vals = 1.0 / f_sub if use_period else f_sub
        
        if y_log:
            ax.semilogy(x_vals, p_sub, color=color_line, lw=1.0, label=f"{pg['label']} Power")
        else:
            ax.plot(x_vals, p_sub, color=color_line, lw=1.0, label=f"{pg['label']} Power")
            
        # Analytical FAP lines
        ax.axhline(pg['fap01'], color='crimson', ls='--', lw=0.9, label='0.1% FAP Threshold')
        ax.axhline(pg['fap1'], color='mediumspringgreen', ls='-.', lw=0.9, label='1.0% FAP Threshold')
        ax.axhline(pg['fap5'], color='darkorchid', ls=':', lw=0.9, label='5.0% FAP Threshold')
        
        # Stellar rotation harmonics
        for h in range(1, 5):
            fh = h * f_rot_val
            xh = 1.0 / fh if use_period else fh
            if (use_period and xh >= np.min(x_vals) and xh <= np.max(x_vals)) or \
               (not use_period and xh >= f_disp_min and xh <= f_disp_max):
                lbl = "Rotation" if h == 1 else f"Harmonic {h}"
                ax.axvline(xh, color='black', ls='-.', lw=0.8, alpha=0.6)
                
        # Highlight peak
        ax.scatter([1.0 / pg['peak_freq'] if use_period else pg['peak_freq']],
                   [pg['peak_power']], color='orange', s=25, zorder=5,
                   label=f"Peak: P = {pg['peak_period']:.2f} d")
                   
        x_lbl = "Period (days)" if use_period else r"Frequency $f\ (\rm d^{-1})$"
        ax.set_xlabel(x_lbl, fontsize=10)
        ax.set_ylabel("Normalized LS Power", fontsize=10)
        ax.set_title(f"Lomb-Scargle Periodogram: {pg['label']}", fontsize=11, fontweight='bold', pad=8)
        ax.grid(True, color='0.88', ls=':', lw=0.6)
        ax.legend(loc='upper right', fontsize=8, framealpha=0.9)
        
    plot_single_ls(ax_ls1, keys_to_plot[0], 'mediumblue')
    if ax_ls2 is not None:
        plot_single_ls(ax_ls2, keys_to_plot[1], 'crimson')
        
    # --- 5. Diagnostics Metadata Card ---
    ax_meta.axis('off')
    meta_bg = FancyBboxPatch((0.0, 0.0), 1.0, 1.0, boxstyle="round,pad=0.02,rounding_size=0.03",
                             facecolor='#F8F9FA', edgecolor='#B0BEC5', lw=1.2,
                             transform=ax_meta.transAxes, zorder=1)
    ax_meta.add_patch(meta_bg)
    
    header_bar = FancyBboxPatch((0.0, 0.78), 1.0, 0.22, boxstyle="round,pad=0.01,rounding_size=0.02",
                                facecolor='#ECEFF1', edgecolor='none',
                                transform=ax_meta.transAxes, zorder=2)
    ax_meta.add_patch(header_bar)
    ax_meta.text(0.04, 0.88, "TIME SERIES & SAMPLING DIAGNOSTICS", fontsize=9.5,
                 fontweight='bold', color='#1A237E', va='center', transform=ax_meta.transAxes, zorder=3)
    ax_meta.text(0.96, 0.88, f"Stellar Prot = {prot_val:.2f} d (f = {f_rot_val:.4f} 1/d)",
                 fontsize=8.5, color='#37474F', ha='right', va='center', transform=ax_meta.transAxes, zorder=3)
                 
    col1 = [
        rf"$\bf{{Dataset:}}$ {diag_res['dataset_name']}",
        rf"$\bf{{Observations:}}$ N = {diag_res['dt_stats']['n_pts']}",
        rf"$\bf{{Timespan:}}$ {diag_res['dt_stats']['t_span_days']:.1f} d ({diag_res['dt_stats']['t_span_days']/365.25:.2f} yr)"
    ]
    col2 = [
        rf"$\bf{{Median\ Cadence:}}$ {diag_res['dt_stats']['median_dt']:.2f} d",
        rf"$\bf{{Mean\ Cadence:}}$ {diag_res['dt_stats']['mean_dt']:.2f} d",
        rf"$\bf{{Max\ Observing\ Gap:}}$ {diag_res['dt_stats']['max_dt']:.1f} d"
    ]
    p1 = pg_dict.get(keys_to_plot[0], {})
    peak_str1 = f"P = {p1.get('peak_period', 0):.2f} d" if p1 else "N/A"
    col3 = [
        rf"$\bf{{FAP\ Model:}}$ Analytical",
        rf"$\bf{{Primary\ Peak:}}$ {peak_str1}",
        rf"$\bf{{Aliases:}}$ 1-yr, 6-mon, lunar"
    ]
    
    for idx, (c1, c2, c3) in enumerate(zip(col1, col2, col3)):
        y_pos = 0.58 - idx * 0.22
        ax_meta.text(0.04, y_pos, c1, fontsize=8.0, color='#263238', va='center', transform=ax_meta.transAxes, zorder=3)
        ax_meta.text(0.38, y_pos, c2, fontsize=8.0, color='#263238', va='center', transform=ax_meta.transAxes, zorder=3)
        ax_meta.text(0.72, y_pos, c3, fontsize=8.0, color='#263238', va='center', transform=ax_meta.transAxes, zorder=3)
        
    plt.savefig(out_path, dpi=300, facecolor=fig.get_facecolor(), edgecolor='none', bbox_inches='tight')
    plt.close(fig)
    return out_path
