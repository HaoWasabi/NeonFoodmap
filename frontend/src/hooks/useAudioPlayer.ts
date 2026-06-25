import { useState, useRef, useCallback, useEffect } from 'react';

const globalAudio = typeof window !== 'undefined' ? new Audio() : null;

export function unlockAudioAndTTS() {
    if (typeof window !== 'undefined') {
        // Unlock TTS
        if ('speechSynthesis' in window) {
            // Warmup voices
            window.speechSynthesis.getVoices();
            const utterance = new SpeechSynthesisUtterance('');
            utterance.volume = 0;
            window.speechSynthesis.speak(utterance);
        }
        // Unlock HTML5 Audio
        if (globalAudio) {
            globalAudio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
            globalAudio.volume = 0;
            globalAudio.play().then(() => {
                globalAudio.pause();
                globalAudio.volume = 1;
            }).catch(() => { /* ignore */ });
        }
    }
}

// Global unlock on first interaction
if (typeof window !== 'undefined') {
    const unlock = () => {
        unlockAudioAndTTS();
        window.removeEventListener('mousedown', unlock);
        window.removeEventListener('touchstart', unlock);
        window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('mousedown', unlock);
    window.addEventListener('touchstart', unlock);
    window.addEventListener('keydown', unlock);
}

interface UseAudioPlayerOptions {
    onEnded?: (duration: number) => void;
    onTimeUpdate?: (currentTime: number) => void;
}

export function useAudioPlayer({ onEnded, onTimeUpdate }: UseAudioPlayerOptions = {}) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [playbackRate, setPlaybackRateState] = useState(1);
    
    const startTimeRef = useRef<number>(0);
    const currentTimeRef = useRef<number>(0);
    const durationRef = useRef<number>(0);
    const playbackRateRef = useRef<number>(1);
    const isPlayingRef = useRef<boolean>(false);
    
    // TTS specific refs
    const isTTSRef = useRef<boolean>(false);
    const ttsTextRef = useRef<string>('');
    const ttsLangRef = useRef<string>('vi-VN');
    const ttsTimerRef = useRef<number | null>(null);
    const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

    const updateCurrentTime = useCallback((time: number) => {
        setCurrentTime(time);
        currentTimeRef.current = time;
        onTimeUpdate?.(time);
    }, [onTimeUpdate]);

    const updateDuration = useCallback((dur: number) => {
        setDuration(dur);
        durationRef.current = dur;
    }, []);

    const updateIsPlaying = useCallback((playing: boolean) => {
        setIsPlaying(playing);
        isPlayingRef.current = playing;
    }, []);

    const getAudio = useCallback(() => {
        return globalAudio as HTMLAudioElement;
    }, []);

    const blobUrlRef = useRef<string | null>(null);

    const load = useCallback(async (url: string) => {
        isTTSRef.current = false;
        const audio = getAudio();
        
        // Revoke old blob URL if exists
        if (blobUrlRef.current) {
            URL.revokeObjectURL(blobUrlRef.current);
            blobUrlRef.current = null;
        }

        let finalUrl = url;
        try {
            // Check for offline blob
            const { getMediaBlob } = await import('../services/offlineStorage');
            const blob = await getMediaBlob(url);
            if (blob) {
                blobUrlRef.current = URL.createObjectURL(blob);
                finalUrl = blobUrlRef.current;
                console.log('Using offline audio for:', url);
            }
        } catch (error) {
            console.warn('Failed to load offline audio, falling back to network:', error);
        }

        audio.src = finalUrl;
        audio.load();
        updateCurrentTime(0);
        updateDuration(0);
        updateIsPlaying(false);
    }, [getAudio, updateCurrentTime, updateDuration, updateIsPlaying]);

    const playTTSFromCurrentTime = useCallback(() => {
        if (!('speechSynthesis' in window) || !ttsTextRef.current) return;
        
        window.speechSynthesis.cancel();
        
        const ratio = durationRef.current > 0 ? currentTimeRef.current / durationRef.current : 0;
        const charIndex = Math.floor(ratio * ttsTextRef.current.length);
        const remainingText = ttsTextRef.current.substring(charIndex);
        
        if (remainingText.trim() === '') {
            updateIsPlaying(false);
            return;
        }

        const utterance = new SpeechSynthesisUtterance(remainingText);
        utterance.lang = ttsLangRef.current;
        utterance.rate = playbackRateRef.current;
        utteranceRef.current = utterance; // Giữ ref chống Garbage Collection
        
        // Tính lại startTimeRef để interval tiếp tục từ currentTimeRef hiện tại
        startTimeRef.current = Date.now() - (currentTimeRef.current * 1000 / playbackRateRef.current);
        
        updateIsPlaying(true);
        window.speechSynthesis.speak(utterance);

        if (ttsTimerRef.current !== null) {
            window.clearInterval(ttsTimerRef.current);
        }

        ttsTimerRef.current = window.setInterval(() => {
            if (!isPlayingRef.current) return;
            const elapsed = (Date.now() - startTimeRef.current) / 1000;
            const effectiveElapsed = elapsed * playbackRateRef.current;
            
            if (effectiveElapsed < durationRef.current) {
                updateCurrentTime(effectiveElapsed);
            } else {
                updateCurrentTime(durationRef.current);
                if (ttsTimerRef.current !== null) window.clearInterval(ttsTimerRef.current);
            }
        }, 200);

        utterance.onend = () => {
             // Chỉ trigger ended nếu thực sự phát đến cuối (không phải do cancel để seek)
             if (isPlayingRef.current) {
                if (ttsTimerRef.current !== null) window.clearInterval(ttsTimerRef.current);
                updateIsPlaying(false);
                updateCurrentTime(durationRef.current);
                const elapsed = (Date.now() - startTimeRef.current) / 1000;
                onEnded?.(elapsed);
             }
        };
    }, [updateCurrentTime, updateIsPlaying, onEnded]);

    const play = useCallback(async () => {
        if (isTTSRef.current) {
            if (window.speechSynthesis.paused) {
                window.speechSynthesis.resume();
                updateIsPlaying(true);
            } else {
                playTTSFromCurrentTime();
            }
        } else {
            const audio = getAudio();
            try {
                await audio.play();
                updateIsPlaying(true);
            } catch (e) {
                console.warn('Audio play failed:', e);
            }
        }
    }, [getAudio, playTTSFromCurrentTime, updateIsPlaying]);

    const pause = useCallback(() => {
        if (isTTSRef.current) {
            window.speechSynthesis.pause();
        } else {
            getAudio().pause();
        }
        updateIsPlaying(false);
    }, [getAudio, updateIsPlaying]);

    const seek = useCallback((time: number) => {
        const safeTime = Math.max(0, Math.min(time, durationRef.current));
        updateCurrentTime(safeTime);
        
        if (isTTSRef.current) {
            if (isPlayingRef.current) {
                playTTSFromCurrentTime();
            }
        } else {
            const audio = getAudio();
            audio.currentTime = safeTime;
        }
    }, [getAudio, playTTSFromCurrentTime, updateCurrentTime]);

    const setPlaybackRate = useCallback((rate: number) => {
        playbackRateRef.current = rate;
        setPlaybackRateState(rate);
        
        if (isTTSRef.current) {
            if (isPlayingRef.current) {
                playTTSFromCurrentTime();
            }
        } else {
            const audio = getAudio();
            audio.playbackRate = rate;
        }
    }, [getAudio, playTTSFromCurrentTime]);

    const rewind = useCallback((seconds = 10) => {
        seek(currentTimeRef.current - seconds);
    }, [seek]);

    const forward = useCallback((seconds = 10) => {
        seek(currentTimeRef.current + seconds);
    }, [seek]);

    const speakTTS = useCallback((text: string, lang = 'vi-VN') => {
        if (!('speechSynthesis' in window)) return;
        
        // Đôi khi voices chưa load kịp, retry nhẹ
        if (window.speechSynthesis.getVoices().length === 0) {
            console.log('Voices not loaded, retrying speakTTS in 100ms...');
            setTimeout(() => speakTTS(text, lang), 100);
            return;
        }

        isTTSRef.current = true;
        ttsTextRef.current = text;
        ttsLangRef.current = lang;
        
        const estimatedSeconds = Math.max(1, Math.ceil(text.length / 4));
        updateDuration(estimatedSeconds);
        updateCurrentTime(0);
        
        playTTSFromCurrentTime();
    }, [updateDuration, updateCurrentTime, playTTSFromCurrentTime]);

    useEffect(() => {
        const audio = getAudio();

        const handleTimeUpdate = () => {
            if (!isTTSRef.current) {
                updateCurrentTime(audio.currentTime);
            }
        };
        const handleLoadedMetadata = () => {
            if (!isTTSRef.current) {
                updateDuration(audio.duration);
            }
        };
        const handleEnded = () => {
            if (!isTTSRef.current) {
                updateIsPlaying(false);
                onEnded?.(audio.duration);
            }
        };

        audio.addEventListener('timeupdate', handleTimeUpdate);
        audio.addEventListener('loadedmetadata', handleLoadedMetadata);
        audio.addEventListener('ended', handleEnded);

        return () => {
            audio.removeEventListener('timeupdate', handleTimeUpdate);
            audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
            audio.removeEventListener('ended', handleEnded);
            audio.pause();
            if (blobUrlRef.current) {
                URL.revokeObjectURL(blobUrlRef.current);
                blobUrlRef.current = null;
            }
            if (ttsTimerRef.current !== null) window.clearInterval(ttsTimerRef.current);
            window.speechSynthesis.cancel();
        };
    }, [getAudio, onEnded, updateCurrentTime, updateDuration, updateIsPlaying]);

    return {
        isPlaying,
        currentTime,
        duration,
        playbackRate,
        load,
        play,
        pause,
        seek,
        rewind,
        forward,
        setPlaybackRate,
        speakTTS,
    };
}
