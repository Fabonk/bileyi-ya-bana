# BILEYI YA BANA — page de téléchargement

La page qui propose les trois installateurs de l'application (Android, iPhone/iPad, Windows), avec la citation du
sermon « Tenir des conférences » (Chautauqua, 8 juin 1960, § 44).

- Page : https://bileyiyabana.netlify.app (Netlify, compte bat.fabonk@gmail.com, projet `bileyiyabana`)
- Fichiers : https://github.com/Fabonk/bileyi-ya-bana/releases (GitHub, compte Fabonk)
- La bibliothèque en ligne (lien « Lire en ligne ») : https://fabonk.github.io/bileyi-ya-bana/ — la branche `gh-pages` du
  même dépôt, publiée par `../pipeline/publish_site.py` ; les applications s'y mettent à jour toutes seules.

Les installateurs ne sont pas sur Netlify : l'offre gratuite de Netlify ne permet qu'environ 15 Go de transfert par
mois (à peu près 70 téléchargements de l'APK), alors que les « releases » GitHub n'ont pas de limite.

| Fichier | Rôle |
|---|---|
| `public/index.html` | la page entière (styles et script compris) ; les liens de téléchargement pointent vers la release GitHub |
| `public/don.html` | la page « Faites un don » : les numéros M-Pesa et Orange Money, avec leurs logos (`img/don-*.jpg`), copiés d'un geste |
| `public/img/` | logo, favicon, captures de l'application (`app-accueil.jpg`, `app-sermon.jpg`) et image d'aperçu pour WhatsApp/Facebook (`og.jpg`, 1200×630) |
| `netlify/edge-functions/ia.js` | le relais du Chat IA (voir plus bas), à l'adresse `/api/ia/gemini` et `/api/ia/openrouter` |
| `netlify/functions/retours.mjs` | les commentaires de la page et le compte des installations de l'application web (voir plus bas) |
| `public/gestion.html` | la page privée du responsable : téléchargements, installations, commentaires |
| `package.json` | la bibliothèque `@netlify/blobs` (le stockage des commentaires) : `npm install` avant de déployer |
| `netlify.toml` | dit à Netlify de publier `public/` |

## Le relais du Chat IA

Les clés de l'IA ne sont pas dans le site mis en ligne. Le Chat IA de l'application web (iPhone) et des applications qui
n'ont pas reçu la clé Gemini passe par ce relais, qui garde les clés chez Netlify et transmet la question à Google
Gemini, ou à OpenRouter quand Gemini est saturé. Il n'accepte que les pages de Bileyi ya Bana et les modèles gratuits.

Les clés sont deux variables d'environnement du projet Netlify (une fois, puis à chaque changement de clé) :

```
cd page-web
netlify env:set GEMINI_KEY "<clé Gemini>"
netlify env:set OPENROUTER_KEY "<clé OpenRouter>"
netlify deploy --prod --dir public
```

Une clé changée ne sert qu'après un nouveau `netlify deploy --prod`. Pas besoin de refaire les applications.

## Commentaires et statistiques (pour le responsable seul)

- Le formulaire « Laisser un commentaire » de la page envoie le message à `/api/commentaire`. Il est gardé chez
  Netlify (Netlify Blobs, magasin `commentaires`) et n'est publié nulle part. Un champ caché et le temps de saisie
  écartent les robots.
- L'application web (le site ajouté à l'écran d'accueil, surtout sur iPhone) se signale une fois par téléphone à
  `/api/installation` (un numéro au hasard, rien d'autre) : magasin `installations`.
- La page privée `gestion.html` montre les téléchargements de chaque installateur, version par version (chiffres de
  GitHub), les installations de l'application web et les commentaires (avec le lieu approximatif, l'appareil, et un
  bouton pour supprimer). Elle s'ouvre avec le lien personnel `https://bileyiyabana.netlify.app/gestion.html#<clé>`,
  qui garde ensuite la clé sur l'appareil. La clé n'est écrite nulle part dans le code : seulement son empreinte
  SHA-256 (`OWNER` dans `retours.mjs`).
- Changer la clé : `python -c "import secrets,hashlib;t=secrets.token_urlsafe(24);print(t);print(hashlib.sha256(t.encode()).hexdigest())"`,
  mettre la 2e ligne dans `OWNER`, déployer, et ouvrir `gestion.html#<1re ligne>`.
- Voir ou vider les magasins à la main : `netlify blobs:list commentaires`, `netlify blobs:delete commentaires <clé>`.

La page reconnaît l'appareil du visiteur : sa carte passe en premier, et le grand bouton du haut télécharge directement
le bon fichier (sur iPhone, il ouvre les étapes d'installation : la bibliothèque en ligne ajoutée à l'écran d'accueil
avec Safari, sans ordinateur ; le fichier IPA reste proposé en remarque, pour Sideloadly). Sur ordinateur, un
QR code permet d'ouvrir la page sur le téléphone.

## Publier une nouvelle version

Si seul le contenu de la bibliothèque change, il n'y a pas de nouvelle version à faire : refaire le site
(`pipeline/build_site.py`) puis le publier (`pipeline/publish_site.py`) ; les applications installées le prennent
toutes seules. Les étapes ci-dessous ne servent que pour une nouvelle version des applications elles-mêmes.

1. Faire les trois fichiers (voir `../app-html/LISEZ-MOI.md` et `../app-windows/LISEZ-MOI.md`).
2. Les copier sous ces noms (ici pour la version 1.2.0) : `BILEYI-YA-BANA-1.2.0-android.apk`,
   `BILEYI-YA-BANA-1.2.0-iphone.ipa`, `BILEYI-YA-BANA-1.2.0-windows-setup.exe`.
3. Les publier sur GitHub :
   ```
   gh release create v1.2.0 BILEYI-YA-BANA-1.2.0-* --repo Fabonk/bileyi-ya-bana --title "BILEYI YA BANA 1.2.0" --notes "…"
   ```
4. Dans `public/index.html`, remplacer `1.1.0` par `1.2.0` partout (liens, version affichée), corriger les tailles
   (`222 Mo`, `161 Mo`, `81 Mo`, aussi dans `data-taille`) et la phrase « Nouveau dans la version ».
5. Mettre la page en ligne (avec le relais du Chat IA ; sans `--no-build`, sinon le relais n'est pas envoyé) :
   ```
   cd page-web
   netlify deploy --prod --dir public --site bileyiyabana
   ```
6. Garder la source à jour sur GitHub : `git commit -am "Version 1.2.0"` puis `git push`.
