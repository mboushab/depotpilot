# BoxPilot

MVP de gestion d’un dépôt de self-storage avec persistance PostgreSQL.

Le dépôt modélisé contient exactement 30 box de stockage, un parking dont le nombre de places est configurable, et une zone de chargement avec exactement 2 emplacements. Il existe un seul type d’utilisateur: l’administrateur. Les occupants n’ont aucun compte et aucun accès à l’application.

## Fonctionnalités

- Authentification administrateur par session signée et cookie httpOnly.
- Tableau de bord d’exploitation: occupation des box, revenus mensuels, parking, alertes et factures à suivre.
- Gestion des occupants.
- Gestion des 30 box avec statut, surface, volume, tarif et climatisation.
- Location et libération des box.
- Facturation avec lignes, TVA, échéances, paiements et export PDF.
- Parking configurable, attribution et libération de places.
- Planning des chargements sur 2 emplacements, avec détection des chevauchements.
- Notifications internes.
- Paramètres d’exploitation.
- Tests unitaires Vitest et parcours principal Playwright.

## Stack

- Next.js App Router
- TypeScript strict
- Tailwind CSS
- shadcn/ui personnalisé
- PostgreSQL
- Prisma ORM
- Session administrateur sécurisée avec `jose`
- React Hook Form
- Zod
- date-fns
- @react-pdf/renderer
- Vitest
- Playwright
- Docker Compose

## Variables d’environnement

Copier le fichier d’exemple:

```bash
cp .env.example .env
```

Variables:

- `DATABASE_URL`: URL PostgreSQL utilisée par Prisma. En local hors Docker, le port hôte est `5433` pour éviter les conflits avec un PostgreSQL déjà présent.
- `SESSION_SECRET`: secret de signature des sessions, minimum 32 caractères.
- `APP_URL`: URL locale de l’application.
- `DEMO_ADMIN_EMAIL`: e-mail du compte administrateur de démonstration.
- `DEMO_ADMIN_PASSWORD`: mot de passe du compte administrateur de démonstration.

## Démarrage avec Docker

```bash
docker compose up --build
```

Au démarrage, le conteneur `app` applique automatiquement les migrations Prisma en attente (`prisma migrate deploy`) puis exécute le seed (idempotent — voir la section Migrations ci-dessous). Aucune étape manuelle n'est nécessaire.

Application: http://localhost:3000

Compte de démonstration:

- E-mail: `admin@boxpilot.local`
- Mot de passe: `BoxPilot!2026`

## Version

`package.json` (`version`) est la seule source de vérité de la version de BoxPilot — pas de numéro dupliqué ailleurs dans le code. Elle est exposée à l'exécution par `GET /api/health` (voir `app/api/health/route.ts`), utilisé aussi par le healthcheck Docker du service `app` :

```bash
curl http://localhost:3000/api/health
# {"status":"ok","version":"1.0.0"}
```

Première release client : `1.0.0`. Ensuite, [semver](https://semver.org/lang/fr/) classique :

- `1.0.0` → `1.0.1` : correctif, aucun changement de comportement pour le client.
- `1.0.1` → `1.1.0` : nouvelle fonctionnalité, rétrocompatible.
- `1.1.0` → `2.0.0` : changement incompatible (ex. migration de données non triviale, retrait d'une fonctionnalité).

Pour publier une nouvelle version : mettre à jour `version` dans `package.json`, committer, puis relancer `packaging/mac/install.sh` chez le client — `~/Library/Application Support/BoxPilot/version.txt` note la version installée et le commit source à chaque install/mise à jour.

## Migrations Prisma

Prisma est la seule source de vérité du schéma, en développement comme en production.

- **En production / chez un client** (`scripts/db-setup.sh`, lancé automatiquement au démarrage du conteneur `app`) : uniquement `npx prisma migrate deploy`. Cette commande applique les migrations en attente dans l'ordre et ne touche jamais aux données existantes. Elle est sans danger à chaque redémarrage — s'il n'y a rien à appliquer, elle ne fait rien.
- **En développement**, pour créer une nouvelle migration après avoir modifié `prisma/schema.prisma` :

  ```bash
  npm run db:migrate
  ```

  Ceci crée un nouveau fichier sous `prisma/migrations/`. Les migrations existantes ne doivent pas être supprimées, réécrites ou fusionnées sauf nécessité absolue.

**Interdits en production, quelle que soit la situation** (aucun script de ce dépôt ne doit jamais les exécuter contre la base d'un client) :

- `prisma migrate reset`
- `prisma db push`
- `DROP DATABASE`
- toute suppression/recréation automatique de la base
- suppression du volume PostgreSQL (`docker volume rm boxpilot_boxpilot_postgres`)
- `docker compose down -v`

Une mise à jour de BoxPilot (nouveau build, `packaging/mac/install.sh` relancé) ne doit jamais supprimer les données existantes du client.

## Installation chez un client (macOS, sans Docker/npm/Prisma visible)

Pour un client non technique, tout tourne dans Docker et il ne voit qu'une icône `BoxPilot` dans `/Applications` (ou le Dock).

Étapes, à faire une seule fois par le développeur, sur le Mac du client :

1. Installer [Docker Desktop](https://www.docker.com/products/docker-desktop/) sur ce Mac.
2. Depuis un clone de ce dépôt :

   ```bash
   bash packaging/mac/install.sh
   ```

   Ce script :
   - génère, au premier lancement seulement, une configuration de production dans `~/Library/Application Support/BoxPilot/` avec des secrets réels et aléatoires (`SESSION_SECRET` sur 32 octets, mot de passe PostgreSQL, mot de passe admin) — jamais les valeurs de démonstration codées en dur dans `.env.example` ;
   - construit les images Docker (`db` + `app`) ;
   - avant toute mise à jour d'une installation existante, sauvegarde la base dans `.../BoxPilot/backups/` ;
   - démarre la stack (les migrations Prisma et les données de démonstration s'appliquent automatiquement) ;
   - installe une app `BoxPilot.app` autonome (le code du projet est embarqué dedans, mais aucun secret ni donnée) dans `/Applications`.

En production (`docker-compose.prod.yml`, toujours utilisé en overlay avec `docker-compose.yml`), PostgreSQL n'est pas publié sur l'hôte du tout (accessible uniquement depuis le service `app` via le réseau Docker interne) et l'application est liée à `127.0.0.1:3000` — jamais joignable depuis une autre machine du réseau local, seulement depuis ce Mac.

Ensuite, le client double-clique sur `BoxPilot` (ou le glisse dans le Dock). L'app vérifie que Docker Desktop tourne (le démarre si besoin), démarre les conteneurs, attend que http://localhost:3000 réponde, puis ouvre le navigateur. Il n'a jamais besoin de Terminal, npm, Docker, Prisma ou PostgreSQL.

`/Applications/BoxPilot.app` ne contient jamais de données persistantes : elles vivent dans un volume Docker, et la configuration/les secrets dans `~/Library/Application Support/BoxPilot/`. Voir `packaging/mac/README.md` pour le détail technique, la mise à jour d'une installation existante et le dépannage.

## Démarrage local sans Docker

```bash
npm ci
docker compose up -d db
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

## Vérifications

```bash
npm run db:generate
npm run typecheck
npm run lint
npm run test
```

Pour Playwright:

```bash
npm run dev
npm run test:e2e
```

L’application doit être lancée et la base seedée avant les tests end-to-end.

## Structure

- `app/`: routes App Router, pages admin et route PDF.
- `components/`: design system, formulaires et composants d’interface.
- `lib/`: Prisma, auth, validations, règles métier et formatters.
- `server/actions/`: mutations serveur sécurisées.
- `prisma/`: schéma, migration initiale et seed.
- `tests/`: unitaires Vitest et parcours Playwright.

## Notes métier

- La capacité de box est bornée à 30 dans le seed, les règles métier et l’action de création.
- La capacité de chargement est fixée à 2 emplacements.
- Le parking est configurable depuis les paramètres; augmenter la capacité crée les nouvelles places.
- Les occupants sont des fiches métier, pas des utilisateurs.
