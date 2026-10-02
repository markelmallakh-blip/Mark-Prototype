#!/bin/sh
# Builds the app for GitHub Pages and publishes it to the gh-pages branch.
set -e
REMOTE="${PAGES_REMOTE:-git@github.com:markelmallakh-blip/Mark-Prototype.git}"

npm run build:pages
cd dist-pages
touch .nojekyll
rm -rf .git
git init -q -b gh-pages
git add -A
git commit -q -m "Deploy GitHub Pages"
git push -f "$REMOTE" gh-pages
rm -rf .git
echo "Published: https://markelmallakh-blip.github.io/Mark-Prototype/"
