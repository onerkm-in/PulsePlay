import sys
from pathlib import Path

# make `synthetic_poc` importable as a package (scripts/ on path)
SCRIPTS = Path(__file__).resolve().parents[2]
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

REPO_ROOT = Path(__file__).resolve().parents[3]
