import jsQR from 'jsqr';
import { useEffect, useRef, useState } from 'react';
import { Modal } from './ui';

/** Bipe curto para o operador saber que leu (ok) ou falhou (erro), sem olhar a tela. */
export function beep(ok = true) {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = ok ? 1046 : 220;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (ok ? 0.12 : 0.35));
    osc.onended = () => ctx.close();
  } catch {
    // sem áudio: segue sem bipe
  }
}

/** Abre a câmera e devolve o primeiro QR code lido. */
export function CameraScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let done = false;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const tick = () => {
      const v = video.current;
      if (done || !v || !ctx) return;
      if (v.readyState === v.HAVE_ENOUGH_DATA && v.videoWidth) {
        // Reduz a imagem para ler mais rápido em computadores fracos
        const scale = Math.min(1, 640 / v.videoWidth);
        canvas.width = Math.round(v.videoWidth * scale);
        canvas.height = Math.round(v.videoHeight * scale);
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const found = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
        if (found?.data) {
          done = true;
          onCode(found.data.trim());
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Este navegador não permite usar a câmera. Use o leitor USB ou digite o código.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
          audio: false,
        });
        if (done) return;
        if (video.current) {
          video.current.srcObject = stream;
          await video.current.play().catch(() => undefined);
        }
        raf = requestAnimationFrame(tick);
      } catch (e) {
        const name = (e as DOMException).name;
        setError(
          name === 'NotAllowedError'
            ? 'A câmera foi bloqueada. Libere o acesso à câmera para este site nas configurações do navegador.'
            : 'Nenhuma câmera encontrada neste aparelho.',
        );
      }
    })();

    return () => {
      done = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onCode]);

  return (
    <Modal title="Aponte para o QR da carteirinha" onClose={onClose}>
      {error ? (
        <div className="alert alert-error">{error}</div>
      ) : (
        <div className="camera">
          <video ref={video} playsInline muted />
          <div className="camera-frame" aria-hidden />
        </div>
      )}
      <button className="btn btn-ghost" onClick={onClose}>
        Cancelar
      </button>
    </Modal>
  );
}
