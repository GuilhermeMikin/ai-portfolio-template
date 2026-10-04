import { createElement } from "react";
import type { IconType } from "react-icons";
import {
  FaBehance,
  FaBluesky,
  FaDribbble,
  FaGithub,
  FaGitlab,
  FaGlobe,
  FaLink,
  FaLinkedin,
  FaMastodon,
  FaMedium,
  FaWhatsapp,
  FaXTwitter,
  FaYoutube,
} from "react-icons/fa6";

import type { SocialPlatform } from "@/content/schema";

const PLATFORM_ICONS: Record<SocialPlatform, IconType> = {
  github: FaGithub,
  gitlab: FaGitlab,
  linkedin: FaLinkedin,
  x: FaXTwitter,
  bluesky: FaBluesky,
  mastodon: FaMastodon,
  youtube: FaYoutube,
  dribbble: FaDribbble,
  behance: FaBehance,
  medium: FaMedium,
  whatsapp: FaWhatsapp,
  website: FaGlobe,
  other: FaLink,
};

/** Decorative icon for a social platform. Always pair it with a visible or sr-only label. */
export function SocialIcon({ platform, className }: { platform: SocialPlatform; className?: string }) {
  return createElement(PLATFORM_ICONS[platform] ?? FaLink, { "aria-hidden": true, className });
}
