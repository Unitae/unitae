# Maps

Unitae draws the territory maps itself: a quiet base map of streets and buildings, served by your instance, with the
congregation's numbered pins on top. The browser never calls a map service for it and nothing asks for consent. Until
you configure a base map, these maps stay hidden.

The base map shows on *Mes territoires* (a publisher's territory) and on a territory's page. The territory editor,
*Créer en lot*, the drawing on *Carte de l'assemblée*, the PDF map page and the address proximity search still use
Google Maps (`GOOGLE_MAPS_API_KEY`, see [Environment Variables](environment-variables.md#maps)).

## The base map file

The base map is [Protomaps](https://protomaps.com) vector tiles in a single PMTiles file. Point `UNITAE_MAP_TILES` at
it:

- a path on the server (a mounted volume), e.g. `/app/maps/area.pmtiles`;
- `s3://bucket/key`: a private bucket, read with the instance's storage credentials (`S3_ENDPOINT`, `S3_REGION`,
  `S3_ACCESS_KEY`, `S3_SECRET_KEY`), which need read access to that object;
- or a public `https://` URL. A public file can be used by anyone who finds its address: prefer a private bucket.

Protomaps' own daily builds are kept a week only: cut a file from one, don't point Unitae at it.

Unitae reads the file in ranges — never whole — and serves the tiles itself at `/map/tiles/…`: only to signed-in
accounts, and only inside each congregation's area (its perimeter, or else the rectangle around its placed buildings,
with a margin). Recent tiles stay in memory, and each congregation's area is read ahead when one of its maps opens.

### Getting a file for your area

You don't need the whole world (about 140 GB): cut out your congregation's area.

1. In **Réglages › Territoires**, an instance without a base map offers **Télécharger la zone à couvrir**: a GeoJSON
   file holding the congregation's perimeter, or the rectangle around its placed buildings.
2. Install the [`pmtiles` command-line tool](https://github.com/protomaps/go-pmtiles/releases) and cut that area out of
   a daily Protomaps build (the dates are listed at [maps.protomaps.com/builds](https://maps.protomaps.com/builds)).
   It reads the build in ranges; nothing else is downloaded:

   ```sh
   pmtiles extract https://build.protomaps.com/20261111.pmtiles area.pmtiles --region=zone.geojson
   ```

   A town comes to a few dozen MB, a whole country to several GB.
3. Put `area.pmtiles` where the app can read it, set `UNITAE_MAP_TILES`, and restart the app:
   - **Docker Compose:** put the file in a `maps/` folder next to `compose.yaml`, uncomment the `./maps:/app/maps:ro`
     volume of the `web` service, and add `UNITAE_MAP_TILES="/app/maps/area.pmtiles"` to `.env`. Then
     `docker compose up -d`. The container runs as user 1001: the file only needs to be readable by everyone (the
     default).
   - **PM2 or any other process manager:** set `UNITAE_MAP_TILES` to the file's absolute path.
   - **A bucket:** upload the file (under a dated name, e.g. `area-20261111.pmtiles`) to a private bucket and set
     `UNITAE_MAP_TILES` to `s3://your-bucket/area-20261111.pmtiles`; the storage credentials need read access to it.
4. Streets change slowly: run the extraction again once or twice a year, replace the file (or upload a new dated
   one and point the variable at it), restart.

Several congregations on one instance: cut a region that covers them all (or a whole country).

## What the map shows

- Only the pins are in colour. The base keeps to greys, with water and parks barely tinted; no places, shops,
  transport, shields or house numbers. Light and dark follow the theme chosen in Unitae.
- Labels use the app's typeface. Its glyph files ship with the app (`public/map-fonts`); scripts it does not cover
  (Arabic, Hebrew, Devanagari…) are drawn in Noto Sans, and CJK by the browser itself.
- The credit « Protomaps · © OpenStreetMap » stays in the corner of every map, as OpenStreetMap's licence requires.

## Without a base map

On-screen territory maps are hidden: the entrance list takes the whole width, and publishers are told nothing.
Whoever configures the territories sees, in **Réglages › Territoires**, that the instance has no base map, with the
area file to hand you.
