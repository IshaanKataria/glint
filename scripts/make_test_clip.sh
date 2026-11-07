#!/usr/bin/env bash
# Generate a spoken test clip with macOS `say` as a 16 kHz mono 16-bit wav, then print the spoken text.
#
# Usage: scripts/make_test_clip.sh <out.wav> [text] [voice]
#   out.wav  where to write the clip (parent dirs are created)
#   text     what to say (default: a short meeting snippet with a pricing + deadline question)
#   voice    a `say -v` voice name (default: Samantha if installed, else the system voice)
# Output: line 1 on stdout is the spoken text; details go to stderr.
set -euo pipefail

if [[ $# -lt 1 || "$1" == "-h" || "$1" == "--help" ]]; then
  sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
fi

out="$1"
text="${2:-Thanks for joining the call. We reviewed the proposal and the team likes the integration plan. What would the pricing be for two hundred seats, and can you deliver the first version by the end of March?}"
voice="${3:-}"
if [[ -z "$voice" ]] && say -v '?' | grep -q '^Samantha '; then voice="Samantha"; fi

mkdir -p "$(dirname "$out")"
tmp="$(mktemp -t glint-clip).aiff"
trap 'rm -f "$tmp"' EXIT

if [[ -n "$voice" ]]; then say -v "$voice" -o "$tmp" -- "$text"; else say -o "$tmp" -- "$text"; fi
ffmpeg -hide_banner -loglevel error -y -i "$tmp" -ac 1 -ar 16000 -sample_fmt s16 "$out"

dur="$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$out")"
echo "$text"
echo "wrote $out (${dur}s, 16 kHz mono s16, voice=${voice:-default})" >&2
