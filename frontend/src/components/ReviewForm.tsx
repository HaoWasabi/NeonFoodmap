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
        <div className="fixed inset-0 z-[9999] flex flex-col justify-end bg-black/60 backdrop-blur-sm animate-fade-in p-4 sm:p-6 pb-0">
            {/* Clickable background to close */}
            <div className="absolute inset-0" onClick={!submitting ? onClose : undefined} />

            <div className="relative bg-[#F9F9FA] w-full max-w-[480px] mx-auto p-6 sm:border-[3px] border-t-[3px] sm:border-b-0 border-[#191C1D] animate-slide-up shadow-2xl">
                <h3 className="text-2xl font-bold text-[#191C1D] mb-6">
                    {t('review.writeReview', { defaultValue: 'Viết đánh giá' })}
                </h3>

                {/* Star Selection */}
                <div className="mb-6">
                    <p className="text-[11px] font-bold tracking-widest uppercase text-[#5C6663] mb-2">
                        {t('review.yourRating', { defaultValue: 'Trải nghiệm của bạn thế nào?' })}
                    </p>
                    <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                            <button
                                key={star}
                                type="button"
                                disabled={submitting}
                                onClick={() => { setRating(star); setError(''); }}
                                onMouseEnter={() => setHoverRating(star)}
                                onMouseLeave={() => setHoverRating(0)}
                                className={`text-[40px] transition-colors bg-transparent border-0 p-0 cursor-pointer ${
                                    (hoverRating || rating) >= star
                                        ? 'text-[#006D38]'
                                        : 'text-[#EDEEEF] hover:text-[#E3EFE8]'
                                }`}
                            >
                                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1", fontSize: 'inherit' }}>
                                    star
                                </span>
                            </button>
                        ))}
                    </div>
                    {error && <p className="text-[#9A3226] text-sm mt-2">{error}</p>}
                </div>

                {/* Comment Input */}
                <div className="mb-8">
                    <label className="block text-[11px] font-bold tracking-widest uppercase text-[#5C6663] mb-2">
                        {t('review.commentPlaceholder', { defaultValue: 'Chia sẻ thêm về trải nghiệm của bạn (không bắt buộc)...' })}
                    </label>
                    <textarea
                        disabled={submitting}
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        className="w-full bg-transparent border-0 border-b-2 border-[#191C1D] rounded-none py-3 text-base text-[#191C1D] placeholder:text-[#5C6663]/60 focus:ring-0 focus:outline-none focus:border-[#006D38] transition-colors resize-y min-h-[88px]"
                    />
                </div>

                {/* Actions */}
                <div className="flex gap-4">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        className="flex-1 py-3 px-6 text-[14px] font-bold tracking-[0.01em] bg-transparent border border-[#191C1D] text-[#191C1D] hover:bg-[#191C1D] hover:text-white transition-colors"
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={submitting || rating === 0}
                        className={`flex-1 py-3 px-6 text-[14px] font-bold tracking-[0.01em] transition-colors border border-transparent ${
                            rating > 0 && !submitting
                                ? 'bg-[#191C1D] text-white hover:bg-[#006D38] cursor-pointer'
                                : 'bg-[#191C1D]/30 text-[#191C1D] cursor-not-allowed'
                        }`}
                    >
                        {submitting ? (
                            <span className="flex items-center justify-center gap-2">
                                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
