#!/usr/bin/env python3
"""Actual STT word timestamps using faster-whisper; never estimates timings."""
import argparse
import json
import os
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--audio', required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--model', default=os.environ.get('WHISPER_MODEL', 'small'))
parser.add_argument('--language', default=os.environ.get('WHISPER_LANGUAGE', 'tl'))
args = parser.parse_args()
try:
    from faster_whisper import WhisperModel
except ImportError as error:
    raise SystemExit('Install alignment dependencies: python3 -m pip install -r requirements-alignment.txt') from error

model = WhisperModel(args.model, device='cpu', compute_type='int8')
segments, info = model.transcribe(args.audio, language=args.language or None, word_timestamps=True, vad_filter=True, beam_size=5)
words = []
for segment in segments:
    for word in segment.words or []:
        if word.end > word.start and word.word.strip():
            words.append({'word': word.word.strip(), 'start': word.start, 'end': word.end, 'confidence': word.probability})
result = {'words': words, 'language': info.language, 'languageProbability': info.language_probability, 'model': args.model, 'method': 'faster-whisper word timestamps; STT, not synthetic timing'}
Path(args.output).parent.mkdir(parents=True, exist_ok=True)
Path(args.output).write_text(json.dumps(result, ensure_ascii=False, indent=2))
