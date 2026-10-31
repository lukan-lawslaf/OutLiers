import { useCallback, useEffect, useRef, useState } from 'react';
import { storageGet, storageKeys, storageSet } from '../utils/storage';

function preferredMotion(): boolean {
  const saved = storageGet(storageKeys.motion);
  return (
    saved === 'reduced' ||
    (saved !== 'full' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  );
}

export function useOfficePreferences() {
  const [reduced, setReduced] = useState(preferredMotion);
  const [flat, setFlat] = useState(() => storageGet(storageKeys.office) === 'flat');
  const [sound, setSound] = useState(false);
  const [showIntro, setShowIntro] = useState(
    () => !storageGet(storageKeys.intro) && !preferredMotion(),
  );
  const finishIntro = useCallback(() => {
    storageSet(storageKeys.intro, 'seen');
    setShowIntro(false);
  }, []);

  useEffect(() => {
    if (reduced && showIntro) finishIntro();
  }, [finishIntro, reduced, showIntro]);

  return {
    reduced,
    flat,
    sound,
    showIntro,
    finishIntro,
    setReduced: useCallback((value: boolean) => {
      setReduced(value);
      storageSet(storageKeys.motion, value ? 'reduced' : 'full');
    }, []),
    setFlat: useCallback((value: boolean) => {
      setFlat(value);
      storageSet(storageKeys.office, value ? 'flat' : '3d');
    }, []),
    toggleSound: useCallback(() => setSound((value) => !value), []),
  };
}

export type OfficePreferences = ReturnType<typeof useOfficePreferences>;

function playChime() {
  try {
    const audio = new AudioContext();
    const gain = audio.createGain();
    gain.connect(audio.destination);
    gain.gain.setValueAtTime(0.045, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.6);
    [523.25, 659.25].forEach((frequency, index) => {
      const oscillator = audio.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      oscillator.start(audio.currentTime + index * 0.1);
      oscillator.stop(audio.currentTime + 0.6);
    });
    window.setTimeout(() => void audio.close(), 800);
  } catch {
    // Sound is optional; a browser audio restriction never interrupts the case.
  }
}

export function useCaseFeedback(sound: boolean) {
  const [announcement, setAnnouncement] = useState('');
  const [toast, setToast] = useState('');
  const enabled = useRef(sound);
  useEffect(() => {
    enabled.current = sound;
  }, [sound]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  return {
    announcement,
    toast,
    notify: useCallback((message: string) => {
      setAnnouncement(message);
      setToast(message);
      if (enabled.current) playChime();
    }, []),
    dismiss: useCallback(() => setToast(''), []),
  };
}
