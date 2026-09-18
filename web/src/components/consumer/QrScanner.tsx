"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, CloseIcon, Notice, inputCls } from "@/components/ui";
import { PARSE_ERROR_MESSAGES, parsePayInput } from "@/lib/qr";

/** Minimal typing for the native BarcodeDetector (Chrome/Android, Safari 17+). */
interface NativeDetector {
  detect(source: ImageBitmapSource): Promise<Array<{ rawValue: string }>>;
}
type DetectorCtor = new (opts: { formats: string[] }) => NativeDetector;

const SCAN_INTERVAL_MS = 250;

/**
 * In-app QR scanner (SPEC 7.1). Uses the native BarcodeDetector when present, otherwise decodes video
 * frames with jsQR. Any camera failure falls back to a paste box so the flow still works on desktop.
 */
export function QrScanner({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [engine, setEngine] = useState<"native" | "jsqr" | null>(null);
  const doneRef = useRef(false);

  const accept = useCallback(
    (raw: string) => {
      if (doneRef.current) return;
      const parsed = parsePayInput(raw, window.location.origin);
      if (!parsed.ok) {
        setParseError(PARSE_ERROR_MESSAGES[parsed.error]);
        return;
      }
      doneRef.current = true;
      const u = new URL(raw.trim(), window.location.origin);
      router.push(`${u.pathname}${u.search}`);
      onClose();
    },
    [router, onClose],
  );

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    let detector: NativeDetector | null = null;
    let jsqr: ((data: Uint8ClampedArray, w: number, h: number) => { data: string } | null) | null = null;

    async function start() {
      if (!window.isSecureContext) {
        setCameraError("카메라는 HTTPS(또는 localhost)에서만 쓸 수 있어요. 아래에 링크를 붙여 넣어 주세요.");
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("이 브라우저는 카메라를 지원하지 않아요. 아래에 링크를 붙여 넣어 주세요.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
      } catch (e) {
        const name = e instanceof DOMException ? e.name : "";
        setCameraError(
          name === "NotAllowedError"
            ? "카메라 권한이 거부됐어요. 아래에 링크를 붙여 넣어 주세요."
            : "카메라를 열 수 없어요. 아래에 링크를 붙여 넣어 주세요.",
        );
        return;
      }
      const Ctor = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
      if (Ctor) {
        try {
          detector = new Ctor({ formats: ["qr_code"] });
          setEngine("native");
        } catch {
          detector = null;
        }
      }
      if (!detector) {
        const mod = await import("jsqr");
        jsqr = (data, w, h) => mod.default(data, w, h, { inversionAttempts: "dontInvert" });
        setEngine("jsqr");
      }
      const loop = async () => {
        if (cancelled) return;
        const video = videoRef.current;
        if (video && video.readyState >= 2) {
          try {
            if (detector) {
              const codes = await detector.detect(video);
              if (codes[0]?.rawValue) accept(codes[0].rawValue);
            } else if (jsqr) {
              const canvas = canvasRef.current;
              if (canvas) {
                const w = video.videoWidth;
                const h = video.videoHeight;
                if (w && h) {
                  canvas.width = w;
                  canvas.height = h;
                  const ctx = canvas.getContext("2d", { willReadFrequently: true });
                  if (ctx) {
                    ctx.drawImage(video, 0, 0, w, h);
                    const img = ctx.getImageData(0, 0, w, h);
                    const code = jsqr(img.data, w, h);
                    if (code?.data) accept(code.data);
                  }
                }
              }
            }
          } catch {
            // a single bad frame is fine
          }
        }
        timer = window.setTimeout(loop, SCAN_INTERVAL_MS);
      };
      loop();
    }

    start();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [accept]);

  return (
    <div role="dialog" aria-modal="true" aria-label="QR 스캔" className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-bold text-gray-900">QR 스캔</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="rounded-full p-2 text-gray-500 hover:bg-gray-100">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        {!cameraError && (
          <div className="relative mt-4 overflow-hidden rounded-2xl bg-black">
            <video ref={videoRef} playsInline muted className="aspect-square w-full object-cover" />
            <div aria-hidden="true" className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-white/80" />
            <canvas ref={canvasRef} className="hidden" />
          </div>
        )}
        <p className="mt-2 text-[12px] text-gray-500">
          {cameraError ? cameraError : engine ? `가맹점 화면의 결제 QR을 사각형 안에 맞춰 주세요 (${engine === "native" ? "기기 내장 인식" : "jsQR"})` : "카메라를 여는 중…"}
        </p>

        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (pasted.trim()) accept(pasted);
          }}
        >
          <input
            className={inputCls}
            placeholder="또는 결제 링크 붙여넣기 (…/pay?m=…&a=…)"
            value={pasted}
            onChange={(e) => {
              setPasted(e.target.value);
              setParseError(null);
            }}
            aria-label="결제 링크"
          />
          <Button type="submit" variant="dark" disabled={!pasted.trim()}>
            열기
          </Button>
        </form>
        {parseError && (
          <Notice tone="error" className="mt-3">
            {parseError}
          </Notice>
        )}
      </div>
    </div>
  );
}
