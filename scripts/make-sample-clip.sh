#!/usr/bin/env bash
# Renders the labelled demo clip used by the form-check demo (an animated bar path, not a real lift).
# Output: packages/ui/assets/sample-lift.{webm,mp4}. Needs ffmpeg with libvpx-vp9 and libx264.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FONT="$ROOT/node_modules/@expo-google-fonts/source-sans-3/600SemiBold/SourceSans3_600SemiBold.ttf"
OUT="$ROOT/packages/ui/assets"
BAR_Y="300+130*sin(2*PI*t/3)"
PLATE_Y="288+130*sin(2*PI*t/3)"
VF="drawbox=x=170:y=60:w=20:h=520:color=0x5D5A52:t=fill"
VF="$VF,drawbox=x=60:y='$BAR_Y':w=240:h=14:color=0xC2410C:t=fill"
VF="$VF,drawbox=x=60:y='$PLATE_Y':w=22:h=38:color=0xF1ECE2:t=fill"
VF="$VF,drawbox=x=278:y='$PLATE_Y':w=22:h=38:color=0xF1ECE2:t=fill"
VF="$VF,drawtext=fontfile=$FONT:text='Sample clip (demo)':fontcolor=0xF1ECE2:fontsize=22:x=(w-text_w)/2:y=20"
mkdir -p "$OUT"
ffmpeg -y -loglevel error -f lavfi -i "color=c=0x211F1C:s=360x640:r=30:d=6" -vf "$VF" -c:v libvpx-vp9 -b:v 300k -an "$OUT/sample-lift.webm"
ffmpeg -y -loglevel error -f lavfi -i "color=c=0x211F1C:s=360x640:r=30:d=6" -vf "$VF" -c:v libx264 -pix_fmt yuv420p -crf 30 -movflags +faststart -an "$OUT/sample-lift.mp4"
