import { getProfile, type Profile } from "@/content";
import { SITE_URL, SUPPORTED_LOCALES, toLanguageTag, type Locale } from "@/shared/config/site";
import { getPageUrl, getSiteDescription } from "@/shared/utils/seo";

const MAX_KNOWS_ABOUT = 20;

function parseUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/** A path under `public/` becomes an absolute URL; other values must already be absolute. */
function toAbsoluteUrl(src: string) {
  if (src.startsWith("/") && !src.startsWith("//")) {
    return `${SITE_URL}${src}`;
  }
  const protocol = parseUrl(src)?.protocol;
  return protocol === "https:" || protocol === "http:" ? src : undefined;
}

/** Only when exactly one role is ongoing: with two or more, the employer would be a guess. */
function getCurrentEmployer(profile: Profile) {
  const ongoing = profile.experience.filter((item) => !item.period.end);
  if (ongoing.length !== 1) {
    return undefined;
  }

  const { organization, organizationUrl } = ongoing[0];
  return {
    "@type": "Organization",
    name: organization,
    ...(organizationUrl && parseUrl(organizationUrl)?.protocol === "https:" ? { url: organizationUrl } : {}),
  };
}

/** schema.org Person + WebSite graph, built from the locale's profile. */
export function buildStructuredData(locale: Locale, profile: Profile = getProfile(locale)) {
  const { person } = profile;
  const personId = `${SITE_URL}/#person`;
  const image = person.photo ? toAbsoluteUrl(person.photo.src) : undefined;
  const sameAs = profile.contact.social
    .map((link) => link.href)
    .filter((href) => parseUrl(href)?.protocol === "https:");
  const knowsAbout = [...new Set(profile.skills.flatMap((group) => group.items))].slice(
    0,
    MAX_KNOWS_ABOUT
  );
  const worksFor = getCurrentEmployer(profile);

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Person",
        "@id": personId,
        name: person.name,
        jobTitle: person.headline,
        description: person.summary,
        url: getPageUrl(locale, ""),
        ...(image ? { image } : {}),
        ...(sameAs.length > 0 ? { sameAs } : {}),
        ...(knowsAbout.length > 0 ? { knowsAbout } : {}),
        ...(worksFor ? { worksFor } : {}),
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        name: person.name,
        url: `${SITE_URL}/`,
        description: getSiteDescription(profile),
        inLanguage: SUPPORTED_LOCALES.map(toLanguageTag),
        author: { "@id": personId },
      },
    ],
  };
}

/**
 * JSON for an inline `<script type="application/ld+json">`. Every "<" is escaped as
 * < (still valid JSON), so no content can close the script tag or open a comment.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
