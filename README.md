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

Initialiser les données de démonstration:

```bash
docker compose exec app npm run db:seed
```

Application: http://localhost:3000

Compte de démonstration:

- E-mail: `admin@boxpilot.local`
- Mot de passe: `BoxPilot!2026`

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
