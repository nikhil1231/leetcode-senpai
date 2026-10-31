"""Speak a podcast script to MP3, run as child processes by server/podcast.py.

    python -m server.podcast_synth voice <name> <script.json> <out.npz>   one voice's segments
    python -m server.podcast_synth encode <script.json> <out.mp3> <npz>…  stitch in order, to MP3

A Piper voice holds a few hundred MB once running, so each voice gets its own process and the
memory goes back to the system when it exits. The script: {segments: [{voice, text, pause}],
voices: {name: path to a Piper .onnx}}. Text is spoken a phrase at a time (see phrases).
"""
import json
import re
import sys

RATE = 22050
MAX_WORDS = 18   # Piper's memory grows with the length of what it speaks at once: ~600 MB at 50 words


def phrases(text):
    """Sentences, with long ones split at commas, semicolons and colons into runs of at most MAX_WORDS."""
    out = []
    for sentence in re.split(r'(?<=[.!?])\s+', text.strip()):
        if len(sentence.split()) <= MAX_WORDS:
            out.append(sentence)
            continue
        run = ''
        for clause in re.split(r'(?<=[,;:])\s+', sentence):
            if run and len((run + ' ' + clause).split()) > MAX_WORDS:
                out.append(run)
                run = clause
            else:
                run = f'{run} {clause}'.strip()
        out.append(run)
    return [p for p in out if p.strip()]


def speak(name, src, out):
    import numpy as np
    import onnxruntime as ort
    from piper import PiperVoice

    plain = ort.InferenceSession

    def lean(path, sess_options=None, providers=None, **kw):
        o = sess_options or ort.SessionOptions()
        o.enable_cpu_mem_arena = False
        o.enable_mem_pattern = False
        o.intra_op_num_threads = 1
        return plain(path, sess_options=o, providers=providers or ['CPUExecutionProvider'], **kw)
    ort.InferenceSession = lean

    spec = json.load(open(src))
    voice = PiperVoice.load(spec['voices'][name])
    pcm = {}
    for i, seg in enumerate(spec['segments']):
        if seg['voice'] != name:
            continue
        parts = []
        for sentence in phrases(seg['text']):
            for chunk in voice.synthesize(sentence):
                audio = chunk.audio_int16_array
                if chunk.sample_rate != RATE:   # the bundled voices are 22.05 kHz; resample crudely if not
                    idx = np.linspace(0, len(audio) - 1, int(len(audio) * RATE / chunk.sample_rate)).astype(int)
                    audio = audio[idx]
                parts.append(audio)
        parts.append(np.zeros(int(RATE * float(seg.get('pause', 0.5))), dtype=np.int16))
        pcm[f's{i}'] = np.concatenate(parts)
    np.savez(out, **pcm)


def encode(src, out, npzs):
    import lameenc
    import numpy as np
    segs = json.load(open(src))['segments']
    found = {}
    for f in npzs:
        with np.load(f) as z:
            found.update({k: z[k] for k in z.files})
    enc = lameenc.Encoder()
    enc.set_bit_rate(48)
    enc.set_in_sample_rate(RATE)
    enc.set_channels(1)
    enc.set_quality(5)
    mp3 = bytearray()
    for i in range(len(segs)):
        mp3 += enc.encode(found[f's{i}'].tobytes())
    mp3 += enc.flush()
    with open(out, 'wb') as fh:
        fh.write(mp3)


if __name__ == '__main__':
    if sys.argv[1] == 'voice':
        speak(sys.argv[2], sys.argv[3], sys.argv[4])
    else:
        encode(sys.argv[2], sys.argv[3], sys.argv[4:])
