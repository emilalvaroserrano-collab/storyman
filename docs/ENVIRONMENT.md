# Inspected environment

## OpenCode Zen writing follow-up

OpenCode CLI v2.3.0 is installed at `/opt/homebrew/bin/opencode`. The current CLI model list includes `opencode/glm-5.3-flash-free` and `opencode/deepseek-v4.1-flash-free`. A small standalone JSON event-stream probe with GLM succeeded, then subsequent calls to both free models returned `provider.free-limit` HTTP 429. Storyman therefore selects the free Zen CLI writer first and retains its local Ollama writing service as a fallback. The local `.env.local` has `WRITING_PROVIDER=opencode-cli` and `OPENCODE_MODEL=opencode/glm-5.3-flash-free`; existing local provider and TTS settings were preserved. This does not verify a full story generation through Zen.

Inspected during initial implementation on 2026-11-17 (Asia/Manila task context): macOS/Darwin, Apple arm64, 16 logical CPUs, 48 GiB RAM. Node 22.23.1, npm 12.0.2, Python 3.14.8, FFmpeg/ffprobe 9.0.2 were available. Docker CLI was installed, but a Docker server response was not obtained. PostgreSQL and Redis server binaries were not found on PATH; the application therefore uses its local SQLite adapter unless a database URL is configured.

Python Pillow and Torch were available. faster-whisper, Whisper and WhisperX were absent. The inspected FFmpeg build supports H.264/AAC but does not list drawtext/ASS subtitle filters, so original frame typography is rendered with Pillow rather than relying on missing FFmpeg text libraries.

The project directory was empty before implementation; no existing files or uncommitted project work were overwritten. No provider credential values were inspected or copied. Configuration detection uses environment-variable presence only. No OAuth account, external publication, deployment, real five-minute narration or full end-to-end acceptance has been verified.

## Local speech follow-up

An existing Zonos3 MLX service at loopback port 1919 was verified through its owning `ZONOS3-Mini/docs/api.md` and live speakers/capabilities. It accepts OpenAI-compatible WAV requests and `language: tl`; no Tagalog-labeled default voice was available. A default AmericanMale voice produced an actual 11.933-second Tagalog smoke WAV. Actual faster-whisper small-model word alignment had 80.07% average word confidence and 89.47% word agreement against the input; human pronunciation/fluency review remains pending. No cloud key or new account authorization was used.

Storyman now has its own Python 3.12.15 environment under `.venv`, with faster-whisper 1.2.1, Pillow 12.3.0 and PyAV 18.1.0. A real incompatibility was reproduced with PyAV 19.0.2 (`metadata_errors` removed from `av.open`); `requirements-alignment.txt` pins PyAV below 19, and the installed environment is recorded in `requirements-alignment.lock.txt`. Actual alignment was rerun successfully with the Storyman interpreter and cached small-model weights. The prior project environment was only read/used for initial inspection and was not modified.
