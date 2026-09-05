#!/usr/bin/env python3
import gc
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path

from langdetect import DetectorFactory, detect

DetectorFactory.seed = 0

DATA_PATH = Path("data/events.json")
CACHE_PATH = Path("data/translations-it.json")
CACHE_VERSION = 2
MODEL_NAME = "facebook/m2m100_418M"

CATEGORY_IT = {
    "Konzert": "Concerto",
    "Führung": "Visita guidata",
    "Vortrag/Lesung/Gespräch": "Conferenza, lettura o conversazione",
    "Dies & das": "Varie",
    "Film": "Film",
    "Party": "Festa",
    "Performance/Tanz/Theater": "Performance, danza o teatro",
    "Workshop": "Laboratorio",
}


def clean(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def hash_key(lang, text):
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
    return f"{lang}:{digest}"


def detect_language(text, fallback="de"):
    text = clean(text)
    if not text:
        return fallback
    letters = re.sub(r"[^A-Za-zÀ-ÿÄÖÜäöüß]", "", text)
    if len(letters) < 5:
        return fallback
    try:
        lang = detect(text)
    except Exception:
        return fallback
    if lang == "it":
        return "it"
    if lang == "en":
        return "en"
    return "de"


def event_languages(event):
    description = clean(event.get("description"))
    title = clean(event.get("title"))
    description_lang = detect_language(description, "de") if description else None
    title_lang = detect_language(title, description_lang or "de")
    return title_lang, description_lang or title_lang


def load_cache():
    try:
        raw = json.loads(CACHE_PATH.read_text(encoding="utf-8"))
        if raw.get("version") == CACHE_VERSION and isinstance(raw.get("items"), dict):
            return raw["items"]
    except Exception:
        pass
    return {}


def save_cache(items):
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(
        json.dumps({"version": CACHE_VERSION, "model": MODEL_NAME, "items": items}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def translate_all(jobs):
    pending_count = sum(len(values) for values in jobs.values())
    if not pending_count:
        return {}

    import torch
    from transformers import M2M100ForConditionalGeneration, M2M100Tokenizer

    print(f"Loading {MODEL_NAME} for {pending_count} unique strings…")
    tokenizer = M2M100Tokenizer.from_pretrained(MODEL_NAME)
    model = M2M100ForConditionalGeneration.from_pretrained(MODEL_NAME)
    model.eval()
    torch.set_num_threads(max(1, min(4, torch.get_num_threads())))

    output = {}
    batch_size = 16
    with torch.inference_mode():
        for lang in ("de", "en"):
            texts = sorted(jobs.get(lang, set()))
            if not texts:
                continue
            tokenizer.src_lang = lang
            target_id = tokenizer.get_lang_id("it")
            print(f"Translating {len(texts)} {lang} strings…")

            for offset in range(0, len(texts), batch_size):
                batch = texts[offset : offset + batch_size]
                encoded = tokenizer(
                    batch,
                    return_tensors="pt",
                    padding=True,
                    truncation=True,
                    max_length=256,
                )
                generated = model.generate(
                    **encoded,
                    forced_bos_token_id=target_id,
                    max_new_tokens=256,
                    num_beams=3,
                    early_stopping=True,
                    renormalize_logits=True,
                )
                translated = tokenizer.batch_decode(generated, skip_special_tokens=True)
                for source, target in zip(batch, translated):
                    output[(lang, source)] = clean(target) or source
                print(f"  {lang}: {min(offset + batch_size, len(texts))}/{len(texts)}")

    del model
    del tokenizer
    gc.collect()
    return output


def main():
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    events = data.get("events", [])
    cache = load_cache()

    jobs = {"de": set(), "en": set()}
    event_meta = []

    for event in events:
        title = clean(event.get("title"))
        description = clean(event.get("description"))
        title_lang, description_lang = event_languages(event)
        event_meta.append((event, title, description, title_lang, description_lang))

        for text, lang in ((title, title_lang), (description, description_lang)):
            if not text or lang == "it":
                continue
            key = hash_key(lang, text)
            if key not in cache:
                jobs[lang].add(text)

    translated = translate_all(jobs)
    for (lang, source), target in translated.items():
        cache[hash_key(lang, source)] = target
    save_cache(cache)

    for event, title, description, title_lang, description_lang in event_meta:
        if title:
            event["titleIt"] = title if title_lang == "it" else cache.get(hash_key(title_lang, title), title)
        else:
            event["titleIt"] = ""

        if description:
            event["descriptionIt"] = description if description_lang == "it" else cache.get(hash_key(description_lang, description), description)
        else:
            event["descriptionIt"] = ""

        category = event.get("category")
        event["categoryIt"] = CATEGORY_IT.get(category, category) if category else None

    data["locale"] = "it-CH"
    data["translation"] = {
        "target": "it",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "model": MODEL_NAME,
    }

    DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    save_cache(cache)

    translated_titles = sum(1 for event in events if event.get("titleIt"))
    translated_descriptions = sum(1 for event in events if event.get("descriptionIt"))
    print(f"Italian fields written for {translated_titles} titles and {translated_descriptions} descriptions.")


if __name__ == "__main__":
    main()
