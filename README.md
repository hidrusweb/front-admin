# Hidrus Admin (Frontend)

Aplicação web administrativa do Hidrus para gestão de condomínios, unidades, leituras, consumo e relatórios.

## Stack

- React 18 + TypeScript + Vite 5
- React Router
- TanStack Query e TanStack Table
- React Hook Form + Zod
- Tailwind CSS 3
- Axios, ExcelJS e jsPDF

## Requisitos

- Node.js 20+
- npm 10+

## Configuração

```bash
npm install
```

Crie/ajuste o arquivo `.env`:

```env
VITE_API_URL=http://127.0.0.1:8000/api
```

- `VITE_API_URL`: URL base da API (`hidrus-backend`).
- Para deploy em subpasta (ex.: `/admin`), configure `VITE_BASE_URL` no ambiente de build.

## Execução local

```bash
npm run dev
```

## Build e preview

```bash
npm run build
npm run preview
```

## Lint

```bash
npm run lint
```

## Deploy

Este projeto possui workflow de deploy (`.github/workflows/deploy-admin.yml`) com seleção de `VITE_API_URL` por branch e suporte a `VITE_BASE_URL` para publicação em subdiretório.
