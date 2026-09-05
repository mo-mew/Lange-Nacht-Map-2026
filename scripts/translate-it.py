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

MODELS = {
    "de": "Helsinki-NLP/opus-mt-de-it",
    "en": "Helsinki-NLP/opus-mt-en-it",
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
        if raw.get("version") == 1 and isinstance(raw.get("items"), dict):
            return raw["items"]
    except Exception:
        pass
    return {}


def save_cache(items):
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(
        json.dumps({"version": 1, "items": items}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def translate_batches(lang, texts):
    if not texts:
        return {}

    import torch
    from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

    model_name = MODELS[lang]
    print(f"Loading {model_name} for {len(texts)} unique strings…")
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    model = AutoModelForSeq2SeqLM.from_pretrained(model_name)
    model.eval()
    torch.set_num_threads(max(1, min(4, torch.get_num_threads())))

    output = {}
    batch_size = 24
    with torch.inference_mode():
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
                max_new_tokens=256,
                num_beams=3,
                early_stopping=True,
                renormalize_logits=True,
            )
            translated = tokenizer.batch_decode(generated, skip_special_tokens=True)
            for source, target in zip(batch, translated):
                output[source] = clean(target) or source
            print(f"  {min(offset + batch_size, len(texts))}/{len(texts)}")

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

    for lang in ("de", "en"):
        pending = sorted(jobs[lang])
        if not pending:
            continue
        translated = translate_batches(lang, pending)
        for source, target in translated.items():
            cache[hash_key(lang, source)] = target
        save_cache(cache)

    for event, title, description, title_lang, description_lang in event_meta:
        if title:
            if title_lang == "it":
                event["titleIt"] = title
            else:
                event["titleIt"] = cache.get(hash_key(title_lang, title), title)
        else:
            event["titleIt"] = title

        if description:
            if description_lang == "it":
                event["descriptionIt"] = description
            else:
                event["descriptionIt"] = cache.get(hash_key(description_lang, description), description)
        else:
            event["descriptionIt"] = ""

        category = event.get("category")
        event["categoryIt"] = CATEGORY_IT.get(category, category) if category else None

    data["locale"] = "it-CH"
    data["translation"] = {
        "target": "it",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "models": sorted(set(MODELS.values())),
    }

    DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    save_cache(cache)

    translated_titles = sum(1 for event in events if event.get("titleIt"))
    translated_descriptions = sum(1 for event in events if event.get("descriptionIt"))
    print(f"Italian fields written for {translated_titles} titles and {translated_descriptions} descriptions.")


if __name__ == "__main__":
    main()
