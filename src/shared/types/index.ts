/** Props Next.js passes to pages (and `generateMetadata`) under `app/[locale]`. */
export type ParamsLocale = {
  params: Promise<{ locale: string }>;
};
