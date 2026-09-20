#!/usr/bin/env python3
"""Read-only inventory. Missing capabilities are findings, never install success."""
import json
import os
import platform
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path


def probe(argv):
    executable = shutil.which(argv[0])
    if not executable and argv[0] == 'nvidia-smi':
        candidate = Path('/usr/lib/wsl/lib/nvidia-smi')
        if candidate.is_file():
            executable = str(candidate)
    if not executable:
        return {'command': argv, 'status': 'missing'}
    try:
        run = subprocess.run([executable, *argv[1:]], capture_output=True, text=True, timeout=15)
        return {'command': argv, 'status': 'passed' if run.returncode == 0 else 'failed',
                'exit_code': run.returncode, 'output': (run.stdout + run.stderr)[:6000]}
    except (OSError, subprocess.TimeoutExpired) as exc:
        return {'command': argv, 'status': 'failed', 'error': str(exc)}


def main():
    release = platform.release()
    disk = shutil.disk_usage(Path.cwd())
    commands = [['git', '--version'], ['node', '--version'], ['python3', '--version'],
                ['uv', '--version'], ['godot', '--version'], ['ffmpeg', '-version'],
                ['nvidia-smi', '--query-gpu=name,memory.total,memory.free,driver_version', '--format=csv']]
    ram = None
    try:
        ram = os.sysconf('SC_PAGE_SIZE') * os.sysconf('SC_PHYS_PAGES')
    except (ValueError, OSError, AttributeError):
        pass
    print(json.dumps({'checked_at': datetime.now(timezone.utc).isoformat(),
                      'os': platform.system(), 'kernel': release,
                      'wsl_detected': 'microsoft' in release.lower(),
                      'environment_identity': 'unconfirmed: agent must establish local Lenovo versus remote/container',
                      'ram_bytes_visible_to_process': ram,
                      'disk_total_bytes': disk.total, 'disk_free_bytes': disk.free,
                      'probes': [probe(cmd) for cmd in commands],
                      'note': 'Read-only inventory; exit 0 means report generated, not environment ready.'}, indent=2))


if __name__ == '__main__':
    main()
