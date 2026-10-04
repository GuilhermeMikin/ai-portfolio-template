import {
  LOCALE_PREFERENCE_COOKIE_NAME,
  resolvePreferredLocale,
} from "@/shared/config/site";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function RootPage() {
  const cookieStore = await cookies();
  const requestHeaders = await headers();
  const locale = resolvePreferredLocale({
    savedLocale: cookieStore.get(LOCALE_PREFERENCE_COOKIE_NAME)?.value,
    acceptLanguage: requestHeaders.get("accept-language"),
  });

  redirect(`/${locale}`);
}
