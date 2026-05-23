import { wsUrl } from "./url";

export type JanusStatic = {
  new (config: {
    server: string;
    ipv6?: boolean;
    destroyOnUnload?: boolean;
    iceServers?: () => RTCIceServer[];
    success: () => void;
    error: (error: unknown) => void;
  }): JanusSession;
  init(config: { debug?: string | boolean; callback: () => void }): void;
  randomString(length: number): string;
};

export type JanusSession = {
  attach(config: {
    plugin: string;
    opaqueId: string;
    success: (handle: JanusHandle) => void;
    error: (error: unknown) => void;
    connectionState?: (state: string) => void;
    iceState?: (state: string) => void;
    webrtcState?: (up: boolean) => void;
    onmessage: (message: JanusMessage, jsep?: RTCSessionDescriptionInit) => void;
    onremotetrack: (track: MediaStreamTrack, id: string, added: boolean, meta?: { reason?: string }) => void;
    oncleanup?: () => void;
  }): void;
  destroy(): void;
};

export type JanusHandle = {
  getPlugin(): string;
  getId(): string | number;
  send(payload: { message: Record<string, unknown>; jsep?: RTCSessionDescriptionInit }): void;
  createAnswer(config: {
    jsep: RTCSessionDescriptionInit;
    tracks: Array<{ type: string; capture: boolean; recv: boolean; add: boolean }>;
    success: (jsep: RTCSessionDescriptionInit) => void;
    error: (error: unknown) => void;
  }): void;
  hangup(): void;
  detach(): void;
};

type JanusMessage = {
  result?: {
    status?: string;
    features?: {
      ice?: { url?: string };
    };
  };
  error?: string;
  error_code?: string | number;
};

export type StartedJanusStream = {
  session: JanusSession;
  handle: JanusHandle | null;
  stop: () => void;
};

export async function startJanusWebRtcStream(
  video: HTMLVideoElement,
  onStatus: (status: string) => void,
  signal?: AbortSignal,
) {
  if (!window.RTCPeerConnection) {
    throw new Error("RTCPeerConnection is not available in this browser.");
  }
  if (signal?.aborted) {
    throw new DOMException("WebRTC startup was aborted.", "AbortError");
  }

  const janusPath = "/share/js/kvm/janus.js";
  const { Janus } = (await import(/* @vite-ignore */ janusPath)) as { Janus: JanusStatic };

  await new Promise<void>((resolve) => {
    Janus.init({ debug: false, callback: resolve });
  });

  return new Promise<StartedJanusStream>((resolve, reject) => {
    let settled = false;
    let janusRef: JanusSession | null = null;
    let handleRef: JanusHandle | null = null;
    let ice: { url?: string } | null = null;
    const timer = window.setTimeout(() => fail(new Error("Timed out starting Janus WebRTC.")), 15000);

    const cleanup = () => {
      if (janusRef || handleRef) {
        stopStream(video, janusRef, handleRef);
      }
    };

    const finish = (session: JanusSession) => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timer);
      resolve({
        session,
        handle: handleRef,
        stop: () => stopStream(video, session, handleRef),
      });
    };

    const fail = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timer);
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    signal?.addEventListener(
      "abort",
      () => fail(new DOMException("WebRTC startup was aborted.", "AbortError")),
      { once: true },
    );

    const janus = new Janus({
      server: wsUrl("/janus/ws"),
      ipv6: true,
      destroyOnUnload: false,
      iceServers: () => (ice?.url ? [{ urls: ice.url }] : []),
      success: () => {
        onStatus("Janus connected.");
        janus.attach({
          plugin: "janus.plugin.ustreamer",
          opaqueId: `kvm-portal-${Janus.randomString(12)}`,
          success: (handle) => {
            handleRef = handle;
            onStatus("WebRTC plugin attached.");
            handle.send({ message: { request: "features" } });
          },
          error: fail,
          onmessage: (message, jsep) => {
            if (message.error || message.error_code) {
              fail(new Error(message.error || `Janus error ${message.error_code}`));
              return;
            }

            if (message.result?.features) {
              ice = message.result.features.ice || null;
              onStatus("Starting WebRTC watch.");
              handleRef?.send({
                message: { request: "watch", params: { orientation: 0, audio: false, mic: false, cam: false } },
              });
            }

            if (jsep) {
              handleRef?.createAnswer({
                jsep,
                tracks: [{ type: "video", capture: false, recv: true, add: true }],
                success: (answer) => {
                  onStatus("Starting WebRTC stream.");
                  handleRef?.send({ message: { request: "start" }, jsep: answer });
                },
                error: fail,
              });
            }
          },
          onremotetrack: (track, _id, added, meta) => {
            if (track.kind !== "video" || !added || meta?.reason !== "created") {
              return;
            }

            const stream = video.srcObject instanceof MediaStream ? video.srcObject : new MediaStream();
            stream.addTrack(track);
            video.srcObject = stream;
            void video.play();
            finish(janus);
          },
        });
      },
      error: fail,
    });
    janusRef = janus;
  });
}

function stopStream(video: HTMLVideoElement, session: JanusSession | null, handle: JanusHandle | null) {
  if (video.srcObject instanceof MediaStream) {
    for (const track of video.srcObject.getTracks()) {
      track.stop();
    }
    video.srcObject = null;
  }

  try {
    handle?.hangup();
    handle?.detach();
  } catch {
    // Best effort cleanup.
  }

  try {
    session?.destroy();
  } catch {
    // Best effort cleanup.
  }
}
