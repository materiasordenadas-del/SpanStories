import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { WorldCatalog, SharedCharacterResources, storageKey, validateCatalog } from "../catalog.ts";
import type { Appearance, Asset, Country, Library } from "../model.ts";

function fixtures() {
  const load = (path: string) => JSON.parse(readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8"));
  const library = load("content/worlds/library.json") as Library;
  const countries = ["ar", "co", "es"].map(id => load(`content/worlds/countries/${id}/country.json`) as Country);
  return { library, countries };
}

test("el catálogo conserva los siete servicios y añade el hotel solo a Colombia", () => {
  const { library, countries } = fixtures();
  assert.deepEqual(validateCatalog(library, countries), []);
  for (const country of countries) {
    assert.equal(country.places.length, country.id === "co" ? 8 : 7);
    assert.equal(country.city.status, "pending");
    assert.equal(country.city.touristPlaceTarget, 5);
    assert.equal(country.appearances.length, 0);
  }
  assert.ok(library.assets.some(a => a.sources.length > 1), "duplicados reunidos por contenido");
  const catalog = new WorldCatalog(library, countries);
  assert.equal(catalog.place("co", "co-hotel").base.entry, "worlds/prototypes/hotel/index.html");
  assert.ok(countries.filter(c => c.id !== "co").every(c => c.places.every(p => p.baseId !== "hotel")));
});

test("cambiar entrada o salida de una configuración no altera otro país ni el catálogo", () => {
  const { library, countries } = fixtures();
  const catalog = new WorldCatalog(library, countries);
  countries[0].places[0].config.test = true;
  const argentina = catalog.place("ar", "ar-airport");
  argentina.instance.config.currency = "XXX";
  argentina.base.name = "Alterado";
  assert.deepEqual(catalog.place("ar", "ar-airport").instance.config, {});
  assert.deepEqual(catalog.place("co", "co-airport").instance.config, {});
  assert.notEqual(catalog.place("co", "co-airport").base.name, "Alterado");
});

test("referencias inválidas y versiones no aprobadas no se aceptan", () => {
  const { library, countries } = fixtures();
  countries[0].places[0].baseVersion = "no-existe";
  countries[0].characterIds.push("no-existe");
  library.characters[0].defaultVersion = library.characters[0].versions[0].id;
  const errors = validateCatalog(library, countries);
  assert.ok(errors.some(e => e.includes("Base o versión")));
  assert.ok(errors.some(e => e.includes("Personaje ausente")));
  assert.ok(errors.some(e => e.includes("sin aprobar")));
});

test("dos versiones de una base permiten actualizar un país sin cambiar los demás", () => {
  const { library, countries } = fixtures();
  const base = library.places.find(p => p.id === "airport")!;
  library.places.push({ ...structuredClone(base), version: "import-2", name: "Aeropuerto nuevo" });
  countries[0].places[0].baseVersion = "import-2";
  const catalog = new WorldCatalog(library, countries);
  assert.equal(catalog.place("ar", "ar-airport").base.version, "import-2");
  assert.equal(catalog.place("co", "co-airport").base.version, "import-1");
});

test("apariciones de países diferentes comparten el mismo modelo pero no configuración", () => {
  const { library, countries } = fixtures();
  const character = library.characters.find(c => c.versions.length)!;
  const version = character.versions[0];
  version.status = "approved";
  for (const country of countries) {
    const appearance: Appearance = { id: "npc-1", characterId: character.id, characterVersion: version.id,
      placeId: country.places[0].id, role: "recepción", position: [0, 0, 0],
      voice: { locale: country.locale, audioAssetIds: [] }, config: {} };
    country.appearances.push(appearance);
  }
  const catalog = new WorldCatalog(library, countries);
  const ar = catalog.appearance("ar", "npc-1");
  const co = catalog.appearance("co", "npc-1");
  assert.equal(ar.model.path, co.model.path);
  assert.notEqual(ar.appearance.voice.locale, co.appearance.voice.locale);
  ar.appearance.position[0] = 42;
  assert.equal(catalog.appearance("ar", "npc-1").appearance.position[0], 0);
  assert.equal(co.appearance.position[0], 0);
});

test("la caché agrupa cargas simultáneas y clona estado de cada instancia", async () => {
  const { library } = fixtures();
  const asset = library.assets.find(a => a.kind === "glb")!;
  let loads = 0;
  const cache = new SharedCharacterResources(async () => { loads++; return { bones: [0] }; },
    template => ({ bones: [...template.bones] }));
  const [a, b] = await Promise.all([cache.instantiate(asset), cache.instantiate(structuredClone(asset))]);
  assert.equal(loads, 1);
  a.bones[0] = 9;
  assert.equal(b.bones[0], 0);
});

test("una carga fallida permite reintentar, sin contaminar la caché", async () => {
  const { library } = fixtures();
  const asset = library.assets.find(a => a.kind === "glb")!;
  let calls = 0;
  const cache = new SharedCharacterResources<Asset, Asset>(async value => {
    if (++calls === 1) throw new Error("fallo de red");
    return value;
  }, value => structuredClone(value));
  await assert.rejects(cache.instantiate(asset), /fallo de red/);
  assert.equal((await cache.instantiate(asset)).id, asset.id);
  assert.equal(calls, 2);
});

test("las claves separan país, aparición y versión sin colisiones por separadores", () => {
  assert.notEqual(storageKey("ar", "bank", "npc", "1", "progress"), storageKey("co", "bank", "npc", "1", "progress"));
  assert.notEqual(storageKey("ar", "bank:a", "b", "1", "x"), storageKey("ar", "bank", "a:b", "1", "x"));
});
