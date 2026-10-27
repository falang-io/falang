export interface IMailContent {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

type TLang = 'en' | 'ru';

const pickLang = (language: string | undefined): TLang => (language?.toLowerCase().startsWith('ru') ? 'ru' : 'en');

const escapeHtml = (value: string): string =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

const wrapHtml = (paragraphs: string[]): string => `<div>${paragraphs.map((p) => `<p>${p}</p>`).join('')}</div>`;

const link = (url: string): string => `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`;

/** `signup`: the self-service signup (`SIGNUP_AUTO_ACTIVATE`), `application`: a closed-beta application awaiting review. */
export type TConfirmEmailKind = 'application' | 'signup';

export const confirmEmailMail = (
  language: string | undefined,
  url: string,
  kind: TConfirmEmailKind = 'application',
): IMailContent => {
  const signup = kind === 'signup';
  if (pickLang(language) === 'ru') {
    const lead = signup
      ? 'Чтобы подтвердить e-mail и войти в Falang, перейдите по ссылке (действует 24 часа):'
      : 'Чтобы подтвердить e-mail и завершить заявку, перейдите по ссылке (действует 24 часа):';
    const ignore = signup
      ? 'Если вы не регистрировались, просто проигнорируйте это письмо.'
      : 'Если вы не оставляли заявку, просто проигнорируйте это письмо.';
    return {
      subject: 'Подтвердите e-mail',
      text: `${lead}\n${url}\n\n${ignore}`,
      html: wrapHtml([`${lead}<br>${link(url)}`, ignore]),
    };
  }
  const lead = signup
    ? 'Follow the link to confirm your e-mail and sign in to Falang (valid for 24 hours):'
    : 'Follow the link to confirm your e-mail and complete your application (valid for 24 hours):';
  const ignore = signup
    ? 'If you did not sign up, just ignore this message.'
    : 'If you did not apply, just ignore this message.';
  return {
    subject: 'Confirm your e-mail',
    text: `${lead}\n${url}\n\n${ignore}`,
    html: wrapHtml([`${lead}<br>${link(url)}`, ignore]),
  };
};

export interface INewApplicationInfo {
  readonly email: string;
  readonly companyName: string | null;
  readonly automationInterest: string | null;
  /** The account was activated on e-mail confirmation (`SIGNUP_AUTO_ACTIVATE`): an FYI, nothing to activate. */
  readonly activated?: boolean;
}

export const newApplicationMail = (language: string | undefined, info: INewApplicationInfo): IMailContent => {
  const company = info.companyName ?? '-';
  const interest = info.automationInterest ?? '-';
  if (pickLang(language) === 'ru') {
    const [subject, lead, tail] = info.activated
      ? [`Новый пользователь: ${company}`, 'Зарегистрировался новый пользователь.', 'Аккаунт уже активирован.']
      : [`Новая заявка: ${company}`, 'Новая заявка на бета-доступ.', 'Активируйте её в админке (Users).'];
    return {
      subject,
      text: `${lead}\nE-mail: ${info.email}\nКомпания: ${company}\nЧто хотят автоматизировать: ${interest}\n\n${tail}`,
      html: wrapHtml([
        lead,
        `E-mail: ${escapeHtml(info.email)}<br>Компания: ${escapeHtml(company)}<br>Что хотят автоматизировать: ${escapeHtml(interest)}`,
        tail,
      ]),
    };
  }
  const [subject, lead, tail] = info.activated
    ? [`New user: ${company}`, 'A new user signed up.', 'The account is already active.']
    : [`New application: ${company}`, 'A new beta application arrived.', 'Activate it in the admin app (Users).'];
  return {
    subject,
    text: `${lead}\nE-mail: ${info.email}\nCompany: ${company}\nInterested in automating: ${interest}\n\n${tail}`,
    html: wrapHtml([
      lead,
      `E-mail: ${escapeHtml(info.email)}<br>Company: ${escapeHtml(company)}<br>Interested in automating: ${escapeHtml(interest)}`,
      tail,
    ]),
  };
};

/** `SIGNUP_AUTO_ACTIVATE`: sent when the confirmed e-mail activated the account (the user is already signed in). */
export const welcomeMail = (
  language: string | undefined,
  info: { login: string; password: string; loginUrl: string },
): IMailContent => {
  if (pickLang(language) === 'ru') {
    return {
      subject: 'Добро пожаловать в Falang',
      text: `Ваш аккаунт Falang создан, вы уже вошли в систему.\nДля входа с другого устройства:\nЛогин: ${info.login}\nПароль: ${info.password}\nВход: ${info.loginUrl}\n\nПароль можно сменить в настройках аккаунта.`,
      html: wrapHtml([
        'Ваш аккаунт Falang создан, вы уже вошли в систему.',
        `Для входа с другого устройства:<br>Логин: ${escapeHtml(info.login)}<br>Пароль: <code>${escapeHtml(info.password)}</code><br>Вход: ${link(info.loginUrl)}`,
        'Пароль можно сменить в настройках аккаунта.',
      ]),
    };
  }
  return {
    subject: 'Welcome to Falang',
    text: `Your Falang account is ready and you are already signed in.\nTo sign in from another device:\nLogin: ${info.login}\nPassword: ${info.password}\nSign in: ${info.loginUrl}\n\nYou can change the password in your account settings.`,
    html: wrapHtml([
      'Your Falang account is ready and you are already signed in.',
      `To sign in from another device:<br>Login: ${escapeHtml(info.login)}<br>Password: <code>${escapeHtml(info.password)}</code><br>Sign in: ${link(info.loginUrl)}`,
      'You can change the password in your account settings.',
    ]),
  };
};

export const accountActivatedMail = (
  language: string | undefined,
  info: { login: string; password: string; loginUrl: string },
): IMailContent => {
  if (pickLang(language) === 'ru') {
    return {
      subject: 'Ваш бета-аккаунт активирован',
      text: `Ваш бета-аккаунт активирован.\nЛогин: ${info.login}\nПароль: ${info.password}\nВход: ${info.loginUrl}\n\nРекомендуем сменить пароль после первого входа.`,
      html: wrapHtml([
        'Ваш бета-аккаунт активирован.',
        `Логин: ${escapeHtml(info.login)}<br>Пароль: <code>${escapeHtml(info.password)}</code><br>Вход: ${link(info.loginUrl)}`,
        'Рекомендуем сменить пароль после первого входа.',
      ]),
    };
  }
  return {
    subject: 'Your beta account is activated',
    text: `Your beta account is activated.\nLogin: ${info.login}\nPassword: ${info.password}\nSign in: ${info.loginUrl}\n\nWe recommend changing the password after your first sign-in.`,
    html: wrapHtml([
      'Your beta account is activated.',
      `Login: ${escapeHtml(info.login)}<br>Password: <code>${escapeHtml(info.password)}</code><br>Sign in: ${link(info.loginUrl)}`,
      'We recommend changing the password after your first sign-in.',
    ]),
  };
};

export const resetPasswordMail = (language: string | undefined, url: string): IMailContent => {
  if (pickLang(language) === 'ru') {
    return {
      subject: 'Сброс пароля',
      text: `Чтобы задать новый пароль, перейдите по ссылке (действует 1 час):\n${url}\n\nЕсли вы не запрашивали сброс, проигнорируйте это письмо.`,
      html: wrapHtml([
        `Чтобы задать новый пароль, перейдите по ссылке (действует 1 час):<br>${link(url)}`,
        'Если вы не запрашивали сброс, проигнорируйте это письмо.',
      ]),
    };
  }
  return {
    subject: 'Reset your password',
    text: `Follow the link to set a new password (valid for 1 hour):\n${url}\n\nIf you did not request a reset, ignore this message.`,
    html: wrapHtml([
      `Follow the link to set a new password (valid for 1 hour):<br>${link(url)}`,
      'If you did not request a reset, ignore this message.',
    ]),
  };
};

const excerpt = (text: string): string => (text.length > 500 ? `${text.slice(0, 500)}…` : text);

export const supportNewMessageMail = (
  language: string | undefined,
  info: { username: string; text: string; adminUrl: string },
): IMailContent => {
  const body = excerpt(info.text);
  if (pickLang(language) === 'ru') {
    return {
      subject: `Новое сообщение в поддержку от ${info.username}`,
      text: `Пользователь ${info.username} написал в поддержку:\n\n${body}\n\nОтветить: ${info.adminUrl}`,
      html: wrapHtml([
        `Пользователь ${escapeHtml(info.username)} написал в поддержку:`,
        escapeHtml(body).replaceAll('\n', '<br>'),
        `Ответить: ${link(info.adminUrl)}`,
      ]),
    };
  }
  return {
    subject: `New support message from ${info.username}`,
    text: `${info.username} wrote to support:\n\n${body}\n\nReply: ${info.adminUrl}`,
    html: wrapHtml([
      `${escapeHtml(info.username)} wrote to support:`,
      escapeHtml(body).replaceAll('\n', '<br>'),
      `Reply: ${link(info.adminUrl)}`,
    ]),
  };
};

export const supportReplyMail = (
  language: string | undefined,
  info: { text: string; clientUrl: string },
): IMailContent => {
  const body = excerpt(info.text);
  if (pickLang(language) === 'ru') {
    return {
      subject: 'Администратор ответил на ваше обращение',
      text: `Администратор ответил на ваше обращение в поддержку:\n\n${body}\n\nОткрыть чат: ${info.clientUrl}`,
      html: wrapHtml([
        'Администратор ответил на ваше обращение в поддержку:',
        escapeHtml(body).replaceAll('\n', '<br>'),
        `Открыть чат: ${link(info.clientUrl)}`,
      ]),
    };
  }
  return {
    subject: 'An administrator replied to your support request',
    text: `An administrator replied to your support request:\n\n${body}\n\nOpen the chat: ${info.clientUrl}`,
    html: wrapHtml([
      'An administrator replied to your support request:',
      escapeHtml(body).replaceAll('\n', '<br>'),
      `Open the chat: ${link(info.clientUrl)}`,
    ]),
  };
};

/** Sent to the owner of an address when somebody applies with it again: no new account, a pointer to password recovery. */
export const accountExistsMail = (language: string | undefined, loginUrl: string): IMailContent => {
  if (pickLang(language) === 'ru') {
    const lead =
      'Для этого адреса уже есть аккаунт Falang. Если вы забыли пароль, воспользуйтесь ссылкой «Забыли пароль?» на странице входа:';
    const ignore = 'Если это были не вы, просто проигнорируйте письмо.';
    return {
      subject: 'У вас уже есть аккаунт Falang',
      text: `${lead}\n${loginUrl}\n\n${ignore}`,
      html: wrapHtml([`${lead}<br>${link(loginUrl)}`, ignore]),
    };
  }
  const lead =
    'This address already has a Falang account. If you forgot the password, use "Forgot password?" on the sign-in page:';
  const ignore = 'If this was not you, just ignore this message.';
  return {
    subject: 'You already have a Falang account',
    text: `${lead}\n${loginUrl}\n\n${ignore}`,
    html: wrapHtml([`${lead}<br>${link(loginUrl)}`, ignore]),
  };
};

export interface IAdminDigestItem {
  readonly email: string;
  readonly companyName: string | null;
  readonly automationInterest: string | null;
  readonly activated: boolean;
}

/** One mail to an admin listing every signup since the previous digest. */
export const adminDigestMail = (language: string | undefined, items: readonly IAdminDigestItem[]): IMailContent => {
  const ru = pickLang(language) === 'ru';
  const line = (item: IAdminDigestItem): string => {
    const company = item.companyName ?? '-';
    const interest = item.automationInterest ?? '-';
    const states = ru ? ['активирован', 'ждёт активации'] : ['active', 'awaiting activation'];
    const state = item.activated ? states[0] : states[1];
    return ru
      ? `${item.email} | компания: ${company} | автоматизировать: ${interest} | ${state}`
      : `${item.email} | company: ${company} | automating: ${interest} | ${state}`;
  };
  const lead = ru ? `Новых заявок и пользователей: ${items.length}.` : `New applications and users: ${items.length}.`;
  const tail = ru ? 'Активируйте заявки в админке (Users).' : 'Activate applications in the admin app (Users).';
  return {
    subject: ru ? `Falang: новых заявок ${items.length}` : `Falang: ${items.length} new signup(s)`,
    text: `${lead}\n\n${items.map((item) => line(item)).join('\n')}\n\n${tail}`,
    html: wrapHtml([lead, items.map((item) => escapeHtml(line(item))).join('<br>'), tail]),
  };
};
