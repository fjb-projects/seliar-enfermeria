# Welcome to your Lovable project

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Guard handover drafts

On `/control-guardia`, use **Descartar borrador** above the first section to start
over. The confirmation explains what will be removed; **Cancelar** keeps the form
unchanged. Confirming clears the current form, inventory selections, notes, and
attached photos from this device. It does not delete submitted records or saved
email suggestions. Discarding is disabled while a submission is in progress.

Drafts are restored in the same browser without an expiry, but attached photos
are not saved across reloads.

## Public compensatory requests

The `/compensatorio` staff list includes active agents whose operational role is
`Movil` **or** whose operational status is `SI` (either or both). These are the
second `FUNCION` and `OPERATIVO` columns of the combined roster CSV. Comparisons
ignore case, accents, and surrounding whitespace; missing values do not qualify.
Names shared by multiple active profiles remain excluded to avoid ambiguity.

The server applies the same eligibility rule when receiving a new public request,
not just when listing names. Existing request history and exact idempotent retries
are unchanged. This restriction does not change administrative request entry or
deactivate staff. Previously imported profiles must have these directory fields
populated; uploading the CSV alone does not save or update them.

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS
