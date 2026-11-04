// Mapa editorial de vocabulario (lado visor). Une grupos de objetos 3D con SenseId publicados.
//
// El visor solo necesita SABER qué objeto enseña qué entrada: selectores, resaltado, audio y el texto
// que usa la voz de respaldo. NUNCA decide si una palabra escrita es correcta: la ortografía esperada,
// el género y la validación viven en el anfitrión (features/world-lexicon). La comprobación contra el
// registro publicado (SenseId/LexemeId A1) también ocurre allí; aquí solo se valida la forma del mapa.
//
// Selectores admitidos (ninguno identifica por nombre de malla):
//   { registryKind }  tipo del registro de la ciudad (p. ej. «tree»: todas las instancias)
//   { collection }    colección de origen del modelo (todas las mallas de ese grupo)
//   { objectIds }     ids estables explícitos del manifiesto

const MAP_KEYS = new Set(['version', 'id', 'zoneId', 'curriculumReleaseId', 'lexiconReleaseId', 'entries']);
const ENTRY_KEYS = new Set(['id', 'senseId', 'lexemeId', 'selectors', 'highlight', 'accentPolicy', 'speech', 'audio']);
const ENTRY_ID = /^[a-z][a-z0-9-]{1,40}$/;
const SENSE_ID = /^SENSE-A1-\d{6}$/;
const LEXEME_ID = /^LEX-A1-\d{6}$/;
const NAME = /^[A-Za-z0-9._-]{1,80}$/;
const OBJECT_ID = /^[A-Za-z0-9._:-]{1,80}$/;
const AUDIO_URL = /^[A-Za-z0-9][A-Za-z0-9._/-]*\.(mp3|ogg|m4a|wav)$/;
const SPEECH_LANG = /^es(-[A-Z]{2})?$/;

const isRecord = value => typeof value === 'object' && value !== null && !Array.isArray(value);

function leerSelector(raw, entrada) {
  const claves = isRecord(raw) ? Object.keys(raw) : [];
  if (claves.length !== 1) throw new Error(`Entrada ${entrada}: selector inválido.`);
  const [clave] = claves, valor = raw[clave];
  if ((clave === 'registryKind' || clave === 'collection') && typeof valor === 'string' && NAME.test(valor)) return Object.freeze({ [clave]: valor });
  if (clave === 'objectIds' && Array.isArray(valor) && valor.length > 0 && valor.length <= 500 &&
      valor.every(id => typeof id === 'string' && OBJECT_ID.test(id)) && new Set(valor).size === valor.length)
    return Object.freeze({ objectIds: Object.freeze([...valor]) });
  throw new Error(`Entrada ${entrada}: selector no admitido (solo registryKind, collection u objectIds).`);
}

export function leerMapaLexico(raw) {
  if (!isRecord(raw)) throw new Error('El mapa léxico debe ser un objeto.');
  for (const clave of Object.keys(raw)) if (!MAP_KEYS.has(clave)) throw new Error(`Clave desconocida en el mapa: ${clave}`);
  if (raw.version !== 1) throw new Error('Versión de mapa léxico no compatible.');
  for (const campo of ['id', 'zoneId', 'curriculumReleaseId', 'lexiconReleaseId'])
    if (typeof raw[campo] !== 'string' || !raw[campo].trim()) throw new Error(`Falta ${campo} en el mapa.`);
  if (!Array.isArray(raw.entries) || raw.entries.length === 0) throw new Error('El mapa necesita al menos una entrada.');
  const ids = new Set(), senses = new Set(), entries = [];
  for (const e of raw.entries) {
    if (!isRecord(e)) throw new Error('Cada entrada debe ser un objeto.');
    for (const clave of Object.keys(e)) if (!ENTRY_KEYS.has(clave)) throw new Error(`Clave desconocida en la entrada ${e.id}: ${clave}`);
    if (typeof e.id !== 'string' || !ENTRY_ID.test(e.id) || ids.has(e.id)) throw new Error(`Id de entrada inválido o duplicado: ${e.id}`);
    ids.add(e.id);
    if (!SENSE_ID.test(e.senseId) || !LEXEME_ID.test(e.lexemeId)) throw new Error(`Entrada ${e.id}: SenseId o LexemeId inválido.`);
    if (senses.has(e.senseId)) throw new Error(`Entrada ${e.id}: dos entradas con el mismo Sense.`);
    senses.add(e.senseId);
    if (!Array.isArray(e.selectors) || e.selectors.length === 0) throw new Error(`Entrada ${e.id}: necesita selectores explícitos.`);
    const selectors = e.selectors.map(s => leerSelector(s, e.id));
    const highlight = e.highlight ?? 'hit';
    if (highlight !== 'hit' && highlight !== 'collection') throw new Error(`Entrada ${e.id}: highlight inválido.`);
    if (highlight === 'collection' && !selectors.some(s => 'collection' in s)) throw new Error(`Entrada ${e.id}: highlight «collection» requiere un selector de colección.`);
    if (!isRecord(e.speech) || typeof e.speech.text !== 'string' || !e.speech.text.trim()) throw new Error(`Entrada ${e.id}: falta speech.text.`);
    const lang = e.speech.lang ?? 'es-ES';
    if (typeof lang !== 'string' || !SPEECH_LANG.test(lang)) throw new Error(`Entrada ${e.id}: speech.lang inválido.`);
    let audio;
    if (e.audio !== undefined) {
      if (!isRecord(e.audio) || typeof e.audio.url !== 'string' || !AUDIO_URL.test(e.audio.url) || e.audio.url.includes('..'))
        throw new Error(`Entrada ${e.id}: audio.url debe ser una ruta relativa a un archivo de audio.`);
      audio = Object.freeze({ url: e.audio.url });
    }
    entries.push(Object.freeze({ id: e.id, senseId: e.senseId, lexemeId: e.lexemeId, selectors: Object.freeze(selectors), highlight,
      accentPolicy: e.accentPolicy ?? 'FORGIVEN_WITH_CORRECTION', speech: Object.freeze({ text: e.speech.text, lang }), ...(audio ? { audio } : {}) }));
  }
  return Object.freeze({ version: 1, id: raw.id, zoneId: raw.zoneId, curriculumReleaseId: raw.curriculumReleaseId,
    lexiconReleaseId: raw.lexiconReleaseId, entries: Object.freeze(entries) });
}

// Relaciona objetos del registro de la ciudad con entradas del mapa.
// `objetosManifest` es la lista del manifiesto de zona ({id, parentId, collections}). Una malla hija hereda
// las colecciones de sus ancestros, de modo que tocar cualquier pieza de un edificio cuenta como tocar el edificio.
export function crearResolutorLexico(mapa, { objetosManifest = [] } = {}) {
  const porId = new Map(objetosManifest.map(o => [o.id, o]));
  const memoria = new Map();

  function contexto(id) {
    let valor = memoria.get(id);
    if (valor) return valor;
    const ids = new Set(), colecciones = new Set();
    for (let actual = porId.get(id), n = 0; actual && !ids.has(actual.id) && n < 64; actual = porId.get(actual.parentId), n++) {
      ids.add(actual.id);
      for (const c of actual.collections ?? []) colecciones.add(c);
    }
    ids.add(id);
    valor = { ids, colecciones };
    memoria.set(id, valor);
    return valor;
  }

  function coincide(entrada, registro) {
    const { ids, colecciones } = contexto(registro.id);
    for (const s of entrada.selectors) {
      if ('registryKind' in s && registro.tipo === s.registryKind) return true;
      if ('collection' in s && colecciones.has(s.collection)) return true;
      if ('objectIds' in s && s.objectIds.some(id => ids.has(id))) return true;
    }
    return false;
  }

  return {
    // Primera entrada habilitada del mapa (en el orden del mapa) que reclama este objeto del registro.
    entradaPara(registro, habilitadas = null) {
      if (!registro?.id) return null;
      for (const entrada of mapa.entries) if ((!habilitadas || habilitadas.has(entrada.id)) && coincide(entrada, registro)) return entrada;
      return null;
    },
    // Raíces que se resaltan: solo el objeto tocado o todo el grupo de su colección, sin repetir hijos.
    raicesParaResaltar(entrada, registro, entradasDelRegistro) {
      if (entrada.highlight !== 'collection') return [registro.raiz];
      const touched=contexto(registro.id).colecciones;
      const ownCollections=entrada.selectors.filter(s=>'collection' in s&&touched.has(s.collection)).map(s=>s.collection);
      const miembros = [...entradasDelRegistro].filter(e => ownCollections.some(c=>contexto(e.id).colecciones.has(c)));
      const ids = new Set(miembros.map(e => e.id));
      return miembros.filter(e => !ids.has(porId.get(e.id)?.parentId)).map(e => e.raiz);
    },
    coincide
  };
}
