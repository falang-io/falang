// Individual `@activepieces/piece-*` packages ship a compiled bundle (`src/index.js`) but no `.d.ts`
// — only `@activepieces/pieces-framework`/`shared` are typed on npm. Each is a `Piece` instance built
// via `createPiece()`; the export names below were verified against each installed bundle (see
// `registry.test.ts`, which loads every one for real). Several declare `auth` as an *array* of
// methods at runtime (`Piece<PieceAuthProperty[]>`) — typed as plain `Piece` here regardless, since
// nothing reads `piece.auth` except `select-auth.ts`, which handles both shapes.
declare module '@activepieces/piece-resend' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const resend: Piece;
}
declare module '@activepieces/piece-wordpress' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const wordpress: Piece;
}
declare module '@activepieces/piece-slack' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const slack: Piece;
}
declare module '@activepieces/piece-google-sheets' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const googleSheets: Piece;
}
declare module '@activepieces/piece-gmail' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const gmail: Piece;
}
declare module '@activepieces/piece-google-drive' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const googleDrive: Piece;
}
declare module '@activepieces/piece-google-calendar' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const googleCalendar: Piece;
}
declare module '@activepieces/piece-notion' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const notion: Piece;
}
declare module '@activepieces/piece-github' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const github: Piece;
}
declare module '@activepieces/piece-gitlab' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const gitlab: Piece;
}
declare module '@activepieces/piece-airtable' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const airtable: Piece;
}
declare module '@activepieces/piece-trello' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const trello: Piece;
}
declare module '@activepieces/piece-hubspot' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const hubspot: Piece;
}
declare module '@activepieces/piece-stripe' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const stripe: Piece;
}
declare module '@activepieces/piece-sendgrid' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const sendgrid: Piece;
}
declare module '@activepieces/piece-smtp' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const smtp: Piece;
}
declare module '@activepieces/piece-imap' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const imapPiece: Piece;
}
declare module '@activepieces/piece-jira-cloud' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const jiraCloud: Piece;
}
declare module '@activepieces/piece-postgres' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const postgres: Piece;
}
declare module '@activepieces/piece-mysql' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const mysql: Piece;
}
declare module '@activepieces/piece-mailchimp' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const mailchimp: Piece;
}
declare module '@activepieces/piece-todoist' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const todoist: Piece;
}
declare module '@activepieces/piece-linear' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const linear: Piece;
}
declare module '@activepieces/piece-clickup' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const clickup: Piece;
}
declare module '@activepieces/piece-rss' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const rssFeed: Piece;
}
declare module '@activepieces/piece-dropbox' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const dropbox: Piece;
}
declare module '@activepieces/piece-amazon-s3' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const amazonS3: Piece;
}
declare module '@activepieces/piece-discord' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const discord: Piece;
}
declare module '@activepieces/piece-mattermost' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const mattermost: Piece;
}
declare module '@activepieces/piece-salesforce' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const salesforce: Piece;
}
declare module '@activepieces/piece-pipedrive' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const pipedrive: Piece;
}
declare module '@activepieces/piece-zoho-crm' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const zohoCrm: Piece;
}
declare module '@activepieces/piece-close' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const close: Piece;
}
declare module '@activepieces/piece-monday' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const monday: Piece;
}
declare module '@activepieces/piece-asana' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const asana: Piece;
}
declare module '@activepieces/piece-wrike' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const wrike: Piece;
}
declare module '@activepieces/piece-zendesk' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const zendesk: Piece;
}
declare module '@activepieces/piece-freshdesk' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const freshdesk: Piece;
}
declare module '@activepieces/piece-intercom' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const intercom: Piece;
}
declare module '@activepieces/piece-activecampaign' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const activecampaign: Piece;
}
declare module '@activepieces/piece-klaviyo' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const klaviyo: Piece;
}
declare module '@activepieces/piece-sendinblue' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const sendinblue: Piece;
}
declare module '@activepieces/piece-google-forms' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const googleForms: Piece;
}
declare module '@activepieces/piece-zoom' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const zoom: Piece;
}
declare module '@activepieces/piece-microsoft-teams' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const microsoftTeams: Piece;
}
declare module '@activepieces/piece-twilio' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const twilio: Piece;
}
declare module '@activepieces/piece-shopify' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const shopify: Piece;
}
declare module '@activepieces/piece-woocommerce' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const woocommerce: Piece;
}
declare module '@activepieces/piece-quickbooks' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const quickbooks: Piece;
}
declare module '@activepieces/piece-xero' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const xero: Piece;
}
declare module '@activepieces/piece-razorpay' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const razorpay: Piece;
}
declare module '@activepieces/piece-paddle' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const paddle: Piece;
}
declare module '@activepieces/piece-docusign' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const docusign: Piece;
}
declare module '@activepieces/piece-pandadoc' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const pandadoc: Piece;
}
declare module '@activepieces/piece-mongodb' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const mongodb: Piece;
}
declare module '@activepieces/piece-mixpanel' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const mixpanel: Piece;
}
declare module '@activepieces/piece-posthog' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const posthog: Piece;
}
declare module '@activepieces/piece-youtube' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const youtube: Piece;
}
declare module '@activepieces/piece-typeform' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const typeform: Piece;
}
declare module '@activepieces/piece-jotform' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const jotform: Piece;
}
declare module '@activepieces/piece-calendly' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const calendly: Piece;
}
declare module '@activepieces/piece-box' {
  import type { Piece } from '@activepieces/pieces-framework';
  export const box: Piece;
}
