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

import {
  createSearchRepository
} from "./data/search.repository.js";

import {
  createSearchService
} from "./search/search.service.js";

import {
  createSearchHandler
} from "./search/search.handler.js";

import {
  createAccountProfileRepository
} from "./data/account-profile.repository.js";

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

const searchRepository =
  createSearchRepository(
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

const searchService =
  createSearchService(
    searchRepository
  );

const handleSearchRequest =
  createSearchHandler(
    searchService
  );

const accountProfileRepository =
  createAccountProfileRepository(
    database
  );

const server =
  createApp({
    tokenService,

    findUserByUsername:
      authUserRepository.findUserByUsername,

    findProfileByUserId:
      accountProfileRepository.findProfileByUserId,

    handleCatalogRequest,

    handleSearchRequest
  });
  server.listen(
  port,
  () => {
    console.log(
      `Soundwave API listening on http://localhost:${port}`
    );
  }
);
