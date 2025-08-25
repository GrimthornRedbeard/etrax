-- ETrax Production Database Setup Script
-- Run this script as PostgreSQL superuser (postgres)

-- Create database user
CREATE USER etrax_user WITH ENCRYPTED PASSWORD 'CHANGE_THIS_PASSWORD_IN_PRODUCTION';

-- Create database
CREATE DATABASE etrax_production WITH 
    OWNER = etrax_user
    ENCODING = 'UTF8'
    LC_COLLATE = 'en_US.UTF-8'
    LC_CTYPE = 'en_US.UTF-8'
    TEMPLATE = template0;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE etrax_production TO etrax_user;

-- Connect to the database
\c etrax_production

-- Grant schema privileges
GRANT ALL ON SCHEMA public TO etrax_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO etrax_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO etrax_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO etrax_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO etrax_user;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Display connection info
SELECT 
    'Database setup complete!' as message,
    current_database() as database_name,
    current_user as connected_as,
    version() as postgresql_version;

-- Show database size
SELECT 
    pg_size_pretty(pg_database_size(current_database())) as database_size;