import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getTourReviews, submitTourReview } from '../services/api';
import type { TourReview } from '../types';
import ReviewCard from './ReviewCard';
import ReviewForm from './ReviewForm';

interface ReviewSectionProps {
    tourId: string;
}

export default function ReviewSection({ tourId }: ReviewSectionProps) {
    const { t } = useTranslation();
    const [reviews, setReviews] = useState<TourReview[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => {
        const fetchReviews = async () => {
            setLoading(true);
            try {
                const data = await getTourReviews(tourId);
                setReviews(data);
            } catch (error) {
                console.error('Failed to fetch reviews:', error);
            } finally {
                setLoading(false);
            }
        };

        if (tourId) fetchReviews();
    }, [tourId, refreshKey]);

    const handleReviewSubmit = async (rating: number, comment: string) => {
        await submitTourReview({
            tour: Number(tourId),
            rating,
            comment,
        } as any);
        setRefreshKey(prev => prev + 1);
        // setShowForm(false); handled inside ReviewForm's onClose call which is called in handleSubmit with delay
    };

    return (
        <div className="mt-8 animate-fade-slide-up">
            <div className="flex items-center justify-between mb-4 px-1">
                <h3 className="text-base font-bold text-slate-900">
                    {t('review.sectionTitle', { defaultValue: 'Đánh giá & Nhận xét' })}
                </h3>
                <button
                    onClick={() => setShowForm(true)}
                    className="flex items-center gap-1 text-xs font-bold text-primary bg-primary/10 px-3 py-1.5 rounded-full tap-scale"
                >
                    <span className="material-symbols-outlined text-[14px]">edit_note</span>
                    {t('review.addReview', { defaultValue: 'Viết đánh giá' })}
                </button>
            </div>

            {loading ? (
                <div className="space-y-3">
                    <div className="h-24 bg-slate-50 rounded-2xl animate-pulse" />
                    <div className="h-24 bg-slate-50 rounded-2xl animate-pulse" />
                </div>
            ) : reviews.length === 0 ? (
                <div className="bg-slate-50 rounded-2xl p-8 text-center border border-dashed border-slate-200">
                    <div className="size-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <span className="material-symbols-outlined text-slate-400 text-2xl">rate_review</span>
                    </div>
                    <p className="text-sm font-semibold text-slate-500">{t('review.empty', { defaultValue: 'Chưa có đánh giá nào cho tour này.' })}</p>
                    <p className="text-xs text-slate-400 mt-1">{t('review.emptySub', { defaultValue: 'Hãy là người đầu tiên chia sẻ cảm nhận!' })}</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {reviews.map(review => (
                        <ReviewCard key={review.id} review={review} />
                    ))}
                </div>
            )}

            {showForm && (
                <ReviewForm
                    onClose={() => setShowForm(false)}
                    onSubmit={handleReviewSubmit}
                />
            )}
        </div>
    );
}
