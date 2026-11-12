//! Reading WAV and FLAC files as the 16 kHz mono audio the engine reads, and
//! writing that audio as WAV.

use std::fs::File;
use std::io::Read;
use std::path::Path;

use rubato::audioadapter_buffers::direct::InterleavedSlice;
use rubato::{Fft, FixedSync, Resampler};

use crate::{Error, ErrorCode};

/// The engine reads 16 kHz mono WAV files only.
pub const SAMPLE_RATE: u32 = 16_000;

/// Reads a WAV or FLAC file as 16 kHz mono samples between -1 and 1.
///
/// The format comes from the file's first bytes, not its name. Channels are
/// averaged, and other sample rates are resampled. A file that is neither
/// format, cannot be decoded or holds no samples is `bad_audio`.
pub fn read_audio_16k_mono(path: &Path) -> Result<Vec<f32>, Error> {
    let mut magic = [0u8; 4];
    File::open(path)
        .and_then(|mut file| file.read_exact(&mut magic))
        .map_err(|cause| bad_audio(path, cause))?;
    let (mono, rate) = match &magic {
        b"RIFF" => read_wav_mono(path)?,
        b"fLaC" => read_flac_mono(path)?,
        _ => return Err(bad_audio(path, "only WAV and FLAC files can be read")),
    };
    if mono.is_empty() {
        return Err(bad_audio(path, "the file holds no audio"));
    }
    if rate == SAMPLE_RATE {
        return Ok(mono);
    }
    resample_to_16k(&mono, rate).map_err(|cause| bad_audio(path, cause))
}

/// Writes `samples` as a 16 kHz mono 16-bit WAV file.
pub fn write_wav_16k(path: &Path, samples: &[f32]) -> Result<(), Error> {
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: SAMPLE_RATE,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let write = || -> Result<(), hound::Error> {
        let mut writer = hound::WavWriter::create(path, spec)?;
        for sample in samples {
            writer.write_sample((sample.clamp(-1.0, 1.0) * f32::from(i16::MAX)) as i16)?;
        }
        writer.finalize()
    };
    write().map_err(|cause| Error::file(path, cause))
}

/// The length in seconds of the WAV file at `path`, from its header.
pub fn wav_seconds(path: &Path) -> Result<f64, Error> {
    let reader = hound::WavReader::open(path).map_err(|cause| bad_audio(path, cause))?;
    Ok(f64::from(reader.duration()) / f64::from(reader.spec().sample_rate))
}

/// The WAV file's samples, averaged to mono, and its sample rate.
fn read_wav_mono(path: &Path) -> Result<(Vec<f32>, u32), Error> {
    let mut reader = hound::WavReader::open(path).map_err(|cause| bad_audio(path, cause))?;
    let spec = reader.spec();
    let samples: Result<Vec<f32>, hound::Error> = match spec.sample_format {
        hound::SampleFormat::Float => reader.samples::<f32>().collect(),
        hound::SampleFormat::Int => {
            let scale = int_scale(u32::from(spec.bits_per_sample));
            reader
                .samples::<i32>()
                .map(|sample| sample.map(|value| value as f32 * scale))
                .collect()
        }
    };
    let samples = samples.map_err(|cause| bad_audio(path, cause))?;
    Ok((
        average_channels(&samples, usize::from(spec.channels)),
        spec.sample_rate,
    ))
}

/// The FLAC file's samples, averaged to mono, and its sample rate.
fn read_flac_mono(path: &Path) -> Result<(Vec<f32>, u32), Error> {
    let mut reader = claxon::FlacReader::open(path).map_err(|cause| bad_audio(path, cause))?;
    let info = reader.streaminfo();
    let scale = int_scale(info.bits_per_sample);
    let samples: Result<Vec<f32>, claxon::Error> = reader
        .samples()
        .map(|sample| sample.map(|value| value as f32 * scale))
        .collect();
    let samples = samples.map_err(|cause| bad_audio(path, cause))?;
    Ok((
        average_channels(&samples, info.channels as usize),
        info.sample_rate,
    ))
}

/// The factor that maps a signed integer sample of `bits` bits to -1..1.
fn int_scale(bits: u32) -> f32 {
    1.0 / (1u64 << (bits - 1)) as f32
}

/// Averages each frame of interleaved `samples` into one sample. Zero
/// channels is treated as one, so it never panics.
fn average_channels(samples: &[f32], channels: usize) -> Vec<f32> {
    samples
        .chunks_exact(channels.max(1))
        .map(|frame| frame.iter().sum::<f32>() / frame.len() as f32)
        .collect()
}

fn resample_to_16k(mono: &[f32], rate: u32) -> Result<Vec<f32>, String> {
    let mut resampler = Fft::<f32>::new(
        rate as usize,
        SAMPLE_RATE as usize,
        1024,
        1,
        FixedSync::Both,
    )
    .map_err(|cause| cause.to_string())?;
    let input = InterleavedSlice::new(mono, 1, mono.len()).map_err(|cause| cause.to_string())?;
    let output = resampler
        .process_all(&input, mono.len(), None)
        .map_err(|cause| cause.to_string())?;
    Ok(output.take_data())
}

fn bad_audio(path: &Path, cause: impl std::fmt::Display) -> Error {
    Error::new(ErrorCode::BadAudio, format!("{}: {cause}", path.display()))
}

#[cfg(test)]
mod tests {
    use tempfile::TempDir;

    use super::*;

    /// Writes one second of 48 kHz stereo 16-bit WAV, with the left channel
    /// at `left` and the right at `right`.
    fn write_stereo_48k_wav(path: &Path, left: f32, right: f32) {
        let spec = hound::WavSpec {
            channels: 2,
            sample_rate: 48_000,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let mut writer = hound::WavWriter::create(path, spec).unwrap();
        for _ in 0..48_000 {
            writer.write_sample((left * 32768.0) as i16).unwrap();
            writer.write_sample((right * 32768.0) as i16).unwrap();
        }
        writer.finalize().unwrap();
    }

    /// Writes half a second of 8 kHz stereo 16-bit FLAC as one frame of
    /// uncompressed (verbatim) subframes, with the left channel at `left`
    /// and the right at `right`.
    fn write_stereo_8k_flac(path: &Path, left: f32, right: f32) {
        const FRAMES: u16 = 4_000;
        let mut file = b"fLaC".to_vec();
        // The STREAMINFO block, marked last, 34 bytes long.
        file.extend([0x80, 0, 0, 34]);
        file.extend(FRAMES.to_be_bytes());
        file.extend(FRAMES.to_be_bytes());
        file.extend([0; 6]);
        // Sample rate in 20 bits, channels less one in 3, bits less one in 5,
        // then the total frame count in 36.
        file.extend(((8_000u64 << 44) | (1 << 41) | (15 << 36) | u64::from(FRAMES)).to_be_bytes());
        file.extend([0; 16]);
        // Sync code, block size at the header's end, 8 kHz, two independent
        // channels, 16 bits, frame number 0.
        let mut frame = vec![0xFF, 0xF8, 0x74, 0x18, 0x00];
        frame.extend((FRAMES - 1).to_be_bytes());
        frame.push(flac_crc8(&frame));
        for level in [left, right] {
            frame.push(0x02);
            for _ in 0..FRAMES {
                frame.extend(((level * 32768.0) as i16).to_be_bytes());
            }
        }
        frame.extend(flac_crc16(&frame).to_be_bytes());
        file.extend(frame);
        std::fs::write(path, file).unwrap();
    }

    /// The CRC-8 that ends a FLAC frame header, polynomial 0x07.
    fn flac_crc8(bytes: &[u8]) -> u8 {
        bytes.iter().fold(0, |crc, &byte| {
            (0..8).fold(crc ^ byte, |crc, _| {
                if crc & 0x80 != 0 {
                    (crc << 1) ^ 0x07
                } else {
                    crc << 1
                }
            })
        })
    }

    /// The CRC-16 that ends a FLAC frame, polynomial 0x8005.
    fn flac_crc16(bytes: &[u8]) -> u16 {
        bytes.iter().fold(0, |crc, &byte| {
            (0..8).fold(crc ^ (u16::from(byte) << 8), |crc, _| {
                if crc & 0x8000 != 0 {
                    (crc << 1) ^ 0x8005
                } else {
                    crc << 1
                }
            })
        })
    }

    /// The engine reads 16 kHz mono and segment times come from sample
    /// counts, so a wrong rate or a missed downmix shifts every timestamp.
    #[test]
    fn read_audio_16k_mono_converts_stereo_wav() {
        let folder = TempDir::new().unwrap();
        let path = folder.path().join("stereo.wav");
        write_stereo_48k_wav(&path, 0.4, 0.2);

        let samples = read_audio_16k_mono(&path).unwrap();

        assert_eq!(samples.len(), 16_000);
        assert!((samples[8_000] - 0.3).abs() < 0.01, "{}", samples[8_000]);
    }

    /// FLAC goes through its own decoder, so an import that misread its rate,
    /// channel count or bit depth would shift every time or level in it.
    #[test]
    fn read_audio_16k_mono_converts_stereo_flac() {
        let folder = TempDir::new().unwrap();
        let path = folder.path().join("stereo.flac");
        write_stereo_8k_flac(&path, 0.4, 0.2);

        let samples = read_audio_16k_mono(&path).unwrap();

        assert_eq!(samples.len(), 8_000);
        assert!((samples[4_000] - 0.3).abs() < 0.01, "{}", samples[4_000]);
    }
}
