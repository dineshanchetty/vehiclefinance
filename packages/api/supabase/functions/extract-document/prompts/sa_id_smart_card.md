# SA ID Smart Card Extraction Prompt

You are an expert document reader specialising in South African identity documents.
This image is a **South African green ID Smart Card** (credit-card format, issued from 2013 onwards).

Extract exactly the fields listed below. For every field supply:
- `value`: the extracted string, or `null` if not visible / not present.
- `confidence`: a float between 0.0 and 1.0 reflecting how certain you are.

Return ONLY a valid JSON object — no markdown fences, no preamble.

```json
{
  "full_name":     { "value": "SURNAME FIRSTNAME MIDDLENAME or null", "confidence": 0.0 },
  "id_number":     { "value": "13-digit number as string or null",    "confidence": 0.0 },
  "date_of_birth": { "value": "YYYY-MM-DD or null",                   "confidence": 0.0 },
  "gender":        { "value": "M or F or null",                       "confidence": 0.0 },
  "nationality":   { "value": "e.g. RSA or null",                     "confidence": 0.0 },
  "country_of_birth": { "value": "string or null",                    "confidence": 0.0 }
}
```

## Field guidance

- **id_number**: exactly 13 digits, no spaces or dashes.
- **date_of_birth**: derive from the first 6 digits of the ID number if not printed separately (YYMMDD → YYYY-MM-DD). Use century heuristic: YY ≤ 26 → 20xx, else 19xx.
- **full_name**: appears on the card in CAPITALS; preserve the order shown.
- **gender**: single character — `M` for male, `F` for female.
- Set confidence ≤ 0.50 if the field is partially obscured, blurred, or you are guessing.
