/**
 * Discovery against the Wikimedia Commons API (commons.wikimedia.org).
 *
 * Commons explicitly documents hotlinking its files as permitted, with the
 * caveat that a remote file can be renamed or deleted — which is exactly the
 * risk `SenseImageBinding`'s fallback rank chain exists to absorb, not a
 * reason to mirror the bytes locally.
 * https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia/technical
 */

import type { DiscoveredImageCandidate } from "./types.ts";

const COMMONS_API_ENDPOINT = "https://commons.wikimedia.org/w/api.php";

export type WikimediaSearchOptions = {
  readonly limit?: number;
  /** Width of the thumbnail Commons should render, in pixels. */
  readonly thumbnailWidth?: number;
};

type ExtMetadataValue = { readonly value?: string };

type CommonsImageInfo = {
  readonly url?: string;
  readonly thumburl?: string;
  readonly descriptionurl?: string;
  readonly extmetadata?: {
    readonly Artist?: ExtMetadataValue;
    readonly LicenseShortName?: ExtMetadataValue;
    readonly LicenseUrl?: ExtMetadataValue;
  };
};

type CommonsPage = {
  readonly title?: string;
  readonly imageinfo?: readonly CommonsImageInfo[];
};

type CommonsResponse = {
  readonly query?: {
    readonly pages?: Readonly<Record<string, CommonsPage>>;
  };
};

/** Strip the HTML Commons embeds in `Artist` (e.g. links) down to plain text. */
function plainText(html: string | undefined): string {
  if (html === undefined) return "";
  return html.replace(/<[^>]+>/g, "").trim();
}

/**
 * Search Wikimedia Commons for candidate images of a Spanish word or short
 * gloss. Network failures propagate to the caller.
 */
export async function searchWikimediaCommons(
  query: string,
  options: WikimediaSearchOptions = {},
): Promise<readonly DiscoveredImageCandidate[]> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    generator: "search",
    gsrsearch: `filetype:bitmap ${query}`,
    gsrnamespace: "6",
    gsrlimit: String(options.limit ?? 10),
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: String(options.thumbnailWidth ?? 320),
  });

  const response = await fetch(`${COMMONS_API_ENDPOINT}?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`WIKIMEDIA_SEARCH_FAILED: ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as CommonsResponse;
  const pages = Object.values(body.query?.pages ?? {});
  const candidates: DiscoveredImageCandidate[] = [];

  for (const page of pages) {
    const info = page.imageinfo?.[0];
    if (
      info === undefined ||
      info.url === undefined ||
      info.thumburl === undefined ||
      info.descriptionurl === undefined
    ) {
      continue;
    }
    const license = info.extmetadata?.LicenseShortName?.value;
    const licenseUrl = info.extmetadata?.LicenseUrl?.value;
    if (license === undefined || licenseUrl === undefined) continue;

    const providerAssetId = page.title;
    if (providerAssetId === undefined) continue;

    candidates.push({
      provider: "wikimedia",
      providerAssetId,
      remoteImageUrl: info.url,
      thumbnailUrl: info.thumburl,
      sourcePageUrl: info.descriptionurl,
      creator: plainText(info.extmetadata?.Artist?.value) || "unknown (see source page)",
      license,
      licenseUrl,
      title: page.title ?? query,
    });
  }

  return candidates;
}
