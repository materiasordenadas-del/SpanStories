import type { Appearance, Asset, Country, CountryId, Library, PlaceInstance } from "./model.ts";

function unique(items: { id: string }[], label: string, errors: string[]) {
  const seen = new Set<string>();
  for (const item of items) {
    if (!item.id || seen.has(item.id)) errors.push(`${label}: identificador repetido o vacío ${item.id}`);
    seen.add(item.id);
  }
}
const safePath = (path: string) => Boolean(path) && !path.startsWith("/") && !path.includes("\\") && !path.includes(":") && !path.split("/").includes("..");

/** Validación estructural y de referencias; los archivos se verifican en worlds:check. */
export function validateCatalog(library: Library, countries: Country[]): string[] {
  const errors: string[] = [];
  if (library.schemaVersion !== 1) errors.push("Versión de catálogo no soportada");
  unique(library.assets, "recursos", errors);
  unique(library.places.map(p => ({ id: `${p.id}@${p.version}` })), "versiones de bases", errors);
  unique(library.characters, "personajes", errors);
  unique(countries, "países", errors);
  const assets = new Map(library.assets.map(a => [a.id, a]));
  const characters = new Map(library.characters.map(c => [c.id, c]));
  const bases = new Map(library.places.map(p => [`${p.id}@${p.version}`, p]));
  for (const asset of library.assets) {
    if (!/^[a-f0-9]{64}$/.test(asset.sha256) || !/^sha256:[a-f0-9]{64}$/.test(asset.id)) errors.push(`Recurso sin hash válido: ${asset.id}`);
    if (!safePath(asset.path) || !asset.url.startsWith("/characters/assets/") || asset.url.includes("..")) errors.push(`Ruta inválida: ${asset.id}`);
    for (const dep of asset.dependencies) if (!safePath(dep.path)) errors.push(`Dependencia inválida: ${asset.id}`);
  }
  for (const base of library.places) if (!safePath(base.entry)) errors.push(`Entrada inválida: ${base.id}`);
  for (const character of library.characters) {
    unique(character.versions, `versiones de ${character.id}`, errors);
    for (const version of character.versions) {
      if (assets.get(version.assetId)?.kind !== "glb") errors.push(`Modelo ausente: ${character.id}/${version.id}`);
      for (const texture of version.textureIds) if (assets.get(texture)?.kind !== "texture") errors.push(`Textura ausente: ${character.id}/${version.id}`);
    }
    const selected = character.versions.find(v => v.id === character.defaultVersion);
    if (character.defaultVersion !== null && selected?.status !== "approved") errors.push(`Versión predeterminada sin aprobar: ${character.id}`);
    if (character.status === "ready" && !selected) errors.push(`Personaje listo sin versión: ${character.id}`);
  }
  for (const country of countries) {
    if (!["ar", "co", "es"].includes(country.id)) errors.push(`País no soportado: ${country.id}`);
    try { new Intl.NumberFormat(country.locale, { style: "currency", currency: country.currency }); } catch { errors.push(`Idioma o moneda inválidos: ${country.id}`); }
    const allPlaces = [...country.places, ...country.attractions];
    unique(allPlaces, `lugares de ${country.id}`, errors);
    unique(country.appearances, `apariciones de ${country.id}`, errors);
    if (new Set(country.characterIds).size !== country.characterIds.length) errors.push(`Reparto repetido: ${country.id}`);
    for (const id of country.characterIds) if (!characters.has(id)) errors.push(`Personaje ausente: ${country.id}/${id}`);
    for (const place of allPlaces) {
      const base = bases.get(`${place.baseId}@${place.baseVersion}`);
      if (!base) errors.push(`Base o versión ausente: ${country.id}/${place.id}`);
      if (place.status === "ready" && base?.adaptationStatus !== "ready") errors.push(`Lugar listo con base pendiente: ${country.id}/${place.id}`);
      for (const id of place.assetIds) if (!assets.has(id)) errors.push(`Recurso de lugar ausente: ${country.id}/${id}`);
    }
    for (const appearance of country.appearances) {
      const character = characters.get(appearance.characterId);
      const version = character?.versions.find(v => v.id === appearance.characterVersion);
      if (!country.characterIds.includes(appearance.characterId) || !version || version.status !== "approved") errors.push(`Aparición sin personaje aprobado: ${country.id}/${appearance.id}`);
      if (!allPlaces.some(p => p.id === appearance.placeId)) errors.push(`Lugar de aparición ausente: ${country.id}/${appearance.id}`);
      if (appearance.position.length !== 3 || !appearance.position.every(Number.isFinite)) errors.push(`Posición inválida: ${country.id}/${appearance.id}`);
      for (const id of appearance.voice.audioAssetIds) if (assets.get(id)?.kind !== "audio") errors.push(`Audio ausente: ${country.id}/${id}`);
    }
    if (country.city.mapAssetId !== null && assets.get(country.city.mapAssetId)?.kind !== "glb") errors.push(`Mapa ausente: ${country.id}`);
    if (country.city.touristPlaceTarget !== 5) errors.push(`Objetivo turístico inválido: ${country.id}`);
    if (country.city.status === "ready" && (!country.city.mapAssetId || country.attractions.filter(p => p.status === "ready").length !== 5)) errors.push(`Ciudad incompleta: ${country.id}`);
  }
  return errors;
}

export class WorldCatalog {
  private library: Library;
  private countries: Country[];

  constructor(library: Library, countries: Country[]) {
    const errors = validateCatalog(library, countries);
    if (errors.length) throw new Error(errors.join("\n"));
    this.library = structuredClone(library);
    this.countries = structuredClone(countries);
  }

  country(id: CountryId): Country {
    const country = this.countries.find(c => c.id === id);
    if (!country) throw new Error(`País ausente: ${id}`);
    return structuredClone(country);
  }

  place(countryId: CountryId, id: string): { country: Country; instance: PlaceInstance; base: Library["places"][number] } {
    const country = this.country(countryId);
    const instance = [...country.places, ...country.attractions].find(p => p.id === id);
    if (!instance) throw new Error(`Lugar ausente: ${countryId}/${id}`);
    const base = this.library.places.find(p => p.id === instance.baseId && p.version === instance.baseVersion)!;
    return { country, instance, base: structuredClone(base) };
  }

  appearance(countryId: CountryId, id: string): { appearance: Appearance; model: Asset; textures: Asset[] } {
    const appearance = this.country(countryId).appearances.find(a => a.id === id);
    if (!appearance) throw new Error(`Aparición ausente: ${countryId}/${id}`);
    const character = this.library.characters.find(c => c.id === appearance.characterId)!;
    const version = character.versions.find(v => v.id === appearance.characterVersion)!;
    return { appearance, model: this.asset(version.assetId), textures: version.textureIds.map(id => this.asset(id)) };
  }

  asset(id: string): Asset {
    const asset = this.library.assets.find(a => a.id === id);
    if (!asset) throw new Error(`Recurso ausente: ${id}`);
    return structuredClone(asset);
  }
}

/** Cada aparición recibe una instancia independiente; el adaptador 3D decide cómo clonar el rig. */
export class SharedCharacterResources<Resource, Instance> {
  private resources = new Map<string, Promise<Resource>>();
  private load: (asset: Asset) => Promise<Resource>;
  private clone: (resource: Resource, asset: Asset) => Instance;

  constructor(load: (asset: Asset) => Promise<Resource>, clone: (resource: Resource, asset: Asset) => Instance) {
    this.load = load;
    this.clone = clone;
  }

  async instantiate(asset: Asset): Promise<Instance> {
    if (asset.kind !== "glb") throw new Error("El personaje requiere un GLB");
    let resource = this.resources.get(asset.id);
    if (!resource) {
      resource = Promise.resolve().then(() => this.load(structuredClone(asset)));
      this.resources.set(asset.id, resource);
      const pending = resource;
      resource.catch(() => { if (this.resources.get(asset.id) === pending) this.resources.delete(asset.id); });
    }
    return this.clone(await resource, structuredClone(asset));
  }
}

export function storageKey(countryId: CountryId, placeId: string, appearanceId: string, version: string, purpose: string): string {
  return "spanstories.worlds:" + [countryId, placeId, appearanceId, version, purpose].map(encodeURIComponent).join(":");
}
