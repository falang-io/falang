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

export const confirmEmailMail = (language: string | undefined, url: string): IMailContent => {
  if (pickLang(language) === 'ru') {
    return {
      subject: 'Подтвердите e-mail',
      text: `Чтобы подтвердить e-mail и завершить заявку, перейдите по ссылке (действует 24 часа):\n${url}\n\nЕсли вы не оставляли заявку, просто проигнорируйте это письмо.`,
      html: wrapHtml([
        `Чтобы подтвердить e-mail и завершить заявку, перейдите по ссылке (действует 24 часа):<br>${link(url)}`,
        'Если вы не оставляли заявку, просто проигнорируйте это письмо.',
      ]),
    };
  }
  return {
    subject: 'Confirm your e-mail',
    text: `Follow the link to confirm your e-mail and complete your application (valid for 24 hours):\n${url}\n\nIf you did not apply, just ignore this message.`,
    html: wrapHtml([
      `Follow the link to confirm your e-mail and complete your application (valid for 24 hours):<br>${link(url)}`,
      'If you did not apply, just ignore this message.',
    ]),
  };
};

export interface INewApplicationInfo {
  readonly email: string;
  readonly companyName: string | null;
  readonly automationInterest: string | null;
}

export const newApplicationMail = (language: string | undefined, info: INewApplicationInfo): IMailContent => {
  const company = info.companyName ?? '-';
  const interest = info.automationInterest ?? '-';
  if (pickLang(language) === 'ru') {
    return {
      subject: `Новая заявка: ${company}`,
      text: `Новая заявка на бета-доступ.\nE-mail: ${info.email}\nКомпания: ${company}\nЧто хотят автоматизировать: ${interest}\n\nАктивируйте её в админке (Users).`,
      html: wrapHtml([
        'Новая заявка на бета-доступ.',
        `E-mail: ${escapeHtml(info.email)}<br>Компания: ${escapeHtml(company)}<br>Что хотят автоматизировать: ${escapeHtml(interest)}`,
        'Активируйте её в админке (Users).',
      ]),
    };
  }
  return {
    subject: `New application: ${company}`,
    text: `A new beta application arrived.\nE-mail: ${info.email}\nCompany: ${company}\nInterested in automating: ${interest}\n\nActivate it in the admin app (Users).`,
    html: wrapHtml([
      'A new beta application arrived.',
      `E-mail: ${escapeHtml(info.email)}<br>Company: ${escapeHtml(company)}<br>Interested in automating: ${escapeHtml(interest)}`,
      'Activate it in the admin app (Users).',
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
