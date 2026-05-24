const targetSampleRate = 16000;
const processorBufferSize = 2048;

type ScribeMicrophoneConfig = {
  deviceId?: ConstrainDOMString;
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
  channelCount?: number;
};

type ActiveCapture = {
  cleanup: () => void;
};

let activeCapture: ActiveCapture | null = null;

export async function startAppOwnedScribeMicrophoneCapture(
  config: ScribeMicrophoneConfig,
  onAudioData: (base64Audio: string) => void,
  signal?: AbortSignal,
) {
  stopActiveScribeMicrophoneCapture();
  throwIfAborted(signal);

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: config.deviceId,
      echoCancellation: config.echoCancellation ?? true,
      noiseSuppression: config.noiseSuppression ?? true,
      autoGainControl: config.autoGainControl ?? true,
      channelCount: config.channelCount ?? 1,
      sampleRate: { ideal: targetSampleRate },
    },
  });
  throwIfAborted(signal, () => stopStream(stream));

  const [audioTrack] = stream.getAudioTracks();
  if (!audioTrack) {
    stopStream(stream);
    throw new Error("Scribe microphone setup did not receive an audio track.");
  }

  const streamSampleRate = audioTrack.getSettings().sampleRate;
  const audioContext = new AudioContext(streamSampleRate ? { sampleRate: streamSampleRate } : {});
  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(processorBufferSize, 1, 1);
  const silentSink = audioContext.createGain();
  silentSink.gain.value = 0;

  let cleanedUp = false;
  const onAbort = () => cleanup();
  const cleanup = () => {
    if (cleanedUp) {
      return;
    }

    cleanedUp = true;
    if (activeCapture?.cleanup === cleanup) {
      activeCapture = null;
    }

    processor.onaudioprocess = null;
    disconnectQuietly(source);
    disconnectQuietly(processor);
    disconnectQuietly(silentSink);
    stopStream(stream);
    signal?.removeEventListener("abort", onAbort);
    void audioContext.close().catch(() => {
      // AudioContext close is best-effort during page lifecycle transitions.
    });
  };

  processor.onaudioprocess = (event) => {
    if (cleanedUp) {
      return;
    }

    try {
      const mono = event.inputBuffer.getChannelData(0);
      const resampled = resampleLinear(mono, audioContext.sampleRate, targetSampleRate);
      if (resampled.length > 0) {
        onAudioData(floatToPcm16Base64(resampled));
      }
    } catch {
      cleanup();
    }
  };

  source.connect(processor);
  processor.connect(silentSink);
  silentSink.connect(audioContext.destination);

  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }
  throwIfAborted(signal, cleanup);

  activeCapture = { cleanup };
  signal?.addEventListener("abort", onAbort, { once: true });
  return cleanup;
}

export function stopActiveScribeMicrophoneCapture() {
  activeCapture?.cleanup();
}

function stopStream(stream: MediaStream) {
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

function disconnectQuietly(node: AudioNode) {
  try {
    node.disconnect();
  } catch {
    // Some nodes may already be disconnected during repeated cleanup.
  }
}

function throwIfAborted(signal?: AbortSignal, cleanup?: () => void) {
  if (!signal?.aborted) {
    return;
  }

  cleanup?.();
  throw new DOMException("Scribe microphone capture was aborted.", "AbortError");
}

function resampleLinear(input: Float32Array, inputSampleRate: number, outputSampleRate: number) {
  if (inputSampleRate === outputSampleRate) {
    return input;
  }

  const outputLength = Math.floor((input.length * outputSampleRate) / inputSampleRate);
  const output = new Float32Array(outputLength);
  const ratio = inputSampleRate / outputSampleRate;

  for (let index = 0; index < outputLength; index += 1) {
    const sourceIndex = index * ratio;
    const lowIndex = Math.floor(sourceIndex);
    const highIndex = Math.min(lowIndex + 1, input.length - 1);
    const fraction = sourceIndex - lowIndex;
    output[index] = input[lowIndex] + (input[highIndex] - input[lowIndex]) * fraction;
  }

  return output;
}

function floatToPcm16Base64(input: Float32Array) {
  const pcm = new Int16Array(input.length);
  for (let index = 0; index < input.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, input[index]));
    pcm[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }

  return bytesToBase64(new Uint8Array(pcm.buffer));
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}
