# wiki-sync

Generates the page of a Net-Logic module on https://wiki.netlogic.fr (MediaWiki) from the `wiki/` folder of
the module repository, on each published release. The repository is the source of truth: the page is
replaced as a whole, and manual edits on the wiki are refused at the next sync.

## In the module repository

```
wiki/
  page.yml     # title (exact wiki page title), logo, image_prefix, download (all but title optional)
  fr.md        # the page body, in Markdown
  images/      # png/jpg/gif used by fr.md and the logo
```

`page.yml`:

```yaml
title: Prune                 # created when it does not exist
logo: prune_250x250.png      # optional, a file of wiki/images
image_prefix: Prune          # optional, default: the title without spaces or punctuation
download: https://...        # optional, default: the DoliStore product of dolistore/product.yml
```

The page starts with a generated header: logo, version (from the descriptor), Dolibarr and PHP range and
DoliStore link (from `dolistore/product.yml` when present).

## Markdown

Headings, paragraphs, **bold**, *italic*, `code`, code blocks, lists (nested), tables, quotes, rules and
HTML are converted. Specific to the wiki:

- `![Alt text](images/screen.png "800px")`: an image of `wiki/images`, the title is an optional size
  (`800px`, `x300px`, `640x480px`). Uploaded as `File:<image_prefix>-screen.png`, only when it changed.
- `[the trash module](wiki:Corbeille)`: a link to another wiki page (`<wiki:Galerie d'Images>` or
  `wiki:Relance%20Facture%20Globale` for titles with spaces).
- ```` ```wikitext ```` fenced block: raw wikitext, passed as is.
- A screenshot between two numbered steps must be indented under the step (3 spaces), otherwise the
  numbering restarts and the tool refuses the second list.

Anything else (task lists, relative links...) is an error naming the line.

## Workflow job

```yaml
  wiki:
    needs: [lint, package]
    if: github.event_name == 'workflow_dispatch' || (github.event_name == 'release' && !github.event.release.prerelease)
    runs-on: ubuntu-latest
    permissions:
      contents: read
    concurrency:
      group: wiki-<module>
      cancel-in-progress: false
    steps:
      - uses: actions/checkout@v4
      # Pinned to a tag: the action receives the wiki secrets
      - uses: Net-Logic/wiki-sync@v0.1.0
        with:
          descriptor: core/modules/modXxx.class.php
          dry-run: ${{ github.event_name == 'release' && 'false' || 'true' }}
          login: ${{ secrets.WIKI_LOGIN }}
          password: ${{ secrets.WIKI_PASSWORD }}
```

A manual run (`workflow_dispatch`) is always a dry-run: download the `wiki-preview` artifact (`diff.txt`,
`page.wiki`, `preview.html`). `diff.txt` also says whether the wiki would rewrite part of the text on save
(signature `~~~~` in a wikitext block...): a real run refuses such a text before changing anything. Secrets: a bot password created on `Special:BotPasswords` (grants: basic
rights, edit existing pages, create pages, upload new files, upload/replace files), stored as repository
secrets `WIKI_LOGIN` (`User@botname`) and `WIKI_PASSWORD`.

## First sync of an existing page

A page that wiki-sync never wrote is refused. Check the dry-run, then take it over once from a checkout:

```bash
npm ci --prefix /path/to/wiki-sync
WIKI_LOGIN='Dolibarr@wikisync' WIKI_PASSWORD='...' node /path/to/wiki-sync/bin/wiki-sync.mjs \
  --module . --descriptor core/modules/modXxx.class.php --source https://github.com/Net-Logic/<repo>/blob/main/wiki/fr.md \
  --submit --force
```

## Home page

The `Accueil` page is generated from [`home/accueil.yml`](home/accueil.yml) in this repository: a heading,
then one card per module (logo, name, description, *Documentation* and *DoliStore* links), by group.

```yaml
      - page: Doli 365                       # the wiki page, must exist
        logo: Doli365-Doli365_250x250.png    # a file already on the wiki, without File:
        description: "E-mails Dolibarr via Microsoft 365, ..."   # one paragraph of Markdown
        dolistore: 647                       # optional, the DoliStore product id
        name: Doli 365                       # optional, defaults to page
```

To add a module, add its card once its page exists. The *Home page* workflow publishes the page on a push to
`main`; a pull request or a manual run is a dry run (artifact `wiki-home-preview`). A missing page or logo is
reported by the dry run and refused by a real run. The workflow needs the repository secrets `WIKI_LOGIN` and
`WIKI_PASSWORD`.

By hand: `node bin/wiki-sync.mjs --home home/accueil.yml [--submit [--force]]` (same environment variables).

## Development

`npm test` (node:test, no network).
