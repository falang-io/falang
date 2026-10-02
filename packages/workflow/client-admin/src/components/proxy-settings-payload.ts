export interface IProxyFormValues {
  url: string;
  token: string;
  vendors: string[];
}

/** Builds the `PUT` body: a blank token is omitted (keeps the stored one), the URL is trimmed. */
export const buildProxySettingsPayload = (
  values: IProxyFormValues,
): { url: string; token?: string; vendors: string[] } => {
  const token = values.token.trim();
  return token
    ? { url: values.url.trim(), token, vendors: values.vendors }
    : { url: values.url.trim(), vendors: values.vendors };
};
