import { cookies } from 'next/headers';
import { LANG_COOKIE, resolveLang } from '@/app/_libs/lang';
import ContactSection from '@/app/_components/ContactSection';

export default async function Page() {
  const lang = resolveLang((await cookies()).get(LANG_COOKIE)?.value);
  return <ContactSection lang={lang} />;
}
