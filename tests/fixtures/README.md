# Synthetic media fixtures

Two seconds of a blue frame and a 440 Hz tone, generated with the FFmpeg already installed in the environment. No user media or downloaded assets. Each file is about 23 KB.

```sh
ffmpeg -f lavfi -i color=c=steelblue:s=320x180:r=24:d=2 -f lavfi -i sine=frequency=440:duration=2 -c:v libx264 -pix_fmt yuv420p -c:a aac -movflags +faststart -shortest memory.mp4
ffmpeg -i memory.mp4 -c copy -f mov memory.mov
ffmpeg -i memory.mp4 -c:v libvpx-vp9 -deadline realtime -cpu-used 8 -c:a libopus memory.webm
```

These exercise actual decoding and playback, and byte preservation through backup and simulated cloud uploads. Live Photo tests pair a generated JPEG with a video of the same stem; they do not simulate native Apple metadata or assert HEIC/HEVC support on Safari. The native image decoder fallback is exercised with `createImageBitmap` unavailable.
