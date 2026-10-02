#!/usr/bin/env python3
"""
run_app.py

Convenience launcher script for the NWelch Toolbox.
Usage:
    python3 run_app.py
"""

import sys
import os

APP_DIR = os.path.dirname(os.path.abspath(__file__))
SRC_DIR = os.path.join(APP_DIR, 'src')

# Auto-detect nearby virtualenv if running under system python without requirements
def _ensure_venv():
    if hasattr(sys, 'real_prefix') or (hasattr(sys, 'base_prefix') and sys.base_prefix != sys.prefix):
        return  # Already inside a virtual environment
    # Candidate virtualenv paths
    candidates = [
        os.path.join(APP_DIR, 'venv', 'bin', 'python3'),
        os.path.join(APP_DIR, '.venv', 'bin', 'python3'),
        os.path.join(os.path.dirname(APP_DIR), '.venv', 'bin', 'python3'),
        os.path.join(os.path.dirname(APP_DIR), 'venv', 'bin', 'python3'),
    ]
    for py_bin in candidates:
        if os.path.isfile(py_bin) and os.access(py_bin, os.X_OK):
            # Check if this python has our packages
            os.execv(py_bin, [py_bin] + sys.argv)

_ensure_venv()

sys.path.insert(0, SRC_DIR)

import webbrowser
import threading
import time

from server import run_server

def open_browser(port):
    time.sleep(1.2)
    url = f"http://localhost:{port}"
    print(f"\nOpening browser at {url} ...\n")
    try:
        webbrowser.open(url)
    except Exception:
        pass

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8050
    # Launch browser in separate thread
    threading.Thread(target=open_browser, args=(port,), daemon=True).start()
    run_server(port)
