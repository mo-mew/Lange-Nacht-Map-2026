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
CACHE_PATH = Path("data/translations-it-via-en.json")
CACHE_VERSION = 1
DE_EN_MODEL = "Helsinki-NLP/opus-mt-de-en"
EN_IT_MODEL = "Helsinki-NLP/opus-mt-tc-big-en-it"

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


def key(lang, text):
    return f"{lang}:{hashlib.sha256(text.encode('utf-8')).hexdigest()}"


def detect_lang(text, fallback="de"):
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


def event_langs(event):
    title = clean(event.get("title"))
    description = clean(event.get("description"))
    description_lang = detect_lang(description, "de") if description else None
    title_lang = detect_lang(title, description_lang or "de")
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
        json.dumps(
            {
                "version": CACHE_VERSION,
                "route": [DE_EN_MODEL, EN_IT_MODEL],
                "items": items,
            },
            ensure_ascii=False,
            indent=2,
        ) + "\n",
        encoding="utf-8",
    )


def translate_model(model_name, texts, batch_size=20):
    if not texts:
        return {}

    import torch
    from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

    print(f"Loading {model_name} for {len(texts)} strings…")
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    model = AutoModelForSeq2SeqLM.from_pretrained(model_name)
    model.eval()
    torch.set_num_threads(max(1, min(4, torch.get_num_threads())))

    output = {}
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
                num_beams=4,
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

    meta = []
    german_sources = set()
    english_sources = set()

    for event in events:
        title = clean(event.get("title"))
        description = clean(event.get("description"))
        title_lang, description_lang = event_langs(event)
        meta.append((event, title, description, title_lang, description_lang))

        for text, lang in ((title, title_lang), (description, description_lang)):
            if not text or lang == "it" or key(lang, text) in cache:
                continue
            if lang == "en":
                english_sources.add(text)
            else:
                german_sources.add(text)

    de_to_en = translate_model(DE_EN_MODEL, sorted(german_sources), batch_size=24)
    english_for_final = set(english_sources)
    english_for_final.update(de_to_en.values())
    en_to_it = translate_model(EN_IT_MODEL, sorted(english_for_final), batch_size=16)

    for source in german_sources:
        intermediate = de_to_en.get(source, source)
        cache[key("de", source)] = en_to_it.get(intermediate, intermediate)
    for source in english_sources:
        cache[key("en", source)] = en_to_it.get(source, source)

    save_cache(cache)

    for event, title, description, title_lang, description_lang in meta:
        if title:
            event["titleIt"] = title if title_lang == "it" else cache.get(key(title_lang, title), title)
        else:
            event["titleIt"] = ""

        if description:
            event["descriptionIt"] = description if description_lang == "it" else cache.get(key(description_lang, description), description)
        else:
            event["descriptionIt"] = ""

        category = event.get("category")
        event["categoryIt"] = CATEGORY_IT.get(category, category) if category else None

    data["locale"] = "it-CH"
    data["translation"] = {
        "target": "it",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "route": [DE_EN_MODEL, EN_IT_MODEL],
    }
    DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(
        "Italian fields written for "
        f"{sum(1 for e in events if e.get('titleIt'))} titles and "
        f"{sum(1 for e in events if e.get('descriptionIt'))} descriptions."
    )


if __name__ == "__main__":
    main()
