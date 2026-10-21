export type CountryId = "ar" | "co" | "es";
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export interface Asset {
  id: string;
  sha256: string;
  path: string;
  url: string;
  bytes: number;
  kind: "glb" | "texture" | "audio";
  skins: number;
  animations: string[];
  dependencies: { path: string; sha256: string }[];
  sources: string[];
}
export interface PlaceBase {
  id: string;
  name: string;
  version: string;
  kind: "service" | "attraction";
  entry: string;
  previewUrl: string;
  adaptationStatus: "pending" | "ready";
  capabilities: string[];
}
export interface CharacterVersion {
  id: string;
  assetId: string;
  status: "candidate" | "approved";
  label: string;
  textureIds: string[];
}
export interface Character {
  id: string;
  name: string;
  status: "selection-pending" | "ready";
  defaultVersion: string | null;
  versions: CharacterVersion[];
  artSources: string[];
  note: string;
}
export interface Library {
  schemaVersion: 1;
  places: PlaceBase[];
  assets: Asset[];
  characters: Character[];
}
export interface PlaceInstance {
  id: string;
  baseId: string;
  baseVersion: string;
  kind: "service" | "attraction";
  status: "adaptation-pending" | "ready";
  config: { [key: string]: JsonValue };
  assetIds: string[];
}
export interface Appearance {
  id: string;
  characterId: string;
  characterVersion: string;
  placeId: string;
  role: string;
  position: [number, number, number];
  voice: { locale: string; audioAssetIds: string[] };
  config: { [key: string]: JsonValue };
}
export interface Country {
  id: CountryId;
  name: string;
  locale: string;
  currency: string;
  city: { status: "pending" | "ready"; mapAssetId: string | null; touristPlaceTarget: number };
  places: PlaceInstance[];
  attractions: PlaceInstance[];
  characterIds: string[];
  appearances: Appearance[];
}
