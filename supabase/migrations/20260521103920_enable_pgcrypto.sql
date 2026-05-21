
/*
  # Enable pgcrypto extension
  Required for gen_salt() and crypt() used in create_intern_user function.
*/
CREATE EXTENSION IF NOT EXISTS pgcrypto;
