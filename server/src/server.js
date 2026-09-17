import pg from "pg";

import { createApp } from "./app.js";
import { createTokenService } from "./auth/token.js";

import {
  createAuthUserRepository
} from "./data/auth-user.repository.js";

import {
  createCatalogRepository
} from "./data/catalog.repository.js";

import {
  createCatalogService
} from "./catalog/catalog.service.js";

import {
  createCatalogHandler
} from "./catalog/catalog.handler.js";

const { Pool } = pg;

const port =
  Number(process.env.PORT ?? 8080);

const database =
  new Pool();

const tokenService =
  createTokenService(
    process.env.JWT_SECRET
  );

const authUserRepository =
  createAuthUserRepository(
    database
  );

const catalogRepository =
  createCatalogRepository(
    database
  );

const catalogService =
  createCatalogService(
    catalogRepository
  );

const handleCatalogRequest =
  createCatalogHandler(
    catalogService
  );

const server =
  createApp({
    tokenService,

    findUserByUsername:
      authUserRepository.findUserByUsername,

    handleCatalogRequest
  });

server.listen(
  port,
  () => {
    console.log(
      `Soundwave API listening on http://localhost:${port}`
    );
  }
);