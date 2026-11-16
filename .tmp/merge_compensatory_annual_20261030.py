import csv
import hashlib
import json
import re
import unicodedata
from collections import Counter, defaultdict
from decimal import Decimal
from pathlib import Path

root = Path.cwd()
roster = root / 'docs/IMPORTAR_PADRON_COMBINADO_REVISAR_2026-10-29.csv'
source = root / 'docs/COMPENSATORIOS 2024 y 2025.xlsx - Hoja1.csv'
output = root / 'docs/PADRON_CON_COMPENSATORIOS_2024_2025_PARA_REVISAR.csv'
review = root / 'docs/REVISION_CRUCE_COMPENSATORIOS_2024_2025.csv'
if output.exists() or review.exists():
    raise SystemExit('Los archivos de salida ya existen; no se sobrescribieron.')

def read(path):
    with path.open('r', encoding='utf-8-sig', newline='') as stream:
        return list(csv.reader(stream))

def norm(value):
    normalized = unicodedata.normalize('NFKD', value.casefold())
    normalized = ''.join(c for c in normalized if not unicodedata.combining(c))
    return ' '.join(sorted(re.findall(r'[a-z0-9]+', normalized)))

def number(value):
    value = value.strip()
    if not value:
        return Decimal(0)
    if not re.fullmatch(r'-?\d+(?:[.,]\d+)?', value):
        raise ValueError('non-numeric value')
    return Decimal(value.replace(',', '.'))

before = {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in (roster, source)}
dest = read(roster)
src = read(source)
assert dest[0][2] == 'APELLIDO Y NOMBRE'
assert all(len(r) == len(dest[0]) for r in dest)
target = defaultdict(list)
for i, row in enumerate(dest[1:], start=1):
    if row[2].strip():
        target[norm(row[2])].append(i)

years = {}
for year in (2024, 2025):
    header = [i for i, row in enumerate(src) if len(row) > 14 and row[14].strip().upper() == f'TOTAL {year}']
    assert len(header) == 1
    start = header[0] + 1
    end = len(src) if year == 2025 else next(i for i in range(start, len(src)) if len(src[i]) > 1 and '2025' in src[i][1])
    entries = defaultdict(list)
    for i in range(start, end):
        row = src[i]
        if len(row) <= 14 or not row[1].strip():
            continue
        if not row[14].strip() or sum((number(x) for x in row[2:14]), Decimal()) != number(row[14]):
            raise ValueError(f'Total missing or inconsistent at source row {i+1}')
        entries[norm(row[1])].append((i + 1, row[1].strip(), row[14].strip()))
    years[year] = entries

result = [dest[0] + ['HORAS COMPENSATORIAS 2024', 'HORAS COMPENSATORIAS 2025']]
review_rows = [['AÑO', 'TIPO', 'NOMBRE', 'TOTAL FUENTE', 'FILA FUENTE', 'FILA PADRÓN', 'MOTIVO']]
stats = {}
for row in dest[1:]:
    result.append(row + ['', ''])
for offset, year in enumerate((2024, 2025)):
    entries = years[year]
    matched_dest = set()
    matched = 0
    for key, items in entries.items():
        candidates = target.get(key, [])
        if key and len(items) == 1 and len(candidates) == 1:
            idx = candidates[0]
            result[idx][-2 + offset] = items[0][2]
            matched_dest.add(idx)
            matched += 1
        else:
            for line, name, total in items:
                why = 'Sin coincidencia exacta' if not candidates else 'Coincidencia ambigua'
                review_rows.append([year, 'Fuente sin vincular', name, total, line, '', why])
    for i, row in enumerate(dest[1:], start=1):
        if i not in matched_dest:
            review_rows.append([year, 'Padrón sin dato vinculado', row[2], '', '', i + 1, 'No inferir cero'])
    stats[year] = {'matched': matched, 'source_unmatched': sum(len(v) for k, v in entries.items() if not (k and len(v) == 1 and len(target.get(k, [])) == 1)), 'roster_without': len(dest) - 1 - matched}

assert all(row[:-2] == original for row, original in zip(result[1:], dest[1:]))
for path, rows in ((output, result), (review, review_rows)):
    with path.open('x', encoding='utf-8-sig', newline='') as stream:
        csv.writer(stream).writerows(rows)
assert read(output) == [[str(c) for c in row] for row in result]
assert read(review) == [[str(c) for c in row] for row in review_rows]
assert before == {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in (roster, source)}
print(json.dumps({'stats': stats, 'roster_rows': len(dest)-1, 'review_rows': len(review_rows)-1, 'unchanged_inputs': True}, ensure_ascii=True))
