import { useState, useEffect, useCallback } from 'react';
import type { TourReview } from '../types';
import { getTourReviews, submitTourReview } from '../services/api';

const LOCAL_STORAGE_KEY_PREFIX = 'bcsd_reviews_';

export function useTourReviews(tourId: string) {
    const [reviews, setReviews] = useState<TourReview[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadReviews = useCallback(async () => {
        if (!tourId) return;
        setLoading(true);
        setError(null);
        try {
            // Cố gắng gọi API
            const data = await getTourReviews(tourId);
            setReviews(data);
            localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}${tourId}`, JSON.stringify(data));
        } catch {
            // Fallback: đọc từ localStorage
            const localData = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}${tourId}`);
            if (localData) {
                setReviews(JSON.parse(localData));
            } else {
                setReviews([]);
            }
        } finally {
            setLoading(false);
        }
    }, [tourId]);

    useEffect(() => {
        loadReviews();
    }, [loadReviews]);

    const addReview = async (reviewData: Omit<TourReview, 'id' | 'created_at'>) => {
        try {
            // Cố gắng gửi lên API
            const newReview = await submitTourReview(reviewData);
            const updated = [newReview, ...reviews];
            setReviews(updated);
            localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}${tourId}`, JSON.stringify(updated));
            return newReview;
        } catch {
            // Fallback: lưu vào localStorage
            const fallbackReview: TourReview = {
                ...reviewData,
                id: `local-${Date.now()}`,
                created_at: new Date().toISOString(),
            };
            const updated = [fallbackReview, ...reviews];
            setReviews(updated);
            localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}${tourId}`, JSON.stringify(updated));
            return fallbackReview;
        }
    };

    // Calculate stats
    const totalReviews = reviews.length;
    let averageRating = 0;
    const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    if (totalReviews > 0) {
        const sum = reviews.reduce((acc, r) => {
            if (r.rating >= 1 && r.rating <= 5) {
                ratingDistribution[r.rating as 1 | 2 | 3 | 4 | 5]++;
            }
            return acc + r.rating;
        }, 0);
        averageRating = Number((sum / totalReviews).toFixed(1));
    }

    return {
        reviews,
        loading,
        error,
        addReview,
        refresh: loadReviews,
        stats: {
            total: totalReviews,
            average: averageRating,
            distribution: ratingDistribution,
        }
    };
}
