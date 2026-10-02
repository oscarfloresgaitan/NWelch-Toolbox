#!/usr/bin/env python3
"""
server.py

REST API and Static Web Server for the NWelch Toolbox.
Uses Python standard library ThreadingHTTPServer.
"""

import os
os.environ['MPLCONFIGDIR'] = '/tmp/mpl_cache'
os.makedirs('/tmp/mpl_cache', exist_ok=True)
import sys
import json
import time
import shutil
import mimetypes
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
import math
import numpy as np

# Ensure project paths
APP_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.abspath(os.path.join(APP_DIR, '..'))
sys.path.append(APP_DIR)
sys.path.append(os.path.join(PROJECT_DIR, 'Dual_Coherence'))

from data_loader import (get_available_datasets, load_dataset, load_all_indicators,
                         inspect_uploaded_file, save_uploaded_dataset, delete_uploaded_dataset)
from coherence_engine import (compute_dual_coherence, extract_slices, export_publication_plot,
                              detect_dual_coherence_peaks, export_selected_plots)
from timeseries_engine import compute_timeseries_diagnostics, export_timeseries_diagnostics_plot
from welch_1d_engine import compute_welch_1d, export_welch_1d_plot, autocalculate_adaptive_segments, partition_into_k_segments
from comparison_engine import (
    run_comparison_analysis,
    export_comparison_publication_plot,
    extract_shared_horizontal_slice,
    extract_shared_antidiagonal_slice
)

WEB_DIR = os.path.join(APP_DIR, 'web')
EXPORT_DIR = os.path.join(APP_DIR, 'exports')
ART_DIR = EXPORT_DIR
os.makedirs(EXPORT_DIR, exist_ok=True)

# Global in-memory cache for fast zero-latency slicing and multi-view state
ACTIVE_SESSION = {
    'coherence': None,
    'slices': None,
    'data_dict': None,
    'params': None,
    'diagnostics': None,
    'welch_1d': None,
    'comparison': None,
    'comparison_params': None
}

def sanitize_for_json(obj):
    """
    Recursively replaces NaN, Infinity, -Infinity, and numpy scalars
    with Python None / standard types to guarantee strict RFC 8259 JSON compliance.
    """
    if isinstance(obj, dict):
        return {k: sanitize_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple)):
        return [sanitize_for_json(v) for v in obj]
    elif isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    elif isinstance(obj, (np.floating, np.integer, np.bool_)):
        item = obj.item()
        if isinstance(item, float) and (math.isnan(item) or math.isinf(item)):
            return None
        return item
    elif isinstance(obj, np.ndarray):
        return sanitize_for_json(obj.tolist())
    return obj

class CoherenceAPIHandler(BaseHTTPRequestHandler):
    def _send_json(self, data, status=200):
        clean_data = sanitize_for_json(data)
        body = json.dumps(clean_data).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        self.wfile.write(body)

    def _send_file(self, filepath, content_type=None):
        if not os.path.exists(filepath):
            self.send_error(404, f"File not found: {filepath}")
            return
        if not content_type:
            content_type, _ = mimetypes.guess_type(filepath)
            if not content_type:
                content_type = 'application/octet-stream'
        with open(filepath, 'rb') as f:
            content = f.read()
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        if self.path == '/' or self.path == '/index.html':
            self._send_file(os.path.join(WEB_DIR, 'index.html'), 'text/html')
        elif self.path.startswith('/api/datasets'):
            datasets = get_available_datasets()
            self._send_json({'status': 'ok', 'datasets': datasets})
        elif self.path.startswith('/web/'):
            rel_path = self.path[5:].split('?')[0]
            file_path = os.path.join(WEB_DIR, rel_path)
            self._send_file(file_path)
        elif self.path.startswith('/plots/'):
            rel_path = self.path[7:].split('?')[0]
            file_path = os.path.join(EXPORT_DIR, rel_path)
            self._send_file(file_path, 'image/png')
        else:
            # Fallback to web dir
            rel_path = self.path.lstrip('/').split('?')[0]
            file_path = os.path.join(WEB_DIR, rel_path)
            if os.path.exists(file_path):
                self._send_file(file_path)
            else:
                self.send_error(404, "Endpoint not found")

    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length) if content_length > 0 else b'{}'
        try:
            req_json = json.loads(post_data.decode('utf-8'))
        except Exception as e:
            self._send_json({'status': 'error', 'message': f"Invalid JSON payload: {str(e)}"}, status=400)
            return

        if self.path == '/api/compute':
            self._handle_compute(req_json)
        elif self.path == '/api/slice':
            self._handle_slice(req_json)
        elif self.path == '/api/export_png':
            self._handle_export_png(req_json)
        elif self.path == '/api/export_csv':
            self._handle_export_csv(req_json)
        elif self.path == '/api/timeseries_diagnostics':
            self._handle_timeseries_diagnostics(req_json)
        elif self.path == '/api/segmentation_suggest':
            self._handle_segmentation_suggest(req_json)
        elif self.path == '/api/welch_1d':
            self._handle_welch_1d(req_json)
        elif self.path == '/api/export_diag_png':
            self._handle_export_diag_png(req_json)
        elif self.path == '/api/export_welch1d_png':
            self._handle_export_welch1d_png(req_json)
        elif self.path == '/api/upload_preview':
            self._handle_upload_preview(req_json)
        elif self.path == '/api/confirm_upload':
            self._handle_confirm_upload(req_json)
        elif self.path == '/api/delete_dataset':
            self._handle_delete_dataset(req_json)
        elif self.path == '/api/detect_peaks':
            self._handle_detect_peaks(req_json)
        elif self.path == '/api/export_plots':
            self._handle_export_plots(req_json)
        elif self.path == '/api/compute_comparison':
            self._handle_compute_comparison(req_json)
        elif self.path == '/api/export_comparison_png':
            self._handle_export_comparison_png(req_json)
        elif self.path == '/api/export_comparison_csv':
            self._handle_export_comparison_csv(req_json)
        elif self.path == '/api/extract_comparison_slice':
            self._handle_extract_comparison_slice(req_json)
        else:
            self.send_error(404, "POST endpoint not found")

    def _handle_compute(self, params):
        try:
            dataset_key = params.get('dataset', 'harpsn')
            series1 = params.get('series1', 'RV')
            series2 = params.get('series2', 'FWHM')
            mode = params.get('mode', 'auto')
            preset = params.get('preset', '10yr')
            t_min = params.get('t_min', None)
            t_max = params.get('t_max', None)
            seg_source = params.get('seg_source', 'uniform')
            custom_segments = params.get('custom_segments', None)
            try:
                L_pts = int(params.get('L_pts', 200))
                if L_pts <= 10:
                    L_pts = 200
            except (TypeError, ValueError):
                L_pts = 200
            overlap = float(params.get('overlap', 0.5))
            taper = params.get('taper', 'KaiserBessel')
            fmin = float(params.get('fmin', 0.0))
            fmax = float(params.get('fmax', 0.10))
            fap_type = params.get('fap_type', 'analytical')
            n_mc = int(params.get('n_mc', 50))

            print(f"[Compute] Loading {dataset_key} ({series1}" + (f" vs {series2}" if mode == 'cross' else "") + f") L={L_pts} seg_source={seg_source} taper={taper}...")
            data_dict = load_dataset(dataset_key, series1, series2, preset=preset, t_min=t_min, t_max=t_max)
            
            coh_res = compute_dual_coherence(data_dict, mode=mode, L_pts=L_pts, overlap=overlap, taper=taper,
                                             fmin=fmin, fmax=fmax, fap_type=fap_type, n_mc=n_mc,
                                             custom_segments=custom_segments, seg_source=seg_source)
            
            # Initial default slice at fundamental rotation
            f_rot = 1.0 / coh_res['p_rot']
            z_mat_np = np.array(coh_res['z_matrix'])
            f_grid_np = np.array(coh_res['f_grid'])
            horizontal_targets = params.get('horizontal_targets', None)
            slices_res = extract_slices(z_mat_np, f_grid_np, f_rot, f_rot, coh_res['p_rot'],
                                        coh_res['bw_2R'], coh_res['df_rayleigh'], coh_res,
                                        horizontal_targets=horizontal_targets)

            # Detect significant peaks
            peaks = detect_dual_coherence_peaks(z_mat_np, f_grid_np, coh_res['p_rot'],
                                                coh_res['bw_2R'], coh_res)
            slices_res['detected_peaks'] = peaks

            # Store in session
            ACTIVE_SESSION['coherence'] = coh_res
            ACTIVE_SESSION['slices'] = slices_res
            ACTIVE_SESSION['data_dict'] = data_dict
            ACTIVE_SESSION['params'] = params

            self._send_json({
                'status': 'ok',
                'coherence': coh_res,
                'slices': slices_res,
                'dataset_info': {
                    'n_pts': data_dict['n_pts'],
                    't_span': data_dict['t_span'],
                    'cadence': data_dict['cadence'],
                    's1_label': data_dict['s1_label'],
                    's2_label': data_dict['s2_label']
                }
            })
        except Exception as e:
            import traceback
            traceback.print_exc()
            self._send_json({'status': 'error', 'message': str(e)}, status=500)

    def _handle_slice(self, params):
        try:
            if ACTIVE_SESSION['coherence'] is None:
                self._send_json({'status': 'error', 'message': "No coherence matrix computed yet. Please compute first."}, status=400)
                return

            coh_res = ACTIVE_SESSION['coherence']
            z_mat_np = np.array(coh_res['z_matrix'])
            f_grid_np = np.array(coh_res['f_grid'])

            f1_sel = float(params.get('f1', 1.0 / coh_res['p_rot']))
            f2_sel = float(params.get('f2', 1.0 / coh_res['p_rot']))
            horizontal_targets = params.get('horizontal_targets', None)

            slices_res = extract_slices(z_mat_np, f_grid_np, f1_sel, f2_sel, coh_res['p_rot'],
                                        coh_res['bw_2R'], coh_res['df_rayleigh'], coh_res,
                                        horizontal_targets=horizontal_targets)
            
            # Retain or compute detected peaks
            if ACTIVE_SESSION.get('slices') and 'detected_peaks' in ACTIVE_SESSION['slices']:
                slices_res['detected_peaks'] = ACTIVE_SESSION['slices']['detected_peaks']
            else:
                slices_res['detected_peaks'] = detect_dual_coherence_peaks(
                    z_mat_np, f_grid_np, coh_res['p_rot'], coh_res['bw_2R'], coh_res
                )

            ACTIVE_SESSION['slices'] = slices_res

            self._send_json({
                'status': 'ok',
                'slices': slices_res
            })
        except Exception as e:
            import traceback
            traceback.print_exc()
            self._send_json({'status': 'error', 'message': str(e)}, status=500)

    def _handle_detect_peaks(self, params):
        try:
            if ACTIVE_SESSION['coherence'] is None:
                self._send_json({'status': 'error', 'message': "No coherence matrix computed yet."}, status=400)
                return
            coh = ACTIVE_SESSION['coherence']
            min_fap = params.get('min_fap', 'fap5')
            max_peaks = int(params.get('max_peaks', 60))
            z_mat_np = np.array(coh['z_matrix'])
            f_grid_np = np.array(coh['f_grid'])
            peaks = detect_dual_coherence_peaks(z_mat_np, f_grid_np, coh['p_rot'], coh['bw_2R'], coh,
                                                min_fap=min_fap, max_peaks=max_peaks)
            if ACTIVE_SESSION.get('slices'):
                ACTIVE_SESSION['slices']['detected_peaks'] = peaks
            self._send_json({'status': 'ok', 'peaks': peaks})
        except Exception as e:
            import traceback
            traceback.print_exc()
            self._send_json({'status': 'error', 'message': str(e)}, status=500)

    def _handle_export_plots(self, params):
        try:
            if ACTIVE_SESSION['coherence'] is None or ACTIVE_SESSION['slices'] is None:
                self._send_json({'status': 'error', 'message': "No active coherence analysis to export."}, status=400)
                return

            selected_plots = params.get('selected_plots', ['composite'])
            colormap = params.get('colormap', 'inferno')
            vmin = float(params.get('vmin', 0.5))
            vmax = float(params.get('vmax', 4.0))
            n_harmonics = int(params.get('n_harmonics', 2))
            custom_periods = params.get('custom_periods', None)
            zoom = params.get('zoom', None)

            exported = export_selected_plots(
                ACTIVE_SESSION['coherence'],
                ACTIVE_SESSION['slices'],
                selected_plots,
                EXPORT_DIR,
                colormap=colormap,
                vmin=vmin,
                vmax=vmax,
                n_harmonics=n_harmonics,
                custom_periods=custom_periods,
                zoom=zoom
            )

            for item in exported:
                item['url'] = f"/plots/{item['filename']}"
                if os.path.exists(item['path']):
                    shutil.copy(item['path'], os.path.join(ART_DIR, item['filename']))

            self._send_json({'status': 'ok', 'files': exported})
        except Exception as e:
            import traceback
            traceback.print_exc()
            self._send_json({'status': 'error', 'message': str(e)}, status=500)

    def _handle_export_png(self, params):
        try:
            if ACTIVE_SESSION['coherence'] is None or ACTIVE_SESSION['slices'] is None:
                self._send_json({'status': 'error', 'message': "No active coherence analysis to export."}, status=400)
                return

            colormap = params.get('colormap', 'inferno')
            vmin = float(params.get('vmin', 0.5))
            vmax = float(params.get('vmax', 4.0))
            n_harmonics = int(params.get('n_harmonics', 2))
            custom_periods = params.get('custom_periods', None)
            horiz_domain = params.get('horiz_domain', 'freq')
            beat_domain = params.get('beat_domain', 'freq')
            horiz_yscale = params.get('horiz_yscale', 'linear')
            beat_yscale = params.get('beat_yscale', 'linear')
            zoom = params.get('zoom', None)

            timestamp = int(time.time())
            filename = f"interactive_dual_coherence_{timestamp}.png"
            export_path = os.path.join(EXPORT_DIR, filename)
            
            export_publication_plot(ACTIVE_SESSION['coherence'], ACTIVE_SESSION['slices'], export_path,
                                    colormap=colormap, vmin=vmin, vmax=vmax,
                                    n_harmonics=n_harmonics, custom_periods=custom_periods,
                                    horiz_domain=horiz_domain, beat_domain=beat_domain,
                                    horiz_yscale=horiz_yscale, beat_yscale=beat_yscale,
                                    zoom=zoom)

            # Copy to brain artifact directory as well
            art_path = os.path.join(ART_DIR, filename)
            shutil.copy(export_path, art_path)

            self._send_json({
                'status': 'ok',
                'filename': filename,
                'url': f"/plots/{filename}",
                'path': export_path
            })
        except Exception as e:
            import traceback
            traceback.print_exc()
            self._send_json({'status': 'error', 'message': str(e)}, status=500)

    def _handle_export_csv(self, params):
        try:
            if ACTIVE_SESSION['slices'] is None:
                self._send_json({'status': 'error', 'message': "No active slices."}, status=400)
                return

            cut_type = params.get('cut_type', 'horizontal')
            slices = ACTIVE_SESSION['slices']

            if cut_type == 'horizontal':
                h = slices['horizontal']
                f1 = h['f1']
                p1 = h['period1']
                z = h['z']
                lines = ["frequency_1_d-1,period_1_days,z_coherence,f2_fixed_d-1"]
                for f_val, p_val, z_val in zip(f1, p1, z):
                    lines.append(f"{f_val:.6f},{p_val:.6f},{z_val:.6f},{h['f2_fixed']:.6f}")
                csv_data = "\n".join(lines)
            elif cut_type == 'antidiagonal':
                ad = slices['antidiagonal']
                lines = ["f1_d-1,f2_d-1,delta_f_d-1,f_beat_d-1,p_beat_days,z_coherence"]
                for f1_v, f2_v, df_v, fb_v, pb_v, z_v in zip(ad['f1'], ad['f2'], ad['delta_f'], ad['f_beat'], ad['p_beat'], ad['z']):
                    lines.append(f"{f1_v:.6f},{f2_v:.6f},{df_v:.6f},{fb_v:.6f},{pb_v:.6f},{z_v:.6f}")
                csv_data = "\n".join(lines)
            else:
                d = slices['diagonal']
                lines = ["frequency_d-1,period_days,z_coherence"]
                for f_v, p_v, z_v in zip(d['f'], d['period'], d['z']):
                    lines.append(f"{f_v:.6f},{p_v:.6f},{z_v:.6f}")
                csv_data = "\n".join(lines)

            self._send_json({
                'status': 'ok',
                'csv': csv_data,
                'cut_type': cut_type
            })
        except Exception as e:
            self._send_json({'status': 'error', 'message': str(e)}, status=500)

    def _handle_timeseries_diagnostics(self, params):
        try:
            dataset_key = params.get('dataset', 'harpsn')
            series_list = params.get('series_list', None)
            preset = params.get('preset', '10yr')
            t_min = params.get('t_min', None)
            t_max = params.get('t_max', None)
            fmin = params.get('fmin', None)
            fmax = params.get('fmax', None)
            f_win_max = float(params.get('f_win_max', 1.5))

            diag_res = compute_timeseries_diagnostics(dataset_key, requested_series=series_list,
                                                      preset=preset, t_min=t_min, t_max=t_max,
                                                      fmin=fmin, fmax=fmax, f_win_max=f_win_max)
            ACTIVE_SESSION['diagnostics'] = diag_res
            self._send_json({'status': 'ok', 'diagnostics': diag_res})
        except Exception as e:
            import traceback
            traceback.print_exc()
            self._send_json({'status': 'error', 'message': str(e)}, status=500)

    def _handle_segmentation_suggest(self, params):
        try:
            dataset_key = params.get('dataset', 'harpsn')
            series1 = params.get('series1', 'RV')
            preset = params.get('preset', '10yr')
            t_min = params.get('t_min', None)
            t_max = params.get('t_max', None)
            k_segments = params.get('k_segments', None)
            min_pts = int(params.get('min_pts', 75))
            fallback_min = int(params.get('fallback_min', 50))
            gap_threshold = float(params.get('gap_threshold', 30.0))
            overlap = float(params.get('overlap', 0.5))

            data = load_dataset(dataset_key, series1, None, preset=preset, t_min=t_min, t_max=t_max)
            t = data['time']
            if k_segments is not None and int(k_segments) > 0:
                seg_info = partition_into_k_segments(t, int(k_segments), min_pts=30,
                                                     gap_threshold=gap_threshold, overlap=overlap)
                campaigns = [{'campaign_id': 1, 'start_idx': 0, 'end_idx': len(t), 'n_pts': len(t)}]
            else:
                seg_info = autocalculate_adaptive_segments(t, min_pts=min_pts, fallback_min=fallback_min,
                                                           gap_threshold=gap_threshold, overlap=overlap)
                campaigns = seg_info.get('campaigns', [])
                
            self._send_json({
                'status': 'ok',
                'k_segs': seg_info['k_segs'],
                'neff': seg_info['neff'],
                'mean_l': seg_info['mean_l'],
                'campaigns': campaigns,
                'segments': seg_info['segments'].tolist()
            })
        except Exception as e:
            import traceback
            traceback.print_exc()
            self._send_json({'status': 'error', 'message': str(e)}, status=500)

    def _handle_welch_1d(self, params):
        try:
            dataset_key = params.get('dataset', 'harpsn')
            series1 = params.get('series1', 'RV')
            series2 = params.get('series2', 'FWHM')
            preset = params.get('preset', '10yr')
            t_min = params.get('t_min', None)
            t_max = params.get('t_max', None)
            seg_mode = params.get('seg_mode', 'adaptive')
            L_pts = int(params.get('L_pts', 100))
            k_segments = params.get('k_segments', None)
            custom_segments = params.get('custom_segments', None)
            overlap = float(params.get('overlap', 0.5))
            taper = params.get('taper', 'None')
            fmax = float(params.get('fmax', 0.15))
            p_rot = params.get('p_rot', None)

            welch_res = compute_welch_1d(dataset_key, series1, series2, preset=preset,
                                         t_min=t_min, t_max=t_max, seg_mode=seg_mode,
                                         L_pts=L_pts, k_segments=k_segments,
                                         custom_segments=custom_segments,
                                         overlap=overlap, taper=taper,
                                         fmax=fmax, p_rot=p_rot)
            ACTIVE_SESSION['welch_1d'] = welch_res
            self._send_json({'status': 'ok', 'welch_1d': welch_res})
        except Exception as e:
            import traceback
            traceback.print_exc()
            self._send_json({'status': 'error', 'message': str(e)}, status=500)

    def _handle_export_diag_png(self, params):
        try:
            if ACTIVE_SESSION.get('diagnostics') is None:
                self._send_json({'status': 'error', 'message': "No active diagnostics to export."}, status=400)
                return

            primary_key = params.get('primary_key', None)
            secondary_keys = params.get('secondary_keys', None)
            p_rot = params.get('p_rot', None)
            fmin = params.get('fmin', None)
            fmax = params.get('fmax', None)
            use_period = bool(params.get('use_period', False))
            y_log = bool(params.get('y_log', True))

            timestamp = int(time.time())
            filename = f"timeseries_diagnostics_{timestamp}.png"
            export_path = os.path.join(EXPORT_DIR, filename)

            export_timeseries_diagnostics_plot(ACTIVE_SESSION['diagnostics'],
                                               primary_key=primary_key,
                                               secondary_keys=secondary_keys,
                                               out_path=export_path,
                                               p_rot=p_rot, fmin=fmin, fmax=fmax,
                                               use_period=use_period, y_log=y_log)

            shutil.copy(export_path, os.path.join(ART_DIR, filename))
            self._send_json({
                'status': 'ok',
                'filename': filename,
                'url': f"/plots/{filename}",
                'path': export_path
            })
        except Exception as e:
            import traceback
            traceback.print_exc()
            self._send_json({'status': 'error', 'message': str(e)}, status=500)

    def _handle_export_welch1d_png(self, params):
        try:
            if ACTIVE_SESSION.get('welch_1d') is None:
                self._send_json({'status': 'error', 'message': "No active 1D Welch analysis to export."}, status=400)
                return

            use_period = bool(params.get('use_period', False))
            y_log = bool(params.get('y_log', False))
            use_norm = bool(params.get('use_norm', True))

            timestamp = int(time.time())
            filename = f"welch_1d_coherence_{timestamp}.png"
            export_path = os.path.join(EXPORT_DIR, filename)

            ACTIVE_SESSION['welch_1d']['use_norm'] = use_norm
            export_welch_1d_plot(ACTIVE_SESSION['welch_1d'],
                                 out_path=export_path,
                                 use_period=use_period, y_log=y_log)

            shutil.copy(export_path, os.path.join(ART_DIR, filename))
            self._send_json({
                'status': 'ok',
                'filename': filename,
                'url': f"/plots/{filename}",
                'path': export_path
            })
        except Exception as e:
            import traceback
            traceback.print_exc()
            self._send_json({'status': 'error', 'message': str(e)}, status=500)

    def _handle_upload_preview(self, params):
        try:
            filename = params.get('filename', 'dataset.csv')
            content = params.get('content', '')
            delimiter = params.get('delimiter', None)
            comment_char = params.get('comment_char', '#')
            if not content or not content.strip():
                self._send_json({'status': 'error', 'message': 'Uploaded file is empty.'}, status=400)
                return
            preview = inspect_uploaded_file(content, filename, delimiter=delimiter, comment_char=comment_char)
            self._send_json({'status': 'ok', 'preview': preview})
        except Exception as e:
            import traceback
            traceback.print_exc()
            self._send_json({'status': 'error', 'message': str(e)}, status=500)

    def _handle_confirm_upload(self, params):
        try:
            filename = params.get('filename', 'dataset.csv')
            content = params.get('content', '')
            dataset_name = params.get('dataset_name', '')
            p_rot = float(params.get('p_rot', 27.28))
            time_col = params.get('time_col', 'time')
            time_unit = params.get('time_unit', 'days')
            series_mapping = params.get('series_mapping', {})
            delimiter = params.get('delimiter', None)
            comment_char = params.get('comment_char', '#')

            if not content or not content.strip():
                self._send_json({'status': 'error', 'message': 'Dataset content cannot be empty.'}, status=400)
                return

            dataset_key, cfg = save_uploaded_dataset(filename, content, dataset_name, p_rot, time_col, time_unit, series_mapping, delimiter=delimiter, comment_char=comment_char)
            print(f"[Upload] Successfully ingested dataset '{cfg['name']}' as '{dataset_key}'")
            self._send_json({
                'status': 'ok',
                'dataset_key': dataset_key,
                'dataset_info': cfg,
                'available_datasets': get_available_datasets()
            })
        except Exception as e:
            import traceback
            traceback.print_exc()
            self._send_json({'status': 'error', 'message': str(e)}, status=500)

    def _handle_delete_dataset(self, params):
        try:
            dataset_key = params.get('dataset_key')
            success = delete_uploaded_dataset(dataset_key)
            self._send_json({
                'status': 'ok',
                'deleted': success,
                'available_datasets': get_available_datasets()
            })
        except Exception as e:
            self._send_json({'status': 'error', 'message': str(e)}, status=500)

    def _handle_compute_comparison(self, params):
        try:
            panel_a = params.get('panel_a', {})
            panel_b = params.get('panel_b', {})
            shared = params.get('shared', {})

            print(f"[Comparison] Running side-by-side comparison ({panel_a.get('label', 'Epoch A')} vs {panel_b.get('label', 'Epoch B')})...")
            result = run_comparison_analysis(panel_a, panel_b, shared)
            ACTIVE_SESSION['comparison'] = result
            ACTIVE_SESSION['comparison_params'] = params
            self._send_json({'status': 'ok', 'comparison_data': result})
        except Exception as e:
            import traceback
            traceback.print_exc()
            self._send_json({'status': 'error', 'message': str(e)}, status=500)

    def _handle_export_comparison_png(self, params):
        try:
            if ACTIVE_SESSION.get('comparison') is None:
                self._send_json({'status': 'error', 'message': 'No comparison computed yet. Please run comparison first.'}, status=400)
                return
            colormap = params.get('colormap', 'inferno')
            vmin = float(params.get('vmin', 0.5))
            vmax = float(params.get('vmax', 4.0))

            timestamp = int(time.time())
            filename = f"comparison_composite_{timestamp}.png"
            export_path = os.path.join(EXPORT_DIR, filename)

            export_comparison_publication_plot(ACTIVE_SESSION['comparison'], export_path,
                                              colormap=colormap, vmin=vmin, vmax=vmax)

            shutil.copy(export_path, os.path.join(ART_DIR, filename))
            self._send_json({
                'status': 'ok',
                'filename': filename,
                'url': f"/plots/{filename}",
                'path': export_path
            })
        except Exception as e:
            import traceback
            traceback.print_exc()
            self._send_json({'status': 'error', 'message': str(e)}, status=500)

    def _handle_export_comparison_csv(self, params):
        try:
            if ACTIVE_SESSION.get('comparison') is None:
                self._send_json({'status': 'error', 'message': 'No comparison computed yet.'}, status=400)
                return

            comp = ACTIVE_SESSION['comparison']['comparison']
            h_cut = comp['shared_horizontal_cut']
            f1 = h_cut['f1']
            za = h_cut['z_a']
            zb = h_cut['z_b']

            timestamp = int(time.time())
            filename = f"comparison_slices_{timestamp}.csv"
            export_path = os.path.join(EXPORT_DIR, filename)

            import csv
            with open(export_path, 'w', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                writer.writerow(['f1_d_inv', 'P1_days', f"z_{comp['label_a']}", f"z_{comp['label_b']}", 'fap01_a', 'fap01_b'])
                for i in range(len(f1)):
                    p1_val = 1.0 / f1[i] if f1[i] > 0 else None
                    writer.writerow([f1[i], p1_val, za[i], zb[i], h_cut['fap01_a'], h_cut['fap01_b']])

            shutil.copy(export_path, os.path.join(ART_DIR, filename))
            self._send_json({
                'status': 'ok',
                'filename': filename,
                'url': f"/plots/{filename}",
                'path': export_path
            })
        except Exception as e:
            import traceback
            traceback.print_exc()
            self._send_json({'status': 'error', 'message': str(e)}, status=500)

    def _handle_extract_comparison_slice(self, params):
        try:
            if ACTIVE_SESSION.get('comparison') is None:
                self._send_json({'status': 'error', 'message': 'No comparison computed yet.'}, status=400)
                return

            comp_data = ACTIVE_SESSION['comparison']
            coh_a = comp_data['panel_a']['coherence']
            coh_b = comp_data['panel_b']['coherence']
            target_f2 = float(params.get('target_f2', 1.0 / 27.28))

            slice_res = extract_shared_horizontal_slice(
                coh_a['f_grid'], coh_a['z_matrix'],
                coh_b['f_grid'], coh_b['z_matrix'],
                target_f2
            )
            slice_res['fap01_a'] = float(coh_a['fap01'])
            slice_res['fap01_b'] = float(coh_b['fap01'])

            ad_slice_res = extract_shared_antidiagonal_slice(
                coh_a['f_grid'], coh_a['z_matrix'],
                coh_b['f_grid'], coh_b['z_matrix'],
                f_mid=target_f2
            )
            ad_slice_res['fap01_a'] = float(coh_a['fap01'])
            ad_slice_res['fap01_b'] = float(coh_b['fap01'])

            comp_data['comparison']['shared_horizontal_cut'] = slice_res
            comp_data['comparison']['shared_antidiagonal_cut'] = ad_slice_res
            self._send_json({'status': 'ok', 'slice': slice_res, 'antidiagonal_slice': ad_slice_res})
        except Exception as e:
            import traceback
            traceback.print_exc()
            self._send_json({'status': 'error', 'message': str(e)}, status=500)


def run_server(port=8050):
    server_address = ('0.0.0.0', port)
    try:
        httpd = ThreadingHTTPServer(server_address, CoherenceAPIHandler)
        print(f"\n================================================================================")
        print(f" NWELCH TOOLBOX RUNNING")
        print(f" Web Interface: http://localhost:{port}")
        print(f"================================================================================\n")
        httpd.serve_forever()
    except OSError as e:
        if "Address already in use" in str(e):
            print(f"Port {port} busy, attempting port {port+1}...")
            run_server(port=port+1)
        else:
            raise e

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8050
    run_server(port)
