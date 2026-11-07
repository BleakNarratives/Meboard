#!/usr/bin/env python3
"""
[DNA_TAG]
ORIGIN: Moto4
PILLAR: dynamic_auto_tag
PATH: scanner.py
ROLE: Auto-tagged by Code Sentinel on directory traversal.
LAST_SYNC: 2026-08-01T19:15:00
[/DNA_TAG]
"""

#!/usr/bin/env python3
import os
import sys
import datetime

def scan_for_readiness(root):
    results = []
    for dirpath, dirnames, filenames in os.walk(root):
        # Skip obvious dependency dirs
        if any(x in dirpath for x in ['node_modules', '__pycache__', '.git', 'venv', 'env']):
            continue
        score = 0
        flags = []
        if any(f.endswith('.py') for f in filenames):
            score += 1
            flags.append('has_py')
        if any(f == 'README.md' or f == 'README' for f in filenames):
            score += 2
            flags.append('has_readme')
        if any(f == 'requirements.txt' for f in filenames):
            score += 2
            flags.append('has_reqs')
        if any(f.endswith('.sh') for f in filenames):
            score += 1
            flags.append('has_shell')
        # Check for main() in any .py file – naive but good enough
        for f in filenames:
            if f.endswith('.py'):
                try:
                    with open(os.path.join(dirpath, f), 'r', errors='ignore') as fd:
                        content = fd.read()
                        if 'def main():' in content or 'if __name__ == "__main__":' in content:
                            score += 2
                            flags.append('has_main')
                            break
                except:
                    pass
        if score > 0:
            relpath = os.path.relpath(dirpath, root)
            results.append((relpath, score, flags))
    return results

if __name__ == "__main__":
    root = '/storage/emulated/0/BleakNarratives'
    if not os.path.isdir(root):
        print(f"Error: {root} not found. Please adjust path.")
        sys.exit(1)
    
    print("Scanning... this may take a minute.")
    data = scan_for_readiness(root)
    data.sort(key=lambda x: x[1], reverse=True)
    
    ts = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
    outfile = os.path.expanduser(f"~/scan_report_{ts}.txt")
    with open(outfile, 'w') as f:
        f.write(f"Scan of {root} at {ts}\n")
        f.write("Score = rough readiness (higher is better)\n")
        f.write("-" * 60 + "\n")
        for rel, score, flags in data:
            f.write(f"{score:3d}  {rel}\n")
            f.write(f"      Flags: {', '.join(flags)}\n\n")
    print(f"Report written to {outfile}")
