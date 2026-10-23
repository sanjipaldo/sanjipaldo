#!/usr/bin/env bash
# Build one 아톰문 성장일기 Short from an episode config and the source clip.
# usage: ./make_episode.sh episodes/ep01.json /path/to/clip.mp4 [WORK_DIR]
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
EP=$(realpath "$1"); SRC=$(realpath "$2"); WORK=$(realpath -m "${3:-$HERE/work}")
NAME=$(basename "$EP" .json)
mkdir -p "$WORK"/{cartoon,audio,out}

python3 "$HERE/scripts/cartoon_icon.py" "$WORK/cartoon"
python3 "$HERE/scripts/render.py" "$WORK" "$EP" "$SRC" "$WORK/out/${NAME}_video.mp4"
python3 "$HERE/scripts/music.py" "$EP" "$WORK/audio/${NAME}_bgm.wav"
python3 "$HERE/scripts/mix.py" "$EP" "$SRC" "$WORK/audio/${NAME}_bgm.wav" "$WORK/audio/${NAME}_mix_raw.wav"

# two-pass loudness normalisation to YouTube's -14 LUFS
PRE="alimiter=limit=0.89:level=false"
ffmpeg -v info -y -i "$WORK/audio/${NAME}_mix_raw.wav" -af "$PRE,loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json" -f null - 2>&1 \
  | sed -n '/^{/,/^}/p' > "$WORK/audio/${NAME}_loudnorm.json"
read -r II TP LRA TH OFF < <(python3 -c "import json,sys;d=json.load(open(sys.argv[1]));print(d['input_i'],d['input_tp'],d['input_lra'],d['input_thresh'],d['target_offset'])" "$WORK/audio/${NAME}_loudnorm.json")
ffmpeg -v error -y -i "$WORK/audio/${NAME}_mix_raw.wav" \
  -af "$PRE,loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=$II:measured_TP=$TP:measured_LRA=$LRA:measured_thresh=$TH:offset=$OFF:linear=true,aresample=48000" \
  -c:a pcm_s16le "$WORK/audio/${NAME}_mix.wav"

ffmpeg -v error -y -i "$WORK/out/${NAME}_video.mp4" -i "$WORK/audio/${NAME}_mix.wav" -map 0:v -map 1:a \
  -c:v copy -c:a aac -b:a 192k -ar 48000 -shortest -movflags +faststart "$WORK/out/${NAME}_short.mp4"
python3 "$HERE/scripts/extras.py" "$WORK" "$EP" "$SRC" "$WORK/out"
echo "done: $WORK/out/${NAME}_short.mp4"
