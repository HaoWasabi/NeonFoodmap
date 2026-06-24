from deep_translator import GoogleTranslator
import logging

logger = logging.getLogger(__name__)

SUPPORTED_LANGUAGES = {
    'en': 'en',
    'ja': 'ja',
    'zh': 'zh-CN',
    'ko': 'ko'
}

def translate_text(text, target_lang_code):
    """
    Translates text to target language using GoogleTranslator.
    Handles long text by splitting into chunks.
    """
    if not text or not target_lang_code or target_lang_code == 'vi':
        return text
    
    target = SUPPORTED_LANGUAGES.get(target_lang_code, target_lang_code)
    
    try:
        translator = GoogleTranslator(source='vi', target=target)
        
        # If text is small, translate directly
        if len(text) < 4000:
            return translator.translate(text)
        
        # Else split by newlines or paragraphs to avoid truncation
        chunks = text.split('\n')
        translated_chunks = []
        for chunk in chunks:
            if not chunk.strip():
                translated_chunks.append('')
                continue
                
            # Further split very long paragraphs if needed
            if len(chunk) > 4000:
                sub_chunks = [chunk[i:i+4000] for i in range(0, len(chunk), 4000)]
                translated_chunks.append("".join([translator.translate(sc) for sc in sub_chunks]))
            else:
                translated_chunks.append(translator.translate(chunk))
                
        return '\n'.join(translated_chunks)
    except Exception as e:
        logger.error(f"Translation failed for {target}: {e}")
        return text

def translate_to_all(text):
    """
    Returns a dict of translations for all supported languages.
    """
    results = {}
    for lang in SUPPORTED_LANGUAGES.keys():
        results[lang] = translate_text(text, lang)
    return results
