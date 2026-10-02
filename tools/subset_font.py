"""Rebuild local fonts with the shared Minigame tool; no network required."""
import pathlib
import runpy
import sys
root = pathlib.Path(__file__).resolve().parents[1]
tool = root.parent / "_workflow" / "tools" / "subset_font.py"
if not tool.is_file():
    sys.exit("The Minigame workspace font tool and original Fusion Pixel font are required.")
sys.argv = [str(tool), str(root), *sys.argv[1:]]
runpy.run_path(str(tool), run_name="__main__")
