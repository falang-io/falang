#!/bin/sh
# Entrypoint of the production client image (docker/client.Dockerfile, target `production`; the cloud image uses a
# copy of this file). It builds the Content-Security-Policy from the environment, then hands over to the stock nginx
# entrypoint, whose /etc/nginx/templates/*.template step substitutes ONLY the variables named in
# NGINX_ENVSUBST_FILTER (so nginx's own $uri/$host are never touched).
#
#   API_ORIGIN         required. Origin of the backend API as the browser sees it, e.g. https://api.example.com
#                      (it is already baked into the bundle as VITE_BACKEND_URL; this only lets CSP allow it).
#   CSP_PRESETS        comma list of third-party widgets in use: smartcaptcha, recaptcha, yandex-metrika.
#   CSP_{SCRIPT,CONNECT,IMG,FRAME,FONT}_EXTRA   extra space-separated sources appended to that directive.
#   CSP_HEADER_NAME    Content-Security-Policy (default) or Content-Security-Policy-Report-Only for a trial rollout.
set -eu

if [ -z "${API_ORIGIN:-}" ]; then
  echo "error: API_ORIGIN is required (origin of the backend API, e.g. https://api.example.com): the Content-Security-Policy" >&2
  echo "       connect-src/img-src must allow it, otherwise the browser blocks every API call." >&2
  exit 1
fi
case "$API_ORIGIN" in
  http://* | https://*) ;;
  *)
    echo "error: API_ORIGIN must start with http:// or https:// (got: $API_ORIGIN)" >&2
    exit 1
    ;;
esac
# The value lands inside a quoted nginx string and a CSP: refuse anything that could break out of either.
if printf '%s' "$API_ORIGIN" | grep -Eq '[^A-Za-z0-9:/._-]'; then
  echo "error: API_ORIGIN contains unexpected characters (origin only, no path/query/spaces): $API_ORIGIN" >&2
  exit 1
fi
for var in CSP_SCRIPT_EXTRA CSP_CONNECT_EXTRA CSP_IMG_EXTRA CSP_FRAME_EXTRA CSP_FONT_EXTRA; do
  eval "value=\${$var:-}"
  if printf '%s' "$value" | grep -Eq "[;\"\\\\\$]"; then
    echo "error: $var must not contain ; \" \\ or \$" >&2
    exit 1
  fi
done

script_src="'self'"
connect_src="'self' ${API_ORIGIN}"
img_src="'self' data: blob: ${API_ORIGIN}"
frame_src=""
font_src="'self' data:"

add() { # add <directive-var> <sources...>
  var=$1
  shift
  eval "$var=\"\$$var $*\""
}

IFS=','
for preset in ${CSP_PRESETS:-}; do
  case "$preset" in
    smartcaptcha)
      add script_src "https://smartcaptcha.cloud.yandex.ru https://smartcaptcha.yandexcloud.net"
      add connect_src "https://smartcaptcha.cloud.yandex.ru https://smartcaptcha.yandexcloud.net"
      add img_src "https://smartcaptcha.cloud.yandex.ru https://smartcaptcha.yandexcloud.net"
      add frame_src "https://smartcaptcha.cloud.yandex.ru https://smartcaptcha.yandexcloud.net"
      ;;
    recaptcha)
      add script_src "https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/"
      add frame_src "https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/"
      ;;
    yandex-metrika)
      add script_src "https://mc.yandex.ru https://mc.yandex.com https://yastatic.net"
      add connect_src "https://mc.yandex.ru https://mc.yandex.com wss://mc.yandex.ru wss://mc.yandex.com"
      add img_src "https://mc.yandex.ru https://mc.yandex.com"
      ;;
    '') ;;
    *)
      echo "error: unknown CSP preset '$preset' (known: smartcaptcha, recaptcha, yandex-metrika)" >&2
      exit 1
      ;;
  esac
done
unset IFS

[ -n "${CSP_SCRIPT_EXTRA:-}" ] && add script_src "$CSP_SCRIPT_EXTRA"
[ -n "${CSP_CONNECT_EXTRA:-}" ] && add connect_src "$CSP_CONNECT_EXTRA"
[ -n "${CSP_IMG_EXTRA:-}" ] && add img_src "$CSP_IMG_EXTRA"
[ -n "${CSP_FRAME_EXTRA:-}" ] && add frame_src "$CSP_FRAME_EXTRA"
[ -n "${CSP_FONT_EXTRA:-}" ] && add font_src "$CSP_FONT_EXTRA"
[ -n "$frame_src" ] || frame_src="'none'"

# style-src 'unsafe-inline': emotion/antd inject <style> at run time and index.html has a boot <style>.
# worker-src 'self' blob: : Monaco's language-service workers (bundled as same-origin files by Vite).
CSP_POLICY="default-src 'self'; script-src ${script_src}; style-src 'self' 'unsafe-inline'; img-src ${img_src}; font-src ${font_src}; connect-src ${connect_src}; worker-src 'self' blob:; frame-src ${frame_src}; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'"
export CSP_POLICY
CSP_HEADER_NAME="${CSP_HEADER_NAME:-Content-Security-Policy}"
case "$CSP_HEADER_NAME" in
  Content-Security-Policy | Content-Security-Policy-Report-Only) ;;
  *)
    echo "error: CSP_HEADER_NAME must be Content-Security-Policy or Content-Security-Policy-Report-Only" >&2
    exit 1
    ;;
esac
export CSP_HEADER_NAME
export NGINX_ENVSUBST_FILTER='^(CSP_POLICY|CSP_HEADER_NAME)$'

exec /docker-entrypoint.sh "$@"
