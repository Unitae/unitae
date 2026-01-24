# Unitae

A local-first application with authentication built using NestJS, React, and Replicache/Zero.

## Project Structure

This is a monorepo managed with pnpm workspaces:

```
unitae/
├── apps/
│   ├── backend/    # NestJS backend with authentication
│   └── frontend/   # React frontend with TanStack Query and Replicache
└── packages/       # Shared packages (future)
```

## Prerequisites

- Node.js >= 18.0.0
- pnpm >= 8.0.0

## Getting Started

### Installation

```bash
pnpm install
```

### Development

Run all applications in development mode:

```bash
pnpm dev
```

### Backend Development

```bash
cd apps/backend
pnpm dev
```

The backend API will be available at `http://localhost:3000`.

### Frontend Development

```bash
cd apps/frontend
pnpm dev
```

The frontend will be available at `http://localhost:5173`.

## Features

- **Backend (NestJS)**
  - JWT Authentication
  - RESTful API
  - TypeScript
  - Database integration

- **Frontend (React)**
  - React Router for navigation
  - TanStack Query for data fetching
  - Replicache/Zero for local-first functionality
  - shadcn/ui components
  - Tailwind CSS for styling

## Environment Variables

Copy the `.env.example` files in each application directory and configure as needed:

```bash
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env
```

## License

MIT
