// Clasifica solo por una indicación explícita del clip; nunca por el personaje
// usado para previsualizarlo ni por la apariencia de su movimiento.
export const PROFILE_LABELS = { male: 'Masculinas', female: 'Femeninas', unspecified: 'Sin especificar' };

// UAL comparte sus secuencias entre los dos maniquíes de Quaternius.
// La pertenencia a ambos filtros no crea otra entrada ni otra animación.
export function animationProfiles(clip) {
  if (clip.pack === 'UAL 1' || clip.pack === 'UAL 2') return ['male', 'female'];
  return [animationProfile(clip)];
}

export function matchesAnimationProfile(clip, profile) {
  return !profile || animationProfiles(clip).includes(profile);
}

export function animationProfileLabel(clip) {
  const profiles = animationProfiles(clip);
  return profiles.length > 1 ? 'Masculinas y femeninas' : PROFILE_LABELS[profiles[0]];
}

export function animationProfile(clip) {
  const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  const classify = (value) => {
    const text = normalize(value);
    const female = /\b(female|feminine|femenin[oa]s?|mujer)\b/.test(text);
    const male = /\b(male|masculine|masculin[oa]s?|hombre)\b/.test(text);
    return female === male ? 'unspecified' : female ? 'female' : 'male';
  };
  const explicit = classify(clip.gender || clip.sex);
  if (explicit !== 'unspecified') return explicit;
  return classify([clip.name, ...(clip.tags || [])].join(' ').replace(/_/g, ' '));
}
