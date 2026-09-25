import { resolveMx } from 'node:dns/promises';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const DISPOSABLE_DOMAINS = new Set([
  '0815.ru',
  '10minutemail.com',
  '10minutemail.net',
  '123mail.org',
  '123mails.org',
  '20minutemail.com',
  '33mail.com',
  '4057.com',
  'anonaddy.com',
  'anonymousemail.net',
  'armyspy.com',
  'auctioneer.net',
  'aurelia.net',
  'awdrt.org',
  'bestmail.com',
  'binka.me',
  'bluemail.diariosescritores.com',
  'boostmail.com',
  'brefmail.com',
  'bugmenot.com',
  'bumpass.com',
  'bzwbz.org',
  'cablemail.com',
  'camera-email.com',
  'celebumper.com',
  'chammy.info',
  'cheatmail.de',
  'clipmail.eu',
  'cliptik.com',
  'clrmail.com',
  'coodem.com',
  'courriel.fr.nf',
  'crazymailing.com',
  'curryworld.de',
  'dandikmail.com',
  'deadaddress.com',
  'despam.it',
  'despammed.com',
  'dingbone.com',
  'discard.email',
  'discard.one',
  'discardmail.com',
  'discardmail.de',
  'disposemail.com',
  'dodgeit.com',
  'dontmail.net',
  'e4ward.com',
  'emailfake.com',
  'emailias.com',
  'emailinfive.com',
  'emailmiser.com',
  'emailondeck.com',
  'emailow.com',
  'emailsearcher.net',
  'emailsensei.com',
  'emailtemporario.com.br',
  'emailthe.net',
  'emailtmp.com',
  'emz.net',
  'envy17.com',
  'evopo.com',
  'fakemail.fr',
  'fakemailgenerator.com',
  'fakemail.net',
  'fake-mail.net',
  'fastfucking.pro',
  'fizmail.com',
  'fragolina2.com',
  'fucksall.info',
  'getairmail.com',
  'getnada.com',
  'getonemail.com',
  'guerrillamail.biz',
  'guerrillamail.com',
  'guerrillamail.de',
  'guerrillamail.info',
  'guerrillamail.net',
  'guerrillamail.org',
  'guerrillamailblock.com',
  'hornymatches.com',
  'hypnoticspider.com',
  'imails.info',
  'inboxbear.com',
  'inboxkitten.com',
  'inboxzilla.com',
  'inmynetwork.tk',
  'jetable.org',
  'junkmail.com',
  'kalapi.org',
  'kasmail.com',
  'killmail.net',
  'klassmaster.net',
  'konifc.abruzw.com',
  'kulturbetrieb.info',
  'lags.us',
  'lastmail.co',
  'lazyinbox.com',
  'mail-tester.com',
  'mailcatch.com',
  'maildrop.cc',
  'mailfall.com',
  'mailforspam.com',
  'mailfreeonline.com',
  'mailguard.me',
  'mailimate.com',
  'mailinator.com',
  'mailinator.net',
  'mailme.gq',
  'mailsac.com',
  'mailshell.com',
  'mailtemp.net',
  'mailtest.in',
  'mailtothis.com',
  'maileater.com',
  'meltmail.com',
  'mintemail.com',
  'moakt.com',
  'mobaddress.com',
  'mobiwebmail.com',
  'mytemp.email',
  'nada.email',
  'nakedtruth.biz',
  'no-spam.ws',
  'nobulk.com',
  'noflymail.com',
  'nogmailspam.info',
  'nomail.xl.cx',
  'nospam4.us',
  'nospamfor.us',
  'nowmymail.com',
  'od.ae',
  'opayq.com',
  'pookmail.com',
  'privacy.net',
  'proxymail.eu',
  'quickinbox.com',
  're-gister.com',
  'rejectmail.com',
  'rhyta.com',
  'rockmail.ru',
  'safetymail.info',
  'scrubmail.com',
  'sendspamhere.com',
  'shortmailbox.com',
  'slipstick.net',
  'sneakemail.com',
  'sofort-mail.de',
  'spam4.me',
  'spambean.com',
  'spamcon.org',
  'spamday.com',
  'spameater.org',
  'spamex.com',
  'spamfree24.org',
  'spamgoes.in',
  'spamgourmet.com',
  'spamhole.com',
  'spamify.com',
  'spamland.org',
  'spamoff.de',
  'spamslicer.com',
  'spamspot.com',
  'squizzy.com',
  'temp-mail.org',
  'tempail.com',
  'tempemail.net',
  'tempmail.com',
  'tempmail.io',
  'tempmailo.com',
  'tempinbox.com',
  'tempr.email',
  'thankyou2010.com',
  'throwaway.email',
  'throwawaymail.com',
  'throam.com',
  'tmail.ws',
  'trash-mail.com',
  'trash2009.com',
  'trashmail.com',
  'trashmail.me',
  'trashmail.net',
  'trashymail.com',
  'twinmail.de',
  'tyldd.com',
  'uggsrock.com',
  'uooos.com',
  'validemail.com',
  'veryrealemail.com',
  'viditag.com',
  'viewcastmedia.com',
  'wearespam.net',
  'whitemail.us',
  'whyspam.me',
  'willselfdestruct.com',
  'wupics.com',
  'yopmail.com',
  'yopmail.fr',
  'yopmail.net',
  'yopmail.org',
  'yopmail.pp.ua',
  'yufmailexouclo.com',
  'zippymail.info',
  'zzz.com',
]);

function isDisposable(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  if (DOMAIN_SUFFIX_RE.test(domain)) {
    let base = domain;
    while (base.includes('.')) {
      if (DISPOSABLE_DOMAINS.has(base)) return true;
      base = base.slice(base.indexOf('.') + 1);
    }
  }
  return DISPOSABLE_DOMAINS.has(domain);
}

const DOMAIN_SUFFIX_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export async function assertLegitEmail(email: string): Promise<string | null> {
  const value = email.trim().toLowerCase();
  if (!EMAIL_RE.test(value)) return 'Enter a valid email address.';

  const domain = value.split('@')[1] ?? '';
  if (!DOMAIN_SUFFIX_RE.test(domain)) {
    return 'Enter a valid email address.';
  }

  if (isDisposable(value)) {
    return 'Disposable addresses are not accepted. Use a real email provider (e.g. Gmail, Outlook, Proton).';
  }

  try {
    const mx = await resolveMx(domain);
    if (mx.length === 0) {
      return `We could not find a mail server for ${domain}. Use an email from a real provider (e.g. Gmail, Outlook, Proton).`;
    }
  } catch {
    return `We could not verify a mail server for ${domain}. Use an email from a real provider (e.g. Gmail, Outlook, Proton).`;
  }

  return null;
}

function supabaseConfig(): { url: string; publishable: string; service: string } {
  const url = process.env.SUPABASE_URL?.trim();
  const publishable = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  const service = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !publishable || !service) {
    throw new Error(
      'Supabase email is not configured. Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY, and enable the Email provider in Supabase Auth.'
    );
  }
  return { url: url.replace(/\/+$/, ''), publishable, service };
}

/** Ask Supabase GoTrue to email a 6-digit sign-in code to `email`. */
export async function sendOtpEmail(email: string): Promise<void> {
  const { url, publishable, service } = supabaseConfig();
  const res = await fetch(`${url}/auth/v1/otp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: publishable,
      Authorization: `Bearer ${service}`,
    },
    body: JSON.stringify({ email, create_user: true }),
  });
  if (!res.ok) {
    let detail = '';
    try {
      const body = (await res.json()) as { msg?: string };
      detail = body.msg ?? '';
    } catch {
      /* ignore */
    }
    throw new Error(
      `Could not send the verification email (${res.status}${
        detail ? `: ${detail}` : ''
      }). Check that the Email provider is enabled in Supabase Auth.`
    );
  }
}

/** Check a user-submitted code against Supabase GoTrue. */
export async function verifyOtpEmail(email: string, code: string): Promise<boolean> {
  const { url, publishable } = supabaseConfig();
  const res = await fetch(`${url}/auth/v1/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: publishable,
    },
    body: JSON.stringify({ type: 'email', email, token: code }),
  });
  return res.ok;
}