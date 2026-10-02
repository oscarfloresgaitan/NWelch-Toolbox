#!/usr/bin/env python3
"""
data_loader.py

Unified dataset loader for the NWelch Toolbox.
Supports:
1. HARPS-N Solar Spectroscopic Observations (RV, FWHM, logRHK, SMW, BIS, Contrast, Mg2)
2. OMNI2 Solar Activity Indices (Sunspots R, Lyman-alpha, F10.7 Radio Flux)
3. NEID Solar Observations (RV, delta_fwhm_sq, CaIIHK, Ha06_1, NaI, HeI_2)
"""

import os
import io
import json
import re
import math
import numpy as np
import pandas as pd

SRC_DIR = os.path.dirname(os.path.abspath(__file__))
APP_DIR = os.path.abspath(os.path.join(SRC_DIR, '..'))
PROJECT_DIR = os.path.dirname(APP_DIR)
DATA_DIR = os.path.join(APP_DIR, 'data', 'solar')
UPLOAD_DIR = os.path.join(APP_DIR, 'user_uploads')
MANIFEST_FILE = os.path.join(UPLOAD_DIR, 'manifest.json')
os.makedirs(UPLOAD_DIR, exist_ok=True)

def _resolve_data_file(filename, fallback_rel_path):
    local_path = os.path.join(DATA_DIR, filename)
    if os.path.isfile(local_path):
        return local_path
    fallback_path = os.path.join(PROJECT_DIR, fallback_rel_path)
    if os.path.isfile(fallback_path):
        return fallback_path
    return local_path

DATASET_CONFIGS = {
    'harpsn': {
        'name': 'HARPS-N Solar Observations',
        'file': _resolve_data_file('harpsn_10yr_daily_all_indicators.csv', 'Solar data/dataset 3/harpsn_10yr_daily_all_indicators.csv'),
        'p_rot': 27.28,
        'series': {
            'RV': {'col': 'RV', 'err': 'e_RV', 'unit': 'm/s', 'label': 'Radial Velocity'},
            'FWHM': {'col': 'FWHM', 'err': 'e_FWHM', 'unit': 'm/s', 'label': 'CCF FWHM'},
            'logRHK': {'col': 'logRHK', 'err': 'e_logRHK', 'unit': 'dex', 'label': "log(R'_HK)"},
            'SMW': {'col': 'SMW', 'err': 'e_SMW', 'unit': 'index', 'label': 'Mount Wilson S-Index'},
            'BIS': {'col': 'BIS', 'err': 'e_BIS', 'unit': 'm/s', 'label': 'Bisector Inverse Slope'},
            'Contrast': {'col': 'Contrast', 'err': 'e_Contrast', 'unit': '%', 'label': 'CCF Contrast'},
            'Mg2': {'col': 'Mg2', 'err': 'e_Mg2', 'unit': 'index', 'label': 'Mg II Index'},
        },
        'presets': {
            '10yr': {'label': 'Full 10-Year Baseline (2015-2025)', 't_min': None, 't_max': None},
            'cycle_min_3yr': {'label': 'Solar Cycle 24/25 Min (2018-2021, 3-Yr)', 't_min': 58270.0, 't_max': 59367.0},
            'cycle_max_3yr': {'label': 'Solar Cycle 25 Max (2022-2024, 3-Yr)', 't_min': 59580.0, 't_max': 60675.0},
            'cycle_min': {'label': 'Solar Cycle 24 Min (2018-2020, 2-Yr)', 't_min': 58119.0, 't_max': 58849.0},
            'cycle_max': {'label': 'Solar Cycle 24 Max (2015-2016, 2-Yr)', 't_min': 57219.0, 't_max': 57754.0},
        }
    },
    'omni2': {
        'name': 'OMNI2 Solar Activity Indices',
        'file': _resolve_data_file('omni2_daily_HPK8LJyaIV.lst.txt', 'Solar data/dataset 1/omni2_daily_HPK8LJyaIV.lst.txt'),
        'p_rot': 27.28,
        'series': {
            'R': {'col': 'R', 'err': None, 'unit': 'count', 'label': 'Sunspot Number (Rz)'},
            'Lya': {'col': 'Lya', 'err': None, 'unit': 'W/m²', 'label': 'Lyman-alpha Flux'},
            'F10_7': {'col': 'F10_7', 'err': None, 'unit': 'sfu', 'label': '10.7cm Radio Flux'},
        },
        'presets': {
            '10yr': {'label': '10-Year Baseline (2015-2025)', 'year_min': 2015, 'year_max': 2025},
            'cycle_min_3yr': {'label': 'Solar Cycle 24/25 Min (2018-2021, 3-Yr)', 'year_min': 2018, 'year_max': 2021},
            'cycle_max_3yr': {'label': 'Solar Cycle 25 Max (2022-2024, 3-Yr)', 'year_min': 2022, 'year_max': 2024},
            'cycle_min': {'label': 'Solar Cycle 24 Min (2018-2020)', 'year_min': 2018, 'year_max': 2020},
            'cycle_max': {'label': 'Solar Cycle 24 Max (2014-2016)', 'year_min': 2014, 'year_max': 2016},
            'all_min': {'label': 'All Solar Minimums (1964-2020 Cycles 20-25)', 'mode': 'cycles_min'},
            'all_max': {'label': 'All Solar Maximums (1968-2025 Cycles 20-25)', 'mode': 'cycles_max'},
            'full': {'label': 'Full 60-Year Epoch (1963-2025)', 'year_min': 1963, 'year_max': 2025},
        }
    },
    'neid': {
        'name': 'NEID Solar Observations',
        'file': _resolve_data_file('neid_solar_daily_merged.csv', 'Solar data/dataset 4/neid_solar_daily_merged.csv'),
        'p_rot': 27.28,
        'series': {
            'rv': {'col': 'rv', 'err': 'rv_err', 'unit': 'm/s', 'label': 'Radial Velocity'},
            'delta_fwhm_sq': {'col': 'delta_fwhm_sq', 'err': None, 'unit': 'm²/s²', 'label': 'ΔFWHM²'},
            'CaIIHK': {'col': 'CaIIHK', 'err': 'σ_CaIIHK', 'unit': 'index', 'label': 'Ca II H&K'},
            'Ha06_1': {'col': 'Ha06_1', 'err': 'σ_Ha06_1', 'unit': 'index', 'label': 'H-alpha (0.6Å)'},
            'NaI': {'col': 'NaI', 'err': 'σ_NaI', 'unit': 'index', 'label': 'Na I D'},
            'HeI_2': {'col': 'HeI_2', 'err': 'σ_HeI_2', 'unit': 'index', 'label': 'He I D3'},
        },
        'presets': {
            'full': {'label': 'Full Baseline (2021-2024)', 't_min': None, 't_max': None},
        }
    }
}

def init_uploaded_datasets():
    """Loads any user-uploaded datasets from the manifest file into DATASET_CONFIGS."""
    if os.path.exists(MANIFEST_FILE):
        try:
            with open(MANIFEST_FILE, 'r', encoding='utf-8') as f:
                saved = json.load(f)
            for k, v in saved.items():
                if os.path.exists(v.get('file', '')):
                    DATASET_CONFIGS[k] = v
        except Exception as err:
            print(f"[DataLoader] Warning loading manifest: {err}")

# Load saved custom datasets upon import
init_uploaded_datasets()

def get_available_datasets():
    """Returns dataset metadata for API clients."""
    result = {}
    for key, cfg in DATASET_CONFIGS.items():
        result[key] = {
            'name': cfg['name'],
            'p_rot': cfg['p_rot'],
            'is_custom': cfg.get('is_custom', False),
            'series': {s_key: {'label': s_val['label'], 'unit': s_val['unit']} for s_key, s_val in cfg['series'].items()},
            'presets': {p_key: p_val['label'] for p_key, p_val in cfg['presets'].items()}
        }
    return result

def load_dataset(dataset_key, series1_key, series2_key=None, preset='10yr', t_min=None, t_max=None):
    """
    Loads and preprocesses the requested dataset and time series.
    Returns:
        dict: {
            'time': np.ndarray,
            'time_label': str,
            's1': np.ndarray,
            's1_err': np.ndarray,
            's1_label': str,
            's2': np.ndarray or None,
            's2_err': np.ndarray or None,
            's2_label': str or None,
            'p_rot': float,
            'n_pts': int,
            't_span': float,
            'cadence': float
        }
    """
    if dataset_key not in DATASET_CONFIGS:
        raise ValueError(f"Unknown dataset: {dataset_key}")
    
    cfg = DATASET_CONFIGS[dataset_key]
    
    if dataset_key == 'harpsn':
        df = pd.read_csv(cfg['file'])
        # Time axis
        t_col = 'BJD' if 'BJD' in df.columns else 'time'
        df = df.dropna(subset=[t_col, cfg['series'][series1_key]['col']])
        
        # Preset filtering
        if preset in cfg['presets'] and t_min is None and t_max is None:
            p_cfg = cfg['presets'][preset]
            if p_cfg['t_min'] is not None:
                df = df[df[t_col] >= p_cfg['t_min']]
            if p_cfg['t_max'] is not None:
                df = df[df[t_col] <= p_cfg['t_max']]
        else:
            if t_min is not None:
                df = df[df[t_col] >= float(t_min)]
            if t_max is not None:
                df = df[df[t_col] <= float(t_max)]
                
        df = df.sort_values(t_col).reset_index(drop=True)
        t = df[t_col].values
        # Relative time in days
        time_days = t - t[0]
        
        col1 = cfg['series'][series1_key]['col']
        err_col1 = cfg['series'][series1_key]['err']
        s1 = df[col1].values
        s1_err = df[err_col1].values if err_col1 and err_col1 in df.columns else np.ones_like(s1) * 0.01 * np.std(s1)
        
        s2 = None
        s2_err = None
        s2_label = None
        if series2_key and series2_key in cfg['series']:
            col2 = cfg['series'][series2_key]['col']
            err_col2 = cfg['series'][series2_key]['err']
            s2 = df[col2].values
            s2_err = df[err_col2].values if err_col2 and err_col2 in df.columns else np.ones_like(s2) * 0.01 * np.std(s2)
            s2_label = f"{cfg['series'][series2_key]['label']} ({cfg['series'][series2_key]['unit']})"
            
        return {
            'time': time_days,
            'bjd_raw': t,
            'time_label': 'Time (days)',
            's1': s1,
            's1_err': s1_err,
            's1_label': f"{cfg['series'][series1_key]['label']} ({cfg['series'][series1_key]['unit']})",
            's2': s2,
            's2_err': s2_err,
            's2_label': s2_label,
            'p_rot': cfg['p_rot'],
            'n_pts': len(time_days),
            't_span': float(time_days[-1] - time_days[0]),
            'cadence': float(np.median(np.diff(time_days))),
            'dataset_name': cfg['name'],
            'dataset_key': dataset_key
        }

    elif dataset_key == 'omni2':
        records = []
        with open(cfg['file'], 'r') as f:
            for line in f:
                p = line.strip().split()
                if len(p) == 6:
                    records.append([int(p[0]), int(p[1]), float(p[3]), float(p[4]), float(p[5])])
        df = pd.DataFrame(records, columns=['year', 'doy', 'R', 'F10_7', 'Lya'])
        
        # Clean missing values
        df['R'] = pd.Series(np.where(df['R'] >= 990.0, np.nan, df['R'])).interpolate().bfill().ffill().values
        df['F10_7'] = pd.Series(np.where(df['F10_7'] >= 990.0, np.nan, df['F10_7'])).interpolate().bfill().ffill().values
        df['Lya'] = pd.Series(np.where((df['Lya'] >= 990.0) | (df['Lya'] <= 0.0), np.nan, df['Lya'])).interpolate().bfill().ffill().values
        
        # Filtering
        if t_min == '' or t_min is False:
            t_min = None
        if t_max == '' or t_max is False:
            t_max = None

        if preset in ['all_min', 'solar_minima_all'] and t_min is None and t_max is None:
            min_mask = (
                ((df['year'] >= 1964) & (df['year'] <= 1965)) |
                ((df['year'] >= 1974) & (df['year'] <= 1976)) |
                ((df['year'] >= 1985) & (df['year'] <= 1987)) |
                ((df['year'] >= 1995) & (df['year'] <= 1997)) |
                ((df['year'] >= 2007) & (df['year'] <= 2009)) |
                ((df['year'] >= 2018) & (df['year'] <= 2020))
            )
            df = df[min_mask].reset_index(drop=True)
        elif preset in ['all_max', 'solar_maxima_all'] and t_min is None and t_max is None:
            max_mask = (
                ((df['year'] >= 1968) & (df['year'] <= 1970)) |
                ((df['year'] >= 1979) & (df['year'] <= 1981)) |
                ((df['year'] >= 1989) & (df['year'] <= 1991)) |
                ((df['year'] >= 2000) & (df['year'] <= 2002)) |
                ((df['year'] >= 2012) & (df['year'] <= 2014)) |
                ((df['year'] >= 2023) & (df['year'] <= 2025))
            )
            df = df[max_mask].reset_index(drop=True)
        elif preset in cfg['presets'] and t_min is None and t_max is None:
            p_cfg = cfg['presets'][preset]
            if 'year_min' in p_cfg and 'year_max' in p_cfg:
                df = df[(df['year'] >= p_cfg['year_min']) & (df['year'] <= p_cfg['year_max'])].reset_index(drop=True)
        else:
            if t_min is not None and str(t_min).strip() != '':
                df = df[df['year'] >= int(t_min)]
            if t_max is not None and str(t_max).strip() != '':
                df = df[df['year'] <= int(t_max)]
            df = df.reset_index(drop=True)
            
        dates = pd.to_datetime(df['year'].astype(str) + '-' + df['doy'].astype(str), format='%Y-%j')
        ref_date = pd.to_datetime('1963-01-01')
        bjd_days = 2438030.5 + (dates - ref_date).dt.total_seconds().values / 86400.0
        time_days = bjd_days - bjd_days[0]
        
        col1 = cfg['series'][series1_key]['col']
        s1 = df[col1].values
        s1_err = np.ones_like(s1) * 0.01 * np.std(s1)
        
        s2 = None
        s2_err = None
        s2_label = None
        if series2_key and series2_key in cfg['series']:
            col2 = cfg['series'][series2_key]['col']
            s2 = df[col2].values
            s2_err = np.ones_like(s2) * 0.01 * np.std(s2)
            s2_label = f"{cfg['series'][series2_key]['label']} ({cfg['series'][series2_key]['unit']})"
            
        return {
            'time': time_days,
            'bjd_raw': bjd_days,
            'time_label': 'Time (days from start)',
            's1': s1,
            's1_err': s1_err,
            's1_label': f"{cfg['series'][series1_key]['label']} ({cfg['series'][series1_key]['unit']})",
            's2': s2,
            's2_err': s2_err,
            's2_label': s2_label,
            'p_rot': cfg['p_rot'],
            'n_pts': len(time_days),
            't_span': float(time_days[-1] - time_days[0]),
            'cadence': 1.0,
            'dataset_name': cfg['name'],
            'dataset_key': dataset_key
        }

    elif dataset_key == 'neid':
        df = pd.read_csv(cfg['file'])
        t_col = 'bjd'
        df = df.dropna(subset=[t_col, cfg['series'][series1_key]['col']])
        
        if t_min is not None:
            df = df[df[t_col] >= float(t_min)]
        if t_max is not None:
            df = df[df[t_col] <= float(t_max)]
            
        df = df.sort_values(t_col).reset_index(drop=True)
        t = df[t_col].values
        time_days = t - t[0]
        
        col1 = cfg['series'][series1_key]['col']
        err_col1 = cfg['series'][series1_key]['err']
        s1 = df[col1].values
        s1_err = df[err_col1].values if err_col1 and err_col1 in df.columns else np.ones_like(s1) * 0.01 * np.std(s1)
        
        s2 = None
        s2_err = None
        s2_label = None
        if series2_key and series2_key in cfg['series']:
            col2 = cfg['series'][series2_key]['col']
            err_col2 = cfg['series'][series2_key]['err']
            s2 = df[col2].values
            s2_err = df[err_col2].values if err_col2 and err_col2 in df.columns else np.ones_like(s2) * 0.01 * np.std(s2)
            s2_label = f"{cfg['series'][series2_key]['label']} ({cfg['series'][series2_key]['unit']})"
            
        return {
            'time': time_days,
            'bjd_raw': t,
            'time_label': 'Time (days)',
            's1': s1,
            's1_err': s1_err,
            's1_label': f"{cfg['series'][series1_key]['label']} ({cfg['series'][series1_key]['unit']})",
            's2': s2,
            's2_err': s2_err,
            's2_label': s2_label,
            'p_rot': cfg['p_rot'],
            'n_pts': len(time_days),
            't_span': float(time_days[-1] - time_days[0]),
            'cadence': float(np.median(np.diff(time_days))),
            'dataset_name': cfg['name'],
            'dataset_key': dataset_key
        }

    else:
        # Custom User-Uploaded Dataset
        df = pd.read_csv(cfg['file'])
        t_col = cfg.get('time_col', 'time')
        if t_col not in df.columns:
            for c in df.columns:
                if pd.api.types.is_numeric_dtype(df[c]):
                    t_col = c
                    break

        if series1_key not in cfg['series']:
            series1_key = list(cfg['series'].keys())[0]
        col1 = cfg['series'][series1_key]['col']

        cols_to_drop = [t_col, col1]
        if series2_key and series2_key in cfg['series']:
            cols_to_drop.append(cfg['series'][series2_key]['col'])

        df = df.dropna(subset=[c for c in cols_to_drop if c in df.columns])

        if t_min is not None:
            df = df[df[t_col] >= float(t_min)]
        if t_max is not None:
            df = df[df[t_col] <= float(t_max)]

        df = df.sort_values(t_col).reset_index(drop=True)
        t = df[t_col].values.astype(float)
        time_days = t - t[0] if len(t) > 0 else np.array([0.0])

        s1 = df[col1].values.astype(float)
        err_col1 = cfg['series'][series1_key].get('err')
        if err_col1 and err_col1 in df.columns:
            s1_err = df[err_col1].values.astype(float)
        else:
            s1_err = np.ones_like(s1) * 0.01 * (np.nanstd(s1) if np.nanstd(s1) > 0 else 1.0)

        s2 = None
        s2_err = None
        s2_label = None
        if series2_key and series2_key in cfg['series']:
            col2 = cfg['series'][series2_key]['col']
            s2 = df[col2].values.astype(float)
            err_col2 = cfg['series'][series2_key].get('err')
            if err_col2 and err_col2 in df.columns:
                s2_err = df[err_col2].values.astype(float)
            else:
                s2_err = np.ones_like(s2) * 0.01 * (np.nanstd(s2) if np.nanstd(s2) > 0 else 1.0)
            s2_label = f"{cfg['series'][series2_key]['label']} ({cfg['series'][series2_key]['unit']})"

        return {
            'time': time_days,
            'bjd_raw': t,
            'time_label': f"Time ({cfg.get('time_unit', 'days')})",
            's1': s1,
            's1_err': s1_err,
            's1_label': f"{cfg['series'][series1_key]['label']} ({cfg['series'][series1_key]['unit']})",
            's2': s2,
            's2_err': s2_err,
            's2_label': s2_label,
            'p_rot': float(cfg.get('p_rot', 27.28)),
            'n_pts': len(time_days),
            't_span': float(time_days[-1] - time_days[0]) if len(time_days) > 1 else 0.0,
            'cadence': float(np.median(np.diff(time_days))) if len(time_days) > 1 else 1.0,
            'dataset_name': cfg['name'],
            'dataset_key': dataset_key
        }

def load_all_indicators(dataset_key, requested_series=None, preset='10yr', t_min=None, t_max=None):
    """
    Loads all requested indicators (or all available indicators if None) for the given dataset and time window.
    Preserves 100% of observations.
    Returns:
        dict: {
            'time': np.ndarray,
            'bjd_raw': np.ndarray,
            'indicators': {
                key: {
                    'values': np.ndarray,
                    'err': np.ndarray,
                    'unit': str,
                    'label': str,
                    'valid_mask': np.ndarray
                }
            },
            'p_rot': float,
            'n_pts': int,
            't_span': float,
            'cadence': float,
            'dataset_name': str,
            'dataset_key': str
        }
    """
    if dataset_key not in DATASET_CONFIGS:
        raise ValueError(f"Unknown dataset: {dataset_key}")
    
    cfg = DATASET_CONFIGS[dataset_key]
    if requested_series is None:
        target_keys = list(cfg['series'].keys())
    else:
        target_keys = [k for k in requested_series if k in cfg['series']]
        if not target_keys:
            target_keys = list(cfg['series'].keys())

    if dataset_key == 'harpsn':
        df = pd.read_csv(cfg['file'])
        t_col = 'BJD' if 'BJD' in df.columns else 'time'
        df = df.dropna(subset=[t_col])
        if preset in cfg['presets'] and t_min is None and t_max is None:
            p_cfg = cfg['presets'][preset]
            if p_cfg['t_min'] is not None:
                df = df[df[t_col] >= p_cfg['t_min']]
            if p_cfg['t_max'] is not None:
                df = df[df[t_col] <= p_cfg['t_max']]
        else:
            if t_min is not None:
                df = df[df[t_col] >= float(t_min)]
            if t_max is not None:
                df = df[df[t_col] <= float(t_max)]
        df = df.sort_values(t_col).reset_index(drop=True)
        t_raw = df[t_col].values
        time_days = t_raw - t_raw[0]

        indicators = {}
        for k in target_keys:
            s_cfg = cfg['series'][k]
            col = s_cfg['col']
            err_col = s_cfg.get('err')
            if col in df.columns:
                vals = df[col].values
                valid_mask = ~np.isnan(vals)
                if err_col and err_col in df.columns:
                    errs = df[err_col].values
                else:
                    errs = np.ones_like(vals) * 0.01 * np.nanstd(vals)
                indicators[k] = {
                    'values': vals,
                    'err': errs,
                    'unit': s_cfg['unit'],
                    'label': s_cfg['label'],
                    'valid_mask': valid_mask
                }

        return {
            'time': time_days,
            'bjd_raw': t_raw,
            'indicators': indicators,
            'p_rot': cfg['p_rot'],
            'n_pts': len(time_days),
            't_span': float(time_days[-1] - time_days[0]) if len(time_days) > 1 else 0.0,
            'cadence': float(np.median(np.diff(time_days))) if len(time_days) > 1 else 1.0,
            'dataset_name': cfg['name'],
            'dataset_key': dataset_key
        }

    elif dataset_key == 'omni2':
        records = []
        with open(cfg['file'], 'r') as f:
            for line in f:
                p = line.strip().split()
                if len(p) == 6:
                    records.append([int(p[0]), int(p[1]), float(p[3]), float(p[4]), float(p[5])])
        df = pd.DataFrame(records, columns=['year', 'doy', 'R', 'F10_7', 'Lya'])
        df['R'] = pd.Series(np.where(df['R'] >= 990.0, np.nan, df['R'])).interpolate().bfill().ffill().values
        df['F10_7'] = pd.Series(np.where(df['F10_7'] >= 990.0, np.nan, df['F10_7'])).interpolate().bfill().ffill().values
        df['Lya'] = pd.Series(np.where((df['Lya'] >= 990.0) | (df['Lya'] <= 0.0), np.nan, df['Lya'])).interpolate().bfill().ffill().values

        # Filtering
        if t_min == '' or t_min is False:
            t_min = None
        if t_max == '' or t_max is False:
            t_max = None

        if preset in ['all_min', 'solar_minima_all'] and t_min is None and t_max is None:
            min_mask = (
                ((df['year'] >= 1964) & (df['year'] <= 1965)) |
                ((df['year'] >= 1974) & (df['year'] <= 1976)) |
                ((df['year'] >= 1985) & (df['year'] <= 1987)) |
                ((df['year'] >= 1995) & (df['year'] <= 1997)) |
                ((df['year'] >= 2007) & (df['year'] <= 2009)) |
                ((df['year'] >= 2018) & (df['year'] <= 2020))
            )
            df = df[min_mask].reset_index(drop=True)
        elif preset in ['all_max', 'solar_maxima_all'] and t_min is None and t_max is None:
            max_mask = (
                ((df['year'] >= 1968) & (df['year'] <= 1970)) |
                ((df['year'] >= 1979) & (df['year'] <= 1981)) |
                ((df['year'] >= 1989) & (df['year'] <= 1991)) |
                ((df['year'] >= 2000) & (df['year'] <= 2002)) |
                ((df['year'] >= 2012) & (df['year'] <= 2014)) |
                ((df['year'] >= 2023) & (df['year'] <= 2025))
            )
            df = df[max_mask].reset_index(drop=True)
        elif preset in cfg['presets'] and t_min is None and t_max is None:
            p_cfg = cfg['presets'][preset]
            if 'year_min' in p_cfg and 'year_max' in p_cfg:
                df = df[(df['year'] >= p_cfg['year_min']) & (df['year'] <= p_cfg['year_max'])].reset_index(drop=True)
        else:
            if t_min is not None and str(t_min).strip() != '':
                df = df[df['year'] >= int(t_min)]
            if t_max is not None and str(t_max).strip() != '':
                df = df[df['year'] <= int(t_max)]
            df = df.reset_index(drop=True)

        dates = pd.to_datetime(df['year'].astype(str) + '-' + df['doy'].astype(str), format='%Y-%j')
        ref_date = pd.to_datetime('1963-01-01')
        bjd_days = 2438030.5 + (dates - ref_date).dt.total_seconds().values / 86400.0
        time_days = bjd_days - bjd_days[0]
        indicators = {}
        for k in target_keys:
            s_cfg = cfg['series'][k]
            col = s_cfg['col']
            if col in df.columns:
                vals = df[col].values
                valid_mask = ~np.isnan(vals)
                errs = np.ones_like(vals) * 0.01 * np.nanstd(vals)
                indicators[k] = {
                    'values': vals,
                    'err': errs,
                    'unit': s_cfg['unit'],
                    'label': s_cfg['label'],
                    'valid_mask': valid_mask
                }

        return {
            'time': time_days,
            'bjd_raw': bjd_days,
            'indicators': indicators,
            'p_rot': cfg['p_rot'],
            'n_pts': len(time_days),
            't_span': float(time_days[-1] - time_days[0]) if len(time_days) > 1 else 0.0,
            'cadence': float(np.median(np.diff(time_days))) if len(time_days) > 1 else 1.0,
            'dataset_name': cfg['name'],
            'dataset_key': dataset_key
        }

    elif dataset_key == 'neid':
        df = pd.read_csv(cfg['file'])
        t_col = 'bjd'
        df = df.dropna(subset=[t_col])
        if t_min is not None:
            df = df[df[t_col] >= float(t_min)]
        if t_max is not None:
            df = df[df[t_col] <= float(t_max)]
        df = df.sort_values(t_col).reset_index(drop=True)
        t_raw = df[t_col].values
        time_days = t_raw - t_raw[0]

        indicators = {}
        for k in target_keys:
            s_cfg = cfg['series'][k]
            col = s_cfg['col']
            err_col = s_cfg.get('err')
            if col in df.columns:
                vals = df[col].values
                valid_mask = ~np.isnan(vals)
                if err_col and err_col in df.columns:
                    errs = df[err_col].values
                else:
                    errs = np.ones_like(vals) * 0.01 * np.nanstd(vals)
                indicators[k] = {
                    'values': vals,
                    'err': errs,
                    'unit': s_cfg['unit'],
                    'label': s_cfg['label'],
                    'valid_mask': valid_mask
                }

        return {
            'time': time_days,
            'bjd_raw': t_raw,
            'indicators': indicators,
            'p_rot': cfg['p_rot'],
            'n_pts': len(time_days),
            't_span': float(time_days[-1] - time_days[0]) if len(time_days) > 1 else 0.0,
            'cadence': float(np.median(np.diff(time_days))) if len(time_days) > 1 else 1.0,
            'dataset_name': cfg['name'],
            'dataset_key': dataset_key
        }

    else:
        # Custom User-Uploaded Dataset for all indicators
        df = pd.read_csv(cfg['file'])
        t_col = cfg.get('time_col', 'time')
        if t_col not in df.columns:
            for c in df.columns:
                if pd.api.types.is_numeric_dtype(df[c]):
                    t_col = c
                    break
        df = df.dropna(subset=[t_col])
        if t_min is not None:
            df = df[df[t_col] >= float(t_min)]
        if t_max is not None:
            df = df[df[t_col] <= float(t_max)]
        df = df.sort_values(t_col).reset_index(drop=True)
        t_raw = df[t_col].values.astype(float)
        time_days = t_raw - t_raw[0] if len(t_raw) > 0 else np.array([0.0])

        indicators = {}
        for k in target_keys:
            if k in cfg['series']:
                s_cfg = cfg['series'][k]
                col = s_cfg['col']
                err_col = s_cfg.get('err')
                if col in df.columns:
                    vals = df[col].values.astype(float)
                    valid_mask = ~np.isnan(vals)
                    if err_col and err_col in df.columns:
                        errs = df[err_col].values.astype(float)
                    else:
                        std_val = float(np.nanstd(vals))
                        errs = np.ones_like(vals) * 0.01 * (std_val if std_val > 0 else 1.0)
                    indicators[k] = {
                        'values': vals,
                        'err': errs,
                        'unit': s_cfg['unit'],
                        'label': s_cfg['label'],
                        'valid_mask': valid_mask
                    }

        return {
            'time': time_days,
            'bjd_raw': t_raw,
            'indicators': indicators,
            'p_rot': float(cfg.get('p_rot', 27.28)),
            'n_pts': len(time_days),
            't_span': float(time_days[-1] - time_days[0]) if len(time_days) > 1 else 0.0,
            'cadence': float(np.median(np.diff(time_days))) if len(time_days) > 1 else 1.0,
            'dataset_name': cfg['name'],
            'dataset_key': dataset_key
        }

def parse_tabular_text(content_str, delimiter=None, comment_char='#'):
    """
    Robust multi-strategy parser for tabular astronomical and spectroscopic datasets.
    Handles:
      - Variable comment headers (#, //, %, ;)
      - Header lines prefixed by comments (e.g., # BJD RV FWHM)
      - Unprefixed headers after metadata preambles
      - Delimiters: comma, tab, arbitrary whitespace, semicolon
      - Headerless tables (auto-assigns col_0, col_1, ...)
      - Quoted field values and scientific notation
    """
    if not content_str or not content_str.strip():
        raise ValueError("Uploaded file content is empty.")

    lines = content_str.splitlines()
    non_empty_lines = [l for l in lines if l.strip()]
    if not non_empty_lines:
        raise ValueError("File contains only whitespace.")

    comment_prefixes = ('#', '//', '%', ';')
    header_idx = None

    # Step 1: Detect if a commented line contains the actual column headers
    for idx, line in enumerate(non_empty_lines[:25]):
        stripped = line.strip()
        is_comment = any(stripped.startswith(cp) for cp in comment_prefixes)
        if is_comment:
            # Strip comment markers and common labels like 'Column:', 'Columns:'
            uncommented = re.sub(r'^[#/%;\s]+', '', stripped).strip()
            uncommented = re.sub(r'^(column[s]?|header[s]?|field[s]?|column definition[s]?)\s*[:=]\s*', '', uncommented, flags=re.IGNORECASE)
            tokens = [tok for tok in re.split(r'[,;\t\s]+', uncommented) if tok]
            has_letters = any(re.search(r'[a-zA-Z]', tok) for tok in tokens)
            if len(tokens) >= 2 and has_letters:
                # Inspect the next non-empty line to see if data follows
                if idx + 1 < len(non_empty_lines):
                    next_stripped = re.sub(r'^[#/%;\s]+', '', non_empty_lines[idx + 1].strip())
                    next_tokens = [tok for tok in re.split(r'[,;\t\s]+', next_stripped) if tok]
                    num_count = sum(1 for tok in next_tokens if re.match(r'^-?\d+(\.\d+)?([eE][-+]?\d+)?$', tok))
                    if num_count >= max(1, len(next_tokens) * 0.4):
                        header_idx = idx
                        break

    cleaned_lines = list(non_empty_lines)
    if header_idx is not None:
        # Promote the commented header to a clean header line and drop prior comment lines
        hdr_clean = re.sub(r'^[#/%;\s]+', '', cleaned_lines[header_idx]).strip()
        hdr_clean = re.sub(r'^(column[s]?|header[s]?|field[s]?|column definition[s]?)\s*[:=]\s*', '', hdr_clean, flags=re.IGNORECASE)
        cleaned_lines[header_idx] = hdr_clean
        cleaned_lines = cleaned_lines[header_idx:]

    cleaned_text = '\n'.join(cleaned_lines)

    # Step 2: Multi-strategy delimiter & format scanning
    strategies = []
    if delimiter and delimiter != 'auto':
        sep = r'\s+' if delimiter in ['whitespace', ' ', 'space'] else delimiter
        strategies.append({'sep': sep, 'comment': comment_char or '#', 'engine': 'python'})
        strategies.append({'sep': sep, 'comment': None, 'engine': 'python'})
        strategies.append({'sep': sep, 'comment': comment_char or '#', 'engine': 'python', 'on_bad_lines': 'skip'})

    strategies.extend([
        {'sep': None, 'comment': '#', 'engine': 'python'},
        {'sep': ',', 'comment': '#', 'engine': 'python'},
        {'sep': r'\s+', 'comment': '#', 'engine': 'python'},
        {'sep': '\t', 'comment': '#', 'engine': 'python'},
        {'sep': ';', 'comment': '#', 'engine': 'python'},
        {'sep': r'\s+', 'comment': '#', 'engine': 'python', 'on_bad_lines': 'skip'},
        {'sep': ',', 'comment': '#', 'engine': 'python', 'on_bad_lines': 'skip'},
        {'sep': None, 'comment': None, 'engine': 'python', 'on_bad_lines': 'skip'},
        {'sep': r'\s+', 'comment': None, 'engine': 'python', 'on_bad_lines': 'skip'}
    ])

    last_error = None
    for strat in strategies:
        try:
            kwargs = {'engine': strat.get('engine', 'python')}
            if strat.get('sep') is not None:
                kwargs['sep'] = strat['sep']
            if strat.get('comment') is not None:
                kwargs['comment'] = strat['comment']
            if strat.get('on_bad_lines'):
                kwargs['on_bad_lines'] = strat['on_bad_lines']

            df = pd.read_csv(io.StringIO(cleaned_text), **kwargs)
            if not df.empty and len(df.columns) >= 2:
                df.columns = [str(c).strip().replace('"', '').replace("'", "") for c in df.columns]
                # Drop unnamed trailing columns that are entirely NaN
                valid_cols = [c for c in df.columns if not (c.startswith('Unnamed') and df[c].isna().all())]
                if len(valid_cols) >= 2:
                    df = df[valid_cols]
                numeric_cols = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]
                if len(numeric_cols) >= 1:
                    return df
        except Exception as e:
            last_error = e
            continue

    # Step 3: Fallback for headerless numerical tables
    try:
        df = pd.read_csv(io.StringIO(cleaned_text), sep=r'\s+', header=None, comment='#', engine='python', on_bad_lines='skip')
        if not df.empty and len(df.columns) >= 2:
            df.columns = [f"col_{i}" for i in range(len(df.columns))]
            return df
    except Exception:
        pass

    raise ValueError(f"Unable to parse table file. Please check column delimiters and header structure. Parser note: {str(last_error)}")

def inspect_uploaded_file(content_str, filename="dataset.csv", delimiter=None, comment_char='#'):
    """
    Parses an uploaded CSV/TSV/TXT file and auto-detects columns, time axis,
    indicator channels, uncertainty columns, and sampling properties.
    """
    df = parse_tabular_text(content_str, delimiter=delimiter, comment_char=comment_char)
    if df.empty or len(df.columns) < 2:
        raise ValueError("Uploaded file must contain at least 2 columns.")

    all_cols = [str(c).strip() for c in df.columns]
    
    # 1. Identify candidate time columns
    time_tokens = ['bjd', 'hjd', 'mjd', 'rjd', 'jd', 'time', 'date', 'epoch', 'day', 't']
    candidate_time_cols = []
    
    for c in all_cols:
        c_clean = c.lower()
        if c_clean in time_tokens or any(c_clean.startswith(t + '_') or c_clean.endswith('_' + t) or f"_{t}_" in c_clean for t in time_tokens):
            if pd.api.types.is_numeric_dtype(df[c]):
                candidate_time_cols.append(c)

    if not candidate_time_cols:
        for c in all_cols:
            if pd.api.types.is_numeric_dtype(df[c]):
                vals = df[c].dropna().values
                if len(vals) > 5 and np.sum(np.diff(vals) > 0) / len(vals) > 0.8:
                    candidate_time_cols.append(c)

    if not candidate_time_cols:
        for c in all_cols:
            if pd.api.types.is_numeric_dtype(df[c]):
                candidate_time_cols.append(c)
                break

    suggested_time_col = candidate_time_cols[0] if candidate_time_cols else all_cols[0]

    # 2. Identify candidate error/uncertainty columns
    error_cols = set()
    for c in all_cols:
        c_low = c.lower()
        if (c_low.startswith(('e_', 'err_', 'sigma_', 'sig_', 'unc_')) or
            c_low.endswith(('_err', '_error', '_unc', '_sigma', '_sig', '_e')) or
            c_low in ['err', 'error', 'sigma', 'unc']):
            if pd.api.types.is_numeric_dtype(df[c]):
                error_cols.add(c)

    # 3. Identify candidate indicators / signal columns
    candidate_series = {}
    for c in all_cols:
        if c == suggested_time_col or c in error_cols:
            continue
        if pd.api.types.is_numeric_dtype(df[c]):
            c_low = c.lower()
            
            # Infer label and unit
            if 'rv' in c_low or 'vrad' in c_low:
                lbl = 'Radial Velocity'
                unit = 'm/s'
            elif 'fwhm' in c_low:
                lbl = 'CCF FWHM'
                unit = 'm/s'
            elif 'halpha' in c_low or c_low in ['ha', 'ha06_1', 'ha16']:
                lbl = 'H-alpha'
                unit = 'index'
            elif 'cahk' in c_low or 'caii' in c_low:
                lbl = 'Ca II H&K'
                unit = 'index'
            elif 'nad' in c_low or 'nai' in c_low:
                lbl = 'Na I D'
                unit = 'index'
            elif 'hei' in c_low or 'he1' in c_low:
                lbl = 'He I D3'
                unit = 'index'
            elif 'bis' in c_low:
                lbl = 'Bisector Inverse Slope'
                unit = 'm/s'
            elif 'contrast' in c_low:
                lbl = 'CCF Contrast'
                unit = '%'
            elif 'smw' in c_low or 's_index' in c_low or 'sindex' in c_low:
                lbl = 'S-Index'
                unit = 'index'
            elif 'logrhk' in c_low or 'rhk' in c_low:
                lbl = "log(R'HK)"
                unit = 'dex'
            elif 'flux' in c_low:
                lbl = c
                unit = 'flux'
            elif 'mag' in c_low:
                lbl = c
                unit = 'mag'
            else:
                lbl = c
                unit = 'unit'

            # Associate with error column if matching pattern exists
            associated_err = None
            clean_c = re.sub(r'(_sindex|_index|_sq)$', '', c_low)
            for ec in error_cols:
                ec_low = ec.lower()
                clean_ec = re.sub(r'^(e_|err_|sigma_|sig_|unc_)|(_err|_error|_unc|_sigma|_sig|_e)$', '', ec_low)
                if clean_ec == c_low or clean_ec == clean_c or clean_ec in c_low or clean_c in clean_ec:
                    associated_err = ec
                    break

            candidate_series[c] = {
                'col': c,
                'label': lbl,
                'unit': unit,
                'err': associated_err,
                'default_selected': True
            }

    # 4. Summary metrics
    n_pts = len(df)
    t_clean = df[suggested_time_col].dropna().values.astype(float) if suggested_time_col in df.columns else np.arange(n_pts, dtype=float)
    t_clean = np.sort(t_clean)
    t_span = float(t_clean[-1] - t_clean[0]) if len(t_clean) > 1 else 0.0
    dt_vals = np.diff(t_clean)
    dt_pos = dt_vals[dt_vals > 0]
    cadence = float(np.median(dt_pos)) if len(dt_pos) > 0 else 1.0
    gaps_count = int(np.sum(dt_pos > 30.0))

    # Top 5 preview rows - sanitize NaNs and infinities to None for standard JSON compliance
    preview_df = df.head(5).copy()
    raw_records = preview_df.to_dict(orient='records')
    preview_rows = []
    for r in raw_records:
        cleaned_r = {}
        for col_k, val_v in r.items():
            if pd.isna(val_v) or val_v is None:
                cleaned_r[col_k] = None
            elif isinstance(val_v, float) and (math.isnan(val_v) or math.isinf(val_v)):
                cleaned_r[col_k] = None
            elif isinstance(val_v, (np.floating, np.integer)):
                val_num = val_v.item()
                if isinstance(val_num, float) and (math.isnan(val_num) or math.isinf(val_num)):
                    cleaned_r[col_k] = None
                else:
                    cleaned_r[col_k] = val_num
            else:
                cleaned_r[col_k] = val_v
        preview_rows.append(cleaned_r)

    clean_name = os.path.splitext(os.path.basename(filename))[0].replace('_', ' ').replace('-', ' ').title()

    return {
        'filename': filename,
        'dataset_name': clean_name,
        'all_columns': all_cols,
        'candidate_time_cols': candidate_time_cols,
        'suggested_time_col': suggested_time_col,
        'error_cols': sorted(list(error_cols)),
        'candidate_series': candidate_series,
        'preview_rows': preview_rows,
        'n_pts': n_pts,
        't_span': t_span,
        'cadence': cadence,
        'gaps_count': gaps_count,
        'p_rot_guess': 27.28
    }

def save_uploaded_dataset(filename, content_str, dataset_name, p_rot, time_col, time_unit='days', series_mapping=None, delimiter=None, comment_char='#'):
    """
    Saves the uploaded CSV content and registers it persistently into DATASET_CONFIGS and manifest.json.
    Normalizes the file to standard CSV format so subsequent reads are robust and instantaneous.
    """
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    
    slug = re.sub(r'[^a-zA-Z0-9_]', '_', os.path.splitext(os.path.basename(filename))[0]).lower()
    if not slug:
        slug = f"dataset_{int(time.time())}"
    dataset_key = f"custom_{slug}"
    save_filename = f"{slug}.csv"
    save_path = os.path.join(UPLOAD_DIR, save_filename)

    # Parse through resilient table engine and save clean standard CSV
    df = parse_tabular_text(content_str, delimiter=delimiter, comment_char=comment_char)
    df.to_csv(save_path, index=False)

    if series_mapping is None or len(series_mapping) == 0:
        info = inspect_uploaded_file(content_str, filename, delimiter=delimiter, comment_char=comment_char)
        series_mapping = info['candidate_series']

    cfg = {
        'name': dataset_name or slug.replace('_', ' ').title(),
        'file': save_path,
        'p_rot': float(p_rot) if p_rot else 27.28,
        'time_col': time_col,
        'time_unit': time_unit or 'days',
        'is_custom': True,
        'series': series_mapping,
        'presets': {
            'full': {'label': 'Full Baseline (100% observations)', 't_min': None, 't_max': None}
        }
    }

    DATASET_CONFIGS[dataset_key] = cfg

    manifest = {}
    if os.path.exists(MANIFEST_FILE):
        try:
            with open(MANIFEST_FILE, 'r', encoding='utf-8') as f:
                manifest = json.load(f)
        except Exception:
            manifest = {}
    manifest[dataset_key] = cfg
    with open(MANIFEST_FILE, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2)

    return dataset_key, cfg

def delete_uploaded_dataset(dataset_key):
    """Removes a user-uploaded dataset from DATASET_CONFIGS and manifest.json."""
    if dataset_key in DATASET_CONFIGS and DATASET_CONFIGS[dataset_key].get('is_custom'):
        cfg = DATASET_CONFIGS.pop(dataset_key)
        if os.path.exists(cfg.get('file', '')):
            try:
                os.remove(cfg['file'])
            except Exception:
                pass
        if os.path.exists(MANIFEST_FILE):
            try:
                with open(MANIFEST_FILE, 'r', encoding='utf-8') as f:
                    manifest = json.load(f)
                if dataset_key in manifest:
                    del manifest[dataset_key]
                with open(MANIFEST_FILE, 'w', encoding='utf-8') as f:
                    json.dump(manifest, f, indent=2)
            except Exception:
                pass
        return True
    return False


