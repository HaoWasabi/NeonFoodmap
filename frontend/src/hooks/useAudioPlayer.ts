import { useState, useRef, useCallback, useEffect } from 'react';

export let lastUnlockTime = 0;

export function unlockAudioAndTTS() {
    if (typeof window !== 'undefined') {
        // Unlock TTS safely without queuing dummy empty utterances that lock Chrome SpeechSynthesis
        if ('speechSynthesis' in window) {
            window.speechSynthesis.getVoices();
            if (window.speechSynthesis.paused) {
                window.speechSynthesis.resume();
            }
            lastUnlockTime = Date.now();
        }
        // Unlock HTML5 Audio with a throwaway element. Each player owns its
        // own Audio instance, so this probe must never touch an active player.
        const probe = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
        probe.volume = 0.01;
        void probe.play().then(() => {
            probe.pause();
            probe.removeAttribute('src');
            probe.load();
        }).catch(() => { /* ignore */ });
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

    // Pre-load voices (Chrome loads them async and needs this trigger)
    if ('speechSynthesis' in window) {
        window.speechSynthesis.getVoices();
        window.speechSynthesis.addEventListener?.('voiceschanged', () => {
            window.speechSynthesis.getVoices();
        });
    }
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
    const [isLoading, setIsLoading] = useState(false);
    
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
    const ttsStartTimeoutRef = useRef<number | null>(null);
    const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
    // Do not share a single Audio element between independent UI surfaces.
    // In particular, loading the partner ledger used to replace the POI
    // narration source while its async media lookup was still in flight.
    const audioRef = useRef<HTMLAudioElement | null>(null);
    if (typeof window !== 'undefined' && !audioRef.current) {
        audioRef.current = new Audio();
    }

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
        if (!audioRef.current) {
            throw new Error('Audio player is unavailable outside the browser');
        }
        return audioRef.current;
    }, []);

    const blobUrlRef = useRef<string | null>(null);

    const load = useCallback(async (url: string) => {
        isTTSRef.current = false;
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
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

        // Lỗi của Web Speech API: Nếu text quá dài (trên 200-300 ký tự), Chrome Android sẽ ngầm drop không đọc.
        // Giải pháp: Cắt nhỏ chuỗi thành các câu ngắn và đưa vào queue.
        const maxChunkLength = 200;
        const chunks: string[] = [];
        const sentences = remainingText.match(/[^.!?\n,;]+[.!?\n,;]*/g) || [remainingText];
        
        let currentChunk = '';
        for (const sentence of sentences) {
            if (currentChunk.length + sentence.length > maxChunkLength) {
                if (currentChunk) {
                    chunks.push(currentChunk.trim());
                    currentChunk = '';
                }
                if (sentence.length > maxChunkLength) {
                    chunks.push(sentence.trim());
                } else {
                    currentChunk = sentence.trim();
                }
            } else {
                currentChunk += currentChunk ? ' ' + sentence.trim() : sentence.trim();
            }
        }
        if (currentChunk) chunks.push(currentChunk.trim());

        const voices = window.speechSynthesis.getVoices();
        const requestedLanguage = ttsLangRef.current.replace('_', '-').toLowerCase();
        const requestedPrefix = requestedLanguage.split('-')[0];
        
        // Voice selection priority:
        // 1. Exact locale match (e.g., vi-VN)
        // 2. Prefix match (e.g., any vi-*)
        // 3. Name-based match (e.g., "Google tiếng Việt", "Microsoft An - Vietnamese")
        // 4. null → browser uses u.lang to select (may fallback to English!)
        let preferredVoice = voices.find((voice) => {
            const voiceLanguage = voice.lang.replace('_', '-').toLowerCase();
            return voiceLanguage === requestedLanguage;
        }) ?? voices.find((voice) => {
            const voiceLanguage = voice.lang.replace('_', '-').toLowerCase();
            return voiceLanguage.startsWith(`${requestedPrefix}-`);
        }) ?? null;

        // Fallback: tìm voice theo tên nếu locale match thất bại
        // Hữu ích cho tiếng Việt trên Windows khi voice.lang có thể khác format
        if (!preferredVoice && requestedPrefix === 'vi') {
            preferredVoice = voices.find((voice) => {
                const name = voice.name.toLowerCase();
                return name.includes('viet') || name.includes('tiếng việt');
            }) ?? null;
        }
        
        // Tính lại startTimeRef để interval tiếp tục từ currentTimeRef hiện tại
        startTimeRef.current = Date.now() - (currentTimeRef.current * 1000 / playbackRateRef.current);
        
        setIsLoading(false);
        updateIsPlaying(true);
        
        // Fix Chrome TTS bug: cancel() followed immediately by speak() gets stuck
        if (ttsStartTimeoutRef.current !== null) {
            window.clearTimeout(ttsStartTimeoutRef.current);
        }
        ttsStartTimeoutRef.current = window.setTimeout(() => {
            ttsStartTimeoutRef.current = null;
            if (isPlayingRef.current) {
                window.speechSynthesis.resume(); // Đảm bảo engine không bị kẹt ở trạng thái pause cũ
                
                chunks.forEach((chunkText, index) => {
                    if (!chunkText) return;
                    const u = new SpeechSynthesisUtterance(chunkText);
                    u.lang = ttsLangRef.current;
                    if (preferredVoice) {
                        u.voice = preferredVoice;
                    }
                    u.rate = playbackRateRef.current;
                    
                    if (index === chunks.length - 1) {
                        utteranceRef.current = u; // Giữ ref của chunk cuối chống GC
                        u.onend = () => {
                             if (isPlayingRef.current) {
                                if (ttsTimerRef.current !== null) window.clearInterval(ttsTimerRef.current);
                                updateIsPlaying(false);
                                updateCurrentTime(durationRef.current);
                                const elapsed = (Date.now() - startTimeRef.current) / 1000;
                                onEnded?.(elapsed);
                             }
                        };
                    }
                    
                    window.speechSynthesis.speak(u);
                });
            }
        }, 50);

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
            // Dùng cancel() thay vì pause() để TTS ngừng ngay lập tức,
            // thay vì phải đọc cố cho hết từ/câu hiện tại (lỗi cố hữu của Web Speech API)
            window.speechSynthesis.cancel();
            if (ttsStartTimeoutRef.current !== null) {
                window.clearTimeout(ttsStartTimeoutRef.current);
                ttsStartTimeoutRef.current = null;
            }
            if (ttsTimerRef.current !== null) {
                window.clearInterval(ttsTimerRef.current);
            }
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
        const targetLang = lang.replace('_', '-').toLowerCase();
        const targetPrefix = targetLang.split('-')[0];

        // Sử dụng Backend TTS Preview Endpoint thay vì gọi trực tiếp Google TTS
        // Việc này ngăn Tracking Prevention chặn request và đảm bảo CORS hợp lệ.
        const playBackendTTS = () => {
            isTTSRef.current = false; // Dùng Audio element, không phải Web Speech API
            const audio = getAudio();
            
            const maxLen = 200;
            const firstChunk = text.substring(0, maxLen);
            const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';
            
            // Encode URI components
            const ttsUrl = `${API_BASE_URL}/tts-preview/?text=${encodeURIComponent(firstChunk)}&lang=${targetPrefix}`;
            
            audio.src = ttsUrl;
            audio.playbackRate = playbackRateRef.current;
            audio.load();
            updateCurrentTime(0);
            const estimatedSeconds = Math.max(1, Math.ceil(text.length / 4));
            updateDuration(estimatedSeconds);
            
            audio.play().then(() => {
                updateIsPlaying(true);
                setIsLoading(false);
            }).catch((e) => {
                console.warn('[TTS] Backend TTS failed, falling back to Web Speech API:', e);
                // Fallback sang Web Speech API nếu backend lỗi
                fallbackToWebSpeech();
            });
        };

        const fallbackToWebSpeech = () => {
            if (!('speechSynthesis' in window)) return;
            
            setIsLoading(false);
            isTTSRef.current = true;
            ttsTextRef.current = text;
            ttsLangRef.current = lang;
            
            const estimatedSeconds = Math.max(1, Math.ceil(text.length / 4));
            updateDuration(estimatedSeconds);
            updateCurrentTime(0);
            
            playTTSFromCurrentTime();
        };

        setIsLoading(true);

        // Thử Backend TTS trước (giọng tự nhiên cho mọi ngôn ngữ bao gồm tiếng Việt)
        playBackendTTS();
    }, [getAudio, updateDuration, updateCurrentTime, updateIsPlaying, playTTSFromCurrentTime]);

    useEffect(() => {
        const audio = getAudio();

        const handleTimeUpdate = () => {
            if (!isTTSRef.current) {
                updateCurrentTime(audio.currentTime);
            }
        };
        const handleWaiting = () => {
            if (!isTTSRef.current) setIsLoading(true);
        };
        const handleCanPlay = () => {
            if (!isTTSRef.current) setIsLoading(false);
        };
        const handleLoadedMetadata = () => {
            if (!isTTSRef.current) {
                updateDuration(audio.duration);
                setIsLoading(false);
            }
        };
        const handleEnded = () => {
            if (!isTTSRef.current) {
                updateIsPlaying(false);
                onEnded?.(audio.duration);
            }
        };

        audio.addEventListener('timeupdate', handleTimeUpdate);
        audio.addEventListener('waiting', handleWaiting);
        audio.addEventListener('canplay', handleCanPlay);
        audio.addEventListener('loadedmetadata', handleLoadedMetadata);
        audio.addEventListener('ended', handleEnded);

        return () => {
            audio.removeEventListener('timeupdate', handleTimeUpdate);
            audio.removeEventListener('waiting', handleWaiting);
            audio.removeEventListener('canplay', handleCanPlay);
            audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
            audio.removeEventListener('ended', handleEnded);
            audio.pause();
            if (blobUrlRef.current) {
                URL.revokeObjectURL(blobUrlRef.current);
                blobUrlRef.current = null;
            }
            if (ttsTimerRef.current !== null) window.clearInterval(ttsTimerRef.current);
            if (ttsStartTimeoutRef.current !== null) window.clearTimeout(ttsStartTimeoutRef.current);
            if ('speechSynthesis' in window) {
                if (Date.now() - lastUnlockTime > 500) {
                    window.speechSynthesis.cancel();
                }
            }
        };
    }, [getAudio, onEnded, updateCurrentTime, updateDuration, updateIsPlaying]);

    return {
        isPlaying,
        isLoading,
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
