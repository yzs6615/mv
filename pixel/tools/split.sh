#!/bin/bash
# Cut the film into parts at exact frames, straight from the lossless chunks, with the master's
# settings (1080p60, x264 slow CRF 18, AAC 256k). Each part plays on its own and they join back
# frame for frame in an editor; pick cut frames at scene changes on a beat (frame = seconds x 60).
#
#   bash pixel/tools/split.sh 6718 12747      -> pixel/build/parts/only_one_1080p60_part{1,2,3}of3.mp4
#
# Needs the full set of chunks (node pixel/render.mjs --all) and pixel/build/audio/mix.wav.
set -e
cd "$(dirname "$0")/../build"
mkdir -p parts
total=$(ls chunks/a60_*_*.mkv | sed 's/.*_\([0-9]*\)\.mkv/\1/' | sort -n | tail -1)
cuts=(0 "$@" $((10#$total)))
n=$(( ${#cuts[@]} - 1 ))
VF="scale=1920:1080:flags=neighbor,scale=out_color_matrix=bt709:out_range=tv:flags=neighbor,format=yuv420p"
part() { # index first-frame end-frame (exclusive)
  local i=$1 f0=$2 f1=$3 c0=$(( $2 / 600 )) c1=$(( ($3 - 1) / 600 ))
  local list=parts/list$i.txt; : > $list
  for c in $(seq $c0 $c1); do ls chunks/a60_$(printf %06d $((c * 600)))_*.mkv | sed "s|^|file '$PWD/|;s|$|'|" >> $list; done
  local s=$(( f0 - c0 * 600 )) e=$(( f1 - c0 * 600 ))
  ffmpeg -v error -y -f concat -safe 0 -i $list -ss $(echo "scale=6; $f0/60" | bc) -t $(echo "scale=6; ($f1-$f0)/60" | bc) -i audio/mix.wav \
    -vf "trim=start_frame=$s:end_frame=$e,setpts=PTS-STARTPTS,$VF" \
    -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv \
    -c:v libx264 -preset slow -crf 18 -tune animation -r 60 -c:a aac -b:a 256k -shortest \
    -movflags +faststart parts/only_one_1080p60_part${i}of${n}.mp4
  echo "part $i of $n: frames $f0-$((f1 - 1))"
}
for i in $(seq 1 $n); do part $i ${cuts[$((i - 1))]} ${cuts[$i]} & done
wait
ls -l parts/*.mp4
