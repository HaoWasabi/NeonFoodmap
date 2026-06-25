import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import vi from './locales/vi.json';
import en from './locales/en.json';
import zh from './locales/zh.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';

const savedLanguage = localStorage.getItem('bcsd_language') || 'vi';

i18n
    .use(initReactI18next)
    .init({
        resources: {
            vi: { translation: vi },
            en: { translation: en },
            zh: { translation: zh },
            ja: { translation: ja },
            ko: { translation: ko },
        },
        lng: savedLanguage,
        fallbackLng: 'vi',
        interpolation: {
            escapeValue: false, // React already escapes
        },
    });

export default i18n;
