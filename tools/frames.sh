#!/usr/bin/env bash
# Extract a contact sheet of frames from a recorded video so motion can be judged
# from stills:  tools/frames.sh shots/<piece>/video.webm  -> shots/<piece>/sheet.png + f*.png
set -e
v="$1"; d="$(dirname "$v")"
ffmpeg -loglevel error -y -i "$v" -vf "fps=2,scale=640:-1" "$d/f%02d.png"
ffmpeg -loglevel error -y -i "$v" -vf "fps=1,scale=426:-1,tile=4x3" -frames:v 1 "$d/sheet.png"
echo "wrote $d/sheet.png and $(ls "$d"/f*.png | wc -l) frames"
