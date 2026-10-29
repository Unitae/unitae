# Fonts

The fonts the server embeds in the PDFs it generates. All three families are under the SIL Open
Font License 1.1; each licence sits next to its files.

| Family | Files | Source | Licence |
|---|---|---|---|
| Fira Sans 4.203 | `FiraSans-*.ttf` | [google/fonts `ofl/firasans`](https://github.com/google/fonts/tree/main/ofl/firasans) | `OFL-FiraSans.txt` |
| Atkinson Hyperlegible 1.006 | `AtkinsonHyperlegible-*.ttf` | [google/fonts `ofl/atkinsonhyperlegible`](https://github.com/google/fonts/tree/main/ofl/atkinsonhyperlegible) | `OFL-AtkinsonHyperlegible.txt` |
| Source Serif 4 4.005 | `SourceSerif4-*.ttf` | [adobe-fonts/source-serif release 4.005R](https://github.com/adobe-fonts/source-serif/releases/tag/4.005R), static TTFs | `OFL-SourceSerif4.md` |

Atkinson Hyperlegible covers fewer characters than the other two. The board sheets fall back to
Fira Sans for any character it lacks.
