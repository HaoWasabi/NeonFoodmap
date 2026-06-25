import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface ReviewFormProps {
    onClose: () => void;
    onSubmit: (rating: number, comment: string) => Promise<void>;
}

export default function ReviewForm({ onClose, onSubmit }: ReviewFormProps) {
    const { t } = useTranslation();
    const [rating, setRating] = useState(0);
    const [hoverRating, setHoverRating] = useState(0);
    const [comment, setComment] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async () => {
        if (rating === 0) {
            setError(t('review.errorNoRating', { defaultValue: 'Vui lòng chọn số sao đánh giá.' }));
            return;
        }

        setSubmitting(true);
        setError('');

        try {
            await onSubmit(rating, comment.trim());
            // onSubmit will handle closing if successful via parent state, 
            // or we close here explicitly after delay
            setTimeout(() => {
                onClose();
            }, 500);
        } catch {
            setError(t('review.errorSubmit', { defaultValue: 'Có lỗi xảy ra, vui lòng thử lại.' }));
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40 backdrop-blur-sm animate-fade-in">
            {/* Clickable background to close */}
            <div className="absolute inset-0" onClick={!submitting ? onClose : undefined} />

            <div className="relative bg-white rounded-t-3xl w-full max-w-[480px] mx-auto p-5 pb-8 animate-slide-up shadow-2xl">
                {/* Drag handle */}
                <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-6" />

                <h3 className="text-xl font-bold text-slate-900 text-center mb-6">
                    {t('review.writeReview', { defaultValue: 'Viết đánh giá' })}
                </h3>

                {/* Star Selection */}
                <div className="flex flex-col items-center justify-center mb-6">
                    <p className="text-sm font-semibold text-slate-500 mb-3">
                        {t('review.yourRating', { defaultValue: 'Trải nghiệm của bạn thế nào?' })}
                    </p>
                    <div className="flex items-center gap-2">
                        {[1, 2, 3, 4, 5].map((star) => (
                            <button
                                key={star}
                                type="button"
                                disabled={submitting}
                                onClick={() => { setRating(star); setError(''); }}
                                onMouseEnter={() => setHoverRating(star)}
                                onMouseLeave={() => setHoverRating(0)}
                                className={`text-4xl transition-all tap-scale ${(hoverRating || rating) >= star
                                        ? 'text-amber-400 animate-pop-in'
                                        : 'text-slate-200 hover:text-amber-200'
                                    }`}
                            >
                                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1", fontSize: 'inherit' }}>
                                    star
                                </span>
                            </button>
                        ))}
                    </div>
                    {error && <p className="text-red-500 text-xs font-medium mt-2 animate-bounce-in">{error}</p>}
                </div>

                {/* Comment Input */}
                <div className="mb-6">
                    <textarea
                        disabled={submitting}
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder={t('review.commentPlaceholder', { defaultValue: 'Chia sẻ thêm về trải nghiệm của bạn (không bắt buộc)...' })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none h-32"
                    />
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        className="flex-1 py-3.5 rounded-2xl font-bold text-sm text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors"
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={submitting || rating === 0}
                        className={`flex-1 py-3.5 rounded-2xl font-bold text-sm transition-all shadow-lg ${rating > 0 && !submitting
                                ? 'bg-primary text-white shadow-primary/30 tap-scale'
                                : 'bg-slate-200 text-slate-400 shadow-none cursor-not-allowed'
                            }`}
                    >
                        {submitting ? (
                            <span className="flex items-center justify-center gap-2">
                                <span className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                {t('common.loading')}
                            </span>
                        ) : (
                            t('review.submit', { defaultValue: 'Gửi đánh giá' })
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
