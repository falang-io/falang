# Media fixtures

Binary fixtures for `integrations-media.workflow-e2e-spec.ts` (ADR 0041 (private) §5). Generated with the real `ffmpeg`/`ffprobe` on the host (not synthesized/hand-written), regenerate with:

```sh
cd packages/workflow/backend/test-fixtures/media

# 64x64 solid-red PNG, 1 frame.
ffmpeg -y -f lavfi -i color=c=red:s=64x64 -frames:v 1 -update 1 sample.png

# 1-second, 128x128 H.264/yuv420p video + mono AAC audio track, muxed into an MP4.
ffmpeg -y -f lavfi -i testsrc=size=128x128:rate=10 -f lavfi -i anullsrc=r=44100:cl=mono \
  -t 1 -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest sample.mp4
```

Verify with `ffprobe`:

```sh
ffprobe -v error -show_entries stream=width,height,codec_name -of default=noprint_wrappers=1 sample.png
ffprobe -v error -show_entries format=duration -show_entries stream=codec_name,codec_type -of default=noprint_wrappers=1 sample.mp4
```
