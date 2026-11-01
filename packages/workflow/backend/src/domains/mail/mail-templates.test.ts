import { afterEach, describe, expect, it } from 'vitest';
import { accountExistsMail, adminDigestMail, confirmEmailMail, mailBrandName, welcomeMail } from './mail-templates.js';

const info = { login: 'a@b.c', password: 'secret', loginUrl: 'https://app.example.com/' };

describe('mail templates: the brand name', () => {
  const saved = process.env.BRAND_NAME;
  afterEach(() => {
    if (typeof saved === 'string') process.env.BRAND_NAME = saved;
    else delete process.env.BRAND_NAME;
  });

  it('defaults to Falang', () => {
    delete process.env.BRAND_NAME;
    expect(mailBrandName()).toBe('Falang');
    expect(welcomeMail('en', info).subject).toBe('Welcome to Falang');
    expect(accountExistsMail('en', info.loginUrl).subject).toBe('You already have a Falang account');
  });

  it('treats a blank BRAND_NAME as unset', () => {
    process.env.BRAND_NAME = '  ';
    expect(mailBrandName()).toBe('Falang');
  });

  it('uses BRAND_NAME in every mail that names the product', () => {
    process.env.BRAND_NAME = 'Шагомат';
    const welcome = welcomeMail('ru', info);
    expect(welcome.subject).toBe('Добро пожаловать в Шагомат');
    expect(welcome.text).toContain('Ваш аккаунт в сервисе Шагомат создан');
    expect(welcome.html).toContain('Ваш аккаунт в сервисе Шагомат создан');
    expect(confirmEmailMail('ru', 'https://x/', 'signup').text).toContain('войти в Шагомат');
    expect(accountExistsMail('ru', 'https://x/').subject).toBe('У вас уже есть аккаунт в сервисе Шагомат');
    const digest = adminDigestMail('ru', [
      { email: 'a@b.c', companyName: null, automationInterest: null, activated: true },
    ]);
    expect(digest.subject).toBe('Шагомат: новых заявок 1');
    for (const mail of [welcome, welcomeMail('en', info), accountExistsMail('en', 'https://x/'), digest]) {
      expect(`${mail.subject} ${mail.text} ${mail.html}`).not.toContain('Falang');
    }
  });

  it('escapes the brand in HTML', () => {
    process.env.BRAND_NAME = 'A<b>';
    expect(welcomeMail('en', info).html).toContain('Your A&lt;b&gt; account');
  });
});
