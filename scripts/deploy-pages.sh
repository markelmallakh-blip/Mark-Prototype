#!/bin/sh
# Publishes a redirect to the gh-pages branch. The app now lives on Cloudflare (same site as the
# preview, which Safari requires); old GitHub Pages links (#/p/<token>, #/prototype/...) forward there.
set -e
REMOTE="${PAGES_REMOTE:-git@github.com:markelmallakh-blip/Mark-Prototype.git}"
APP="${APP_ORIGIN:-https://mark-prototype.markelmallakh.workers.dev}"

OUT=$(mktemp -d)
cat > "$OUT/index.html" <<HTML
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Prototype</title>
<script>
  // #/p/<token> → /p/<token>, #/prototype/<id> → /prototype/<id>; anything else → the dashboard.
  var h = location.hash.replace(/^#/, '');
  var path = /^\/(p|prototype)(\/[A-Za-z0-9_-]+)?\/?$/.test(h) ? h : '/prototype';
  location.replace('$APP' + path);
</script>
</head>
<body style="margin:0;height:100vh;display:grid;place-items:center;background:#1d1e21;color:#fff;font:15px -apple-system,BlinkMacSystemFont,sans-serif">
<a href="$APP/prototype" style="color:#0a84ff">Open Prototype</a>
</body>
</html>
HTML
touch "$OUT/.nojekyll"
cd "$OUT"
git init -q -b gh-pages
git add -A
git commit -q -m "Redirect to the Cloudflare app"
git push -f "$REMOTE" gh-pages
cd - >/dev/null
rm -rf "$OUT"
echo "Published redirect: https://markelmallakh-blip.github.io/Mark-Prototype/ → $APP"
