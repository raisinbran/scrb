# Models and runtimes

`scrb models fetch` downloads these models from the URLs in `models.toml`.
None of their weights are in this repository. Each licence was confirmed on
the model card or the project's repository on 2026-11-12.

## Speech models

- **Parakeet TDT 0.6B v3** by NVIDIA, licensed under
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
  (<https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3>). scrb uses the int8
  ONNX export from the sherpa-onnx project, which converted and quantized the
  weights, from its `asr-models` release.
- **Whisper large-v3-turbo** by OpenAI, MIT licence
  (<https://huggingface.co/openai/whisper-large-v3-turbo>). scrb uses the
  CTranslate2 export at
  <https://huggingface.co/dropbox-dash/faster-whisper-large-v3-turbo>, MIT.
- **Granite Speech 5.0 2B** by IBM, Apache License 2.0
  (<https://huggingface.co/ibm-granite/granite-speech-5.0-2b>).

## Speaker diarization

- **pyannote speaker-diarization-community-1** by pyannoteAI, licensed under
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
  (<https://huggingface.co/pyannote/speaker-diarization-community-1>). scrb's
  `scrb-models-1` release holds the files of revision
  `3533c8cf8e369892e6b79ff1bf80f7b0286a54ee` unchanged, without
  `diarization.gif`, in one archive. Its speaker embedding is WeSpeaker's
  ResNet34 trained on VoxCeleb (CC BY 4.0; Wang et al., "WeSpeaker", 2023),
  and its PLDA comes from BUT Speech@FIT.

## Voice activity detection

- **Silero VAD** by Silero Team, MIT licence
  (<https://github.com/snakers4/silero-vad>). Its weights come inside the
  `silero-vad` package.

## Runtimes

- sherpa-onnx, Apache License 2.0 (<https://github.com/k2-fsa/sherpa-onnx>)
- faster-whisper, MIT (<https://github.com/SYSTRAN/faster-whisper>)
- Transformers, Apache License 2.0
  (<https://github.com/huggingface/transformers>)
- pyannote.audio, MIT (<https://github.com/pyannote/pyannote-audio>)
- PyTorch, BSD-3-Clause (<https://github.com/pytorch/pytorch>)
