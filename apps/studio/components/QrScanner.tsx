'use client';

import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { X, ScanLine } from 'lucide-react';

// Daisy: "It needs its own scanner like it had before... I don't want the
// tablet [to leave] the app." No dependency on iOS recognising a link
// through the system Camera app -- this opens the camera itself, decodes
// frames in-app with jsQR (pure JS, works in any browser, no native
// dependency -- picked deliberately over the Chrome-only BarcodeDetector
// API, which is not reliably present in Safari, the actual target
// browser here), and hands back the decoded booking code directly.
//
// onScan receives the RAW decoded text. The caller decides what to do
// with it -- for a printed table card that's a full URL containing
// ?code=..., but keeping the parsing out of this component means it
// stays reusable for anything else that might one day need a scan.

interface QrScannerProps {
  onScan: (text: string) => void;
  onClose: () => void;
}

export function QrScanner({ onScan, onClose }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const scannedRef = useRef(false); // guards against firing onScan twice from overlapping frames
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (cancelled) {
          // Component unmounted while the permission prompt was up --
          // release immediately rather than leave the camera running.
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        tick();
      } catch (err) {
        setError(
          err instanceof DOMException && err.name === 'NotAllowedError'
            ? 'Camera access was denied. Check Settings → Safari → Camera for this site.'
            : 'Could not open the camera on this device.'
        );
      }
    }

    function tick() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) { rafRef.current = requestAnimationFrame(tick); return; }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(frame.data, frame.width, frame.height, { inversionAttempts: 'dontInvert' });
      if (code && code.data && !scannedRef.current) {
        scannedRef.current = true;
        stop();
        onScan(code.data);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    function stop() {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    start();
    return () => { cancelled = true; stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'black', zIndex: 100, display: 'flex', flexDirection: 'column' }}>
      <button
        onClick={onClose}
        aria-label="Close scanner"
        style={{ position: 'absolute', top: '1rem', right: '1rem', zIndex: 2, width: 40, height: 40, borderRadius: 20, background: 'rgba(255,255,255,0.15)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}
      >
        <X size={20} />
      </button>

      {error ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center', color: 'white' }}>
          <p style={{ fontSize: '0.95rem', marginBottom: '1rem' }}>{error}</p>
          <button onClick={onClose} style={{ padding: '0.7rem 1.4rem', borderRadius: 8, border: '1px solid white', background: 'transparent', color: 'white', fontWeight: 700 }}>
            Close
          </button>
        </div>
      ) : (
        <>
          {/* video is the live feed; canvas is an offscreen scratch pad
              for frame decoding, never shown -- the visible layer is the
              video itself, so there's no perceptible delay from the
              decode loop. */}
          <video ref={videoRef} playsInline muted style={{ flex: 1, objectFit: 'cover', width: '100%' }} />
          <canvas ref={canvasRef} style={{ display: 'none' }} />

          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '68vw', maxWidth: 320, aspectRatio: '1', border: '3px solid white', borderRadius: 16, boxShadow: '0 0 0 2000px rgba(0,0,0,0.45)', pointerEvents: 'none' }} />

          <div style={{ position: 'absolute', bottom: '3.5rem', left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', color: 'white', pointerEvents: 'none' }}>
            <ScanLine size={22} />
            <p style={{ fontSize: '0.85rem', fontWeight: 600 }}>Line the card's QR code up in the box</p>
          </div>
        </>
      )}
    </div>
  );
}
