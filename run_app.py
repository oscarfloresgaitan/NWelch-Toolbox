#!/usr/bin/env python3
"""
run_app.py

Convenience launcher script for the NWelch Toolbox.
Usage:
    python3 run_app.py
"""

import sys
import os
import webbrowser
import threading
import time

APP_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.append(APP_DIR)

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
