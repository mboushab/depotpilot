# BoxPilot – installation macOS pour un client non technique

Ce dossier contient tout ce qu'il faut pour livrer BoxPilot comme une app
qu'un client double-clique, sans jamais toucher à Terminal, npm, Docker,
Prisma ou PostgreSQL.

Aucune réécriture de l'application : elle reste Next.js + Prisma +
PostgreSQL, orchestrés par `docker-compose.yml` (+ `docker-compose.prod.yml`
en overlay) à la racine du dépôt. Cette app macOS n'est qu'un lanceur.

## Deux fichiers compose, un seul dépôt

- **`docker-compose.yml`** : définition de base (image, volumes, healthcheck,
  `restart: unless-stopped`). Utilisé seul en développement local — les deux
  services sont alors publiés sur l'hôte (`5433` pour Postgres, `3000` pour
  l'app) pour la commodité du développeur.
- **`docker-compose.prod.yml`** : overlay utilisé UNIQUEMENT en superposition
  (`-f docker-compose.yml -f docker-compose.prod.yml`), jamais seul. Il
  retire la publication du port PostgreSQL (`ports: !reset []` — PostgreSQL
  n'est joignable que par le service `app`, via le réseau Docker interne) et
  restreint l'app à `127.0.0.1:3000:3000` au lieu de `3000:3000` (qui écoute
  sur toutes les interfaces). Résultat : BoxPilot n'est jamais joignable
  depuis une autre machine du réseau local, seulement depuis ce Mac.

  ⚠️ Les listes (`ports:`, etc.) sont **fusionnées** par Docker Compose par
  défaut, pas remplacées — `docker-compose.prod.yml` utilise donc les tags
  `!reset` / `!override` (Compose ≥ 2.24) pour forcer un remplacement complet
  plutôt que d'ajouter une deuxième liaison en plus de celle du fichier de
  base. Vérifié avec `docker compose -f docker-compose.yml -f
  docker-compose.prod.yml config`.

`install.sh` et le lanceur utilisent toujours les deux fichiers ensemble.

## Deux emplacements, deux rôles

- **`/Applications/BoxPilot.app`** : uniquement du code, jetable et
  remplacé en entier à chaque install/mise à jour. Aucune donnée, aucun
  secret n'y vit jamais.
- **`~/Library/Application Support/BoxPilot/`** : tout ce qui doit survivre
  aux mises à jour — généré une fois, jamais écrasé automatiquement :

  ```
  ~/Library/Application Support/BoxPilot/
    docker-compose.yml       # copié du dépôt à chaque install (pas de secret dedans)
    docker-compose.prod.yml  # idem — restrictions réseau
    .env                     # secrets réels, générés une seule fois, chmod 600
    backups/                 # dump PostgreSQL avant chaque mise à jour
    logs/                    # journal du lanceur + de l'installeur
    version.txt              # version (package.json) + commit source + date de la dernière install
  ```

  Les données PostgreSQL elles-mêmes vivent à part, dans le volume Docker
  nommé `boxpilot_boxpilot_postgres` — ni dans l'app, ni dans Application
  Support.

## Contenu de ce dossier

- `BoxPilot.app/` : le gabarit de l'app macOS.
  - `Contents/Info.plist` : déclaration standard d'une app macOS (icône,
    exécutable, `LSUIElement` pour éviter une icône qui reste dans le Dock
    pendant l'exécution puisqu'il n'y a pas de fenêtre).
  - `Contents/MacOS/BoxPilot` : le script lancé au double-clic. Il vérifie
    Docker Desktop, lance `docker compose --env-file .../BoxPilot/.env -f
    .../BoxPilot/docker-compose.yml -f .../BoxPilot/docker-compose.prod.yml
    --project-directory <app>/.../project up -d --build` (secrets et compose
    files dans Application Support, code source dans l'app), attend que
    `http://localhost:3000` réponde, puis ouvre le navigateur. Toute erreur
    s'affiche dans une boîte de dialogue native (`osascript`), jamais dans
    un terminal.
  - `Contents/Resources/AppIcon.icns` : icône générée depuis
    `public/logo-mark.png`.
  - `Contents/Resources/project/` : **absent du dépôt git**, rempli par
    `install.sh` avec une copie du code du projet (sans `.git`, sans
    `.env`, sans `node_modules`).
- `install.sh` : script à lancer une fois par le développeur (voir le README
  principal). Génère les secrets de production, construit les images,
  démarre la stack, puis installe l'app dans `/Applications`.

## Secrets générés par `install.sh`

Au tout premier lancement (si `~/Library/Application Support/BoxPilot/.env`
n'existe pas encore), le script génère et écrit dans ce fichier :

- `SESSION_SECRET` : 32 octets aléatoires cryptographiques (`openssl rand -hex 32`).
- `POSTGRES_PASSWORD` : 24 octets aléatoires.
- `DEMO_ADMIN_PASSWORD` : mot de passe aléatoire, affiché une seule fois à
  l'écran à la fin de l'installation (et relisible ensuite dans ce `.env`).

Rien de tout ça ne provient de `.env.example` (qui ne contient que des
valeurs de développement local, jamais utilisées en production) ni d'aucun
fichier versionné du dépôt. Une fois généré, ce `.env` n'est plus jamais
modifié automatiquement — relancer `install.sh` le réutilise tel quel.

⚠️ Changer `DEMO_ADMIN_PASSWORD` dans ce fichier APRÈS le premier lancement
ne change pas le mot de passe déjà en base (le compte admin n'est créé
qu'une fois). Pour un vrai changement de mot de passe, il faut le faire
depuis l'application elle-même une fois cette fonctionnalité disponible, ou
le mettre à jour directement en base.

## Mettre à jour une installation existante

Quand le code du dépôt évolue, relancer simplement :

```bash
bash packaging/mac/install.sh
```

Le script :
1. réutilise le `.env` existant (mêmes secrets, même mot de passe admin) ;
2. si des conteneurs tournent, sauvegarde la base dans `backups/` (`pg_dump`
   compressé, horodaté) avant de toucher à quoi que ce soit ;
3. arrête proprement l'ancienne installation (`docker compose down`, sans
   `-v` — le volume n'est jamais supprimé) ;
4. remplace `/Applications/BoxPilot.app` par une copie fraîche du code ;
5. reconstruit l'image et redémarre.

Les données restent intactes à chaque étape : elles vivent dans le volume
Docker `boxpilot_boxpilot_postgres`, jamais dans l'app ni dans Application
Support.

## Désinstaller

Pour retirer juste le lanceur, en gardant les données du client intactes
(prêtes pour une réinstallation future) :

```bash
cd /Applications/BoxPilot.app/Contents/Resources/project
docker compose --env-file "$HOME/Library/Application Support/BoxPilot/.env" \
  -f "$HOME/Library/Application Support/BoxPilot/docker-compose.yml" \
  -f "$HOME/Library/Application Support/BoxPilot/docker-compose.prod.yml" \
  --project-directory "$(pwd)" down
rm -rf /Applications/BoxPilot.app
```

`~/Library/Application Support/BoxPilot/` (secrets, backups, logs) et le
volume PostgreSQL survivent à cette suppression — une réinstallation
retrouve tout tel quel.

⚠️ **Ajouter `-v` à `docker compose down` supprime aussi le volume
PostgreSQL, donc *toutes* les données du client, de façon irréversible.**
Ne l'utiliser que si l'effacement complet est explicitement voulu — jamais
dans le cadre d'une mise à jour ou d'une désinstallation normale. Pour un
effacement complet et volontaire, supprimer aussi
`~/Library/Application Support/BoxPilot/` ensuite.

## Dépannage

```bash
cat "$HOME/Library/Application Support/BoxPilot/logs/launcher.log"
cat "$HOME/Library/Application Support/BoxPilot/logs/install.log"
cd /Applications/BoxPilot.app/Contents/Resources/project
docker compose --env-file "$HOME/Library/Application Support/BoxPilot/.env" \
  -f "$HOME/Library/Application Support/BoxPilot/docker-compose.yml" \
  -f "$HOME/Library/Application Support/BoxPilot/docker-compose.prod.yml" \
  --project-directory "$(pwd)" logs
```

Vérifier que rien n'est exposé au réseau local :

```bash
docker compose ... ps   # db ne doit montrer aucun port publié (que 5432/tcp interne)
curl http://<IP locale de ce Mac>:3000   # doit échouer/timeout depuis une autre machine
```
