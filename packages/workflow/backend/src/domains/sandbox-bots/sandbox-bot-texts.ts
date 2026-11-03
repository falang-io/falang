import { mailBrandName } from '../mail/mail-templates.js';

type TLang = 'en' | 'ru';

const pickLang = (language: string | undefined): TLang => (language?.toLowerCase().startsWith('ru') ? 'ru' : 'en');

export interface ISandboxBotTexts {
  groupsUnsupported(): string;
  linked(projectName: string): string;
  linkInvalid(): string;
  status(projectName: string, commandName: string): string;
  statusNotConnected(): string;
  disconnected(): string;
  expired(): string;
  notConnected(): string;
  standStopped(projectName: string): string;
  disconnectedFromEditor(): string;
  /** Description of the service command in the chat's command menu. */
  serviceCommandDescription(): string;
}

/** Service texts of the shared test bot, en/ru by the deployment's `DEFAULT_LANGUAGE`; the brand follows `BRAND_NAME`. */
export const buildSandboxBotTexts = (language: string | undefined): ISandboxBotTexts => {
  const brand = mailBrandName();
  if (pickLang(language) === 'ru') {
    return {
      groupsUnsupported: () => `Тестовый бот ${brand} работает только в личных сообщениях. Группы не поддерживаются.`,
      linked: (name) => `Готово: чат подключён к проекту «${name}». Сообщения отсюда идут на его тестовый стенд.`,
      linkInvalid: () => 'Ссылка недействительна или устарела. Откройте новую ссылку из редактора.',
      status: (name, command) => `Этот чат подключён к проекту «${name}». Чтобы отключить, отправьте /${command} off.`,
      statusNotConnected: () => 'Этот чат не подключён ни к одному проекту. Откройте ссылку подключения из редактора.',
      disconnected: () => 'Чат отключён от проекта.',
      expired: () => 'Подключение истекло. Откройте ссылку из редактора снова.',
      notConnected: () => 'Чат не подключён к проекту. Откройте ссылку подключения из редактора.',
      standStopped: (name) => `Тестовый стенд проекта «${name}» остановлен — запустите его в редакторе.`,
      disconnectedFromEditor: () => 'Чат отключён от проекта в редакторе.',
      serviceCommandDescription: () => 'Статус подключения тестового бота',
    };
  }
  return {
    groupsUnsupported: () => `The ${brand} test bot works in private chats only. Groups are not supported.`,
    linked: (name) => `Done: this chat is connected to project «${name}». Messages you send here go to its test stand.`,
    linkInvalid: () => 'This link is invalid or has expired. Open a new link from the editor.',
    status: (name, command) => `This chat is connected to project «${name}». To disconnect, send /${command} off.`,
    statusNotConnected: () => 'This chat is not connected to any project. Open the connect link from the editor.',
    disconnected: () => 'The chat is disconnected from the project.',
    expired: () => 'The connection expired. Open the link from the editor again.',
    notConnected: () => 'This chat is not connected to a project. Open the connect link from the editor.',
    standStopped: (name) => `The test stand of project «${name}» is stopped — start it in the editor.`,
    disconnectedFromEditor: () => 'The chat was disconnected from the project in the editor.',
    serviceCommandDescription: () => 'Test bot connection status',
  };
};
