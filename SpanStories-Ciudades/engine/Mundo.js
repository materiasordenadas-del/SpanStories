// Registro de escenarios; el Story Engine conserva la autoría y ejecución narrativa.
export async function cargarMundo(url, fetcher = fetch) {
  const seen = new Set(), countries = [], cities = [], zones = [];
  async function read(ref, kind, parent) {
    const absolute = new URL(ref, parent).href;
    const response = await fetcher(absolute);
    if (!response.ok) throw new Error(`No se pudo cargar ${kind}: ${response.status}`);
    const value = await response.json();
    if (value.version !== 1 || !value.id || seen.has(`${kind}:${value.id}`)) throw new Error(`Identidad ${kind} inválida o duplicada`);
    seen.add(`${kind}:${value.id}`); return { ...value, manifestUrl: absolute };
  }
  const world = await read(url, 'mundo', typeof location === 'undefined' ? 'http://localhost/' : location.href);
  for (const ref of world.countries) {
    const country = await read(ref.manifest, 'pais', world.manifestUrl); countries.push(country);
    if (ref.id !== country.id) throw new Error('La referencia del país no coincide');
    for (const cityRef of country.cities) {
      const city = await read(cityRef.manifest, 'ciudad', country.manifestUrl); cities.push(city);
      if (city.countryId !== country.id || cityRef.id !== city.id) throw new Error('La ciudad no pertenece al país');
      for (const zoneRef of city.zones) {
        zones.push({ ...zoneRef, countryId: country.id, countryLabel: country.label, cityId: city.id,
          cityLabel: city.label, manifestUrl: new URL(zoneRef.manifest, city.manifestUrl).href });
      }
    }
  }
  if (new Set(zones.map(z => z.id)).size !== zones.length) throw new Error('Zona duplicada');
  return { world, countries, cities, zones };
}

export function validarVinculoHistoria(binding, { zones, characters }) {
  if (!/^story-[a-z0-9-]+$/.test(binding.storyId || '') || !/^storyver-[a-z0-9-]+$/.test(binding.storyVersionId || ''))
    throw new Error('Usa StoryId y StoryVersionId del Story Engine existente');
  if (binding.storyId === binding.storyBlueprintId) throw new Error('StoryId y StoryBlueprintId son identidades diferentes');
  for (const ref of binding.scenarios || []) {
    const zone = zones.find(z => z.id === ref.zoneId);
    if (!zone || zone.cityId !== ref.cityId || zone.countryId !== ref.countryId) throw new Error('Escenario desconocido');
  }
  for (const id of binding.characterIds || []) if (!characters.some(c => c.id === id)) throw new Error('Personaje desconocido');
  return binding;
}
