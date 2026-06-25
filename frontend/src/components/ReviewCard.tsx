import { useTranslation } from 'react-i18next';
import type { TourReview } from '../types';

interface ReviewCardProps {
    review: TourReview;
}

export default function ReviewCard({ review }: ReviewCardProps) {
    const { t } = useTranslation();
    const date = new Date(review.created_at);
    // Format ngày sinh động, ví dụ: 25 thg 10, 2023
    const formattedDate = date.toLocaleDateString(t('common.locale', { defaultValue: 'vi-VN' }), {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });

    return (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 mb-3 animate-fade-slide-up">
            <div className="flex items-start gap-3">
                <div className="size-10 rounded-full bg-gradient-to-br from-primary/80 to-orange-400 flex items-center justify-center shrink-0 shadow-inner text-white font-bold text-lg">
                    {review.username.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-slate-900 truncate pr-2">{review.username}</h4>
                        <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">{formattedDate}</span>
                    </div>
                    <div className="flex items-center gap-0.5 mt-0.5 mb-2">
                        {[1, 2, 3, 4, 5].map((star) => (
                            <span
                                key={star}
                                className={`text-[14px] ${star <= review.rating ? 'text-amber-400' : 'text-slate-200'} material-symbols-outlined`}
                                style={{ fontVariationSettings: "'FILL' 1" }}
                            >
                                star
                            </span>
                        ))}
                    </div>
                    {/* Preserve line breaks in text */}
                    <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{review.comment}</p>
                </div>
            </div>
        </div>
    );
}
