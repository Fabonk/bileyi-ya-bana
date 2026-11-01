# BILEYI YA BANA — page de téléchargement

La page qui propose les trois installateurs de l'application (Android, iPhone/iPad, Windows), avec la citation du
sermon « Tenir des conférences » (Chautauqua, 8 juin 1960, § 44).

- Page : https://bileyiyabana.netlify.app (Netlify, compte bat.fabonk@gmail.com, projet `bileyiyabana`)
- Fichiers : https://github.com/Fabonk/bileyi-ya-bana/releases (GitHub, compte Fabonk)

Les installateurs ne sont pas sur Netlify : l'offre gratuite de Netlify ne permet qu'environ 15 Go de transfert par
mois (à peu près 70 téléchargements de l'APK), alors que les « releases » GitHub n'ont pas de limite.

| Fichier | Rôle |
|---|---|
| `public/index.html` | la page entière (styles et script compris) ; les liens de téléchargement pointent vers la release GitHub |
| `public/img/` | logo, favicon, captures de l'application (`app-accueil.jpg`, `app-sermon.jpg`) et image d'aperçu pour WhatsApp/Facebook (`og.jpg`, 1200×630) |
| `netlify.toml` | dit à Netlify de publier `public/` |

La page reconnaît l'appareil du visiteur : sa carte passe en premier, et le grand bouton du haut télécharge directement
le bon fichier (sur iPhone, il ouvre les étapes d'installation, qui passent par un ordinateur). Sur ordinateur, un
QR code permet d'ouvrir la page sur le téléphone.

## Publier une nouvelle version

1. Faire les trois fichiers (voir `../app-html/LISEZ-MOI.md` et `../app-windows/LISEZ-MOI.md`).
2. Les copier sous ces noms (ici pour la version 1.2.0) : `BILEYI-YA-BANA-1.2.0-android.apk`,
   `BILEYI-YA-BANA-1.2.0-iphone.ipa`, `BILEYI-YA-BANA-1.2.0-windows-setup.exe`.
3. Les publier sur GitHub :
   ```
   gh release create v1.2.0 BILEYI-YA-BANA-1.2.0-* --repo Fabonk/bileyi-ya-bana --title "BILEYI YA BANA 1.2.0" --notes "…"
   ```
4. Dans `public/index.html`, remplacer `1.1.0` par `1.2.0` partout (liens, version affichée), corriger les tailles
   (`222 Mo`, `161 Mo`, `81 Mo`, aussi dans `data-taille`) et la phrase « Nouveau dans la version ».
5. Mettre la page en ligne :
   ```
   cd page-web
   netlify deploy --prod --dir public --site bileyiyabana
   ```
6. Garder la source à jour sur GitHub : `git commit -am "Version 1.2.0"` puis `git push`.
