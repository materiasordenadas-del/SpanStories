"""Reproduce la verificación editorial sin modificar currículo ni aplicación."""
from pathlib import Path
import csv
import importlib.util
import json
import re
import subprocess
import sys

HERE = Path(__file__).resolve().parent
MODULE = HERE.parent
REPO = MODULE.parents[2]
SKILL = Path.home() / '.codex/skills/spanstories-storytelling'
REGISTRY = REPO / 'generated/curriculum/a1'

# Evidencia revisada de construcciones, no coincidencias con sus descripciones.
GRAMMAR = {
    'GRAM-A1-007': ('Bogotá es la capital de Colombia.', 'Topónimo sin artículo.'),
    'GRAM-A1-043': ('En la biblioteca de Bogotá hay un plano de la ciudad.', 'Indefinido sin otro determinante incompatible.'),
    'GRAM-A1-046': ('Estas ventanas son pequeñas. Esas puertas del edificio de tu teléfono son grandes. Aquellos edificios están muy lejos.', 'Demostrativos concordados; el diálogo aporta singulares y plurales.'),
    'GRAM-A1-047': ('Eso es un plano. ¿Y aquello, allí, en la ventana?', 'Neutros eso/aquello; esto en la pregunta anterior.'),
    'GRAM-A1-048': ('Eso es un plano.', 'Demostrativo neutro inicial + ser.'),
    'GRAM-A1-049': ('Es nuestra casa. Ese edificio está ahí, al lado. Aquella escuela está allá.', 'Distancia respecto de los interlocutores.'),
    'GRAM-A1-050': ('¿Qué es esto?', 'Nico identifica el objeto mostrado por Samuel.'),
    'GRAM-A1-051': ('Este plano es de hoy.', 'Demostrativo prenominal, sin artículo.'),
    'GRAM-A1-092': ('¿Cómo puedes hacer una puerta?', 'Realización de la remisión mediante interrogación de modo; no es un paradigma nuevo.'),
    'GRAM-A1-094': ('Es nuestra casa. Ese edificio está ahí, al lado. Aquella escuela está allá.', 'Deixis; aquí/allí aparecen asimismo en core.'),
    'GRAM-A1-096': ('Está muy lejos.', 'Muy intensifica lejos.'),
    'GRAM-A1-106': ('¿Cómo puedes hacer una puerta?', 'Cómo inicial; dónde inicial también en core.'),
    'GRAM-A1-120': ('Es un lápiz para escribir. La casa de allí no tiene puerta.', 'Modificadores preposicionales con infinitivo/adverbio; plano de la ciudad aporta término nominal.'),
    'GRAM-A1-131': ('Estoy en la biblioteca.', 'Estar con localización espacial.'),
    'GRAM-A1-032': ('El carro del chofer va a la plaza.', 'Del = de + el; al lado aporta al = a + el.'),
    'GRAM-A1-095': ('Por acá, Ana. La escuela está allá, al lado de aquel edificio.', 'Preferencia de un personaje, sin regla regional universal.'),
}

MANUAL_FORMS = {
    '12B1-MWU-0164': 'El quiosco está abierto.',
    '12B1-MWU-0165': 'La oficina está cerrada',
    'SENSE-A1-000159': 'Conduce por la ciudad.',
}

def main():
    script = SKILL / 'scripts/verify_story.py'
    spec = importlib.util.spec_from_file_location('story_verifier', script)
    verifier = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(verifier)
    targets = json.loads((REGISTRY / 'targets.json').read_text(encoding='utf-8'))
    by_id = {t['targetId']: t for t in targets}
    blueprints = json.loads((REGISTRY / 'story-blueprints.json').read_text(encoding='utf-8'))
    reference = (SKILL / 'references/a1-curriculum-v1.51.md').read_text(encoding='utf-8')
    summaries, anthology = [], ['# Módulo 4 — Cuatro historias\n']
    for i, path in enumerate(sorted(MODULE.glob('0*.md')), 1):
        story_id = f'A1-M04-I05-S{i}'
        text = path.read_text(encoding='utf-8')
        sections = dict(part.split('\n', 1) for part in text.split('\n## ')[1:])
        core = sections['CORE_STORY'].strip()
        evidence = '\n\n'.join(value.strip() for value in sections.values())
        cp, ep = HERE / f'S{i}-core.txt', HERE / f'S{i}-evidencia.txt'
        cp.write_text(core + '\n', encoding='utf-8')
        ep.write_text(evidence + '\n', encoding='utf-8')
        # No se exige un número exacto: margen diagnóstico amplio autorizado
        # por el usuario, no objetivo de longitud ni prueba de comprensibilidad.
        command = [sys.executable, '-X', 'utf8', str(script), '--story-text', str(cp),
                   '--evidence-text', str(ep), '--story-id', story_id,
                   '--curriculum-dir', str(REGISTRY), '--min-tokens', '0',
                   '--max-tokens', '1000', '--json']
        result = subprocess.run(command, capture_output=True, text=True, encoding='utf-8')
        if result.returncode not in (0, 1):
            raise RuntimeError(result.stderr)
        report = json.loads(result.stdout)
        (HERE / f'S{i}-verificacion.json').write_text(result.stdout, encoding='utf-8')
        blueprint = next(b for b in blueprints if b['id'] == story_id)
        ref_section = reference.split('### ' + story_id + ' — ', 1)[1].split('\n### ', 1)[0].split('\n# M', 1)[0]
        ref_ids = set(re.findall(r'`((?:SENSE-A1-|GRAM-A1-|12B1-MWU-)[0-9]+)`', ref_section))
        actual_ids = {t['targetId'] for t in targets if t['firstIntroductionStoryId'] == story_id}
        # Las filas MWU de la referencia pueden citar identidades léxicas
        # introducidas antes/después: solo la identidad principal es contrato.
        principal_ids = set()
        for line in ref_section.splitlines():
            if not line.startswith('- '):
                continue
            match = re.search(r'`((?:SENSE-A1-|GRAM-A1-|12B1-MWU-)[0-9]+)`', line)
            if match:
                principal_ids.add(match.group(1))
        assert principal_ids == actual_ids, (story_id, 'BLOCKER_SOURCE_DRIFT', principal_ids ^ actual_ids)
        assert report['countIntegrity']['pass'], report['countIntegrity']
        rows = []
        for target in report['coverage']:
            tid = target['targetId']
            quote, layer, status, function = '', '', 'PENDING', ''
            if tid in GRAMMAR:
                quote, function = GRAMMAR[tid]
                for key, value in sections.items():
                    if quote in value:
                        layer, status = key, 'REALIZED'
                        break
            elif tid in MANUAL_FORMS:
                quote = MANUAL_FORMS[tid]
                for key, value in sections.items():
                    if quote in value:
                        layer, status = key, 'REALIZED'
                        function = 'Forma flexionada revisada; el verificador busca el lema/chunk literal.'
                        break
            elif target['candidateForms']:
                for key, value in sections.items():
                    for line in value.splitlines():
                        if any(verifier.phrase_present(line, form) for form in target['candidateForms']):
                            quote, layer = line.strip(), key
                            status = 'REALIZED' if target['stage'] == 'FIRST_INTRO' else 'CANDIDATE_REVIEW'
                            function = 'Uso contextual revisado del target de esta historia.' if status == 'REALIZED' else 'Coincidencia textual: pendiente confirmar sentido y etapa de retorno.'
                            break
                    if quote:
                        break
            allocation = by_id[tid]
            rows.append(dict(targetId=tid, allocationId=allocation['allocationId'], item=target['item'],
                             evento=target['stage'], salience=target['salience'] or allocation['introSalience'],
                             role='RETURN' if target['stage'] != 'FIRST_INTRO' else allocation['introSalience'],
                             pedagogicalForm=quote, layer=layer,
                             exposureType='RETURN' if target['stage'] != 'FIRST_INTRO' else 'PRESENTATION',
                             semanticVariation='Ver diseño: contraste y recuperación de estructuras guía.',
                             evidencia=quote, funcion=function,
                             productiveDemand='NONE', juicio=status))
        with (HERE / f'S{i}-ledger.csv').open('w', encoding='utf-8-sig', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=rows[0].keys())
            writer.writeheader(); writer.writerows(rows)
        own = [r for r in rows if r['evento'] == 'FIRST_INTRO']
        pending = [r['targetId'] for r in own if r['juicio'] != 'REALIZED']
        summary = dict(storyId=story_id, title=path.read_text(encoding='utf-8').splitlines()[0][2:],
                       metrics=report['metrics'], firstIntro=len(own),
                       realizedFirstIntro=len(own)-len(pending), pendingFirstIntro=pending,
                       returns=report['returnCount'],
                       returnTextCandidates=sum(r['juicio'] in ('REALIZED', 'CANDIDATE_REVIEW') for r in rows if r['evento'] != 'FIRST_INTRO'),
                       requiredModalities=blueprint['requiredModalities'],
                       sourceIntegrity='MATCH_LOCAL_REGISTRY_AND_SKILL',
                       publicationValidator='NOT_RUN')
        summaries.append(summary)
        anthology += ['## ' + str(i) + '. ' + summary['title'] + '\n', core + '\n']
        print(json.dumps(summary, ensure_ascii=False))
    (MODULE / 'HISTORIAS.md').write_text('\n'.join(anthology), encoding='utf-8')
    (HERE / 'resumen.json').write_text(json.dumps(summaries, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')

if __name__ == '__main__':
    main()
