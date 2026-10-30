#!/usr/bin/env bash
# Builds the import decoder: FFmpeg 9.0 with only what the app needs, LGPL
# (no --enable-gpl, no --enable-nonfree), plus static libopus (BSD).
# Output: packages/transcription/.bin/ffmpeg and ffprobe (git-ignored).
# macOS and Linux only; see THIRD_PARTY_NOTICES.md for Windows.
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
work="$here/.work/ffmpeg"
out="$here/.bin"
ffmpeg_sha=7f607a00dd0d28a729d5a4811205812eef01cf6ef6155025febb6f36a9062d52
mkdir -p "$work" "$out"
cd "$work"

[ -f ffmpeg-9.0.tar.xz ] || curl -sSfL -o ffmpeg-9.0.tar.xz https://ffmpeg.org/releases/ffmpeg-9.0.tar.xz
[ -f opus-1.6.1.tar.gz ] || curl -sSfL -o opus-1.6.1.tar.gz https://downloads.xiph.org/releases/opus/opus-1.6.1.tar.gz
echo "$ffmpeg_sha  ffmpeg-9.0.tar.xz" | shasum -a 256 -c -

if [ ! -f prefix/lib/libopus.a ]; then
  rm -rf opus-1.6.1 && tar xzf opus-1.6.1.tar.gz
  (cd opus-1.6.1 && ./configure --prefix="$work/prefix" --disable-shared --enable-static \
    --disable-doc --disable-extra-programs >/dev/null && make -j4 install >/dev/null)
fi

# FFmpeg's configure only finds libopus through pkg-config, which is not on a
# clean machine; this shim answers for that one library.
cat > pkg-config-shim <<SHIM
#!/bin/sh
case "\$*" in
  *--cflags*) echo "-I$work/prefix/include -I$work/prefix/include/opus" ;;
  *--libs*) echo "-L$work/prefix/lib -lopus" ;;
esac
exit 0
SHIM
chmod +x pkg-config-shim

rm -rf ffmpeg-9.0 && tar xJf ffmpeg-9.0.tar.xz
cd ffmpeg-9.0
./configure --prefix="$work/prefix" --pkg-config="$work/pkg-config-shim" \
  --disable-everything --disable-autodetect --disable-doc --disable-network \
  --disable-ffplay --disable-avdevice --disable-swscale \
  --enable-ffmpeg --enable-ffprobe --enable-libopus \
  --enable-protocol=file,pipe \
  --enable-demuxer=wav,w64,mp3,mov,flac,ogg,aac,concat \
  --enable-decoder=pcm_u8,pcm_s16le,pcm_s16be,pcm_s24le,pcm_s32le,pcm_f32le,pcm_f64le,pcm_alaw,pcm_mulaw,adpcm_ms,adpcm_ima_wav,mp3,mp3float,aac,aac_fixed,alac,flac,opus \
  --enable-parser=aac,flac,mpegaudio,opus \
  --enable-encoder=libopus,pcm_s16le,pcm_f32le \
  --enable-muxer=ogg,opus,segment,wav,pcm_s16le,pcm_f32le,null \
  --enable-filter=aresample,aformat,anull,atrim,pan \
  --enable-bsf=aac_adtstoasc >/dev/null
grep -E '^CONFIG_(GPL|NONFREE|VERSION3)=' ffbuild/config.mak || true
if grep -qE '^CONFIG_(GPL|NONFREE)=yes' ffbuild/config.mak; then
  echo "refusing: build is not LGPL" >&2
  exit 1
fi
make -j4 ffmpeg ffprobe >/dev/null
cp ffmpeg ffprobe "$out/"
"$out/ffmpeg" -hide_banner -version | head -3
