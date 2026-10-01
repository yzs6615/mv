# LOVE STORY — terminal edition · 爱情故事 · 终端版

A music video for *Love Story* (Taylor Swift) that plays live in your terminal: ASCII, box drawing and braille
graphics, synced to the song's bars, beats and key change. There are no human figures. The lovers are
**process A** (amber, `montague.net`) and **process B** (rose, `capulet.net`). The system's policy forbids
them to talk to each other.

## Run 运行

```bash
python3 tui/lovestory.py --audio /path/to/Love_Story.flac   # needs ffplay (ffmpeg) or mpv for sound
python3 tui/lovestory.py --mute                             # visuals only
python3 tui/lovestory.py --audio song.flac --start 185      # jump to the turning point
python3 tui/lovestory.py --audio song.flac --sync 0.08      # delay visuals if your audio output lags
```

* Python 3 standard library only. Use a truecolor terminal (iTerm2, WezTerm, kitty, Windows Terminal, VS Code,
  GNOME Terminal) at ≥ 160×45 for the full composition. It adapts to any size ≥ 60×18 and to live resizing,
  and falls back to 256 colours (`--color 256`).
* The song file is **not included**. Bring your own copy. Press `q` to quit.
* Offline export (Pillow + ffmpeg): `python3 tui/lovestory.py --export out.mp4 --audio song.flac`

## Story map 叙事结构

| chapter | time | screen |
|---|---|---|
| boot | 0:00 | `verona-os` boot log: two households, `firewall … DENY`, two processes "share one heartbeat"; the title evaporates into stars |
| 01 初见 FIRST SIGHT | 0:16 | star field; A and B send ping rings that slowly reach each other. Masquerade mesh: a crowd of grey node pairs waltzing; `ping B` → time ×0.04 |
| 02 靠近 CLOSER | 0:48 | the crowd parts; the two lights step closer on every beat; ECG trace (heartbeat 72 → 119 bpm, the song's tempo) |
| 02 → chorus | 1:00 | the waltz: two lights orbit and paint rosettes in braille; packets on every beat; `<3` rises on each downbeat |
| 03 阻隔 FIREWALL | 1:20 | a red wall slams down. `ACCESS DENIED` |
| 04 秘密相爱 ENCRYPTED | 1:24 | `capulet:/balcony [ro]` above `montague:/garden`. Hex messages bounce off (`EACCES`), then get through and decrypt to `<3`; a vine of light climbs the gap. Then a permission maze: `Permission denied`, `not in the sudoers file` … `route found (hidden)` |
| 05 逃离 ESCAPE | 1:53 | two data streams braided into a helix race over a sleeping city, hopping `[DENY]` gates. An IDS trace closes in, the helix is torn apart. Storm: a jagged crack splits the screen, glyph rain, `connection reset by peer` |
| 06 等待 WAITING | 2:45 | one small window in the dark: `wait --for A --timeout never`, `day 104`, `request timed out` |
| 07 失落 TIMEOUT | 2:59 | the window shrinks to a single dim prompt, then an empty screen. A faint amber point crosses the dark: `signal: A` |
| 08 重逢 SIGNAL | 3:09 | **key change.** The void unfolds into a tiled terminal lattice and the firewall shatters into stars. `SYN → SYN-ACK → ACK` |
| 09 承诺 HANDSHAKE | 3:17 | `CONNECTED`; the rule is rewritten `~~DENY~~ ALLOW`; a ring closes around them. `SO_KEEPALIVE = ∞` |
| 10 圆满 CONNECTED | 3:25 | the most open composition: no borders, both households' networks routed through the joined pair, a rotating rose curve, light rising everywhere |
| exit 0 | 3:50 | two cursors blinking in sync. `process exited with status 0` |

On screen the composition goes from closed panes and walls to open space. The status bar's relation flips from
`✕` to `⇄` at the key change. Light always rises; denial is red and static.

## Files

* `core.py`: canvas with wide-glyph handling, braille 2×4 sub-cell layer, block font, music clock
* `scenes.py`: the 16 scenes and the edit, each a pure function of song time
* `lovestory.py`: live player (row-diffed ANSI, audio sync) and the offline rasteriser/exporter
* `data/music_map.json`: beat grid (119.01 BPM), bars, sections and envelopes from `analysis/analyze.py`

No song lyrics appear anywhere in the piece. All on-screen text is original.
